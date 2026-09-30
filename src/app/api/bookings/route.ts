import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, invoicesTable, roomTypesTable } from "@/db/schema";
import { logBookingEvent } from "@/lib/booking-events";
import { clientIp, logAudit } from "@/lib/audit";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { findOrCreateGuest } from "@/lib/hotel";
import { adminAlertHtml, guestEmailHtml, sendInvoiceEmail, sendMail } from "@/lib/mail";
import { bookingMath, nextBookingNumber } from "@/lib/pricing";
import { malawiShortDate, malawiYear, nowDate } from "@/lib/time";
import { setting } from "@/lib/settings";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

function nightsBetween(checkIn: string, checkOut: string) {
  // Calendar nights only — immune to DST/timezone shifts.
  const start = new Date(`${checkIn}T12:00:00Z`).getTime();
  const end = new Date(`${checkOut}T12:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function makeReference() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let random = "";
  for (let i = 0; i < 4; i++) random += chars.charAt(Math.floor(Math.random() * chars.length));
  return `SM-${malawiShortDate(nowDate())}-${random}`;
}

function makeInvoiceNumber() {
  return `INV-${malawiYear(nowDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
}

type ExtraInput = { label: string; amount: number };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const roomTypeId = typeof body.roomTypeId === "string" ? body.roomTypeId.trim().toLowerCase() : "standard";
    const checkIn = typeof body.checkIn === "string" ? body.checkIn : "";
    const checkOut = typeof body.checkOut === "string" ? body.checkOut : "";
    const guestName = typeof body.guestName === "string" ? body.guestName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    const arrival = typeof body.arrival === "string" && body.arrival.trim() ? body.arrival.trim() : null;
    const requests = typeof body.requests === "string" && body.requests.trim() ? body.requests.trim() : null;
    const adults = Math.max(1, Number(body.adults) || 1);
    const children = Math.max(0, Number(body.children) || 0);
    const nights = nightsBetween(checkIn, checkOut);

    let extras: ExtraInput[] = [];
    if (Array.isArray(body.extras)) {
      extras = (body.extras as unknown[])
        .map((e) => (e && typeof e === "object" && "label" in e ? { label: String((e as ExtraInput).label), amount: Number((e as ExtraInput).amount) || 0 } : null))
        .filter((e): e is ExtraInput => Boolean(e));
    } else if (typeof body.extras === "string") {
      try {
        const parsed = JSON.parse(body.extras) as unknown;
        if (Array.isArray(parsed)) extras = parsed.map((e) => (typeof e === "string" ? { label: e, amount: 0 } : (e as ExtraInput)));
      } catch {
        extras = [];
      }
    }
    const extrasTotal = extras.length ? extras.reduce((s, e) => s + (e.amount || 0), 0) : Number(body.extrasTotal) || 0;

    if (!guestName || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || nights < 1) {
      return NextResponse.json({ error: "Please provide your name, phone number and a valid check-in / check-out date." }, { status: 400 });
    }

    // Server is the source of truth for the room name and rate
    const [roomRecord] = await db.select().from(roomTypesTable).where(eq(roomTypesTable.id, roomTypeId)).limit(1);
    if (!roomRecord || !roomRecord.isActive) {
      return NextResponse.json({ error: "That room type is not available. Please choose another room." }, { status: 404 });
    }
    const roomType = roomRecord.name;
    const nightlyRate = roomRecord.rate;

    // ONE PHONE + ONE EMAIL = ONE GUEST. The identity now exists from the moment the
    // booking is made, not from the moment the desk notices it — so a returning guest's
    // stays, payments, orders and preferences are already joined up when they arrive.
    // Resolved BEFORE the transaction on purpose: losing the sold-out race must never be
    // the reason a booking is left with no identity behind it.
    const guest = await findOrCreateGuest({ fullName: guestName, phone, email });

    // Anti-overbooking: count overlapping live bookings inside a transaction with a row lock on the room type
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM room_types WHERE id = ${roomTypeId} FOR UPDATE`);

      const overlapping = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.roomTypeId, roomTypeId), ne(bookings.status, "cancelled"), sql`${bookings.checkIn} < ${checkOut}`, sql`${bookings.checkOut} > ${checkIn}`));

      const availableCount = roomRecord.totalInventory - overlapping.length;
      if (availableCount <= 0) {
        return { soldOut: true as const, availableCount: 0 };
      }

      const reference = makeReference();
      const invoiceNumber = makeInvoiceNumber();
      // Total = (nightly rate × nights) + service fee + extension fee + extras − discount
      const serviceFee = 0;
      const extensionFee = 0;
      const discount = 0;
      const { subtotal, total: totalAmount } = bookingMath(nightlyRate, nights, { serviceFee, extensionFee, discount, extrasTotal });
      const bookingId = randomUUID();
      const bookingNumber = await nextBookingNumber(tx as unknown, malawiYear(nowDate()));

      const [booking] = await tx
        .insert(bookings)
        .values({
          id: bookingId,
          reference,
          bookingNumber,
          roomTypeId,
          roomType,
          checkIn,
          checkOut,
          adults,
          children,
          nights,
          nightlyRate,
          serviceFee,
          extensionFee,
          discount,
          totalAmount,
          guestName,
          phone,
          email,
          guestId: guest.id,
          arrival,
          requests,
          extras: JSON.stringify(extras),
          status: "pending",
          invoiceNumber,
        })
        .returning();

      const lineItems = [
        { description: `${roomType} (${nights} night${nights > 1 ? "s" : ""} @ MWK ${nightlyRate.toLocaleString()}/night)`, amount: subtotal },
        ...(serviceFee ? [{ description: "Service fee", amount: serviceFee }] : []),
        ...extras.map((e) => ({ description: e.label, amount: e.amount })),
      ];

      await tx.insert(invoicesTable).values({
        id: randomUUID(),
        invoiceNumber,
        bookingId,
        bookingRef: reference,
        guestName,
        guestEmail: email,
        guestPhone: phone,
        roomType,
        checkIn,
        checkOut,
        nights,
        subtotal,
        extrasTotal,
        taxAmount: 0,
        totalAmount,
        amountPaid: 0,
        balanceDue: totalAmount,
        status: "proforma",
        lineItemsJson: JSON.stringify(lineItems),
        paymentInstructions: `National Bank of Malawi | Acc 1009876543 | Airtel Money +265 998 688 332 | TNM Mpamba +265 888 123 456 (Ref: ${reference})`,
      });

      return { soldOut: false as const, booking, availableCount: availableCount - 1 };
    });

    if (result.soldOut) {
      return NextResponse.json(
        { error: `Sorry — ${roomType} is fully booked between ${checkIn} and ${checkOut}. Please choose other dates or another room type.`, code: "SOLD_OUT" },
        { status: 409 },
      );
    }

    const booking = result.booking;
    const ip = clientIp(request);
    await logBookingEvent(booking.id, booking.reference, "created", `Guest ${guestName} requested ${roomType} for ${checkIn} → ${checkOut} (${nights} nights). Pro-forma ${booking.invoiceNumber} issued.`, "guest");
    await logAudit({
      action: "booking.created",
      entity: "booking",
      entityId: booking.id,
      reference: booking.reference,
      summary: `${guestName} (${phone}) requested ${roomType}, ${checkIn} → ${checkOut}, ${nights} night(s), MWK ${booking.totalAmount.toLocaleString()}.`,
      actor: "guest",
      actorLabel: `${guestName} · ${phone}`,
      ip,
      metadata: { roomTypeId, adults, children, extrasTotal, totalAmount: booking.totalAmount, bookingNumber: booking.bookingNumber },
    });

    // --- Auto-email: guest pro-forma (with PDF) + manager alert ---
    // Never blocks the booking response - failures are logged as events.
    let emailNote: string | null = null;
    try {
      const extrasLabels = extras.map((e) => (e.amount ? `${e.label} (MWK ${e.amount.toLocaleString()})` : e.label));
      const pdf = await buildInvoicePdf({
        invoiceNumber: booking.invoiceNumber ?? `INV-${booking.reference}`,
        reference: booking.reference,
        status: booking.status,
        issueDate: nowDate(),
        guestName: booking.guestName,
        phone: booking.phone,
        email: booking.email,
        roomType: booking.roomType,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        adults: booking.adults,
        children: booking.children,
        nightlyRate: booking.nightlyRate,
        extras: extras.map((e) => ({ label: e.label, amount: e.amount })),
        extrasTotal,
        totalAmount: booking.totalAmount,
        amountPaid: 0,
        requests: booking.requests,
      });
      const trackUrl = `/track?ref=${booking.reference}`;
      const html = guestEmailHtml({
        guestName: booking.guestName,
        roomType: booking.roomType,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        adults: booking.adults,
        children: booking.children,
        reference: booking.reference,
        invoiceNumber: booking.invoiceNumber ?? `INV-${booking.reference}`,
        total: booking.totalAmount,
        paid: 0,
        trackUrl,
        extras: extrasLabels,
      });
      if (email) {
        const outcome = await sendInvoiceEmail(
          email,
          `Sunrise Motel — booking ${booking.reference}${booking.bookingNumber ? ` (${booking.bookingNumber})` : ""} pending approval`,
          html,
          pdf,
          `Sunrise-Motel-${booking.reference}.pdf`,
        );
        if (outcome.sent) {
          emailNote = `Pro-forma emailed to guest ${email}.`;
          await logBookingEvent(booking.id, booking.reference, "invoice_emailed", emailNote, "system");
        } else {
          emailNote = outcome.reason;
          await logBookingEvent(booking.id, booking.reference, "invoice_email_failed", `Guest email not sent: ${outcome.reason}`, "system");
        }
      }
      const staffGroup = process.env.STAFF_WHATSAPP_GROUP;
      // Env first, then the database (src/lib/settings.ts) — so a booking alert still
      // reaches the office on a deployment whose environment nobody can edit.
      const staffNotify = (await setting("STAFF_NOTIFY_EMAILS")).split(",").map((s) => s.trim()).filter(Boolean);
      const adminEmail = await setting("ADMIN_EMAIL");
      const notifyTargets = [...new Set([...staffNotify, ...(adminEmail ? [adminEmail] : [])])];
      if (notifyTargets.length > 0) {
        await sendMail({
          to: notifyTargets,
          subject: `New booking to review — ${booking.reference}${booking.bookingNumber ? ` (${booking.bookingNumber})` : ""}`,
          html: adminAlertHtml({
            guestName: booking.guestName,
            phone: booking.phone,
            email: booking.email ?? "",
            roomType: booking.roomType,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            nights: booking.nights,
            adults: booking.adults,
            children: booking.children,
            reference: booking.reference,
            bookingNumber: booking.bookingNumber,
            invoiceNumber: booking.invoiceNumber ?? `INV-${booking.reference}`,
            total: booking.totalAmount,
            arrival: booking.arrival ?? null,
            requests: booking.requests ?? null,
            extras: extrasLabels,
          }),
        });
        if (staffGroup) {
          await logBookingEvent(booking.id, booking.reference, "whatsapp_queued", `WhatsApp group message queued: ${staffGroup} — new booking ${booking.reference}.`, "system");
        }
      }
    } catch (mailError) {
      console.error("Auto-email after booking failed (booking kept):", mailError);
    }

    revalidateLiveContent();
    return NextResponse.json(
      {
        booking: {
          reference: booking.reference,
          status: booking.status,
          guestName: booking.guestName,
          roomType: booking.roomType,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          nights: booking.nights,
          totalAmount: booking.totalAmount,
          invoiceNumber: booking.invoiceNumber,
          invoiceUrl: `/api/invoices/${booking.reference}`,
          trackUrl: `/track?ref=${booking.reference}`,
          remainingRooms: result.availableCount,
          emailNote,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Booking submission failed", error);
    return NextResponse.json({ error: "Could not save the booking request. Please WhatsApp the front desk on +265 998 688 332." }, { status: 500 });
  }
}
