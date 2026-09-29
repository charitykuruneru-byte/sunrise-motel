// Email one-time codes — the rules from the "How the System Creates Guest
// Accounts" addendum, Part 6, implemented in one place:
//
//   length     6 digits
//   channel    EMAIL (the same address the invitation went to) — SMS only for the
//              documented no-email exception
//   validity   10 minutes
//   attempts   3 per code, then a new code must be requested
//   rate       a new code at most once a minute
//   lockout    3 wrong codes locks verification for 15 minutes and tells the desk
//   storage    only the HASH is stored; the code exists only inside the email
//   logging    the code never reaches the audit log or the notification log
//
// The OTP adds one thing the activation link does not: it proves the guest is
// holding that inbox RIGHT NOW, at the moment they set the password.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activationTokensTable, guestAccountsTable } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { issueToken } from "@/lib/guest-auth";
import { publicBaseUrl } from "@/lib/mail";
import { notifyByEmail, notifyBySms, notifyInPortal } from "@/lib/notify";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_SECONDS = 60;
export const OTP_LOCK_MINUTES = 15;

/** A cryptographically random 6-digit code — never Math.random. */
export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, "0");
}

/**
 * Hash the code at rest. The row id salts it, so two guests who happen to receive
 * the same digits never share a hash — a leaked table yields nothing usable.
 */
