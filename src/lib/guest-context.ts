// WHO IS THIS GUEST, AND WHICH STAY ARE THEY ON? — one resolver for BOTH paths.
//
// The addendum "The Two Guest Paths" makes the no-account guest first class: the
// same menu, the same room bill, the same private line to the desk and the same
// receipt. Nothing in the ordering, messaging or request code should care which of
// the two paths the guest arrived by, so those routes all resolve the caller here:
//
//   1. a signed-in account  (cookie `sunrise_guest`) → channel "app"
//   2. a live room session  (cookie `sunrise_room`)  → channel qr | pin | reference
//
// The account is an upgrade, never a requirement — and this file is where that
// sentence is enforced in code.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { readGuestSession } from "@/lib/guest-auth";
import { resolveStays } from "@/lib/hotel";
import { readRoomSession } from "@/lib/room-session";
import { malawiDatePart } from "@/lib/time";

/** How the guest arrived — recorded on every order, message and request. */
export type GuestChannel = "app" | "qr" | "pin" | "reference" | "desk";

export type GuestContext = {
  /** "account" = installed the app; "room" = proved it with the QR / PIN / reference. */
  kind: "account" | "room";
  channel: GuestChannel;
  /** The guest session id (account) or the room session id (no account). */
  sessionId: string;
  guestName: string;
  guestId: string | null;
  accountId: string | null;
  /** Account status, or "room_session" for the no-account path. */
  status: string;
  messagingMuted: boolean;
  roomNumber: string | null;
  bookingId: string | null;
  booking: typeof bookings.$inferSelect | null;
};

/** A charge may only land on a folio with an ACTIVE STAY (addendum Part 16). */
export function canChargeRoom(ctx: GuestContext) {
  if (!ctx.bookingId || !ctx.roomNumber) return { ok: false as const, reason: "no_active_stay" as const };
  if (ctx.booking && !["checked_in", "confirmed", "awaiting_payment"].includes(ctx.booking.status)) {
    return { ok: false as const, reason: "stay_closed" as const };
  }
  return { ok: true as const };
}

/**
 * The nudge that turns a no-account guest into an account guest — offered only once
 * they have a reason to care (they have just ordered, or they are back for a second
 * visit). Never a wall, never a requirement.
 */
export function accountUpgradeNudge(ctx: GuestContext) {
  if (ctx.kind === "account") return null;
  return {
    headline: `Welcome to Room ${ctx.roomNumber ?? "your room"}`,
    body:
      "Keep your order history, get a notification the moment your food leaves the kitchen, and check out " +
      "without stopping at the counter.",
    actionLabel: "Sign in on your own phone — the desk sets it up",
    actionHref: "/app",
    reassurance: "Nothing you can do now depends on it: ordering, messaging the desk and settling all work without an account.",
  };
}

export async function resolveGuestContext(request: Request): Promise<GuestContext | null> {
  const account = await readGuestSession(request);
  if (account) {
    const { active } = await resolveStays(account.guestId, malawiDatePart());
    const stay = active[0] ?? null;
    const roomNumber = stay?.assignedRoom?.replace(/[^0-9]/g, "") || null;
    return {
      kind: "account",
      channel: "app",
      sessionId: account.sessionId,
      guestName: account.guestName,
      guestId: account.guestId,
      accountId: account.accountId,
      status: account.status,
      messagingMuted: account.status === "messaging_muted",
      roomNumber,
      bookingId: stay?.id ?? null,
      booking: stay ?? null,
    };
  }

  const room = await readRoomSession(request);
  if (!room) return null;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, room.bookingId)).limit(1);
  const channel: GuestChannel =
    room.openedVia === "qr" || room.openedVia === "pin" || room.openedVia === "reference"
      ? room.openedVia
      : "desk";
  return {
    kind: "room",
    channel,
    sessionId: room.sessionId,
    guestName: room.guestName,
    guestId: booking?.guestId ?? null,
    accountId: null,
    status: "room_session",
    messagingMuted: false,
    roomNumber: room.roomNumber,
    bookingId: room.bookingId,
    booking: booking ?? null,
  };
}

/** "Please sign in, or scan the card in your room" — the 401 body for both paths. */
export const GUEST_AUTH_HINT =
  "Sign in to the app, or scan the QR card in your room (or type your room number and the PIN from your key sleeve). " +
  "The front desk can do all of this for you at the counter too.";
