// The ROOM SESSION — the second, first-class way to be a guest (addendum "The Two
// Guest Paths"). A guest with no account proves "I am in Room 104 right now" with
//
//   1. the QR card in the room                              (openedVia: "qr")
//   2. the room number + a 4-digit PIN on the key sleeve     ("pin")
//   3. their booking reference + the phone they booked with  ("reference")
//
// and gets the same menu, the same room bill, the same private line to the desk and
// the same receipt as an account guest. What changes is only how they are notified.
//
// Security rules from the addendum, enforced here:
//   * the QR value is only a POINTER — it is re-pointed at the new guest at every
//     check-in and cleared at check-out, so a photographed card is dead afterwards;
//   * the PIN is 4 digits, unique to the stay, NEVER the room number, and locks
//     after 3 wrong attempts;
//   * a charge can only land on a folio with an active stay, and ordering to a room
//     requires an open session for that room.

import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, roomSessionsTable } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";

export const ROOM_COOKIE = "sunrise_room";
const PIN_MAX_ATTEMPTS = 3;
const PIN_LOCK_MINUTES = 15;

export function hashQrToken(token: string) {
  return createHash("sha256").update(`room:${token}`).digest("hex");
}

export function newQrToken() {
  return randomBytes(18).toString("base64url");
}

/** 4 digits, and never equal to the room number (addendum Part 16). */
export function newPin(roomNumber: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (pin !== roomNumber && pin !== roomNumber.padStart(4, "0")) return pin;
  }
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Kept for callers that want to compare a PIN without opening a session. */
export function pinMatches(pin: string, hash: string, salt: string) {
  void safeEqual;
  return verifyPassword(pin, salt, hash);
}

/**
 * Open (or rotate) the room session for a stay. Called at CHECK-IN: the previous
 * session for the room is closed first, so the QR card on the nightstand re-points
 * itself at the new guest and the old guest's access dies immediately.
 */
export async function openRoomSession(opts: {
  bookingId: string;
  guestId?: string | null;
  roomNumber: string;
  guestName: string;
}) {
  await closeRoomSessions({ roomNumber: opts.roomNumber, reason: "rotated for a new guest" });
  const qrToken = newQrToken();
  const pin = newPin(opts.roomNumber);
  const { salt, hash } = await hashPassword(pin);
  const [row] = await db
    .insert(roomSessionsTable)
    .values({
      id: randomUUID(),
      bookingId: opts.bookingId,
      guestId: opts.guestId ?? null,
      roomNumber: opts.roomNumber,
      guestName: opts.guestName,
      qrTokenHash: hashQrToken(qrToken),
      pinHash: hash,
      pinSalt: salt,
      openedVia: "desk",
      status: "open",
    })
    .returning();
  return { session: row!, qrToken, pin };
}

export async function closeRoomSessions(opts: { roomNumber?: string; bookingId?: string; reason?: string }) {
  const filters = [
    opts.roomNumber ? eq(roomSessionsTable.roomNumber, opts.roomNumber) : undefined,
    opts.bookingId ? eq(roomSessionsTable.bookingId, opts.bookingId) : undefined,
    eq(roomSessionsTable.status, "open"),
  ].filter(Boolean);
  await db
    .update(roomSessionsTable)
    .set({ status: "closed", closedAt: new Date(), closedReason: opts.reason ?? "checked out" })
    .where(and(...(filters as never[])));
}

export type RoomSessionContext = {
  sessionId: string;
  bookingId: string;
  roomNumber: string;
  guestName: string;
  openedVia: string;
};

/** The room session currently held by this device, if any. */
export async function readRoomSession(request: Request): Promise<RoomSessionContext | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)sunrise_room=([^;]+)/.exec(cookie);
  if (!match) return null;
  const [row] = await db
    .select()
    .from(roomSessionsTable)
    .where(eq(roomSessionsTable.id, decodeURIComponent(match[1])))
    .limit(1);
  if (!row || row.status !== "open") return null;
  // The stay must still be live — check-out closes the door even if the cookie lives.
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, row.bookingId)).limit(1);
  if (!booking || !["checked_in", "confirmed", "awaiting_payment"].includes(booking.status)) return null;
  const stale = Date.now() - (row.lastSeenAt?.getTime() ?? 0) > 8 * 60 * 60 * 1000;
  if (stale) {
    await db.update(roomSessionsTable).set({ lastSeenAt: new Date() }).where(eq(roomSessionsTable.id, row.id));
  }
  return {
    sessionId: row.id,
    bookingId: row.bookingId,
    roomNumber: row.roomNumber,
    guestName: row.guestName,
    openedVia: row.openedVia,
  };
}