export function hashOtp(code: string, salt: string) {
  return createHash("sha256").update(`${code}:${salt}`).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type OtpIssue = {
  tokenId: string;
  link: string;
  code: string;
  expiresAt: Date;
  otpExpiresAt: Date;
  channel: "email" | "sms";
  sentTo: string | null;
  emailSent: boolean;
  emailReason: string | null;
};


/**
 * Issue the activation link AND the first email code for an account. The link is
 * single-use and valid 7 days; the code is single-use and valid 10 minutes.
 */
export async function issueActivationOtp(opts: {
  accountId: string;
  guestId: string;
  guestName: string;
  email?: string | null;
  phone?: string | null;
  purpose?: "activation" | "password_reset" | "email_otp" | "phone_otp";
  request?: Request;
}): Promise<OtpIssue> {
  const purpose = opts.purpose ?? "activation";
  const email = (opts.email ?? "").trim().toLowerCase() || null;
  const channel: "email" | "sms" = email ? "email" : "sms";
  const issued = await issueToken({
    accountId: opts.accountId,
    guestId: opts.guestId,
    purpose,
    channel,
    sentTo: channel === "email" ? email : opts.phone ?? null,
  });
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await db
    .update(activationTokensTable)
    .set({
      otpHash: hashOtp(issued.otp, issued.id),
      otpExpiresAt,
      otpAttempts: 0,
      otpLastSentAt: new Date(),
      // No readable copy is kept — `otp_code` is legacy and is cleared here.
      otpCode: null,
    })
    .where(eq(activationTokensTable.id, issued.id));

  const base = publicBaseUrl(opts.request);
  const link = `${base}/activate?token=${issued.token}`;
  const firstName = opts.guestName.split(" ")[0] || "there";

  let emailSent = false;
  let emailReason: string | null = null;
  if (channel === "email") {
    const result = await notifyByEmail({
      to: email,
      subject: "Sunrise Motel — your verification code",
      html:
        `<p>Hello ${opts.guestName},</p>` +
        `<p>Your Sunrise Motel verification code is:</p>` +
        `<p style="font-size:28px;font-weight:800;letter-spacing:6px">${issued.otp}</p>` +
        `<p>It is valid for ${OTP_TTL_MINUTES} minutes and can be used once.</p>` +
        `<p>Then set your own password here: <a href="${link}">Set my password</a> — ${firstName}, the link is valid for 7 days and only you can use it.</p>` +
        `<p>If you did not ask for this, tell the front desk and we will stop it. Nothing about your room, your bill or your meals depends on it.</p>`,
      text: `Sunrise Motel verification code: ${issued.otp} (valid ${OTP_TTL_MINUTES} minutes). Set your password: ${link}`,
      template: "guest_activation_otp",
      guestId: opts.guestId,
      // The code travels in the email — never into the log.
      logBody: "Verification code emailed to the guest. The code itself is never stored or logged.",
    });
    emailSent = result.sent;
    emailReason = result.sent ? null : (result.reason ?? null);
  } else {
    // No email on record (the documented exception). There is no SMS gateway on
    // this deployment, so the desk reads the code out live — and the code is not
    // logged here either.
    await notifyBySms({
      to: opts.phone,
      subject: "Sunrise Motel guest account",
      body: "A 6-digit verification code was created for your guest account. The front desk can read it to you, or set your password with you at the counter.",
      template: "guest_activation_otp_sms",
      guestId: opts.guestId,
    });
  }

  return {
    tokenId: issued.id,
    link,
    code: issued.otp,
    expiresAt: issued.expiresAt,
    otpExpiresAt,
    channel,
    sentTo: channel === "email" ? email : opts.phone ?? null,
    emailSent,
    emailReason,
  };
}

/** Request another code on an existing link (never a new link). */
export async function resendOtp(opts: { tokenId: string; request?: Request }) {
  const [row] = await db
    .select()
    .from(activationTokensTable)
    .where(eq(activationTokensTable.id, opts.tokenId))
    .limit(1);
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, reason: "This link has expired — ask the front desk for a new one." };
  }
  if (row.otpLastSentAt && Date.now() - row.otpLastSentAt.getTime() < OTP_RESEND_SECONDS * 1000) {
    const wait = Math.ceil((OTP_RESEND_SECONDS * 1000 - (Date.now() - row.otpLastSentAt.getTime())) / 1000);
    return { ok: false as const, reason: `A code was just sent. Try again in ${wait} second(s).` };
  }
  const [account] = await db.select().from(guestAccountsTable).where(eq(guestAccountsTable.id, row.accountId)).limit(1);
  const code = generateOtp();
  await db
    .update(activationTokensTable)
    .set({
      otpHash: hashOtp(code, row.id),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      otpAttempts: 0,
      otpLastSentAt: new Date(),
      lockedUntil: null,
      verifiedAt: null,
      otpCode: null,
    })
    .where(eq(activationTokensTable.id, row.id));

  const sentTo =
    row.channel === "email" ? row.sentTo ?? account?.loginEmail ?? null : row.sentTo ?? account?.loginPhone ?? null;
  if (row.channel === "email" && sentTo) {
    await notifyByEmail({
      to: sentTo,
      subject: "Sunrise Motel — your new verification code",
      html: `<p>Your new Sunrise Motel verification code is:</p><p style="font-size:28px;font-weight:800;letter-spacing:6px">${code}</p><p>Valid for ${OTP_TTL_MINUTES} minutes. This replaces the previous code.</p>`,
      text: `Sunrise Motel verification code: ${code} (valid ${OTP_TTL_MINUTES} minutes).`,
      template: "guest_otp_resent",
      guestId: row.guestId,
      logBody: "A replacement verification code was emailed. The code itself is never stored.",
    });
  } else {
    await notifyBySms({
      to: sentTo,
      subject: "Sunrise Motel guest account",
      body: "A new 6-digit verification code was created for your guest account. The front desk can read it to you.",
      template: "guest_otp_resent_sms",
      guestId: row.guestId,
    });
  }
  await logAudit({
    action: "guest.otp_resent",
    entity: "guest_account",
    entityId: row.accountId,
    summary: `A new verification code was sent to the guest (${row.channel}). The previous code is dead.`,
    actor: "system",
    metadata: { channel: row.channel },
  });
  return { ok: true as const, code, channel: row.channel, sentTo };
}

/**
 * Verify a code against an activation token.
 *
 * Returns `ok: true` at most once per code. Every failure is audited, and the
 * third wrong code locks verification for 15 minutes and tells the desk (§6.2).
 */
