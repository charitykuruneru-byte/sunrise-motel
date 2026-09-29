// Property core helpers shared by the desk API and the guest app:
// physical-room seeding, guest identity matching, active-stay resolution and the
// running room bill (folio). Everything here is server-side only.

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, folioItemsTable, guestsTable, roomsTable, roomTypesTable } from "@/db/schema";
import { normaliseEmail, normalisePhone, phoneKey } from "@/lib/phone";

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
 * The guest identity behind a booking — ONE EMAIL + ONE PHONE = ONE GUEST, forever.
 *
 * Matching is deliberately tolerant of how the number was typed. The guest who booked
 * as "0888 123 456" last year and "+265 888 123 456" today is the SAME person, and the
 * proof is their nine significant digits, not the string they happened to type. So the
 * comparison happens on `right(digits, 9)` — in SQL, so it also catches rows written
 * before this rule existed (an old "0888…" row still matches a new "+265888…" booking).
 * Emails are compared lower-cased for the same reason.
 *
 * `phoneKey()` returns null when the value is not a number at all ("n/a", "ask at
 * desk"), and a null key simply does not participate in matching: two rows that both
 * say "n/a" are NOT the same guest, and must never be merged into one.
 *
 * This is the only place a guest identity is created. Every write path — the public
 * booking form, the desk, the guest app — goes through here, which is what stops a
 * returning guest being duplicated.
 */
export async function findOrCreateGuest(input: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
}) {
  const rawPhone = input.phone?.trim() || null;
  const key = phoneKey(rawPhone);
  const phone = normalisePhone(rawPhone) ?? rawPhone; // canonical, or the label as typed
  const email = normaliseEmail(input.email);

  const conditions: unknown[] = [];
  if (key) {
    conditions.push(sql`right(regexp_replace(${guestsTable.phone}, '[^0-9]', '', 'g'), 9) = ${key}`);
  }
  if (email) {
    conditions.push(sql`lower(${guestsTable.email}) = ${email}`);
  }

  if (conditions.length > 0) {
    const found = await db
      .select()
      .from(guestsTable)
      .where(conditions.length === 1 ? (conditions[0] as never) : or(...(conditions as never[])))
      .limit(1);
    if (found[0]) {
      const patch: Partial<typeof guestsTable.$inferInsert> = {};
      // Upgrade the row in place: a legacy spelling becomes the canonical one, so the
      // next match is exact. Only ever when we actually have a number to canonicalise.
      if (phone && found[0].phone !== phone) patch.phone = phone;
      if (email && found[0].email !== email) patch.email = email;
      if (!found[0].fullName?.trim() && input.fullName.trim()) patch.fullName = input.fullName.trim();
      if (input.country?.trim() && !found[0].country) patch.country = input.country.trim();
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await db.update(guestsTable).set(patch).where(eq(guestsTable.id, found[0].id));
      }
      return { ...found[0], ...patch } as typeof found[0];
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

