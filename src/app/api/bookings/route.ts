import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, invoicesTable, postsTable, roomTypeRatesTable, roomTypesTable } from "@/db/schema";
import { logBookingEvent } from "@/lib/booking-events";
import { clientIp, logAudit } from "@/lib/audit";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { findOrCreateGuest } from "@/lib/hotel";
import { blockedCountByRoomType } from "@/lib/room-blocks";
import { adminAlertHtml, guestEmailHtml, sendInvoiceEmail, sendMail } from "@/lib/mail";
import { calculateStayQuote, calculateVat, nextBookingNumber } from "@/lib/pricing";
import { malawiShortDate, malawiYear, nowDate } from "@/lib/time";
import { setting } from "@/lib/settings";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
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

const BREAKFAST_PER_GUEST_PER_NIGHT = 8_500;
const AIRPORT_TRANSFER_PRICE = 25_000;
const LATE_CHECKOUT_PRICE = 15_000;

function parseLegacyExtras(raw: unknown, nights: number, maxGuests: number): ExtraInput[] | null {
  let entries: unknown[] = [];
  if (Array.isArray(raw)) entries = raw;
  else if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      entries = parsed;
    } catch {
      return null;
    }
  }

  const extras: ExtraInput[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const label = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && "label" in entry && typeof entry.label === "string"
        ? entry.label
        : "";
    if (!label || seen.has(label)) return null;
    seen.add(label);
    if (
      label === "Kamuzu Airport transfer (one-way)" ||
      label === "Airport Shuttle (one-way)" ||
      label === "Airport shuttle (one-way)"
    ) {
      extras.push({ label: "Kamuzu Airport transfer (one-way)", amount: AIRPORT_TRANSFER_PRICE });
      continue;
    }
    if (label === "Late check-out until 15:00" || label === "Late check-out (15:00)") {
      extras.push({ label: "Late check-out until 15:00", amount: LATE_CHECKOUT_PRICE });
      continue;
    }
    const breakfast = /^Daily breakfast × (\d+) guest(?:s)? \(\d+ nights?\)$/.exec(label);
    if (breakfast) {
      const quantity = Number(breakfast[1]);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxGuests) return null;
      extras.push({
        label: `Daily breakfast × ${quantity} guest${quantity === 1 ? "" : "s"} (${nights} night${nights === 1 ? "" : "s"})`,
        amount: quantity * BREAKFAST_PER_GUEST_PER_NIGHT * nights,
      });
      continue;
    }
    return null;
  }
  return extras;
}

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

    if (!guestName || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || nights < 1) {
      return NextResponse.json({ error: "Please provide your name, phone number and a valid check-in / check-out date." }, { status: 400 });
    }

    let extras: ExtraInput[] = [];
    let offerIds: string[] = [];
    if (body.extraSelections !== undefined) {
      const selections = body.extraSelections;
      if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
        return NextResponse.json({ error: "Booking extra selections are invalid." }, { status: 400 });
      }
      const value = selections as Record<string, unknown>;
      const breakfastQty = value.breakfastQty ?? 0;
      const transfer = value.transfer ?? false;
      const lateCheckout = value.lateCheckout ?? false;
      const requestedOffers = value.offerIds ?? [];
      if (!Number.isSafeInteger(breakfastQty) || Number(breakfastQty) < 0 || Number(breakfastQty) > adults + children) {
        return NextResponse.json({ error: "Breakfast quantity must not exceed the number of guests." }, { status: 400 });
      }
      if (typeof transfer !== "boolean" || typeof lateCheckout !== "boolean") {
        return NextResponse.json({ error: "Choose valid booking extras." }, { status: 400 });
      }
      if (!Array.isArray(requestedOffers) || requestedOffers.length > 20 || requestedOffers.some((id) => typeof id !== "string" || !id.trim())) {
        return NextResponse.json({ error: "Choose valid booking offers." }, { status: 400 });
      }
      offerIds = [...new Set((requestedOffers as string[]).map((id) => id.trim()))];
      if (offerIds.length !== requestedOffers.length) {
        return NextResponse.json({ error: "A booking offer may only be selected once." }, { status: 400 });
      }
      if (Number(breakfastQty) > 0) {
        extras.push({
          label: `Daily breakfast × ${Number(breakfastQty)} guest${Number(breakfastQty) === 1 ? "" : "s"} (${nights} night${nights === 1 ? "" : "s"})`,
          amount: Number(breakfastQty) * BREAKFAST_PER_GUEST_PER_NIGHT * nights,
        });
      }
      if (transfer) extras.push({ label: "Kamuzu Airport transfer (one-way)", amount: AIRPORT_TRANSFER_PRICE });
      if (lateCheckout) extras.push({ label: "Late check-out until 15:00", amount: LATE_CHECKOUT_PRICE });
    } else {
      const legacyExtras = parseLegacyExtras(body.extras, nights, adults + children);
      if (!legacyExtras || (Number(body.extrasTotal) > 0 && legacyExtras.length === 0)) {
        return NextResponse.json({ error: "One or more extras are invalid. Please refresh the booking form and try again." }, { status: 400 });
      }
      extras = legacyExtras;
    }

    if (offerIds.length > 0) {
      const selectedOffers = await db
        .select({ id: postsTable.id, title: postsTable.title, nightlyPrice: postsTable.bookingAddonPrice })
        .from(postsTable)
        .where(and(inArray(postsTable.id, offerIds), eq(postsTable.category, "Offer"), eq(postsTable.isActive, true), isNotNull(postsTable.bookingAddonPrice)));
      const pricedOffers = selectedOffers.filter(
        (offer): offer is (typeof selectedOffers)[number] & { nightlyPrice: number } => offer.nightlyPrice !== null,
      );
      if (pricedOffers.length !== offerIds.length) {
        return NextResponse.json({ error: "One or more selected offers are no longer available. Refresh the page and choose again." }, { status: 409 });
      }
      extras.push(...pricedOffers.map((offer) => ({
        label: `${offer.title} (${nights} night${nights === 1 ? "" : "s"} @ MWK ${offer.nightlyPrice.toLocaleString()}/room-night)`,
        amount: offer.nightlyPrice * nights,
      })));
    }
    const extrasTotal = extras.reduce((sum, extra) => sum + extra.amount, 0);
    const maxStoredAmount = 2_147_483_647;
    if (!Number.isSafeInteger(extrasTotal) || extrasTotal > maxStoredAmount) {
      return NextResponse.json({ error: "The selected extras exceed the maximum billable amount." }, { status: 400 });
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

    // PRICE, from the SAME engine the quote endpoint uses: weekend and seasonal nights
    // priced as configured, extras included — and VAT handled the way this motel quotes,
    // which is INCLUSIVE. The advertised rate is what the guest pays; the VAT portion is
    // recorded *inside* that figure (invoices.taxAmount) so the books can file without the
    // guest's price changing. One row in app_settings (PRICE_TAX_MODE=exclusive) switches
    // to adding VAT on top instead.
    //
    // With no weekend price, no seasonal rate and no discount set — which is today's
    // state — the gross this produces is exactly rate × nights, the same number the old
    // bookingMath produced, which is why no existing price moves.
    const seasonalRates = await db
      .select({
        kind: roomTypeRatesTable.kind,
        label: roomTypeRatesTable.label,
        startDate: roomTypeRatesTable.startDate,
        endDate: roomTypeRatesTable.endDate,
        minNights: roomTypeRatesTable.minNights,
        nightlyRate: roomTypeRatesTable.nightlyRate,
        isActive: roomTypeRatesTable.isActive,
      })
      .from(roomTypeRatesTable)
      .where(eq(roomTypeRatesTable.roomTypeId, roomTypeId));
    const taxInclusive = (await setting("PRICE_TAX_MODE")) !== "exclusive";
    const quote = calculateStayQuote({
      room: roomRecord,
      rates: seasonalRates.filter((rate) => rate.isActive),
      checkIn,
      checkOut,
      guests: adults + children,
      taxInclusive,
    });
    const taxableAmount = quote.subtotal + extrasTotal;
    const { taxAmount, totalAmount } = calculateVat(taxableAmount, quote.taxRateBp, taxInclusive);
    if (!Number.isSafeInteger(totalAmount) || totalAmount > maxStoredAmount) {
      return NextResponse.json({ error: "The total exceeds the maximum billable amount. Please contact the front desk." }, { status: 400 });
    }

    // Anti-overbooking: count overlapping live bookings inside a transaction with a row lock on the room type
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM room_types WHERE id = ${roomTypeId} FOR UPDATE`);

      const overlapping = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.roomTypeId, roomTypeId), ne(bookings.status, "cancelled"), sql`${bookings.checkIn} < ${checkOut}`, sql`${bookings.checkOut} > ${checkIn}`));

      // Dated blocks take rooms off sale as well as drawing them red on the calendar.
      // With no blocks recorded this is 0 and the arithmetic is exactly as before.
      const blockedCounts = await blockedCountByRoomType(checkIn, checkOut);
      const blockedForType = blockedCounts[roomTypeId] ?? 0;

      const availableCount = roomRecord.totalInventory - overlapping.length - blockedForType;
      if (availableCount <= 0) {
        return { soldOut: true as const, availableCount: 0 };
      }

      const reference = makeReference();
      const invoiceNumber = makeInvoiceNumber();
      // MONEY — from the shared engine (see the quote above): the room at its correct
      // nightly rate (weekend/seasonal applied), any length-of-stay discount, then the
      // guest's extras, which are advertised prices and therefore VAT-inclusive too.
      const serviceFee = 0;
      const extensionFee = 0;
      const discount = quote.discount.amount;
      const subtotal = quote.nightlySubtotal;
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
        {
          description: `${roomType} (${nights} night${nights > 1 ? "s" : ""} @ MWK ${nightlyRate.toLocaleString()}/night)${quote.discount.label ? ` — ${quote.discount.label}` : ""}`,
          amount: Math.max(0, subtotal - discount),
        },
        ...(serviceFee ? [{ description: "Service fee", amount: serviceFee }] : []),
        ...extras.map((e) => ({ description: e.label, amount: e.amount })),
        // VAT is already inside the prices above — this line states the portion, so the
        // guest's total is unchanged while the books can still file the tax.
        {
          description: `VAT ${(quote.taxRateBp / 100).toFixed(2)}%${taxInclusive ? " (included in the total)" : ""}`,
          amount: taxAmount,
        },
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
        taxAmount,
        taxRateBp: quote.taxRateBp,
        taxInclusive,
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
        roomSubtotal: quote.nightlySubtotal,
        discountAmount: quote.discount.amount,
        extras: extras.map((e) => ({ label: e.label, amount: e.amount })),
        extrasTotal,
        taxAmount,
        taxRateBp: quote.taxRateBp,
        taxInclusive,
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
          taxAmount,
          taxRateBp: quote.taxRateBp,
          taxInclusive,
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