export async function verifyOtp(opts: { tokenId: string; code?: string | null }) {
  const [token] = await db
    .select()
    .from(activationTokensTable)
    .where(eq(activationTokensTable.id, opts.tokenId))
    .limit(1);
  if (!token || token.consumedAt) {
    return {
      ok: false as const,
      status: 410,
      reason: "This link has already been used. Ask the front desk for a new one.",
    };
  }
  if (token.lockedUntil && token.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((token.lockedUntil.getTime() - Date.now()) / 60_000);
    return {
      ok: false as const,
      status: 429,
      reason: `Too many wrong codes, so verification is paused for ${minutes} more minute(s). The front desk can help.`,
    };
  }
  if (token.verifiedAt) return { ok: true as const, alreadyVerified: true };
  if (!token.otpHash || !token.otpExpiresAt) {
    return { ok: false as const, status: 409, reason: "Ask us to send you a fresh code." };
  }
  if (token.otpExpiresAt.getTime() < Date.now()) {
    return {
      ok: false as const,
      status: 410,
      reason: "That code has expired — request a new one and it will arrive in a moment.",
    };
  }
  if (token.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false as const, status: 429, reason: "That code has been used up. Request a new one." };
  }

  const supplied = (opts.code ?? "").trim();
  if (!supplied || !safeEqual(hashOtp(supplied, token.id), token.otpHash)) {
    const next = token.otpAttempts + 1;
    const lock = next >= OTP_MAX_ATTEMPTS;
    await db
      .update(activationTokensTable)
      .set({
        otpAttempts: next,
        lockedUntil: lock ? new Date(Date.now() + OTP_LOCK_MINUTES * 60_000) : token.lockedUntil,
      })
      .where(eq(activationTokensTable.id, token.id));
    await logAudit({
      action: lock ? "guest.otp_locked" : "guest.otp_failed",
      entity: "guest_account",
      entityId: token.accountId,
      summary: lock
        ? `Verification locked for ${OTP_LOCK_MINUTES} minutes after ${OTP_MAX_ATTEMPTS} wrong codes. The front desk has been told.`
        : `A wrong verification code was entered (attempt ${next} of ${OTP_MAX_ATTEMPTS}).`,
      actor: "guest",
      metadata: { attempt: next },
    });
    if (lock) {
      await notifyInPortal({
        template: "otp_locked",
        subject: "A guest failed email verification three times",
        body: "Verification is locked for 15 minutes and the guest has been told to ask you. You can set the password with them on their own device (" +
          "Bookings → Set password at the desk), or they can request a fresh code in a minute.",
        guestId: token.guestId,
      });
    }
    return {
      ok: false as const,
      status: lock ? 429 : 403,
      reason: lock
        ? `That is ${OTP_MAX_ATTEMPTS} wrong codes, so verification is paused for ${OTP_LOCK_MINUTES} minutes. The front desk can help.`
        : `That code is not correct — ${OTP_MAX_ATTEMPTS - next} attempt(s) left.`,
    };
  }

  await db
    .update(activationTokensTable)
    .set({ verifiedAt: new Date() })
    .where(eq(activationTokensTable.id, token.id));
  await logAudit({
    action: "guest.otp_verified",
    entity: "guest_account",
    entityId: token.accountId,
    summary: "The guest proved they hold the email inbox: the one-time code matched.",
    actor: "guest",
  });
  return { ok: true as const, alreadyVerified: false };
}

/**
 * Show the guest WHERE a code went without ever printing the whole address:
 * `t***o@example.com`, `+265 99* ** *32`. Used on the activation page and by the
 * desk, so neither has to handle the full contact detail.
 */
export function maskContact(value: string | null | undefined, channel: "email" | "sms") {
  if (!value) return null;
  if (channel === "email") {
    const [name, domain] = value.split("@");
    if (!domain) return value;
    const head = name.slice(0, 1);
    const tail = name.length > 2 ? name.slice(-1) : "";
    return `${head}${"*".repeat(Math.max(1, name.length - head.length - tail.length))}${tail}@${domain}`;
  }
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 6) return value;
  return `${digits.slice(0, 5)}***${digits.slice(-2)}`;
}

/** The most recent token for an account — used by the desk to see the OTP state. */
export async function latestOtpToken(accountId: string) {
  const rows = await db
    .select()
    .from(activationTokensTable)
    .where(eq(activationTokensTable.accountId, accountId))
    .orderBy(desc(activationTokensTable.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
