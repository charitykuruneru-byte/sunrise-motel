import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, guestAccountsTable, guestsTable, invitationsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { INVITEE_TTL_HOURS, sendInvitationEmail } from "@/lib/invitation-email";
import { notifyByEmail } from "@/lib/notify";
import { findOrCreateGuest } from "@/lib/hotel";
import { normalisePhone } from "@/lib/phone";
import { resendActivation } from "@/lib/guest-account";
import type { SessionUser } from "@/lib/staff-auth";

export class GuestProfileInviteError extends Error {}

export async function inviteCheckedInGuest(opts: {
  booking: typeof bookings.$inferSelect;
  email: string;
  actor: SessionUser;
  request: Request;
}) {
  const booking = opts.booking;
  if (booking.status !== "checked_in") throw new Error("Guest accounts can only be invited after check-in.");
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) throw new Error("Enter a valid guest email address.");

  const [existing] = await db
    .select()
    .from(guestAccountsTable)
    .where(sql`lower(${guestAccountsTable.loginEmail}) = ${email}`)
    .limit(1);
  if (existing) {
    await db.update(bookings).set({ guestId: existing.guestId, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    const [existingGuest] = await db.select().from(guestsTable).where(eq(guestsTable.id, existing.guestId)).limit(1);
    if (existingGuest && !existingGuest.email) {
      await db.update(guestsTable).set({ email, updatedAt: new Date() }).where(eq(guestsTable.id, existingGuest.id));
    }
    if (["invited", "pending_verification"].includes(existing.status)) {
      const delivery = await resendActivation({
        account: existing,
        guestName: existingGuest?.fullName ?? booking.guestName,
        actorLabel: opts.actor.name,
        request: opts.request,
      });
      await logAudit({
        action: "INVITE_RESENT",
        entity: "guest_account",
        entityId: existing.id,
        targetId: existing.id,
        targetEmail: email,
        reference: booking.reference,
        summary: `${opts.actor.name} resent guest activation for checked-in booking ${booking.reference}.`,
        actor: "manager",
        actorLabel: opts.actor.name,
        actorId: opts.actor.id,
        actorEmail: opts.actor.email,
        actorRole: opts.actor.role,
        ip: clientIp(opts.request),
        details: { bookingId: booking.id, existingAccount: true, status: existing.status },
      });
      return { existingAccount: true, emailSent: delivery.emailSent, emailReason: delivery.emailReason };
    }
    const base = new URL(opts.request.url).origin;
    const mail = await notifyByEmail({
      to: email,
      subject: "Your stay at Sunrise Motel is active",
      html: `<p>Hello ${booking.guestName.replace(/[&<>"']/g, "")},</p><p>Your stay ${booking.reference} is linked to your existing account. Sign in to see your room and bill.</p><p><a href="${base}/app">Open the guest app</a></p><p><a href="https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk">Download the guest Android app</a></p>`,
      text: `Your stay ${booking.reference} is linked to your existing account. Sign in at ${base}/app. Guest app: https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk`,
      template: "guest_stay_linked",
      guestId: existing.guestId,
      bookingId: booking.id,
    });
    await logAudit({
      action: "GUEST_ACCOUNT_LINKED",
      entity: "guest_account",
      entityId: existing.id,
      targetId: existing.id,
      targetEmail: email,
      reference: booking.reference,
      summary: `${opts.actor.name} linked checked-in guest ${booking.guestName} to their existing account.`,
      actor: "manager",
      actorLabel: opts.actor.name,
      actorId: opts.actor.id,
      actorEmail: opts.actor.email,
      actorRole: opts.actor.role,
      ip: clientIp(opts.request),
      details: { bookingId: booking.id, existingAccount: true, guestId: existing.guestId },
    });
    return { existingAccount: true, emailSent: mail.sent, emailReason: mail.sent ? null : mail.reason ?? null };
  }

  const guest = booking.guestId
    ? (await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1))[0] ??
      (await findOrCreateGuest({ fullName: booking.guestName, phone: booking.phone, email }))
    : await findOrCreateGuest({ fullName: booking.guestName, phone: booking.phone, email });
  if (booking.guestId !== guest.id) {
    await db.update(bookings).set({ guestId: guest.id, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  }
  if (guest.email !== email) {
    await db.update(guestsTable).set({ email, updatedAt: new Date() }).where(eq(guestsTable.id, guest.id));
  }

  const [existingInvite] = await db.select().from(invitationsTable)
    .where(and(sql`lower(${invitationsTable.email}) = ${email}`, eq(invitationsTable.accountType, "guest")))
    .orderBy(desc(invitationsTable.createdAt)).limit(1);
  const token = randomBytes(32).toString("hex");
  const inviteValues = {
    email,
    name: booking.guestName,
    role: "guest",
    accountType: "guest",
    invitedById: opts.actor.id,
    invitedByName: opts.actor.name,
    invitedByEmail: opts.actor.email,
    invitedByRole: opts.actor.role,
    guestId: guest.id,
    bookingId: booking.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    status: "pending",
    expiresAt: new Date(Date.now() + INVITEE_TTL_HOURS * 60 * 60 * 1000),
    deliveryError: null,
    updatedAt: new Date(),
  } as const;
  let invitation: typeof invitationsTable.$inferSelect;
  if (existingInvite && ["pending", "failed", "expired"].includes(existingInvite.status)) {
    [invitation] = await db.update(invitationsTable).set(inviteValues).where(eq(invitationsTable.id, existingInvite.id)).returning();
  } else {
    [invitation] = await db.insert(invitationsTable).values({ id: randomUUID(), ...inviteValues }).returning();
  }
  if (!invitation) throw new Error("Guest invitation could not be saved.");

  let delivery: { sent: boolean; reason?: string };
  try {
    delivery = await sendInvitationEmail({
      request: opts.request,
      email,
      name: booking.guestName,
      role: "guest",
      accountType: "guest",
      invitedByName: opts.actor.name,
      invitedByEmail: opts.actor.email,
      token,
      booking: { reference: booking.reference, roomType: booking.roomType, checkIn: booking.checkIn },
    });
  } catch (error) {
    delivery = { sent: false, reason: error instanceof Error ? error.message : "Email could not be sent." };
  }
  await db.update(invitationsTable)
    .set({ status: delivery.sent ? "pending" : "failed", deliveryError: delivery.sent ? null : delivery.reason ?? "Email failed", updatedAt: new Date() })
    .where(eq(invitationsTable.id, invitation.id));
  await logAudit({
    action: delivery.sent ? (existingInvite ? "INVITE_RESENT" : "INVITE_SENT") : "EMAIL_FAILED",
    entity: "invitation",
    entityId: invitation.id,
    targetId: invitation.id,
    targetEmail: email,
    reference: booking.reference,
    summary: `${opts.actor.name} ${delivery.sent ? "invited" : "could not email an invitation to"} checked-in guest ${booking.guestName} (${email}).`,
    actor: "manager",
    actorLabel: opts.actor.name,
    actorId: opts.actor.id,
    actorEmail: opts.actor.email,
    actorRole: opts.actor.role,
    ip: clientIp(opts.request),
    details: { role: "guest", accountType: "guest", bookingId: booking.id, emailSent: delivery.sent, reason: delivery.reason },
  });
  return { existingAccount: false, emailSent: delivery.sent, emailReason: delivery.sent ? null : delivery.reason ?? null };
}

export async function inviteGuestProfile(opts: {
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  notes?: string | null;
  actor: SessionUser;
  request: Request;
}) {
  const fullName = opts.fullName.trim();
  const email = opts.email.trim().toLowerCase();
  if (fullName.length < 2 || fullName.length > 160) throw new GuestProfileInviteError("Enter a guest name between 2 and 160 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) throw new GuestProfileInviteError("Enter a valid guest email address.");
  const rawPhone = opts.phone?.trim() || null;
  const phone = normalisePhone(rawPhone) ?? rawPhone;
  if (phone && phone.length > 40) throw new GuestProfileInviteError("Phone numbers must be 40 characters or fewer.");
  const country = opts.country?.trim() || null;
  if (country && country.length > 80) throw new GuestProfileInviteError("Country must be 80 characters or fewer.");

  const [existingAccount] = await db.select().from(guestAccountsTable)
    .where(sql`lower(${guestAccountsTable.loginEmail}) = ${email}`)
    .limit(1);
  const emailGuest = (await db.select({ id: guestsTable.id }).from(guestsTable)
    .where(sql`lower(${guestsTable.email}) = ${email}`)
    .limit(1))[0];
  const phoneIdentity = phone?.replace(/\D/g, "").slice(-9) ?? "";
  const phoneGuest = phoneIdentity.length >= 6
    ? (await db.select({ id: guestsTable.id }).from(guestsTable)
        .where(sql`right(regexp_replace(${guestsTable.phone}, '[^0-9]', '', 'g'), 9) = ${phoneIdentity}`)
        .limit(1))[0]
    : undefined;
  if (!existingAccount && emailGuest && phoneGuest && emailGuest.id !== phoneGuest.id) {
    throw new GuestProfileInviteError("That email and phone number belong to different guest profiles. Ask an administrator to review them.");
  }
  const guest = existingAccount
    ? (await db.select().from(guestsTable).where(eq(guestsTable.id, existingAccount.guestId)).limit(1))[0]
    : await findOrCreateGuest({ fullName, email, phone, country });
  if (!guest) throw new Error("The guest profile for this account could not be found.");
  if (existingAccount && emailGuest && emailGuest.id !== guest.id) {
    throw new GuestProfileInviteError("That email is already listed on a different guest profile. Ask an administrator to review it.");
  }
  if (existingAccount && phoneGuest && phoneGuest.id !== guest.id) {
    throw new GuestProfileInviteError("This phone number is already linked to another guest profile.");
  }
  if (existingAccount && !["active", "invited", "pending_verification"].includes(existingAccount.status)) {
    throw new GuestProfileInviteError(`This guest account is ${existingAccount.status.replaceAll("_", " ")}. Ask an administrator to review it.`);
  }
  const guestPatch: Partial<typeof guestsTable.$inferInsert> = { fullName, email, updatedAt: new Date() };
  if (phone) guestPatch.phone = phone;
  if (country) guestPatch.country = country;
  if (opts.notes != null) guestPatch.notes = opts.notes.trim() || null;
  await db.update(guestsTable).set(guestPatch).where(eq(guestsTable.id, guest.id));

  if (existingAccount) {
    if (existingAccount.guestId !== guest.id) {
      throw new GuestProfileInviteError("This email is already linked to another guest account. Ask an administrator to resolve it.");
    }
    if (existingAccount.status === "active") {
      return { guestId: guest.id, existingAccount: true, alreadyActive: true, emailSent: false, emailReason: null };
    }
    if (["invited", "pending_verification"].includes(existingAccount.status)) {
      const delivery = await resendActivation({
        account: existingAccount,
        guestName: fullName,
        actorLabel: opts.actor.name,
        request: opts.request,
      });
      return {
        guestId: guest.id,
        existingAccount: true,
        alreadyActive: false,
        emailSent: delivery.emailSent,
        emailReason: delivery.emailReason,
      };
    }
    throw new Error("This guest account cannot receive a setup email.");
  }

  const [otherActiveInvite] = await db.select().from(invitationsTable)
    .where(and(
      sql`lower(${invitationsTable.email}) = ${email}`,
      inArray(invitationsTable.status, ["pending", "failed"]),
    ))
    .orderBy(desc(invitationsTable.createdAt))
    .limit(1);
  if (otherActiveInvite && otherActiveInvite.accountType !== "guest") {
    throw new GuestProfileInviteError("This email already has a pending staff invitation. Ask an administrator to review it.");
  }

  const [existingInvite] = await db.select().from(invitationsTable)
    .where(and(
      sql`lower(${invitationsTable.email}) = ${email}`,
      eq(invitationsTable.accountType, "guest"),
    ))
    .orderBy(desc(invitationsTable.createdAt))
    .limit(1);
  const token = randomBytes(32).toString("hex");
  const inviteValues = {
    email,
    name: fullName,
    role: "guest",
    accountType: "guest",
    invitedById: opts.actor.id,
    invitedByName: opts.actor.name,
    invitedByEmail: opts.actor.email,
    invitedByRole: opts.actor.role,
    guestId: guest.id,
    bookingId: null,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    status: "pending",
    expiresAt: new Date(Date.now() + INVITEE_TTL_HOURS * 60 * 60 * 1000),
    deliveryError: null,
    updatedAt: new Date(),
  } as const;
  let invitation: typeof invitationsTable.$inferSelect;
  if (existingInvite && ["pending", "failed", "expired"].includes(existingInvite.status)) {
    [invitation] = await db.update(invitationsTable)
      .set(inviteValues)
      .where(eq(invitationsTable.id, existingInvite.id))
      .returning();
  } else {
    [invitation] = await db.insert(invitationsTable)
      .values({ id: randomUUID(), ...inviteValues })
      .returning();
  }
  if (!invitation) throw new Error("Guest invitation could not be saved.");

  let delivery: { sent: boolean; reason?: string };
  try {
    delivery = await sendInvitationEmail({
      request: opts.request,
      email,
      name: fullName,
      role: "guest",
      accountType: "guest",
      invitedByName: opts.actor.name,
      invitedByEmail: opts.actor.email,
      token,
    });
  } catch (error) {
    delivery = { sent: false, reason: error instanceof Error ? error.message : "Email could not be sent." };
  }
  await db.update(invitationsTable)
    .set({
      status: delivery.sent ? "pending" : "failed",
      deliveryError: delivery.sent ? null : delivery.reason ?? "Email failed",
      updatedAt: new Date(),
    })
    .where(eq(invitationsTable.id, invitation.id));
  await logAudit({
    action: delivery.sent ? (existingInvite ? "INVITE_RESENT" : "INVITE_SENT") : "EMAIL_FAILED",
    entity: "invitation",
    entityId: invitation.id,
    targetId: invitation.id,
    targetEmail: email,
    summary: `${opts.actor.name} ${delivery.sent ? "invited" : "could not email an invitation to"} guest ${fullName} (${email}).`,
    actor: "manager",
    actorLabel: opts.actor.name,
    actorId: opts.actor.id,
    actorEmail: opts.actor.email,
    actorRole: opts.actor.role,
    ip: clientIp(opts.request),
    details: { role: "guest", accountType: "guest", guestId: guest.id, emailSent: delivery.sent, reason: delivery.reason },
  });
  return {
    guestId: guest.id,
    existingAccount: false,
    alreadyActive: false,
    emailSent: delivery.sent,
    emailReason: delivery.sent ? null : delivery.reason ?? null,
  };
}