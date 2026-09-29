// ROOM SESSIONS AT THE DESK (addendum "the two guest paths", Parts 16–17).
//
// The front desk has to be able to answer four questions without leaving the counter:
//
//   GET   Which rooms have a live session, who is in them, how they got in (QR card,
//         key-sleeve PIN or booking reference) and when that phone last used it?
//         Which checked-in guests have NO session yet — the gap that leaves a guest
//         unable to order until someone prints the card?
//   POST  rotate_pin   a guest forgot the PIN → mint a new one, shown once, and clear
//                      the lockout so they are not stuck
//         close        close ONE session (lost phone, forgotten check-out)
//         close_room   close every session on a room
//         reopen       open a session again for a stay whose card was never printed
//
// The PIN is the only secret produced here and it is returned once, never logged —
// the same rule the guest-facing OTP follows.

import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, roomSessionsTable, roomsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor } from "@/lib/desk-auth";
import { roomForBooking } from "@/lib/hotel";
import { publicBaseUrl } from "@/lib/mail";
import { ROOM_PIN_RULES, closeRoomSessions, openRoomSession, rotateRoomPin } from "@/lib/room-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const [openSessions, liveBookings] = await Promise.all([
      db
        .select()
        .from(roomSessionsTable)
        .where(eq(roomSessionsTable.status, "open"))
        .orderBy(desc(roomSessionsTable.lastSeenAt)),
      db
        .select()
        .from(bookings)
        .where(inArray(bookings.status, ["checked_in", "confirmed", "awaiting_payment"])),
    ]);

    const bookingIds = openSessions.map((session) => session.bookingId);
    const links = bookingIds.length
      ? await db.select().from(bookings).where(inArray(bookings.id, bookingIds))
      : [];

    const sessions = openSessions.map((session) => {
      const booking = links.find((row) => row.id === session.bookingId) ?? null;
      return {
        sessionId: session.id,
        roomNumber: session.roomNumber,
        guestName: session.guestName,
        reference: booking?.reference ?? null,
        bookingId: session.bookingId,
        openedVia: session.openedVia,
        openedAt: session.openedAt,
        lastSeenAt: session.lastSeenAt,
        pinAttempts: session.pinAttempts,
        pinLocked: Boolean(session.pinLockedUntil && session.pinLockedUntil.getTime() > Date.now()),
        // A no-account guest cannot be pushed to: the desk must ring or WhatsApp.
        reachByPhoneOnly: session.guestId === null,
        guestPhone: booking?.phone ?? null,
      };
    });

    const roomedBookingIds = new Set(openSessions.map((session) => session.bookingId));
    const checkedInWithoutSession = liveBookings.filter(
      (booking) => booking.status === "checked_in" && !roomedBookingIds.has(booking.id),
    );

    return NextResponse.json({
      sessions,
      checkedInWithoutSession: checkedInWithoutSession.map((booking) => ({
        bookingId: booking.id,
        reference: booking.reference,
        guestName: booking.guestName,
        roomNumber: booking.assignedRoom ?? null,
      })),
      pinRules: ROOM_PIN_RULES,
      note:
        "Sessions end by themselves at check-out. The QR card is only a pointer: opening a session for a stay re-points it at that guest and kills the previous one.",
    });
  } catch (error) {
    console.error("Could not load room sessions", error);
    return NextResponse.json({ error: "Could not load room sessions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      action?: string;
      sessionId?: string;
      roomNumber?: string;
      bookingId?: string;
      reason?: string;
    };
    const action = body.action ?? "";

    // ---- A guest forgot the PIN: mint a new one, shown once. ----
    if (action === "rotate_pin") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
      const rotated = await rotateRoomPin(body.sessionId);
      if (!rotated) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      await logAudit({
        action: "room_session.pin_rotated",
        entity: "room_session",
        entityId: rotated.session.id,
        reference: `Room ${rotated.session.roomNumber}`,
        summary: `${auth.label} issued a fresh PIN for Room ${rotated.session.roomNumber} (${rotated.session.guestName}).`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        // Never the digits — only that a new PIN exists.
        metadata: { roomNumber: rotated.session.roomNumber },
      });
      return NextResponse.json({
        success: true,
        pin: rotated.pin,
        roomNumber: rotated.session.roomNumber,
        note: "Write this on the key sleeve and hand it over now — it is not shown again.",
      });
    }

    // ---- Close one session (lost phone / forgotten check-out). ----
    if (action === "close") {
      if (!body.sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
      const [session] = await db
        .select()
        .from(roomSessionsTable)
        .where(eq(roomSessionsTable.id, body.sessionId))
        .limit(1);
      if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      await closeRoomSessions({
        roomNumber: session.roomNumber,
        bookingId: session.bookingId,
        reason: body.reason || `closed by ${auth.label}`,
      });
      await logAudit({
        action: "room_session.closed_by_desk",
        entity: "room_session",
        entityId: session.id,
        reference: `Room ${session.roomNumber}`,
        summary: `${auth.label} closed the room session for Room ${session.roomNumber} (${session.guestName}): ${body.reason || "no reason given"}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, closed: true });
    }

    // ---- Close every session on a room. ----
    if (action === "close_room") {
      if (!body.roomNumber) return NextResponse.json({ error: "roomNumber is required." }, { status: 400 });
      await closeRoomSessions({ roomNumber: body.roomNumber, reason: body.reason || `closed by ${auth.label}` });
      await logAudit({
        action: "room_session.room_closed_by_desk",
        entity: "room_session",
        reference: `Room ${body.roomNumber}`,
        summary: `${auth.label} closed all room sessions for Room ${body.roomNumber}: ${body.reason || "no reason given"}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true });
    }


    // ---- Open a session for a stay whose card was never printed. ----
    if (action === "reopen") {
      if (!body.bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1);
      if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      const room = await roomForBooking(booking);
      const roomNumber = room?.roomNumber ?? booking.assignedRoom?.replace(/[^0-9]/g, "") ?? body.roomNumber;
      if (!roomNumber) {
        return NextResponse.json(
          { error: "Assign a physical room to this stay first (Room map → assign)." },
          { status: 400 },
        );
      }
      const opened = await openRoomSession({
        bookingId: booking.id,
        guestId: booking.guestId,
        roomNumber,
        guestName: booking.guestName,
      });
      if (room) {
        await db.update(roomsTable).set({ state: "occupied", updatedAt: new Date() }).where(eq(roomsTable.id, room.id));
      }
      await logAudit({
        action: "room_session.reopened_by_desk",
        entity: "room_session",
        entityId: opened.session.id,
        reference: booking.reference,
        summary: `${auth.label} opened a room session for ${booking.guestName} in Room ${roomNumber} (${booking.reference}).`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { roomNumber },
      });
      return NextResponse.json({
        success: true,
        pin: opened.pin,
        roomNumber,
        roomUrl: `${publicBaseUrl(request)}/room?qr=${opened.qrToken}`,
        qrToken: opened.qrToken,
        note: "Print the card and write the PIN on the key sleeve. Both die at check-out.",
      });
    }

    return NextResponse.json(
      { error: `Unknown action "${action}". Use rotate_pin, close, close_room or reopen.` },
      { status: 400 },
    );
  } catch (error) {
    console.error("Room session action failed", error);
    return NextResponse.json({ error: "Could not complete that room session action." }, { status: 500 });
  }
}