/** Open a session from the QR value, room + PIN, or reference + phone. */
export async function startRoomSession(input: {
  qrToken?: string | null;
  roomNumber?: string | null;
  pin?: string | null;
  reference?: string | null;
  phone?: string | null;
}): Promise<
  | { ok: true; sessionId: string; bookingId: string; roomNumber: string; guestName: string; via: string }
  | { ok: false; status: number; error: string }
> {
  // --- 1. The QR card in the room. ---
  if (input.qrToken) {
    const [row] = await db
      .select()
      .from(roomSessionsTable)
      .where(
        and(eq(roomSessionsTable.qrTokenHash, hashQrToken(input.qrToken.trim())), eq(roomSessionsTable.status, "open")),
      )
      .limit(1);
    if (!row) {
      return {
        ok: false,
        status: 404,
        error:
          "That QR code is no longer active — the card is re-pointed to the new guest at every check-in. Type your room number and the PIN from your key sleeve, or ask the front desk.",
      };
    }
    await db.update(roomSessionsTable).set({ lastSeenAt: new Date() }).where(eq(roomSessionsTable.id, row.id));
    return {
      ok: true,
      sessionId: row.id,
      bookingId: row.bookingId,
      roomNumber: row.roomNumber,
      guestName: row.guestName,
      via: "qr",
    };
  }

  // --- 2. Room number + the PIN from the key sleeve. ---
  if (input.roomNumber && input.pin) {
    const digits = input.roomNumber.replace(/[^0-9]/g, "");
    const [row] = await db
      .select()
      .from(roomSessionsTable)
      .where(and(eq(roomSessionsTable.roomNumber, digits), eq(roomSessionsTable.status, "open")))
      .limit(1);
    if (!row || !row.pinHash || !row.pinSalt) {
      return {
        ok: false,
        status: 404,
        error: "That room has no open session right now. Check the number on your key sleeve, or ask the front desk.",
      };
    }
    if (row.pinLockedUntil && row.pinLockedUntil.getTime() > Date.now()) {
      return { ok: false, status: 429, error: "Too many wrong PINs. Ask the front desk — they can unlock it in a moment." };
    }
    const ok = await verifyPassword(input.pin.trim(), row.pinSalt, row.pinHash);
    if (!ok) {
      const attempts = row.pinAttempts + 1;
      const lock = attempts >= PIN_MAX_ATTEMPTS;
      await db
        .update(roomSessionsTable)
        .set({
          pinAttempts: lock ? 0 : attempts,
          pinLockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : row.pinLockedUntil,
        })
        .where(eq(roomSessionsTable.id, row.id));
      return {
        ok: false,
        status: lock ? 429 : 403,
        error: lock
          ? `That is ${PIN_MAX_ATTEMPTS} wrong PINs, so ordering is locked for ${PIN_LOCK_MINUTES} minutes. The front desk can unlock it straight away.`
          : `That PIN is not right — ${PIN_MAX_ATTEMPTS - attempts} attempt(s) left. It is the 4 digits on your key sleeve.`,
      };
    }
    await db
      .update(roomSessionsTable)
      .set({ pinAttempts: 0, pinLockedUntil: null, lastSeenAt: new Date(), openedVia: "pin" })
      .where(eq(roomSessionsTable.id, row.id));
    return {
      ok: true,
      sessionId: row.id,
      bookingId: row.bookingId,
      roomNumber: row.roomNumber,
      guestName: row.guestName,
      via: "pin",
    };
  }

  // --- 3. Booking reference + the phone used at booking (last 6 digits). ---
  if (input.reference && input.phone) {
    const reference = input.reference.trim().toUpperCase();
    const [booking] = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!booking) {
      return {
        ok: false,
        status: 404,
        error: "We cannot find that booking reference. Check it on your confirmation email or WhatsApp.",
      };
    }
    const wanted = input.phone.replace(/[^0-9]/g, "").replace(/^265/, "").replace(/^0/, "").slice(-6);
    const onRecord = booking.phone.replace(/[^0-9]/g, "").replace(/^265/, "").replace(/^0/, "").slice(-6);
    if (!wanted || wanted !== onRecord) {
      return {
        ok: false,
        status: 403,
        error:
          "That phone number does not match the one on that booking. Use the number you booked with, or ask the front desk.",
      };
    }
    if (!["checked_in", "confirmed", "awaiting_payment"].includes(booking.status)) {
      return {
        ok: false,
        status: 403,
        error: `That booking is ${booking.status.replace(/_/g, " ")}. Ordering to a room opens when you check in.`,
      };
    }
    const roomNumber = (booking.assignedRoom ?? "").replace(/[^0-9]/g, "");
    if (!roomNumber) {
      return {
        ok: false,
        status: 409,
        error: "Your room is not assigned yet. Ask the front desk and try again in a minute.",
      };
    }
    const [existing] = await db
      .select()
      .from(roomSessionsTable)
      .where(and(eq(roomSessionsTable.bookingId, booking.id), eq(roomSessionsTable.status, "open")))
      .limit(1);
    if (existing) {
      await db
        .update(roomSessionsTable)
        .set({ lastSeenAt: new Date(), openedVia: "reference" })
        .where(eq(roomSessionsTable.id, existing.id));
      return {
        ok: true,
        sessionId: existing.id,
        bookingId: booking.id,
        roomNumber: existing.roomNumber,
        guestName: existing.guestName,
        via: "reference",
      };
    }
    // A live stay with a room but no session yet — open one with a fresh PIN.
    const session = await openRoomSession({
      bookingId: booking.id,
      guestId: booking.guestId,
      roomNumber,
      guestName: booking.guestName,
    });
    await db.update(roomSessionsTable).set({ openedVia: "reference" }).where(eq(roomSessionsTable.id, session.session.id));
    return {
      ok: true,
      sessionId: session.session.id,
      bookingId: booking.id,
      roomNumber,
      guestName: booking.guestName,
      via: "reference",
    };
  }

  return {
    ok: false,
    status: 400,
    error:
      "Scan the QR card in your room, or enter your room number and the PIN from your key sleeve, or your booking reference and phone number.",
  };
}

