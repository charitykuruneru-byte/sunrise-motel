// Property core helpers shared by the desk API and the guest app:
// physical-room seeding, guest identity matching, active-stay resolution and the
// running room bill (folio). Everything here is server-side only.

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings, folioItemsTable, guestsTable, roomsTable, roomTypesTable } from "@/db/schema";

/** MWK money formatting — integer Kwacha, never decimals. */
export function MWK(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-US")}`;
}

export const ROOM_STATES = ["available", "occupied", "dirty", "clean", "inspected", "out_of_order"] as const;
/** Statuses that still hold a physical room. */
export const ROOM_HOLDING_STATUSES = ["pending", "awaiting_payment", "confirmed", "checked_in"];

/**
 * Create one physical room per unit of every room type, once. Room numbers are
 * 1xx / 2xx / 3xx by room type, which is how the desk already thinks.
 */
export async function ensureRoomsSeeded() {
  const existing = await db.select({ id: roomsTable.id }).from(roomsTable).limit(1);
  if (existing.length > 0) return;
  const types = await db.select().from(roomTypesTable);
  if (types.length === 0) return;
  const rows: (typeof roomsTable.$inferInsert)[] = [];
  types.forEach((type, typeIndex) => {
    for (let unit = 1; unit <= type.totalInventory; unit += 1) {
      rows.push({
        id: randomUUID(),
        roomNumber: `${typeIndex + 1}${String(unit).padStart(2, "0")}`,
        roomTypeId: type.id,
        roomType: type.name,
        floor: String(typeIndex + 1),
        state: "available",
        isActive: true,
      });
    }
  });
  if (rows.length > 0) await db.insert(roomsTable).values(rows).onConflictDoNothing();
}

/**
 * The guest identity behind a booking. Matched on phone first, then email, so a
 * returning guest keeps their stay history instead of being duplicated.
 */
export async function findOrCreateGuest(input: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
}) {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  const conditions = [
    phone ? eq(guestsTable.phone, phone) : undefined,
    email ? eq(guestsTable.email, email) : undefined,
  ].filter(Boolean);
  if (conditions.length > 0) {
    const found = await db
      .select()
      .from(guestsTable)
      .where(conditions.length === 1 ? (conditions[0] as never) : or(...(conditions as never[])))
      .limit(1);
    if (found[0]) {
      const patch: Partial<typeof guestsTable.$inferInsert> = {};
      if (email && !found[0].email) patch.email = email;
      if (phone && !found[0].phone) patch.phone = phone;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await db.update(guestsTable).set(patch).where(eq(guestsTable.id, found[0].id));
      }
      return found[0];
    }
  }
  const [created] = await db
    .insert(guestsTable)
    .values({
      id: randomUUID(),
      fullName: input.fullName.trim() || "Guest",
      phone,
      email,
      country: input.country?.trim() || null,
    })
    .returning();
  return created!;
}

export type Stay = typeof bookings.$inferSelect;

/**
 * "Which room am I in?" — a booking linked to this guest whose status is
 * confirmed/checked_in and where today falls inside the stay. More than one
 * match means the app shows a stay picker; none means "no active stay".
 */
export async function resolveStays(guestId: string, today: string) {
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.guestId, guestId), inArray(bookings.status, ["confirmed", "checked_in"])))
    .orderBy(desc(bookings.checkIn));
  const past = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.guestId, guestId), inArray(bookings.status, ["checked_out", "cancelled", "no_show"])))
    .orderBy(desc(bookings.checkOut))
    .limit(20);
  return {
    active: rows.filter((b) => b.checkIn <= today && today < b.checkOut),
    upcoming: rows.filter((b) => b.checkIn > today),
    past,
  };
}

/** The folio is the sum of open items — the single source of the room bill. */
export function folioTotals(items: { status: string; amount: number; category: string }[]) {
  const open = items.filter((i) => i.status === "open");
  const byCategory = open.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + item.amount;
    return acc;
  }, {});
  return {
    total: open.reduce((sum, i) => sum + i.amount, 0),
    byCategory,
    openCount: open.length,
  };
}

