// The §2 guest-account lifecycle, in one place so the desk's "Create guest
// account" button, the activation email and the activation page all agree.
//
// 3a — new email: create guest (matched on phone then email), create the account
//      as `invited`, issue a single-use 7-day activation token, email the link.
// 3b — email already has an account (the common case for regulars): issue no new
//      password, just link the stay and tell them the stay is active.

import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, guestAccountsTable, roomsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { issueToken, setGuestPassword } from "@/lib/guest-auth";
import { findOrCreateGuest } from "@/lib/hotel";
import { guestAppDownloadUrl, publicBaseUrl } from "@/lib/mail";
import { notifyByEmail, notifyBySms } from "@/lib/notify";

export type InviteResult = {
  accountId: string;
  guestId: string;
  status: string;
  existingAccount: boolean;
  activationLink: string | null;
  activationOtp: string | null;
  expiresAt: string | null;
  emailSent: boolean;
  emailReason: string | null;
  guestName: string;
};

/**
 * Create (or reuse) the guest account for a booking and send the invitation.
 * `login` is the email the desk typed; if it is empty the phone is used and the
 * activation goes by OTP instead.
 */
export async function inviteGuestAccount(opts: {
  booking: typeof bookings.$inferSelect;
  login?: string | null;
  actorLabel: string;
  request?: Request;
  channel?: "email" | "sms";
}): Promise<InviteResult> {
  const booking = opts.booking;
  const email = (opts.login ?? booking.email ?? "").trim().toLowerCase();
  const guest = await findOrCreateGuest({
    fullName: booking.guestName,
    phone: booking.phone,
    email: email || booking.email || null,
  });

  // Link the stay to the person — the join the app uses to resolve "my room".
  if (booking.guestId !== guest.id) {
    await db.update(bookings).set({ guestId: guest.id, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  }

  const existing = email
    ? await db.select().from(guestAccountsTable).where(eq(guestAccountsTable.loginEmail, email)).limit(1)
    : await db.select().from(guestAccountsTable).where(eq(guestAccountsTable.loginPhone, booking.phone)).limit(1);

  const base = publicBaseUrl(opts.request);
  const downloadUrl = guestAppDownloadUrl(opts.request);
  const channel = opts.channel ?? (email ? "email" : "sms");

  // --- 3b. Returning guest — link the stay, issue no new password. ---
  if (existing[0]) {
    const account = existing[0];
    if (account.guestId !== guest.id) {
      await db
        .update(guestAccountsTable)
        .set({ guestId: guest.id, updatedAt: new Date() })
        .where(eq(guestAccountsTable.id, account.id));
    }
    const emailResult = await notifyByEmail({
      to: account.loginEmail,
      subject: "Your stay at Sunrise Motel is active",
      html:
        `<p>Hello ${booking.guestName},</p>` +
        `<p>Your stay at <strong>Sunrise Motel</strong> (${booking.reference}) is active — open the app to ` +
        `see your room number, your room bill and to order food to your room.</p>` +
        `<p><a href="${downloadUrl}">Download the Sunrise Motel guest app</a> for Android.</p>` +
        `<p><a href="${base}/app">Open the Sunrise guest app</a></p>`,
      text: `Your stay at Sunrise Motel (${booking.reference}) is active. Open ${base}/app to see your room. Download the guest app: ${downloadUrl}`,
      template: "guest_stay_linked",
      guestId: guest.id,
      bookingId: booking.id,
    });
    await logAudit({
      action: "guest.stay_linked",
      entity: "guest_account",
      entityId: account.id,
      reference: booking.reference,
      summary: `${opts.actorLabel} linked stay ${booking.reference} to the existing account ${account.loginEmail ?? account.loginPhone}.`,
      actor: "manager",
      actorLabel: opts.actorLabel,
      ip: opts.request ? clientIp(opts.request) : null,
    });
    return {
      accountId: account.id,
      guestId: guest.id,
      status: account.status,
      existingAccount: true,
      activationLink: null,
      activationOtp: null,
      expiresAt: null,
      emailSent: emailResult.sent,
      emailReason: emailResult.sent ? null : (emailResult.reason ?? null),
      guestName: booking.guestName,
    };
  }

  // --- 3a. New account: created as `invited`, activation token issued. ---
  const [account] = await db
    .insert(guestAccountsTable)
    .values({
      id: randomUUID(),
      guestId: guest.id,
      loginEmail: email || null,
      loginPhone: booking.phone || null,
      status: "invited",
      marketingConsent: false,
      invitedByLabel: opts.actorLabel,
    })
    .returning();

  const token = await issueToken({
    accountId: account!.id,
    guestId: guest.id,
    purpose: "activation",
    channel,
    sentTo: channel === "email" ? email : booking.phone,
  });
  const activationLink = `${base}/activate?token=${token.token}`;

  let emailSent = false;
  let emailReason: string | null = null;
  if (channel === "email") {
    const result = await notifyByEmail({
      to: email,
      subject: "Set your password — Sunrise Motel guest app",
      html:
        `<p>Hello ${booking.guestName},</p>` +
        `<p>Sunrise Motel has created a guest account for you. Set a password and you can:</p>` +
        `<ul><li>see your room number and check-out time</li>` +
        `<li>follow your room bill before you check out</li>` +
        `<li>order food and drinks to your room</li>` +
        `<li>message the front desk without coming down</li></ul>` +
        `<p><a href="${activationLink}">Set my password</a> — single-use, valid for 7 days.</p>` +
        `<p><a href="${downloadUrl}">Download the Sunrise Motel guest app</a> for Android.</p>` +
        `<p>Booking ${booking.reference} · ${booking.checkIn} → ${booking.checkOut} · ${booking.roomType}</p>` +
        `<p>If you would rather not install anything, everything is still available at the desk and on WhatsApp.</p>`,
      text: `Set your Sunrise Motel guest password: ${activationLink} (single-use, 7 days). Download the guest app: ${downloadUrl}. Booking ${booking.reference}.`,
      template: "guest_activation",
      guestId: guest.id,
      bookingId: booking.id,
    });
    emailSent = result.sent;
    emailReason = result.sent ? null : (result.reason ?? null);
  } else {
    await notifyBySms({
      to: booking.phone,
      subject: "Sunrise Motel guest account",
      body: `Sunrise Motel: your guest account code is ${token.otp}. Open ${base}/activate and enter your phone number plus this code.`,
      template: "guest_activation_otp",
      guestId: guest.id,
      bookingId: booking.id,
    });
  }

  await logAudit({
    action: "guest.account_created",
    entity: "guest_account",
    entityId: account!.id,
    reference: booking.reference,
    summary: `${opts.actorLabel} invited ${booking.guestName} (${email || booking.phone}) to the guest app for booking ${booking.reference}.`,
    actor: "manager",
    actorLabel: opts.actorLabel,
    ip: opts.request ? clientIp(opts.request) : null,
    metadata: { channel, existingAccount: false, emailSent },
  });

  return {
    accountId: account!.id,
    guestId: guest.id,
    status: account!.status,
    existingAccount: false,
    activationLink,
    activationOtp: token.otp,
    expiresAt: token.expiresAt.toISOString(),
    emailSent,
    emailReason,
    guestName: booking.guestName,
  };
}

/** Resend an activation link for an account that never activated (§2.3). */
export async function resendActivation(opts: {
  account: typeof guestAccountsTable.$inferSelect;
  guestName: string;
  actorLabel: string;
  request?: Request;
}) {
  const token = await issueToken({
    accountId: opts.account.id,
    guestId: opts.account.guestId,
    purpose: "activation",
    channel: opts.account.loginEmail ? "email" : "sms",
    sentTo: opts.account.loginEmail ?? opts.account.loginPhone,
  });
  const base = publicBaseUrl(opts.request);
  const downloadUrl = guestAppDownloadUrl(opts.request);
  const link = `${base}/activate?token=${token.token}`;
  const result = await notifyByEmail({
    to: opts.account.loginEmail,
    subject: "Your Sunrise Motel guest app link (resent)",
    html: `<p>Hello ${opts.guestName},</p><p>Here is a fresh link to set your password:</p><p><a href="${link}">Set my password</a></p><p>Single-use, valid for 7 days.</p><p><a href="${downloadUrl}">Download the Sunrise Motel guest app</a> for Android.</p>`,
    text: `Sunrise Motel guest app link: ${link}. Download the guest app: ${downloadUrl}`,
    template: "guest_activation_resent",
    guestId: opts.account.guestId,
  });
  await logAudit({
    action: "guest.activation_resent",
    entity: "guest_account",
    entityId: opts.account.id,
    summary: `${opts.actorLabel} resent the activation link to ${opts.account.loginEmail ?? opts.account.loginPhone}.`,
    actor: "manager",
    actorLabel: opts.actorLabel,
    ip: opts.request ? clientIp(opts.request) : null,
  });
  return { link, otp: token.otp, emailSent: result.sent, emailReason: result.sent ? null : result.reason };
}

/** Desk-assisted activation: staff set a password with the guest at the counter. */
export async function activateAtDesk(opts: {
  account: typeof guestAccountsTable.$inferSelect;
  password: string;
  actorLabel: string;
  request?: Request;
}) {
  await setGuestPassword(opts.account.id, opts.password);
  await logAudit({
    action: "guest.activated_at_desk",
    entity: "guest_account",
    entityId: opts.account.id,
    summary: `${opts.actorLabel} set a password at the desk for ${opts.account.loginEmail ?? opts.account.loginPhone}.`,
    actor: "manager",
    actorLabel: opts.actorLabel,
    ip: opts.request ? clientIp(opts.request) : null,
  });
}

// ---------------------------------------------------------------------------
// FRONT-DESK REGISTRATION — the only doorway into the guest app.
//
// There is no self-serve sign-up anywhere in the product any more. The desk
// types the guest's email, the SYSTEM chooses the password, and the desk hands
// that password over on the printed card (or sends it from the desk's own
// WhatsApp, which the desk can read in full before sending). Why the counter and
// not an email:
//
//   * a guest standing at reception is signed in before their bags are upstairs,
//     instead of waiting for a link that may never arrive;
//   * a human confirms the address, so an account cannot be attached to an inbox
//     nobody owns;
//   * "I never got the link" is a ten-second job for the desk instead of a
//     support conversation.
//
// The password is shown ONCE. It is never emailed by us, never written to an
// audit log, a notification row or any other readable column, and cannot be read
// back out of the database afterwards. Re-issuing means setting a new one:
// `activateAtDesk` above for a guest at the counter, or a reset link.
// ---------------------------------------------------------------------------

/**
 * Ambiguous characters are deliberately absent: this password gets read aloud on
 * a busy morning, and I/l/1 and O/0 are exactly where that goes wrong.
 */
const PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_DIGITS = "23456789";

/**
 * The system-set guest password — `KQP-482-XT`. 24 letters and 8 digits to draw
 * from, so roughly 7.9 billion combinations, and it survives being said out loud.
 */
export function generateGuestPassword() {
  const draw = (source: string, count: number) =>
    Array.from({ length: count }, () => source[randomInt(0, source.length)]).join("");
  return `${draw(PASSWORD_LETTERS, 3)}-${draw(PASSWORD_DIGITS, 3)}-${draw(PASSWORD_LETTERS, 2)}`;
}

export type RegisterResult = {
  accountId: string;
  guestId: string;
  guestName: string;
  loginEmail: string;
  loginPhone: string | null;
  /** Shown once on the desk screen. Null when the guest already had an account. */
  password: string | null;
  status: string;
  /** True when this email already had an account: the stay is linked, no new password. */
  existingAccount: boolean;
  roomNumber: string | null;
  bookingReference: string;
  checkOut: string | null;
  emailSent: boolean;
  emailReason: string | null;
};

/**
 * Register (or link) the guest account for a stay and return the password the
 * desk has to hand over.
 *
 * A returning guest KEEPS their password. Silently replacing a password a regular
 * already knows is how you get "the app will not let me in" at 23:00; their stay
 * is linked and nothing else changes. If they have forgotten it, the desk sets a
 * new one with them (`activateAtDesk`) or sends a reset link (`resendActivation`).
 */
export async function registerGuestAccount(opts: {
  booking: typeof bookings.$inferSelect;
  loginEmail: string;
  actorLabel: string;
  request?: Request;
}): Promise<RegisterResult> {
  const booking = opts.booking;
  const email = opts.loginEmail.trim().toLowerCase();
  if (!email) throw new Error("An email address is required — it is the name the guest signs in with.");

  const guest = await findOrCreateGuest({
    fullName: booking.guestName,
    phone: booking.phone,
    email,
  });

  // Link the stay to the person — the join the app uses to resolve "my room".
  if (booking.guestId !== guest.id) {
    await db.update(bookings).set({ guestId: guest.id, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  }

  const [room] = booking.assignedRoomId
    ? await db
        .select({ roomNumber: roomsTable.roomNumber })
        .from(roomsTable)
        .where(eq(roomsTable.id, booking.assignedRoomId))
        .limit(1)
    : [];
  const roomNumber = room?.roomNumber ?? null;

  const [existing] = await db
    .select()
    .from(guestAccountsTable)
    .where(eq(guestAccountsTable.loginEmail, email))
    .limit(1);

  const base = publicBaseUrl(opts.request);
  // --- Returning guest: link the stay and leave their password alone. ---
  if (existing) {
    const patch: Partial<typeof guestAccountsTable.$inferInsert> = { updatedAt: new Date() };
    if (existing.guestId !== guest.id) patch.guestId = guest.id;
    if (!existing.loginPhone && booking.phone) patch.loginPhone = booking.phone;
    await db.update(guestAccountsTable).set(patch).where(eq(guestAccountsTable.id, existing.id));

    const linkResult = await notifyByEmail({
      to: existing.loginEmail,
      subject: "Your stay at Sunrise Motel is active",
      html:
        `<p>Hello ${booking.guestName},</p>` +
        `<p>Your stay at <strong>Sunrise Motel</strong> (${booking.reference}) is active — open the app to ` +
        `see your room number, your room bill and to order food to your room.</p>` +
        `<p><a href="${base}/app">Open the Sunrise guest app</a></p>`,
      text: `Your stay at Sunrise Motel (${booking.reference}) is active. Open ${base}/app to see your room.`,
      template: "guest_stay_linked",
      guestId: guest.id,
      bookingId: booking.id,
    });

    await logAudit({
      action: "guest.stay_linked",
      entity: "guest_account",
      entityId: existing.id,
      reference: booking.reference,
      summary: `${opts.actorLabel} registered ${booking.guestName} (${email}) at the desk. They already had an account, so the stay was linked and their existing password was left untouched.`,
      actor: "manager",
      actorLabel: opts.actorLabel,
      ip: opts.request ? clientIp(opts.request) : null,
      metadata: { channel: "desk", source: "desk", existingAccount: true, passwordSet: false },
    });

    return {
      accountId: existing.id,
      guestId: guest.id,
      guestName: booking.guestName,
      loginEmail: email,
      loginPhone: existing.loginPhone ?? booking.phone ?? null,
      password: null,
      status: existing.status,
      existingAccount: true,
      roomNumber,
      bookingReference: booking.reference,
      checkOut: booking.checkOut,
      emailSent: linkResult.sent,
      emailReason: linkResult.sent ? null : (linkResult.reason ?? null),
    };
  }

  // --- New account: the system sets the password, the desk hands it over. ---
  const password = generateGuestPassword();
  const accountId = randomUUID();
  await db.insert(guestAccountsTable).values({
    id: accountId,
    guestId: guest.id,
    loginEmail: email,
    loginPhone: booking.phone ?? null,
    // Inserted `invited`, then switched on by setGuestPassword below, so the
    // account never exists for even a moment without a password.
    status: "invited",
    signupSource: "desk",
    invitedByLabel: opts.actorLabel,
  });
  await setGuestPassword(accountId, password, { status: "active" });

  // The email carries the sign-in ADDRESS and nothing secret: the password is
  // handed over in person, so it never passes through SMTP.
  const readyResult = await notifyByEmail({
    to: email,
    subject: "Your Sunrise Motel guest app account is ready",
    html:
      `<p>Hello ${booking.guestName},</p>` +
      `<p>Your guest app account is ready. Sign in with <strong>${email}</strong> and the password the front ` +
      `desk handed you.</p>` +
      `<p><a href="${base}/app">Open the Sunrise guest app</a></p>` +
      `<p>Lost the password? Anyone at the front desk can set a new one with you in a minute.</p>`,
    text: `Sign in to the Sunrise Motel guest app with ${email} and the password the front desk gave you: ${base}/app`,
    template: "guest_account_ready",
    guestId: guest.id,
    bookingId: booking.id,
  });

  await logAudit({
    action: "guest.account_registered",
    entity: "guest_account",
    entityId: accountId,
    reference: booking.reference,
    summary: `${opts.actorLabel} registered a guest account for ${booking.guestName} (${email}) on booking ${booking.reference}. The system set the password and the desk handed it over — the password itself is recorded nowhere.`,
    actor: "manager",
    actorLabel: opts.actorLabel,
    ip: opts.request ? clientIp(opts.request) : null,
    metadata: { channel: "desk", source: "desk", existingAccount: false, passwordSet: true },
  });

  return {
    accountId,
    guestId: guest.id,
    guestName: booking.guestName,
    loginEmail: email,
    loginPhone: booking.phone ?? null,
    password,
    status: "active",
    existingAccount: false,
    roomNumber,
    bookingReference: booking.reference,
    checkOut: booking.checkOut,
    emailSent: readyResult.sent,
    emailReason: readyResult.sent ? null : (readyResult.reason ?? null),
  };
}

