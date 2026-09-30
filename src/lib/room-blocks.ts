// DATED BLOCKS — "this room is not sellable between these nights".
//
// A room's `state` says what it is doing right now (dirty, occupied, out of order);
// it cannot say "not next Tuesday". Blocks can, and they must affect SELLING, not just
// the calendar drawing: a room held back for painting that the website still sells is
// worse than no calendar at all.
//
// The rule is the same overlap rule the rest of the system uses for stays:
//   block.startDate < requested.checkOut  AND  block.endDate > requested.checkIn
// A room whose block ends on your check-in day is free that night, exactly like a guest
// who checks out that morning.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { roomBlocksTable, roomsTable } from "@/db/schema";

export type BlockRow = typeof roomBlocksTable.$inferSelect;

/** Blocks that overlap a stay window, oldest first. */
export async function blocksOverlapping(checkIn: string, checkOut: string) {
  return db
    .select()
    .from(roomBlocksTable)
    .where(and(sql`${roomBlocksTable.startDate} < ${checkOut}`, sql`${roomBlocksTable.endDate} > ${checkIn}`));
}

/**
 * How many rooms of each type are blocked for a window. Booking availability subtracts
 * this alongside live bookings — so blocking a room actually takes it off sale.
 */
export async function blockedCountByRoomType(checkIn: string, checkOut: string) {
  const blocks = await blocksOverlapping(checkIn, checkOut);
  const counts: Record<string, number> = {};
  if (blocks.length === 0) return counts;

  // A block stores the room NUMBER; the sellable unit is the room TYPE, so resolve the
  // numbers to types once. Legacy rows without a type fall back to the rooms table.
  const numbers = [...new Set(blocks.map((block) => block.roomNumber))];
  const rows = await db
    .select({ roomNumber: roomsTable.roomNumber, roomTypeId: roomsTable.roomTypeId })
    .from(roomsTable)
    .where(inArray(roomsTable.roomNumber, numbers));
  const typeOfRoom: Record<string, string> = {};
  for (const row of rows) typeOfRoom[row.roomNumber] = row.roomTypeId;

  for (const block of blocks) {
    const typeId = block.roomTypeId ?? typeOfRoom[block.roomNumber];
    if (!typeId) continue;
    counts[typeId] = (counts[typeId] ?? 0) + 1;
  }
  return counts;
}

/** Everything the calendar needs to draw one window. */
export async function blocksBetween(from: string, to: string) {
  return db
    .select()
    .from(roomBlocksTable)
    .where(and(sql`${roomBlocksTable.startDate} < ${to}`, sql`${roomBlocksTable.endDate} > ${from}`))
    .orderBy(roomBlocksTable.startDate);
}

/** True when this room number is blocked on this night — used by the grid's own legend. */
export function blockCoversNight(block: BlockRow, night: string) {
  return block.startDate <= night && block.endDate > night;
}

/** Remove blocks that no longer cover any future night (housekeeping, run by hand). */
export async function pruneExpiredBlocks(today: string) {
  const { lt } = await import("drizzle-orm");
  await db.delete(roomBlocksTable).where(lt(roomBlocksTable.endDate, today));
}

export async function roomIdForNumber(roomNumber: string) {
  const [room] = await db.select({ id: roomsTable.id }).from(roomsTable).where(eq(roomsTable.roomNumber, roomNumber)).limit(1);
  return room?.id ?? null;
}