export async function loadFolio(bookingId: string) {
  return db
    .select()
    .from(folioItemsTable)
    .where(eq(folioItemsTable.bookingId, bookingId))
    .orderBy(folioItemsTable.createdAt);
}

/** Post a charge to the room bill. `amount` is qty × unit price unless given. */
export async function postFolioItem(input: {
  bookingId: string | null;
  roomNumber: string | null;
  category: "room" | "extras" | "order" | "late_checkout" | "damage" | "adjustment";
  description: string;
  qty?: number;
  unitPrice: number;
  amount?: number;
  orderId?: string | null;
  postedByLabel: string;
}) {
  const qty = input.qty ?? 1;
  const [row] = await db
    .insert(folioItemsTable)
    .values({
      id: randomUUID(),
      bookingId: input.bookingId,
      roomNumber: input.roomNumber,
      category: input.category,
      description: input.description.slice(0, 200),
      qty,
      unitPrice: input.unitPrice,
      amount: input.amount ?? qty * input.unitPrice,
      orderId: input.orderId ?? null,
      postedByLabel: input.postedByLabel,
      status: "open",
    })
    .returning();
  return row!;
}

/** ORD-260926-001 style order numbers. */
export function nextOrderNumber(compactDate: string, sequence: number) {
  return `ORD-${compactDate}-${String(sequence).padStart(3, "0")}`;
}

/** Due time from priority: urgent 15 min, normal 2 h, emergency 5 min (§6). */
export function taskDueBy(priority: string) {
  const minutes = priority === "emergency" ? 5 : priority === "urgent" ? 15 : 120;
  return new Date(Date.now() + minutes * 60_000);
}

/** Find the room row for a booking (v2 link first, legacy free text second). */
export async function roomForBooking(booking: Stay) {
  if (booking.assignedRoomId) {
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, booking.assignedRoomId)).limit(1);
    if (room) return room;
  }
  const number = booking.assignedRoom?.replace(/[^0-9]/g, "");
  if (number) {
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.roomNumber, number)).limit(1);
    if (room) return room;
  }
  return null;
}

/**
 * Is the room free for these dates? Overlap counting is what stops the same room
 * being sold twice; cancelled / no-show / released stays do not hold a room.
 */
export async function roomIsFree(roomId: string, checkIn: string, checkOut: string, ignoreBookingId?: string) {
  const rows = await db
    .select({ id: bookings.id, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
    .from(bookings)
    .where(and(eq(bookings.assignedRoomId, roomId), inArray(bookings.status, ROOM_HOLDING_STATUSES)));
  return rows.every((row) => row.id === ignoreBookingId || !(row.checkIn < checkOut && checkIn < row.checkOut));
}

/** Rooms already committed elsewhere for the same night range. */
export async function roomsBusyForRange(checkIn: string, checkOut: string) {
  const rows = await db
    .select({ roomId: bookings.assignedRoomId, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
    .from(bookings)
    .where(inArray(bookings.status, ROOM_HOLDING_STATUSES));
  return new Set(
    rows.filter((r) => r.roomId && r.checkIn < checkOut && checkIn < r.checkOut).map((r) => r.roomId as string),
  );
}

/**
 * Is the kitchen taking orders right now? The guest menu shows "Order now" or "Opens
 * at 07:00" from this, and the desk sees the same value, so the two can never
 * disagree about whether an order should have been accepted.
 */
export function serviceWindow() {
  const open = Number(process.env.KITCHEN_OPEN_HOUR ?? 7);
  const close = Number(process.env.KITCHEN_CLOSE_HOUR ?? 22);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Blantyre", hour: "2-digit", hour12: false }).format(new Date()),
  );
  const label = `${String(open).padStart(2, "0")}:00`;
  return {
    open,
    close,
    hour,
    isOpen: hour >= open && hour < close,
    openLabel: label,
    closeLabel: `${String(close).padStart(2, "0")}:00`,
  };
}

