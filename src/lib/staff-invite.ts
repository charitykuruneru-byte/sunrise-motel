// ONE implementation of "invite somebody to the management system", shared by the
// portal's own route (/api/admin/invitations), the alias the brief asked for
// (/api/admin/invite) and the bulk sender (/api/admin/invite/bulk).
//
// Why a shared module: the token, the expiry, the duplicate checks, the email and
// the audit row have to be identical no matter who asks. Three copies of that logic
// is three ways for the invitations table and the notification log to disagree.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogTable, guestAccountsTable, invitationsTable, staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { INVITEE_TTL_HOURS, appOrigin, roleLabel, sendInvitationEmail } from "@/lib/invitation-email";
import { notifyByEmail } from "@/lib/notify";
import { revalidateLiveContent } from "@/lib/revalidate";
import type { SessionUser } from "@/lib/staff-auth";

/**
 * Roles that can be handed out by invitation.
 *
 * `admin` belongs on this list: src/lib/staff-auth.ts treats "admin" as a Super
 * Admin (isSuperAdminRole), the staff table already holds rows with that role, and
 * yet the portal could not previously invite or promote anybody to it — so the one
 * role the motel actually asked for was the one role the form refused.
 */
export const INVITABLE_ROLES = ["super_admin", "admin", "motel_manager", "restaurant_manager", "staff"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** What the three addresses on file are meant to be (the brief, as a constant). */
export const DEFAULT_ADMIN_INVITES: { email: string; role: InvitableRole }[] = [
  { email: "sunrisemotelllw@gmail.com", role: "super_admin" },
  { email: "evone.azraa@yahoo.com", role: "admin" },
  { email: "cchiwale25@gmail.com", role: "admin" },
];

/** "evone.azraa@yahoo.com" → "Evone Azraa" — a placeholder the invitee overwrites when they set up. */
export function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  const pretty = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return (pretty || email).slice(0, 160);
}

/** The link that goes in the email. /admin/setup forwards here (both URLs work). */
export function setupLinkFor(request: Request, token: string) {
  return `${appOrigin(request)}/setup-account?token=${encodeURIComponent(token)}`;
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Five invitations an hour per actor — a person, not a mail-bomb. */
async function inviteLimitReached(actorId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: auditLogTable.id })
    .from(auditLogTable)
    .where(and(eq(auditLogTable.actorId, actorId), inArray(auditLogTable.action, ["INVITE_SENT", "INVITE_RESENT", "EMAIL_FAILED"]), gt(auditLogTable.createdAt, since)))
    .limit(5);
  return recent.length >= 5;
}

async function audit(request: Request, actor: SessionUser, input: { action: string; invitationId?: string; targetId?: string; targetEmail?: string; details?: Record<string, unknown> }) {
  await logAudit({
    action: input.action,
    entity: input.targetId && !input.invitationId ? "staff" : "invitation",
    entityId: input.invitationId ?? input.targetId ?? null,
    targetId: input.targetId ?? input.invitationId ?? null,
    targetEmail: input.targetEmail ?? null,
    summary: `${input.action} by ${actor.name} (${actor.email}) for ${input.targetEmail ?? "invitation"}.`,
    actor: "manager",
    actorLabel: actor.name,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    ip: clientIp(request),
    details: input.details ?? null,
  });
}

/**
 * Tells an existing account that its access changed. Deliberately NOT a setup link:
 * that account already has a password, and pretending otherwise is how somebody
 * clicks a link, sets a second password and then wonders which one works.
 */
async function emailRoleGranted(opts: { request: Request; email: string; name: string; role: string; actor: SessionUser }) {
  const base = appOrigin(opts.request);
  const role = roleLabel(opts.role);
  const loginUrl = `${base}/admin/login`;
  const text = [
    `Hello ${opts.name},`,
    "",
    `${opts.actor.name} has set your Sunrise Motel access to ${role}.`,
    `Your existing password still works — sign in at ${loginUrl}`,
    "If you have forgotten it, ask a Super Admin to set a new one from Admin -> Users.",
    "",
    "Regards,",
    "Sunrise Motel Team",
  ].join("\n");
  return notifyByEmail({
    to: opts.email,
    template: "staff_role_granted",
    subject: `Sunrise Motel - Your access is now ${role}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#171513;border:1px solid #eadfce;border-radius:12px;overflow:hidden">
        <div style="background:#171513;padding:24px;text-align:center"><img src="${base}/images/sunrise-logo.svg" alt="Sunrise Motel" width="56" height="56"><p style="margin:10px 0 0;color:#f28c18;font-size:11px;font-weight:bold;letter-spacing:2px">SUNRISE MOTEL &amp; RESTAURANT</p></div>
        <div style="padding:28px 30px">
          <p>Hello ${opts.name},</p>
          <p>${opts.actor.name} has set your Sunrise Motel access to <strong>${role}</strong>.</p>
          <p>Your existing password still works — sign in at <a href="${loginUrl}">${loginUrl}</a>.</p>
          <p style="font-size:13px;color:#756c64">If you have forgotten it, ask a Super Admin to set a new one from Admin &rarr; Users.</p>
          <p>Regards,<br>Sunrise Motel Team</p>
        </div>
      </div>`,
    text,
    logBody: `Role grant email (${opts.role}).`,
  });
}

