// Guest accounts: activation tokens, device sessions and sign-in state.
//
// v2 rule (§13 of the spec): guest passwords use the same scrypt scheme as staff
// passwords; activation/reset tokens are random, single-use, hashed at rest and
// short-lived. A session belongs to a DEVICE, so "sign out of all devices" works.
//
// ADDENDUM ("staying signed in"): there is NO session timeout for a guest. Once a
// guest signs in, that device stays signed in until they sign out, they change
// their password, an admin disables the account, the device data is cleared, or
// the 12-month inactivity backstop below is reached. Staff sessions keep their
// 12-hour life — the two systems are deliberately different.

import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  activationTokensTable,
  guestAccountsTable,
  guestSessionsTable,
  guestsTable,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";

export const GUEST_COOKIE = "sunrise_guest";
/**
 * 12 months. This is NOT a session timeout: `lastSeenAt` is refreshed on every
 * use, so the only guest who ever meets this date is one whose app has not been
 * opened for a whole year. Guests open the app far more often than that.
 */
const SESSION_BACKSTOP_DAYS = 365;

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** A cryptographically random 6-digit code (see src/lib/guest-otp.ts). */
export function otpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type IssuedToken = {
  id: string;
  token: string;
  otp: string;
  expiresAt: Date;
  purpose: string;
  sentTo: string | null;
};

/**
 * Create a single-use token for an account. 7 days for an activation link
 * (the desk may invite at booking time), 1 hour for a password reset and
 * 24 hours for a phone OTP.
 */
export async function issueToken(opts: {
  accountId: string;
  guestId: string;
  purpose?: "activation" | "password_reset" | "phone_otp" | "email_otp";
  channel?: "email" | "sms";
  sentTo?: string | null;
  ttlMinutes?: number;
}): Promise<IssuedToken> {
  const purpose = opts.purpose ?? "activation";
  const ttl =
    opts.ttlMinutes ?? (purpose === "password_reset" ? 60 : purpose === "phone_otp" ? 1440 : 7 * 24 * 60);
  const token = randomToken();
  const otp = otpCode();
  const expiresAt = new Date(Date.now() + ttl * 60_000);
  const [row] = await db
    .insert(activationTokensTable)
    .values({
      id: randomUUID(),
      accountId: opts.accountId,
      guestId: opts.guestId,
      purpose,
      tokenHash: hashToken(token),
      // The code is returned in memory only — it is never written in readable form.
      otpCode: null,
      channel: opts.channel ?? (purpose === "phone_otp" ? "sms" : "email"),
      sentTo: opts.sentTo ?? null,
      expiresAt,
    })
    .returning();
  return { id: row!.id, token, otp, expiresAt, purpose, sentTo: opts.sentTo ?? null };
}

/** Look a token up without consuming it (used to render the activation page). */
export async function peekToken(token: string, purpose?: string) {
  if (!token) return null;
  const rows = await db
    .select()
    .from(activationTokensTable)
    .where(eq(activationTokensTable.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (purpose && row.purpose !== purpose) return null;
  return row;
}

/** Verify + consume a token in one step (activation / reset links). */
export async function consumeToken(token: string, purpose?: string) {
  const row = await peekToken(token, purpose);
  if (!row) return null;
  await db
    .update(activationTokensTable)
    .set({ consumedAt: new Date() })
    .where(eq(activationTokensTable.id, row.id));
  return row;
}

/** Register a signed-in device so it can be revoked individually or all at once. */
export async function createGuestSession(opts: {
  accountId: string;
  guestId: string;
  deviceLabel?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_BACKSTOP_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(guestSessionsTable).values({
    id: randomUUID(),
    accountId: opts.accountId,
    guestId: opts.guestId,
    tokenHash: hashToken(token),
    deviceLabel: opts.deviceLabel?.slice(0, 160) ?? null,
    userAgent: opts.userAgent?.slice(0, 240) ?? null,
    ip: opts.ip ?? null,
    lastSeenAt: new Date(),
    expiresAt,
  });
  return { token, expiresAt };
}

/** "Thabo's phone", "Chrome on Windows" — enough for the guest to recognise it. */
export function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const platform = /Android/i.test(ua)
    ? "Android phone"
    : /iPhone|iPad|iOS/i.test(ua)
      ? "iPhone or iPad"
      : /Windows/i.test(ua)
        ? "Windows computer"
        : /Mac OS X/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux computer"
            : "Device";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Safari\//i.test(ua)
          ? "Safari"
          : /Firefox\//i.test(ua)
            ? "Firefox"
            : "";
  return browser ? `${browser} on ${platform}` : platform;
}

export type GuestSessionUser = {
  sessionId: string;
  accountId: string;
  guestId: string;
  guestName: string;
  email: string | null;
  phone: string | null;
  status: string;
  marketingConsent: boolean;
};

/** Resolve the signed-in guest from the device cookie. Server-side only. */
export async function readGuestSession(request: Request): Promise<GuestSessionUser | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)sunrise_guest=([^;]+)/.exec(cookie);
  if (!match) return null;
  const tokenHash = hashToken(decodeURIComponent(match[1]));
  const rows = await db
    .select()
    .from(guestSessionsTable)
    .where(and(eq(guestSessionsTable.tokenHash, tokenHash), isNull(guestSessionsTable.revokedAt)))
    .limit(1);
  const session = rows[0];
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const [account] = await db
    .select()
    .from(guestAccountsTable)
    .where(eq(guestAccountsTable.id, session.accountId))
    .limit(1);
  if (!account || !["active", "messaging_muted"].includes(account.status)) return null;
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, session.guestId)).limit(1);
  if (!guest) return null;

  // Keep the device signed in: slide the backstop and note the visit. The write is
  // throttled to once an hour so ordinary reading never becomes a write storm.
  const lastSeen = session.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeen > 60 * 60 * 1000) {
    const expiresAt = new Date(Date.now() + SESSION_BACKSTOP_DAYS * 24 * 60 * 60 * 1000);
    try {
      await db
        .update(guestSessionsTable)
        .set({ lastSeenAt: new Date(), expiresAt })
        .where(eq(guestSessionsTable.id, session.id));
    } catch (error) {
      console.error("Could not refresh the guest session backstop", error);
    }
  }

  return {
    sessionId: session.id,
    accountId: account.id,
    guestId: guest.id,
    guestName: guest.fullName,
    email: account.loginEmail,
    phone: account.loginPhone ?? guest.phone,
    status: account.status,
    marketingConsent: account.marketingConsent,
  };
}

