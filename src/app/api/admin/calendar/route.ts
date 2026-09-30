import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, roomBlocksTable, roomsTable, roomTypesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { ROOM_HOLDING_STATUSES, ensureRoomsSeeded, roomIsFree } from "@/lib/hotel";
import { isManagerRole, readSession } from "@/lib/staff-auth";
import { blocksBetween } from "@/lib/room-blocks";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/calendar?from=YYYY-MM-DD&days=30
 *
 * One row per PHYSICAL room, one column per night, computed from rows that exist:
 *   * `stays`  — bookings with an `assignedRoomId`, which is what the desk assigns at
 *                check-in, so a blue cell means a real room is really taken;
 *   * `blocks` — dated holds, red;
 *   * `state`  — what the room is doing today (dirty, out of order), yellow;
 *   * what is left is genuinely free.
 *
 * Bookings that have NOT been assigned to a physical room are reported separately
 * (`unassigned`) rather than being painted onto a room that was never chosen for them —
 * a grid that invents an assignment is worse than one that admits the gap.
 */
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? malawiDatePart();
  const days = Math.min(60, Math.max(7, Number(searchParams.get("days")) || 30));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: "Use a date like 2026-10-01." }, { status: 400 });

  // The grid is drawn per PHYSICAL room. Those rows are created by the desk console on
  // first use, which meant a fresh deployment had room types but no rooms to draw — so
  // the calendar, the board and blocking all looked empty. Seed them here too; the
  // helper is idempotent and returns immediately once they exist.
  await ensureRoomsSeeded();

  const start = new Date(`${from}T00:00:00Z`);
  const windowDays: string[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start.getTime() + index * 86_400_000);
    windowDays.push(day.toISOString().slice(0, 10));
  }
  const to = windowDays[windowDays.length - 1];

  const [rooms, types, stays, unassigned, blocks] = await Promise.all([
    db.select().from(roomsTable).orderBy(roomsTable.roomNumber),
    db.select({ id: roomTypesTable.id, name: roomTypesTable.name, isActive: roomTypesTable.isActive }).from(roomTypesTable),
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        bookingNumber: bookings.bookingNumber,
        guestName: bookings.guestName,
        roomTypeId: bookings.roomTypeId,
        assignedRoomId: bookings.assignedRoomId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
      })
      .from(bookings)
      .where(and(ne(bookings.status, "cancelled"), sql`${bookings.checkIn} < ${to}`, sql`${bookings.checkOut} > ${from}`)),
    db
      .select({ id: bookings.id, reference: bookings.reference, guestName: bookings.guestName, roomTypeId: bookings.roomTypeId, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
      .from(bookings)
      .where(
        and(
          ne(bookings.status, "cancelled"),
          sql`${bookings.assignedRoomId} is null`,
          sql`${bookings.checkIn} < ${to}`,
          sql`${bookings.checkOut} > ${from}`,
        ),
      ),
    blocksBetween(from, to),
  ]);

  const typeName = new Map(types.map((type) => [type.id, type.name]));
  return NextResponse.json({
    from,
    to,
    days: windowDays,
    today: malawiDatePart(),
    rooms: rooms.map((room) => ({
      id: room.id,
      roomNumber: room.roomNumber,
      floor: room.floor,
      state: room.state,
      roomTypeId: room.roomTypeId,
      roomType: typeName.get(room.roomTypeId) ?? room.roomType,
      isActive: room.isActive,
    })),
    stays,
    unassigned: await Promise.all(
      unassigned.map(async (row) => {
        // Rooms a manager could actually put this booking into: right type, not blocked for
        // those nights, and not already holding another stay. Computed here so the page
        // never offers a room the write would refuse.
        const options: string[] = [];
        for (const room of rooms) {
          if (!room.isActive || room.roomTypeId !== row.roomTypeId) continue;
          // The write refuses a dirty or out-of-order room, so the picker must not offer one.
          if (room.state === "dirty" || room.state === "out_of_order") continue;
          if (blocks.some((block) => block.roomNumber === room.roomNumber && block.startDate < row.checkOut && block.endDate > row.checkIn)) continue;
          if (await roomIsFree(room.id, row.checkIn, row.checkOut)) options.push(room.id);
        }
        return { ...row, roomType: typeName.get(row.roomTypeId) ?? row.roomTypeId, roomOptions: options };
      }),
    ),
    blocks: blocks.map((block) => ({ id: block.id, roomNumber: block.roomNumber, startDate: block.startDate, endDate: block.endDate, reason: block.reason, note: block.note })),
  });
}

