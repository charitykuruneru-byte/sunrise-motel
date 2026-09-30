import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, roomsTable, roomTypesTable } from "@/db/schema";
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
      .select({ roomTypeId: bookings.roomTypeId, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
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
    unassigned: unassigned.map((row) => ({ ...row, roomType: typeName.get(row.roomTypeId) ?? row.roomTypeId })),
    blocks: blocks.map((block) => ({ id: block.id, roomNumber: block.roomNumber, startDate: block.startDate, endDate: block.endDate, reason: block.reason, note: block.note })),
  });
}