export const ROOM_PIN_RULES = {
  length: 4,
  maxAttempts: PIN_MAX_ATTEMPTS,
  lockMinutes: PIN_LOCK_MINUTES,
} as const;

/**
 * Put the room session on this device. httpOnly, and re-validated on every read, so
 * the cookie grants nothing by itself: it is only a handle back to a session that is
 * still open AND attached to a stay that is still live (see readRoomSession).
 */
export function setRoomCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(ROOM_COOKIE, sessionId, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  });
}

/** Forget the session on this device — for a phone passed across the counter. */
export function clearRoomCookie(response: NextResponse) {
  response.cookies.set(ROOM_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Give a stay a fresh 4-digit PIN (desk: "I forgot it", or "someone saw me type it").
 * The QR card is untouched — only the PIN changes — and the attempt counter and lock
 * are cleared so the guest can use it immediately. The new PIN is returned once.
 */
export async function rotateRoomPin(sessionId: string) {
  const [row] = await db.select().from(roomSessionsTable).where(eq(roomSessionsTable.id, sessionId)).limit(1);
  if (!row) return null;
  const pin = newPin(row.roomNumber);
  const { salt, hash } = await hashPassword(pin);
  await db
    .update(roomSessionsTable)
    .set({ pinHash: hash, pinSalt: salt, pinAttempts: 0, pinLockedUntil: null, lastSeenAt: new Date() })
    .where(eq(roomSessionsTable.id, sessionId));
  return { session: row, pin };
}