/**
 * PATCH /api/admin/calendar — put a booking into a physical room, or take it back out.
 *
 * The same decision the desk makes at check-in, with the same guards (`roomIsFree`, and a
 * dirty room refusing the assignment) plus one the calendar knows about and the desk does
 * not need: a room blocked for those nights is not offered.
 *
 * It exists because the calendar listed stays with no room chosen and gave nobody a way to
 * resolve them — an unassigned booking is invisible to housekeeping and to the room grid,
 * which is the kind of gap that surfaces at 22:00.
 */
export async function PATCH(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  try {
    const body = (await request.json()) as { bookingId?: string; roomId?: string | null };
    const bookingId = (body.bookingId ?? "").trim();
    if (!bookingId) return NextResponse.json({ error: "Which booking?" }, { status: 400 });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (!ROOM_HOLDING_STATUSES.includes(booking.status)) {
      return NextResponse.json({ error: `That booking is ${booking.status} — only a live stay holds a room.` }, { status: 409 });
    }
    const actor = `${user.staffCode} — ${user.name}`;

    if (!body.roomId) {
      if (!booking.assignedRoomId) return NextResponse.json({ success: true, unassigned: true });
      await db.update(bookings).set({ assignedRoomId: null, assignedRoom: null, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      await logAudit({
        action: "booking.room_unassigned",
        entity: "booking",
        entityId: booking.id,
        reference: booking.reference,
        targetEmail: booking.email,
        summary: `${actor} removed the room from ${booking.guestName}'s booking ${booking.reference}.`,
        actor: "manager",
        actorLabel: actor,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        ip: clientIp(request),
        metadata: { roomId: booking.assignedRoomId },
      });
      return NextResponse.json({ success: true, unassigned: true });
    }

    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, body.roomId)).limit(1);
    if (!room || !room.isActive) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (room.roomTypeId !== booking.roomTypeId) {
      return NextResponse.json({ error: `Room ${room.roomNumber} is a ${room.roomType}; this booking is for a ${booking.roomType}. Changing the room type changes the price, so do that from the booking itself.` }, { status: 409 });
    }
    if (room.state === "dirty") {
      return NextResponse.json({ error: `Room ${room.roomNumber} is still dirty. Mark it clean before assigning a guest to it.` }, { status: 409 });
    }
    if (room.state === "out_of_order") {
      return NextResponse.json({ error: `Room ${room.roomNumber} is out of order. Bring it back into service first.` }, { status: 409 });
    }
    const blocked = await db
      .select({ id: roomBlocksTable.id })
      .from(roomBlocksTable)
      .where(and(eq(roomBlocksTable.roomNumber, room.roomNumber), sql`${roomBlocksTable.startDate} < ${booking.checkOut}`, sql`${roomBlocksTable.endDate} > ${booking.checkIn}`))
      .limit(1);
    if (blocked.length > 0) return NextResponse.json({ error: `Room ${room.roomNumber} is blocked for those nights. Release the block first.` }, { status: 409 });
    const free = await roomIsFree(room.id, booking.checkIn, booking.checkOut, booking.id);
    if (!free) return NextResponse.json({ error: `Room ${room.roomNumber} is already held for overlapping nights.` }, { status: 409 });

    await db.update(bookings).set({ assignedRoomId: room.id, assignedRoom: `Room ${room.roomNumber}`, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    await logAudit({
      action: "booking.room_assigned",
      entity: "booking",
      entityId: booking.id,
      reference: booking.reference,
      targetEmail: booking.email,
      summary: `${actor} assigned Room ${room.roomNumber} (${room.roomType}) to ${booking.guestName} · ${booking.reference} (${booking.checkIn} → ${booking.checkOut}).`,
      actor: "manager",
      actorLabel: actor,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: clientIp(request),
      metadata: { roomNumber: room.roomNumber, roomId: room.id, reference: booking.reference },
    });
    return NextResponse.json({ success: true, roomNumber: room.roomNumber });
  } catch (error) {
    console.error("Assigning a room failed", error);
    return NextResponse.json({ error: "Could not assign that room." }, { status: 500 });
  }
}

