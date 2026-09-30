import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, guestsTable, roomsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { logBookingEvent } from "@/lib/booking-events";
import { deskActor } from "@/lib/desk-auth";
import { buildFolioInvoice, settleFolio } from "@/lib/folio-invoice";
import { folioTotals, loadFolio, postFolioItem, roomForBooking } from "@/lib/hotel";
import { publicBaseUrl } from "@/lib/mail";
import { notifyWaitlistForDates, requestReview } from "@/lib/reviews";
import { closeRoomSessions, openRoomSession } from "@/lib/room-session";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The stay lifecycle: check-in, check-out, no-show.
 *
 * Check-in posts the room charge to the folio once (nights × rate + extras), so
 * the guest's running bill is complete from the first night. Check-out makes the
 * room `dirty` (back in inventory), settles the folio and generates the invoice
 * FROM the folio. No-show flags the guest and releases the room (§12).
 *
 * ADDENDUM (the two guest paths) — the room session is opened HERE, at check-in:
 * one call re-points the QR card on the nightstand at this guest and mints the
 * 4-digit PIN for the key sleeve, both returned once for printing. Check-out closes
 * it (the photographed card dies that second) AND sends the review request; a
 * no-show closes it too and hands the released dates to the waitlist.
 */
export async function POST(request: Request) {
  const auth = await deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as { bookingId?: string; action?: string; roomId?: string; reason?: string };
    const bookingId = body.bookingId ?? "";
    const action = body.action ?? "";
    if (!bookingId || !action) {
      return NextResponse.json({ error: "bookingId and action are required." }, { status: 400 });
    }

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const today = malawiDatePart();

    // ---- CHECK IN ----
    if (action === "check_in") {
      let room = await roomForBooking(booking);
      if (!room && body.roomId) {
        const [byId] = await db.select().from(roomsTable).where(eq(roomsTable.id, body.roomId)).limit(1);
        room = byId ?? null;
      }
      if (!room) {
        return NextResponse.json(
          { error: "Assign a physical room before checking this guest in (Room map → assign)." },
          { status: 400 },
        );
      }
      await db
        .update(bookings)
        .set({
          status: "checked_in",
          assignedRoomId: room.id,
          assignedRoom: `Room ${room.roomNumber}`,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
      await db.update(roomsTable).set({ state: "occupied", updatedAt: new Date() }).where(eq(roomsTable.id, room.id));

      // Post the room charge once — the folio is the basis of the invoice.
      const existingFolio = await loadFolio(booking.id);
      const alreadyPosted = existingFolio.some((item) => item.category === "room" && item.status !== "voided");
      if (!alreadyPosted) {
        const roomAmount =
          booking.nightlyRate * booking.nights +
          (booking.serviceFee ?? 0) +
          (booking.extensionFee ?? 0) -
          (booking.discount ?? 0);
        await postFolioItem({
          bookingId: booking.id,
          roomNumber: room.roomNumber,
          category: "room",
          description: `${booking.roomType} · ${booking.nights} night${booking.nights === 1 ? "" : "s"} @ ${booking.nightlyRate.toLocaleString()} (${booking.checkIn} → ${booking.checkOut})`,
          qty: booking.nights,
          unitPrice: booking.nightlyRate,
          amount: roomAmount,
          postedByLabel: auth.label,
        });
      }
      await buildFolioInvoice(booking.id);
      await logBookingEvent(
        booking.id,
        booking.reference,
        "status_changed",
        `${auth.label}: checked in to Room ${room.roomNumber}`,
        "manager",
        auth.user,
      );
      await logAudit({
        action: "BOOKING_CHECKED_IN",
        entity: "booking",
        entityId: booking.id,
        reference: booking.reference,
        summary: `${auth.label} checked ${booking.guestName} into Room ${room.roomNumber} (${booking.reference}).`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { roomNumber: room.roomNumber, date: today },
      });
      const folio = await loadFolio(booking.id);

      // ADDENDUM (two guest paths): check-in is the moment the no-account guest gets
      // in. Opening the session rotates the QR card onto this guest and mints the
      // 4-digit PIN for the key sleeve — shown ONCE, here, so the desk can print the
      // card and write the PIN on the sleeve. Nothing is stored in readable form.
      const opened = await openRoomSession({
        bookingId: booking.id,
        guestId: booking.guestId,
        roomNumber: room.roomNumber,
        guestName: booking.guestName,
      });
      await logAudit({
        action: "room_session.opened_at_check_in",
        entity: "room_session",
        entityId: opened.session.id,
        reference: booking.reference,
        summary: `${auth.label} checked ${booking.guestName} in and opened the room session for Room ${room.roomNumber}: QR card re-pointed and a fresh PIN issued.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        // The PIN itself never reaches a log — only the fact that one exists.
        metadata: { roomNumber: room.roomNumber, sessionId: opened.session.id, pinIssued: true },
      });
      return NextResponse.json({
        success: true,
        roomNumber: room.roomNumber,
        folio: folioTotals(folio),
        roomAccess: {
          sessionId: opened.session.id,
          pin: opened.pin,
          roomUrl: `${publicBaseUrl(request)}/room?qr=${opened.qrToken}`,
          qrToken: opened.qrToken,
          note:
            "Print the QR card and write the PIN on the key sleeve. Both work until check-out — and a photograph of the card stops working the moment this stay ends.",
        },
      });
    }
    // ---- CHECK OUT ----
    if (action === "check_out") {
      const room = await roomForBooking(booking);
      await db.update(bookings).set({ status: "checked_out", updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      // Room goes dirty and straight back into inventory (§12 room auto-dirty).
      if (room) {
        await db.update(roomsTable).set({ state: "dirty", updatedAt: new Date() }).where(eq(roomsTable.id, room.id));
      }
      const invoice = await buildFolioInvoice(booking.id);
      await settleFolio(booking.id);

      // Guest stats: stay_count / total_spent / is_regular (§12 guest stats).
      if (booking.guestId) {
        const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
        if (guest) {
          const stayCount = guest.stayCount + 1;
          await db
            .update(guestsTable)
            .set({
              stayCount,
              totalSpent: guest.totalSpent + (invoice?.totalAmount ?? booking.totalAmount),
              isRegular: stayCount >= 3,
              updatedAt: new Date(),
            })
            .where(eq(guestsTable.id, guest.id));
        }
      }

      await logBookingEvent(
        booking.id,
        booking.reference,
        "status_changed",
        `${auth.label}: checked out${room ? ` from Room ${room.roomNumber}` : ""}`,
        "manager",
        auth.user,
      );

      // ADDENDUM (two guest paths): the room's access dies with the stay. The QR card
      // on the nightstand and the PIN on the key sleeve stop working in this second —
      // including on the phone of anyone who photographed the card.
      await closeRoomSessions({
        bookingId: booking.id,
        roomNumber: room?.roomNumber,
        reason: "checked out",
      });
      // Then ask how it was: one tap, five stars, and only once ever for this stay.
      const reviewRequest = await requestReview(booking.id);

      await logAudit({
        action: "BOOKING_CHECKED_OUT",
        entity: "booking",
        entityId: booking.id,
        reference: booking.reference,
        summary: `${auth.label} checked ${booking.guestName} out${room ? ` of Room ${room.roomNumber}` : ""} — invoice ${invoice?.invoiceNumber ?? "—"} for MWK ${(invoice?.totalAmount ?? 0).toLocaleString()}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { invoiceNumber: invoice?.invoiceNumber ?? null, balanceDue: invoice?.balanceDue ?? 0 },
      });
      return NextResponse.json({
        success: true,
        invoice,
        roomAccessClosed: true,
        reviewRequest: {
          sent: reviewRequest.sent,
          note: reviewRequest.sent
            ? "The guest has been asked how the stay was — one tap, and it goes straight to the manager."
            : reviewRequest.reason,
        },
      });
    }

    // ---- NO SHOW ----
    if (action === "no_show") {
      const room = await roomForBooking(booking);
      await db.update(bookings).set({ status: "no_show", updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      if (room) {
        await db.update(roomsTable).set({ state: "available", updatedAt: new Date() }).where(eq(roomsTable.id, room.id));
      }
      if (booking.guestId) {
        await db
          .update(guestsTable)
          .set({ isNoShow: true, updatedAt: new Date() })
          .where(eq(guestsTable.id, booking.guestId));
      }
      await logBookingEvent(
        booking.id,
        booking.reference,
        "status_changed",
        `${auth.label}: marked no-show (${body.reason ?? "did not arrive"})`,
        "manager",
        auth.user,
      );

      // ADDENDUM (two guest paths + landing page): the stay is dead, so its room
      // session is closed, and these nights are exactly what the waitlist is for —
      // the released dates are offered to whoever is waiting before they go public.
      await closeRoomSessions({
        bookingId: booking.id,
        roomNumber: room?.roomNumber,
        reason: "no show — access released",
      });
      const waitlist = await notifyWaitlistForDates({
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        roomTypeId: booking.roomTypeId,
      });

      await logAudit({
        action: "BOOKING_NO_SHOW",
        entity: "booking",
        entityId: booking.id,
        reference: booking.reference,
        summary: `${auth.label} marked ${booking.guestName} (${booking.reference}) as no-show — room released${
          waitlist.notified > 0 ? ` and ${waitlist.notified} waiting guest(s) told the nights are free` : ""
        }.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { waitlistNotified: waitlist.notified },
      });
      return NextResponse.json({ success: true, roomAccessClosed: true, waitlistNotified: waitlist.notified });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    console.error("Stay action failed", error);
    return NextResponse.json({ error: "Could not complete that stay action." }, { status: 500 });
  }
}
