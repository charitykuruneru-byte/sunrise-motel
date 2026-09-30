import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookingEventsTable, bookings, invoicesTable } from "@/db/schema";
import { logBookingEvent } from "@/lib/booking-events";
import { clientIp, logAudit } from "@/lib/audit";
import { buildInvoicePdf, parseExtras } from "@/lib/invoice-pdf";
import { publicBaseUrl, sendInvoiceEmail } from "@/lib/mail";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";
import { nowDate } from "@/lib/time";
import { asc, desc, eq, ilike, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim().toUpperCase();
    const q = searchParams.get("q")?.trim();

    if (reference) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
      if (!booking) return NextResponse.json({ error: `No booking found for reference ${reference}.` }, { status: 404 });
      const events = await db.select().from(bookingEventsTable).where(eq(bookingEventsTable.bookingId, booking.id)).orderBy(asc(bookingEventsTable.createdAt));
      const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.bookingRef, reference)).limit(1);
      return NextResponse.json({ booking, events, invoice: invoice ?? null });
    }

    const rows = q
      ? await db
          .select()
          .from(bookings)
          .where(or(ilike(bookings.reference, `%${q}%`), ilike(bookings.guestName, `%${q}%`), ilike(bookings.phone, `%${q}%`), ilike(bookings.email, `%${q}%`)))
          .orderBy(desc(bookings.createdAt))
      : await db.select().from(bookings).orderBy(desc(bookings.createdAt));

    return NextResponse.json({ bookings: rows });
  } catch (error) {
    console.error("Failed to load admin bookings:", error);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await readSession(request);
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const actorLabel = `${actor.staffCode} — ${actor.name}`;
  try {
    const body = (await request.json()) as {
      id: string;
      status?: string;
      assignedRoom?: string;
      assignedStaffId?: string;
      amountPaid?: number;
      note?: string;
      followUpAt?: string;
      followUpNote?: string;
      action?: "email_invoice" | "add_note" | "approve" | "confirm" | "cancel" | "follow_up";
      recipientEmail?: string;
    };

    if (!body.id) return NextResponse.json({ error: "Booking ID is required." }, { status: 400 });

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, body.id)).limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    // Staff may only approve/confirm/cancel/follow-up + view. Room/staff
    // assignment, payments and deletes stay admin-only.
    const staffOnlyAction =
      body.action === "approve" || body.action === "confirm" || body.action === "cancel" || body.action === "follow_up" ||
      (body.status && ["confirmed", "cancelled"].includes(body.status) && !body.assignedRoom && body.amountPaid === undefined && body.assignedStaffId === undefined);
    if (actor.role === "staff") {
      const wantsAdminField =
        body.assignedRoom !== undefined || body.assignedStaffId !== undefined || body.amountPaid !== undefined ||
        (body.status && !["confirmed", "cancelled"].includes(body.status)) ||
        body.action === "email_invoice";
      if (wantsAdminField && !staffOnlyAction) {
        return NextResponse.json({ error: "Staff can only approve / confirm / cancel / follow-up bookings." }, { status: 403 });
      }
    }

    if (body.action === "approve" || body.action === "confirm") {
      body.status = "confirmed";
    }
    if (body.action === "cancel") {
      body.status = "cancelled";
    }

    // --- Manager note ---
    if (body.action === "add_note") {
      if (!body.note?.trim()) return NextResponse.json({ error: "Note cannot be empty." }, { status: 400 });
      await logBookingEvent(booking.id, booking.reference, "note", `${actorLabel}: ${body.note.trim()}`, "manager", actor);
      await logAudit({
        action: "booking.note_added", entity: "booking", entityId: booking.id, reference: booking.reference,
        summary: `${actorLabel} note on ${booking.reference}: ${body.note.trim().slice(0, 200)}`,
        actor: "manager", actorLabel, ip: clientIp(request),
      });
      return NextResponse.json({ success: true });
    }

    // --- Email invoice (PDF attached) ---
    if (body.action === "email_invoice") {
      const email = (body.recipientEmail || booking.email || "").trim();
      if (!email) return NextResponse.json({ error: "This guest has no email address. Add one or share the PDF via WhatsApp." }, { status: 400 });

      const pdf = await buildInvoicePdf({
        invoiceNumber: booking.invoiceNumber || `INV-${booking.reference}`,
        reference: booking.reference,
        status: booking.status,
        issueDate: new Date(booking.createdAt),
        guestName: booking.guestName,
        phone: booking.phone,
        email,
        roomType: booking.roomType,
        assignedRoom: booking.assignedRoom,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        adults: booking.adults,
        children: booking.children,
        nightlyRate: booking.nightlyRate,
        extras: parseExtras(booking.extras),
        extrasTotal: Math.max(0, booking.totalAmount - booking.nightlyRate * booking.nights),
        totalAmount: booking.totalAmount,
        amountPaid: booking.amountPaid,
        requests: booking.requests,
      });

      const html = `<p>Dear ${booking.guestName},</p><p>Thank you for choosing Sunrise Motel, Area 5, Lilongwe. Please find attached your ${booking.amountPaid >= booking.totalAmount ? "invoice/receipt" : "pro-forma invoice"} <strong>${booking.invoiceNumber}</strong> for booking reference <strong>${booking.reference}</strong> (${booking.roomType}, ${booking.checkIn} to ${booking.checkOut}).</p><p>Total: MWK ${booking.totalAmount.toLocaleString()} · Paid: MWK ${booking.amountPaid.toLocaleString()} · Balance: MWK ${Math.max(0, booking.totalAmount - booking.amountPaid).toLocaleString()}</p><p>Pay by bank transfer, Airtel Money or TNM Mpamba and send proof on WhatsApp +265 998 688 332.</p><p><em>When you are here, you are family.</em></p>`;

      const outcome = await sendInvoiceEmail(email, `Sunrise Motel — ${booking.invoiceNumber} for booking ${booking.reference}`, html, pdf, `${booking.invoiceNumber}.pdf`);
      const now = nowDate();

      if (outcome.sent) {
        await db.update(bookings).set({ invoiceSentAt: now, status: booking.status === "pending" ? "awaiting_payment" : booking.status }).where(eq(bookings.id, booking.id));
        if (booking.invoiceNumber) {
          await db.update(invoicesTable).set({ sentToEmail: email, sentAt: now, status: "sent" }).where(eq(invoicesTable.invoiceNumber, booking.invoiceNumber));
        }
        await logBookingEvent(booking.id, booking.reference, "invoice_emailed", `Invoice ${booking.invoiceNumber} emailed to ${email}.`, "manager", actor);
        await logAudit({
          action: "invoice.emailed", entity: "invoice", entityId: booking.invoiceNumber ?? booking.id, reference: booking.reference,
          summary: `Invoice ${booking.invoiceNumber} emailed to ${email} for ${booking.reference}.`,
          actor: "manager", ip: clientIp(request), metadata: { to: email },
        });
        return NextResponse.json({ success: true, sent: true, message: `Invoice emailed to ${email} with the PDF attached.` });
      }

      await logBookingEvent(booking.id, booking.reference, "invoice_email_failed", `Email to ${email} not sent: ${outcome.reason}`, "system");
      return NextResponse.json({ success: false, sent: false, message: outcome.reason, pdfUrl: `/api/invoices/${booking.reference}` }, { status: 202 });
    }

    // --- General updates: status / room / staff / payment / follow-up ---
    // Staff can only touch status confirm/cancel + follow-up fields (checked above).
    const update: Partial<typeof bookings.$inferInsert> = {};
    const notes: string[] = [];

    if (body.status && body.status !== booking.status) {
      update.status = body.status;
      notes.push(`${actorLabel} changed ${booking.reference} ${booking.status} → ${body.status}`);
    }
    if (body.action === "follow_up") {
      if (body.followUpAt) update.followUpAt = new Date(body.followUpAt);
      if (body.followUpNote !== undefined) update.followUpNote = body.followUpNote || null;
      notes.push(`${actorLabel} requested follow-up on ${booking.reference}${body.followUpNote ? `: ${body.followUpNote}` : ""}`);
    }
    if (body.followUpAt !== undefined && body.action !== "follow_up") update.followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
    if (body.followUpNote !== undefined && body.action !== "follow_up") update.followUpNote = body.followUpNote || null;
    if (body.assignedRoom !== undefined && body.assignedRoom !== booking.assignedRoom) {
      update.assignedRoom = body.assignedRoom || null;
      notes.push(body.assignedRoom ? `Assigned ${body.assignedRoom}` : "Room assignment cleared");
    }
    if (body.assignedStaffId !== undefined && body.assignedStaffId !== booking.assignedStaffId) {
      update.assignedStaffId = body.assignedStaffId || null;
      notes.push(body.assignedStaffId ? `Assigned to staff ${body.assignedStaffId}` : "Staff assignment cleared");
    }
    if (body.amountPaid !== undefined && !Number.isNaN(Number(body.amountPaid))) {
      const paid = Math.max(0, Math.round(Number(body.amountPaid)));
      update.amountPaid = paid;
      notes.push(`Payment recorded: MWK ${paid.toLocaleString()} of MWK ${booking.totalAmount.toLocaleString()}`);
      if (paid >= booking.totalAmount && !body.status) update.status = "confirmed";
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ booking });

    update.updatedAt = nowDate();
    const [updated] = await db.update(bookings).set(update).where(eq(bookings.id, booking.id)).returning();

    if (update.amountPaid !== undefined && updated.invoiceNumber) {
      await db
        .update(invoicesTable)
        .set({ amountPaid: updated.amountPaid, balanceDue: Math.max(0, updated.totalAmount - updated.amountPaid), status: updated.amountPaid >= updated.totalAmount ? "paid" : "sent" })
        .where(eq(invoicesTable.invoiceNumber, updated.invoiceNumber));
    }
    if (update.status === "cancelled" && updated.invoiceNumber) {
      await db.update(invoicesTable).set({ status: "cancelled" }).where(eq(invoicesTable.invoiceNumber, updated.invoiceNumber));
    }

    const action =
      body.action === "follow_up" ? "follow_up_requested"
      : update.amountPaid !== undefined ? "payment_recorded"
      : update.assignedRoom !== undefined && !update.status ? "room_assigned"
      : update.assignedStaffId !== undefined && !update.status ? "staff_assigned"
      : body.action === "approve" ? "approved"
      : body.action === "confirm" ? "confirmed"
      : body.action === "cancel" ? "cancelled"
      : "status_changed";
    await logBookingEvent(booking.id, booking.reference, action, notes.join(" · "), "manager", actor);
    await logAudit({
      action: action === "approved" ? "BOOKING_APPROVED" : action === "cancelled" ? "BOOKING_DECLINED" : `BOOKING_${action.toUpperCase()}`, entity: "booking", entityId: booking.id, reference: booking.reference,
      summary: notes.join(" · ") || `Booking ${booking.reference} updated by ${actorLabel}.`,
      actor: "manager", actorLabel, ip: clientIp(request), metadata: { ...update },
    });

    // Notify guest + admin on approve/confirm/cancel/follow-up
    try {
      const base = publicBaseUrl(request);
      const adminEmail = process.env.ADMIN_EMAIL;
      const subjectMap: Record<string, string> = {
        approved: `Sunrise Motel — booking ${booking.reference} approved`,
        confirmed: `Sunrise Motel — booking ${booking.reference} confirmed`,
        cancelled: `Sunrise Motel — booking ${booking.reference} cancelled`,
        follow_up_requested: `Sunrise Motel — please confirm booking ${booking.reference}`,
        status_changed: `Sunrise Motel — booking ${booking.reference} update`,
      };
      if (["approved", "confirmed", "cancelled", "follow_up_requested", "status_changed"].includes(action)) {
        if (updated.email) {
          const { sendMail } = await import("@/lib/mail");
          const msg =
            action === "cancelled"
              ? `Sorry ${updated.guestName}, booking ${updated.reference} has been cancelled. Reply to this email or WhatsApp +265 998 688 332 if you still need the room.`
              : action === "follow_up_requested"
                ? `Hello ${updated.guestName}, please confirm if you are continuing with booking ${updated.reference} (${updated.roomType}, ${updated.checkIn} → ${updated.checkOut}). Track it here: ${base}/track?ref=${updated.reference}`
                : `Good news ${updated.guestName} — booking ${updated.reference} (${updated.bookingNumber ?? ""}) is ${updated.status}. Track it here: ${base}/track?ref=${updated.reference}`;
          await sendMail({ to: updated.email, subject: subjectMap[action] ?? subjectMap.status_changed, html: `<p>${msg}</p>` });
        }
        if (adminEmail && adminEmail !== updated.email) {
          const { sendMail } = await import("@/lib/mail");
          await sendMail({
            to: adminEmail,
            subject: `${actorLabel} — ${action} ${booking.reference}`,
            html: `<p>${actorLabel} ${action.replace(/_/g, " ")} booking <strong>${booking.reference}</strong> (${updated.guestName}, ${updated.email ?? updated.phone}).</p><p>${notes.join(" · ")}</p>`,
          });
        }
      }
    } catch (notifyErr) {
      console.error("Status notification failed (booking kept):", notifyErr);
    }

    return NextResponse.json({ booking: updated });
  } catch (error) {
    console.error("Failed to update booking:", error);
    return NextResponse.json({ error: "Failed to update booking." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor = await readSession(request);
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSuperAdminRole(actor.role)) return NextResponse.json({ error: "Only Super Admins can delete bookings." }, { status: 403 });
  const actorLabel = `${actor.staffCode} — ${actor.name}`;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Booking ID is required." }, { status: 400 });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    // Retain-then-remove: keep an organised audit record (with full snapshot)
    // before the operational rows are deleted, so future auditing never loses it.
    await logAudit({
      action: "booking.deleted",
      entity: "booking",
      entityId: booking.id,
      reference: booking.reference,
      summary: `Booking ${booking.reference} (${booking.guestName}, ${booking.roomType}, ${booking.checkIn} → ${booking.checkOut}, MWK ${booking.totalAmount.toLocaleString()}) deleted by ${actorLabel}. Snapshot retained in audit log.`,
      actor: "manager",
      actorLabel,
      ip: clientIp(request),
      metadata: {
        guestName: booking.guestName,
        phone: booking.phone,
        email: booking.email,
        roomType: booking.roomType,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        adults: booking.adults,
        children: booking.children,
        totalAmount: booking.totalAmount,
        amountPaid: booking.amountPaid,
        status: booking.status,
        invoiceNumber: booking.invoiceNumber,
        createdAt: booking.createdAt,
      },
    });
    await logBookingEvent(booking.id, booking.reference, "deleted", `Booking deleted by ${actor.name} (${actor.email}).`, "manager", actor);
    await logBookingEvent(booking.id, booking.reference, "deleted", `Booking deleted by manager. Snapshot retained in audit log.`, "manager");

    await db.delete(invoicesTable).where(eq(invoicesTable.bookingRef, booking.reference));
    await db.delete(bookingEventsTable).where(eq(bookingEventsTable.bookingId, id));
    await db.delete(bookings).where(eq(bookings.id, id));
    return NextResponse.json({ success: true, message: `Booking ${booking.reference} deleted and its rooms released.` });
  } catch (error) {
    console.error("Failed to delete booking:", error);
    return NextResponse.json({ error: "Failed to delete booking." }, { status: 500 });
  }
}