/** The guest's own devices, newest first — what Settings → Devices shows. */
export async function listDeviceSessions(accountId: string, currentSessionId?: string) {
  const rows = await db
    .select()
    .from(guestSessionsTable)
    .where(and(eq(guestSessionsTable.accountId, accountId), isNull(guestSessionsTable.revokedAt)))
    .orderBy(desc(guestSessionsTable.lastSeenAt));
  return rows.map((row) => ({
    id: row.id,
    deviceLabel: row.deviceLabel ?? describeDevice(row.userAgent),
    signedInAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    isCurrent: row.id === currentSessionId,
  }));
}

export async function revokeAllSessions(accountId: string, reason?: string) {
  await db
    .update(guestSessionsTable)
    .set({ revokedAt: new Date(), revokedReason: reason ?? "signed out everywhere" })
    .where(and(eq(guestSessionsTable.accountId, accountId), isNull(guestSessionsTable.revokedAt)));
}

/**
 * Revoke one device. Options:
 *   keepSessionId — revoke every device EXCEPT this one (used after a password
 *                   change, so the device that changed it stays signed in).
 */
export async function revokeSession(sessionId: string, reason?: string) {
  await db
    .update(guestSessionsTable)
    .set({ revokedAt: new Date(), revokedReason: reason ?? "revoked" })
    .where(eq(guestSessionsTable.id, sessionId));
}

export async function revokeOtherSessions(accountId: string, keepSessionId: string, reason?: string) {
  const rows = await db
    .select({ id: guestSessionsTable.id })
    .from(guestSessionsTable)
    .where(and(eq(guestSessionsTable.accountId, accountId), isNull(guestSessionsTable.revokedAt)));
  for (const row of rows) {
    if (row.id === keepSessionId) continue;
    await revokeSession(row.id, reason ?? "password changed elsewhere");
  }
}

/** Set (or replace) a guest password and flip the account to active. */
export async function setGuestPassword(
  accountId: string,
  password: string,
  opts: { markEmailVerified?: boolean; status?: string } = {},
) {
  const { salt, hash } = await hashPassword(password);
  await db
    .update(guestAccountsTable)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      status: opts.status ?? "active",
      failedAttempts: 0,
      lockedUntil: null,
      ...(opts.markEmailVerified ? { emailVerifiedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(guestAccountsTable.id, accountId));
}

export async function checkGuestPassword(accountId: string, password: string) {
  const [account] = await db.select().from(guestAccountsTable).where(eq(guestAccountsTable.id, accountId)).limit(1);
  if (!account?.passwordHash || !account.passwordSalt) return false;
  return verifyPassword(password, account.passwordSalt, account.passwordHash);
}

/** Find an account by login email or login phone (either is a valid login name). */
export async function findAccountByLogin(login: string) {
  const value = login.trim().toLowerCase();
  const byEmail = await db
    .select()
    .from(guestAccountsTable)
    .where(eq(guestAccountsTable.loginEmail, value))
    .limit(1);
  if (byEmail[0]) return byEmail[0];
  const byPhone = await db
    .select()
    .from(guestAccountsTable)
    .where(eq(guestAccountsTable.loginPhone, login.trim()))
    .limit(1);
  return byPhone[0] ?? null;
}
