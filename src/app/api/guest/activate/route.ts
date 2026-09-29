import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guestAccountsTable, guestsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { consumeToken, peekToken, setGuestPassword } from "@/lib/guest-auth";
import { OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, OTP_TTL_MINUTES, resendOtp, verifyOtp } from "@/lib/guest-otp";
import { notifyByEmail } from "@/lib/notify";
import { samePhone } from "@/lib/phone";
import { malawiStamp } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Mask an address for display: t***o@example.com — never the full inbox. */
function maskEmail(value: string | null) {
  if (!value) return null;
  const [name, domain] = value.split("@");
  if (!domain) return value;
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(1, name.length - head.length - tail.length))}${tail}@${domain}`;
}

/**
 * Opening the invitation link (step 9a). A valid token moves the account to
 * `pending_verification` — the state the desk sees on the booking badge — and the
 * page then asks for a password and the emailed code. The code itself is never
 * returned here: it exists only inside the email.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ valid: false, reason: "No link code was supplied." }, { status: 400 });
  const row = await peekToken(token);
  if (!row) {
    return NextResponse.json(
      {
        valid: false,
        reason:
          "This link has already been used or has expired. Ask the front desk to send a fresh one — it takes them one tap.",
      },
      { status: 410 },
    );
  }
  const [account] = await db.select().from(guestAccountsTable).where(eq(guestAccountsTable.id, row.accountId)).limit(1);
  if (!account) return NextResponse.json({ valid: false, reason: "Guest account not found." }, { status: 404 });
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, account.guestId)).limit(1);

  if (account.status === "invited") {
    await db
      .update(guestAccountsTable)
      .set({ status: "pending_verification", updatedAt: new Date() })
      .where(eq(guestAccountsTable.id, account.id));
    await logAudit({
      action: "guest.activation_started",
      entity: "guest_account",
      entityId: account.id,
      summary: `${account.loginEmail ?? account.loginPhone} opened their invitation — account is now pending verification.`,
      actor: "guest",
      actorLabel: account.loginEmail ?? account.loginPhone,
      ip: clientIp(request),
    });
  }

  return NextResponse.json({
    valid: true,
    purpose: row.purpose,
    guestName: guest?.fullName ?? "Guest",
    loginEmail: account.loginEmail,
    loginEmailMasked: maskEmail(account.loginEmail),
    loginPhone: account.loginPhone,
    // Email OTP: the code goes to the inbox. No email on record (the documented
    // exception) means SMS, and the front desk reads the code out live.
    otpChannel: account.loginEmail ? "email" : "sms",
    otpRules: { digits: 6, minutes: OTP_TTL_MINUTES, attempts: OTP_MAX_ATTEMPTS, resendSeconds: OTP_RESEND_SECONDS },
    codeSentAt: row.otpLastSentAt,
    codeExpiresAt: row.otpExpiresAt,
    codeVerified: Boolean(row.verifiedAt),
    codeBlockedUntil: row.lockedUntil,
    linkExpiresAt: row.expiresAt,
    status: account.status,
    alreadyActive: account.status === "active",
  });
}

/**
 * The two guest actions on this page:
 *
 *   action=send_code  → email a fresh 6-digit code (max once a minute; requesting
 *                       one replaces and kills the previous code)
 *   action=complete   → set the password, prove the inbox with the code, and
 *                       activate the account. The link is consumed exactly once.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      action?: "send_code" | "complete";
      password?: string;
      confirmPassword?: string;
      phone?: string;
      code?: string;
    };
    const token = body.token ?? "";
    if (!token) return NextResponse.json({ error: "No link code was supplied." }, { status: 400 });
    const row = await peekToken(token);
    if (!row) {
      return NextResponse.json(
        {
          error: "This link has already been used or has expired. Ask the front desk to send a fresh one.",
          expired: true,
        },
        { status: 410 },
      );
    }
    const [account] = await db.select().from(guestAccountsTable).where(eq(guestAccountsTable.id, row.accountId)).limit(1);
    if (!account) return NextResponse.json({ error: "Guest account not found." }, { status: 404 });

    // ---- Send (or resend) the code ----
    if (body.action === "send_code") {
      const result = await resendOtp({ tokenId: row.id, request });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 429 });
      return NextResponse.json({
        success: true,
        channel: result.channel,
        sentToMasked: result.channel === "email" ? maskEmail(result.sentTo) : result.sentTo,
        expiresInMinutes: OTP_TTL_MINUTES,
        canResendInSeconds: OTP_RESEND_SECONDS,
        // Phone-only guests have no inbox, so the desk delivers the code.
        deskDelivery: result.channel === "sms",
      });
    }

    // ---- Complete activation ----
    const password = (body.password ?? "").trim();
    if (password.length < 8) {
      return NextResponse.json({ error: "Choose a password of at least 8 characters." }, { status: 400 });
    }
    if (body.confirmPassword !== undefined && body.confirmPassword !== body.password) {
      return NextResponse.json({ error: "The two passwords do not match." }, { status: 400 });
    }

    // The phone number on the booking is still checked when supplied, and it is
    // what proves ownership of the stay on the self-serve route.
    // Fails CLOSED: if the number on the booking is not a number at all, nobody can
    // prove ownership with it and the desk is the way in (the message says so). Both
    // sides go through the one rule in §lib/phone.ts, so "0888 123 456" and
    // "+265888123456" are the same number and no other spelling is a second guest.
    const onRecord = account.loginPhone;
    if (onRecord && body.phone && !samePhone(body.phone, onRecord)) {
      return NextResponse.json(
        { error: "That phone number does not match the one on your booking. The front desk can fix it for you." },
        { status: 403 },
      );
    }

    const verified = await verifyOtp({ tokenId: row.id, code: body.code });
    if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: verified.status });

    const consumed = await consumeToken(token, row.purpose);
    if (!consumed) {
      return NextResponse.json({ error: "That link was just used. Please sign in." }, { status: 409 });
    }
    await setGuestPassword(account.id, password, { markEmailVerified: Boolean(account.loginEmail) });
    await db
      .update(guestAccountsTable)
      .set({ phoneVerified: Boolean(onRecord && body.phone), updatedAt: new Date() })
      .where(eq(guestAccountsTable.id, account.id));
    await logAudit({
      action: consumed.purpose === "password_reset" ? "guest.password_reset" : "guest.account_created",
      entity: "guest_account",
      entityId: account.id,
      summary: `${account.loginEmail ?? account.loginPhone} completed ${
        consumed.purpose === "password_reset" ? "a password reset" : "account activation"
      } — password chosen by the guest, email code verified.`,
      actor: "guest",
      actorLabel: account.loginEmail ?? account.loginPhone,
      ip: clientIp(request),
      metadata: { at: malawiStamp() },
    });
    await notifyByEmail({
      to: account.loginEmail,
      subject: "Your Sunrise Motel guest app is ready",
      html:
        "<p>Your password is set and your account is active.</p>" +
        "<p>Sign in to see your room number, your room bill, to order food to your room and to message the front desk.</p>" +
        "<p>You stay signed in on your phone — you will not be asked for this password again unless you sign out yourself.</p>",
      text:
        "Your Sunrise Motel guest account is active. Sign in to see your room, bill and to order to your room. " +
        "You stay signed in until you sign out.",
      template: "guest_activation_complete",
      guestId: account.guestId,
    });
    return NextResponse.json({ success: true, status: "active" });
  } catch (error) {
    console.error("Activation failed", error);
    return NextResponse.json({ error: "Could not activate your account." }, { status: 500 });
  }
}