export type InviteOutcome =
  | { outcome: "invited"; email: string; role: InvitableRole; invitationId: string; inviteLink: string; emailSent: boolean; reason: string | null }
  | { outcome: "already_has_account"; email: string; role: InvitableRole; staffId?: string; existingRole?: string; roleUpdated: boolean; emailSent: boolean; reason: string | null }
  | { outcome: "already_invited"; email: string; invitationId: string; status: string }
  | { outcome: "rate_limited"; email: string; reason: string }
  | { outcome: "invalid"; email: string; reason: string };

/**
 * Create (or re-issue) a staff invitation and email the setup link.
 *
 * `promoteExisting` covers the honest case where the address already has an account
 * — the brief's own super admin is one. Refusing outright would leave that person
 * unable to act on the request; sending them a setup link would be a lie (they
 * already have a password). So the role is set and the email says exactly that.
 */
export async function createStaffInvitation(opts: {
  request: Request;
  actor: SessionUser;
  email: string;
  role: string;
  name?: string;
  promoteExisting?: boolean;
}): Promise<InviteOutcome> {
  const email = (opts.email ?? "").trim().toLowerCase();
  const role = (opts.role ?? "").trim() as InvitableRole;
  if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { outcome: "invalid", email, reason: "Enter a valid email address." };
  if (!INVITABLE_ROLES.includes(role)) return { outcome: "invalid", email, reason: "Choose a valid role." };
  if (await inviteLimitReached(opts.actor.id)) return { outcome: "rate_limited", email, reason: "Invite limit reached. Try again in an hour." };

  const [existingStaff] = await db.select().from(staffTable).where(sql`lower(${staffTable.email}) = ${email}`).limit(1);
  if (existingStaff && !existingStaff.isDeleted) {
    const changed = existingStaff.role !== role;
    let emailSent = false;
    let reason: string | null = null;
    if (opts.promoteExisting && changed) {
      await db.update(staffTable).set({ role }).where(eq(staffTable.id, existingStaff.id));
      await audit(opts.request, opts.actor, {
        action: "ROLE_CHANGED", targetId: existingStaff.id, targetEmail: email,
        details: { oldRole: existingStaff.role, newRole: role, via: "invite" },
      });
    }
    if (opts.promoteExisting && changed) {
      const delivery = await emailRoleGranted({ request: opts.request, email, name: existingStaff.name, role, actor: opts.actor });
      emailSent = delivery.sent;
      reason = delivery.sent ? null : (delivery.reason ?? "Email could not be sent.");
      await audit(opts.request, opts.actor, {
        action: delivery.sent ? "INVITE_SENT" : "EMAIL_FAILED", targetId: existingStaff.id, targetEmail: email,
        details: { role, existingAccount: true, emailSent: delivery.sent, reason: reason ?? undefined },
      });
    }
    revalidateLiveContent();
    return {
      outcome: "already_has_account", email, role, staffId: existingStaff.id, existingRole: existingStaff.role,
      roleUpdated: Boolean(opts.promoteExisting && changed), emailSent, reason,
    };
  }

  const [existingGuest] = await db
    .select({ id: guestAccountsTable.id })
    .from(guestAccountsTable)
    .where(sql`lower(${guestAccountsTable.loginEmail}) = ${email}`)
    .limit(1);
  if (existingGuest) {
    return { outcome: "already_has_account", email, role, roleUpdated: false, emailSent: false, reason: "This address already has a guest account." };
  }

  const [pending] = await db
    .select({ id: invitationsTable.id, status: invitationsTable.status })
    .from(invitationsTable)
    .where(and(sql`lower(${invitationsTable.email}) = ${email}`, sql`${invitationsTable.status} in ('pending', 'failed')`))
    .limit(1);
  if (pending) return { outcome: "already_invited", email, invitationId: pending.id, status: pending.status };

  const token = randomBytes(32).toString("hex");
  const [invitation] = await db
    .insert(invitationsTable)
    .values({
      id: randomUUID(),
      email,
      name: (opts.name ?? "").trim() || nameFromEmail(email),
      role,
      accountType: "staff",
      invitedById: opts.actor.id,
      invitedByName: opts.actor.name,
      invitedByEmail: opts.actor.email,
      invitedByRole: opts.actor.role,
      tokenHash: hashInviteToken(token),
      status: "pending",
      expiresAt: new Date(Date.now() + INVITEE_TTL_HOURS * 60 * 60 * 1000),
    })
    .returning();
  if (!invitation) return { outcome: "invalid", email, reason: "Invitation could not be created." };

  const delivery = await sendInvitationEmail({
    request: opts.request,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    accountType: "staff",
    invitedByName: invitation.invitedByName,
    invitedByEmail: invitation.invitedByEmail,
    token,
  }).catch((error: unknown) => ({ sent: false as const, reason: error instanceof Error ? error.message : "Email could not be sent.", messageId: null }));

  await db
    .update(invitationsTable)
    .set({ status: delivery.sent ? "pending" : "failed", deliveryError: delivery.sent ? null : (delivery.reason ?? "Email failed"), updatedAt: new Date() })
    .where(eq(invitationsTable.id, invitation.id));

  await audit(opts.request, opts.actor, {
    action: delivery.sent ? "INVITE_SENT" : "EMAIL_FAILED", invitationId: invitation.id, targetEmail: email,
    details: { role, accountType: "staff", invitedBy: opts.actor.id, emailSent: delivery.sent, reason: delivery.sent ? undefined : delivery.reason },
  });
  revalidateLiveContent();

  return {
    outcome: "invited", email, role, invitationId: invitation.id,
    inviteLink: setupLinkFor(opts.request, token),
    emailSent: delivery.sent,
    reason: delivery.sent ? null : (delivery.reason ?? "Email could not be sent."),
  };
}
