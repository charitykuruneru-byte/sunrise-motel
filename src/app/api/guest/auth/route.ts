import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guestAccountsTable, guestsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import {
  checkGuestPassword,
  createGuestSession,
  findAccountByLogin,
  GUEST_COOKIE,
  readGuestSession,
  revokeAllSessions,
  revokeSession,
  setGuestPassword,
} from "@/lib/guest-auth";
import { OTP_RESEND_SECONDS, latestOtpToken, maskContact } from "@/lib/guest-otp";

export const dynamic = "force-dynamic";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const SIGN_IN_ERROR = "That email (or phone) and password do not match. Check your details or contact the front desk to activate your account.";

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60,
  });
}

/** Who is signed in on this device? */
export async function GET(request: Request) {
  const session = await readGuestSession(request);
  if (!session) return NextResponse.json({ signedIn: false });
  return NextResponse.json({ signedIn: true, guest: session });
}

/**
 * Guest sign-in. Five wrong passwords lock the account for 15 minutes (§2.3) and
 * the attempt is recorded — never the password itself.
 *
 * ADDENDUM (account creation, Part 5): the sign-in screen must not be a way to test
 * whether somebody is one of our guests. A login we do not recognise and a wrong
 * password therefore get the SAME answer — and an account that is still
 * `invited` / `pending_verification` is answered with the state of its code rather
 * than a dead end, so the guest can finish instead of ringing the desk.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { login?: string; password?: string; deviceLabel?: string };
    const login = (body.login ?? "").trim();
    const password = body.password ?? "";
    if (!login || !password) {
      return NextResponse.json({ error: "Enter the email (or phone) and password the desk gave you." }, { status: 400 });
    }
    const account = await findAccountByLogin(login);

    // --- No such login. Identical wording to a wrong password: no enumeration. ---
    if (!account) {
      await logAudit({
        action: "guest.signin_failed",
        entity: "guest_account",
        summary: "A sign-in was attempted for an email or phone with no guest account. The response is identical to a wrong password, so nothing is revealed.",
        actor: "guest",
        actorLabel: login,
        ip: clientIp(request),
        metadata: { reason: "no_account" },
      });
      return NextResponse.json(
        {
          error: SIGN_IN_ERROR,
          noEnumeration: true,
        },
        { status: 401 },
      );
    }
    if (account.status === "disabled") {
      return NextResponse.json({ error: "This account has been disabled. Please speak to the front desk." }, { status: 403 });
    }
    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json({ error: `Too many attempts. Try again in ${minutes} minute(s).` }, { status: 429 });
    }

    // --- The account exists but is not switched on yet (invited / pending_verification). ---
    if (account.status === "invited" || account.status === "pending_verification" || !account.passwordHash) {
      const token = await latestOtpToken(account.id);
      const channel: "email" | "sms" = account.loginEmail ? "email" : "sms";
      const sentTo = token?.sentTo ?? account.loginEmail ?? account.loginPhone;
      const secondsSinceSend = token?.otpLastSentAt
        ? Math.ceil((Date.now() - token.otpLastSentAt.getTime()) / 1000)
        : Number.MAX_SAFE_INTEGER;
      const canResendInSeconds = Math.max(0, OTP_RESEND_SECONDS - secondsSinceSend);
      return NextResponse.json(
        {
          code: "pending_verification",
          pendingVerification: true,
          error:
            account.status === "pending_verification" || token
              ? `Your account is not switched on yet: we sent a 6-digit code to ${maskContact(sentTo, channel) ?? (channel === "email" ? "your inbox" : "your phone")}. Enter it with your new password and you are in.`
              : "Your account is not switched on yet. Open your invitation link, or ask the front desk to send a fresh one.",
          sentToMasked: maskContact(sentTo, channel),
          channel,
          codeValidMinutes: 10,
          canResendInSeconds,
          resendHref: "/activate",
          activateHref: "/activate",
          // No email on the booking → the desk reads the code out (documented exception).
          deskDelivery: channel === "sms",
          helpText: "Stuck? The front desk can set the password with you at the counter.",
        },
        { status: 409 },
      );
    }

    const ok = await checkGuestPassword(account.id, password);
    if (!ok) {
      const failed = account.failedAttempts + 1;
      const lock = failed >= MAX_FAILED;
      await db
        .update(guestAccountsTable)
        .set({
          failedAttempts: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          status: lock ? "locked" : account.status,
          updatedAt: new Date(),
        })
        .where(eq(guestAccountsTable.id, account.id));
      await logAudit({
        action: lock ? "guest.account_locked" : "guest.signin_failed",
        entity: "guest_account",
        entityId: account.id,
        summary: lock
          ? `Guest account ${account.loginEmail ?? account.loginPhone} locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED} failed sign-ins.`
          : `Failed guest sign-in for ${account.loginEmail ?? account.loginPhone} (attempt ${failed}).`,
        actor: "guest",
        actorLabel: account.loginEmail ?? account.loginPhone,
        ip: clientIp(request),
      });
      return NextResponse.json(
        { error: lock ? `Too many attempts — locked for ${LOCK_MINUTES} minutes.` : SIGN_IN_ERROR },
        { status: 401 },
      );
    }

    await db
      .update(guestAccountsTable)
      .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), status: "active", updatedAt: new Date() })
      .where(eq(guestAccountsTable.id, account.id));
    const { token } = await createGuestSession({
      accountId: account.id,
      guestId: account.guestId,
      deviceLabel: body.deviceLabel ?? request.headers.get("user-agent"),
      ip: clientIp(request),
    });
    const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, account.guestId)).limit(1);
    await logAudit({
      action: "guest.signed_in",
      entity: "guest_account",
      entityId: account.id,
      summary: `${guest?.fullName ?? "Guest"} signed in to the app.`,
      actor: "guest",
      actorLabel: account.loginEmail ?? account.loginPhone,
      ip: clientIp(request),
    });
    const response = NextResponse.json({
      success: true,
      guest: {
        guestName: guest?.fullName ?? "Guest",
        email: account.loginEmail,
        phone: account.loginPhone,
        status: "active",
      },
    });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Guest sign-in failed", error);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}

/** Sign out of this device — or of every device ("lost my phone", §2.3). */
export async function DELETE(request: Request) {
  const session = await readGuestSession(request);
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  if (session) {
    if (all) {
      await revokeAllSessions(session.accountId);
    } else {
      await revokeSession(session.sessionId);
    }
    await logAudit({
      action: all ? "guest.signed_out_everywhere" : "guest.signed_out",
      entity: "guest_account",
      entityId: session.accountId,
      summary: `${session.guestName} signed out${all ? " of all devices" : ""}.`,
      actor: "guest",
      actorLabel: session.email ?? session.phone,
      ip: clientIp(request),
    });
  }
  const response = NextResponse.json({ success: true, all });
  response.cookies.set(GUEST_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

/**
 * Update the guest's own details and preferences: phone, password, and the
 * marketing opt-in (which is always separate from service messages).
 */
export async function PATCH(request: Request) {
  const session = await readGuestSession(request);
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const body = (await request.json()) as {
      phone?: string;
      currentPassword?: string;
      newPassword?: string;
      marketingConsent?: boolean;
    };
    const [account] = await db
      .select()
      .from(guestAccountsTable)
      .where(eq(guestAccountsTable.id, session.accountId))
      .limit(1);
    if (!account) return NextResponse.json({ error: "Guest account not found." }, { status: 404 });

    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: "Enter your current password to change it." }, { status: 400 });
      }
      const ok = await checkGuestPassword(account.id, body.currentPassword);
      if (!ok) return NextResponse.json({ error: "The current password is not correct." }, { status: 401 });
      if (body.newPassword.trim().length < 8) {
        return NextResponse.json({ error: "Use at least 8 characters for the new password." }, { status: 400 });
      }
      await setGuestPassword(account.id, body.newPassword.trim());
      await revokeAllSessions(account.id);
      await logAudit({
        action: "guest.password_changed",
        entity: "guest_account",
        entityId: account.id,
        summary: `${session.guestName} changed their password — all other devices were signed out.`,
        actor: "guest",
        actorLabel: session.email ?? session.phone,
        ip: clientIp(request),
      });
      const response = NextResponse.json({ success: true, signedOutEverywhere: true });
      response.cookies.set(GUEST_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
      return response;
    }

    const patch: Partial<typeof guestAccountsTable.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.phone === "string" && body.phone.trim()) patch.loginPhone = body.phone.trim();
    if (typeof body.marketingConsent === "boolean") patch.marketingConsent = body.marketingConsent;
    await db.update(guestAccountsTable).set(patch).where(eq(guestAccountsTable.id, account.id));
    if (typeof body.phone === "string" && body.phone.trim()) {
      await db
        .update(guestsTable)
        .set({ phone: body.phone.trim(), updatedAt: new Date() })
        .where(eq(guestsTable.id, account.guestId));
    }
    if (typeof body.marketingConsent === "boolean") {
      await db
        .update(guestsTable)
        .set({ marketingConsent: body.marketingConsent, updatedAt: new Date() })
        .where(eq(guestsTable.id, account.guestId));
      await logAudit({
        action: "guest.consent_changed",
        entity: "guest_account",
        entityId: account.id,
        summary: `${session.guestName} ${body.marketingConsent ? "opted in to" : "opted out of"} offers and event news.`,
        actor: "guest",
        actorLabel: session.email ?? session.phone,
        ip: clientIp(request),
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Profile update failed", error);
    return NextResponse.json({ error: "Could not save your details." }, { status: 500 });
  }
}
