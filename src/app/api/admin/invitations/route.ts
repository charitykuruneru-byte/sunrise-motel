import { randomBytes, randomUUID, createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogTable, guestAccountsTable, invitationsTable, staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { isManagerRole, isSuperAdminRole, readSession } from "@/lib/staff-auth";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

const INVITABLE_ROLES = ["super_admin", "motel_manager", "restaurant_manager", "staff"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function superAdmin(request: Request) {
  const user = await readSession(request);
  if (!user) return { error: fail("Please sign in.", 401) } as const;
  if (!isSuperAdminRole(user.role)) return { error: fail("Super Admin access required.", 403) } as const;
  return { user } as const;
}

async function checkInviteLimit(actorId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: auditLogTable.id })
    .from(auditLogTable)
    .where(and(eq(auditLogTable.actorId, actorId), inArray(auditLogTable.action, ["INVITE_SENT", "INVITE_RESENT", "EMAIL_FAILED"]), gt(auditLogTable.createdAt, since)))
    .limit(5);
  return recent.length < 5;
}

async function audit(request: Request, actor: { id: string; email: string; name: string; role: string }, input: {
  action: string;
  invitationId?: string;
  targetId?: string;
  targetEmail?: string;
  details?: Record<string, unknown>;
}) {
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

async function emailInvitation(request: Request, invitation: typeof invitationsTable.$inferSelect, token: string) {
  try {
    return await sendInvitationEmail({
      request,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      accountType: invitation.accountType as "staff" | "guest",
      invitedByName: invitation.invitedByName,
      invitedByEmail: invitation.invitedByEmail,
      token,
    });
  } catch (error) {
    return { sent: false as const, reason: error instanceof Error ? error.message : "Email could not be sent." };
  }
}

export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return fail("Please sign in.", 401);
  if (!isManagerRole(user.role)) return fail("Manager access required.", 403);
  const canManage = isSuperAdminRole(user.role);
  const [staff, invitations] = await Promise.all([
    db.select().from(staffTable).orderBy(desc(staffTable.createdAt)),
    db.select().from(invitationsTable).orderBy(desc(invitationsTable.createdAt)).limit(500),
  ]);
  return NextResponse.json({
    users: staff.map((user) => ({
      id: user.id,
      name: user.name,
      ...(canManage ? { email: user.email } : {}),
      role: user.role,
      ...(canManage ? { invitedBy: user.invitedBy } : {}),
      status: user.isDeleted ? "deleted" : user.isActive ? "active" : "deactivated",
      ...(canManage ? { lastLogin: user.lastLoginAt, createdAt: user.createdAt } : {}),
    })),
    invitations: canManage ? invitations.map((invite) => ({
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      accountType: invite.accountType,
      invitedByName: invite.invitedByName,
      status: invite.expiresAt.getTime() < Date.now() && invite.status === "pending" ? "expired" : invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      deliveryError: invite.deliveryError,
      // When the last attempt happened — so a stored failure from three days ago
      // cannot look like a failure that is happening now.
      updatedAt: invite.updatedAt,
    })) : [],
    canManage,
  });
}

export async function POST(request: Request) {
  const auth = await superAdmin(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  try {
    const body = (await request.json()) as { name?: string; email?: string; role?: string };
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const role = (body.role ?? "staff").trim() as InvitableRole;
    if (name.length < 2 || name.length > 160) return fail("Enter a name between 2 and 160 characters.", 400);
    if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.", 400);
    if (!INVITABLE_ROLES.includes(role)) return fail("Choose a valid staff role.", 400);
    if (!(await checkInviteLimit(user.id))) return fail("Invite limit reached. Try again in an hour.", 429);

    const [existingStaff] = await db
      .select({ id: staffTable.id, isDeleted: staffTable.isDeleted })
      .from(staffTable)
      .where(sql`lower(${staffTable.email}) = ${email}`)
      .limit(1);
    const [existingGuest] = await db
      .select({ id: guestAccountsTable.id })
      .from(guestAccountsTable)
      .where(sql`lower(${guestAccountsTable.loginEmail}) = ${email}`)
      .limit(1);
    if ((existingStaff && !existingStaff.isDeleted) || existingGuest) return fail("This email already has an account. Ask the Super Admin to manage it.", 409);

    const [pending] = await db
      .select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(and(sql`lower(${invitationsTable.email}) = ${email}`, sql`${invitationsTable.status} in ('pending', 'failed')`))
      .limit(1);
    if (pending) return fail("An invitation already exists for this email. Resend it from Users.", 409);

    const token = randomBytes(32).toString("hex");
    const [invitation] = await db
      .insert(invitationsTable)
      .values({
        id: randomUUID(),
        email,
        name,
        role,
        accountType: "staff",
        invitedById: user.id,
        invitedByName: user.name,
        invitedByEmail: user.email,
        invitedByRole: user.role,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        status: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    if (!invitation) return fail("Invitation could not be created.", 500);

    const delivery = await emailInvitation(request, invitation, token);
    await db
      .update(invitationsTable)
      .set({ status: delivery.sent ? "pending" : "failed", deliveryError: delivery.sent ? null : delivery.reason ?? "Email failed", updatedAt: new Date() })
      .where(eq(invitationsTable.id, invitation.id));
    await audit(request, user, {
      action: delivery.sent ? "INVITE_SENT" : "EMAIL_FAILED",
      invitationId: invitation.id,
      targetEmail: email,
      details: { role, accountType: "staff", invitedBy: user.id, emailSent: delivery.sent, reason: delivery.sent ? undefined : delivery.reason },
    });
    revalidateLiveContent();
    return NextResponse.json({ success: true, invitationId: invitation.id, emailSent: delivery.sent, reason: delivery.sent ? null : delivery.reason }, { status: 201 });
  } catch (error) {
    console.error("Staff invitation failed", error);
    return fail("Could not create the invitation.", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await superAdmin(request);
  if (auth.error) return auth.error;
  const user = auth.user;
  try {
    const body = (await request.json()) as { action?: string; id?: string; role?: string };
    if (!body.id) return fail("An id is required.", 400);

    if (body.action === "resend") {
      const [invitation] = await db.select().from(invitationsTable).where(eq(invitationsTable.id, body.id)).limit(1);
      if (!invitation || invitation.status === "accepted" || invitation.status === "revoked") return fail("This invitation cannot be resent.", 404);
      if (!(await checkInviteLimit(user.id))) return fail("Invite limit reached. Try again in an hour.", 429);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [refreshed] = await db
        .update(invitationsTable)
        .set({ tokenHash: createHash("sha256").update(token).digest("hex"), status: "pending", expiresAt, deliveryError: null, updatedAt: new Date() })
        .where(eq(invitationsTable.id, invitation.id))
        .returning();
      const delivery = await emailInvitation(request, refreshed!, token);
      await db.update(invitationsTable).set({ status: delivery.sent ? "pending" : "failed", deliveryError: delivery.sent ? null : delivery.reason ?? "Email failed", updatedAt: new Date() }).where(eq(invitationsTable.id, invitation.id));
      await audit(request, user, { action: delivery.sent ? "INVITE_RESENT" : "EMAIL_FAILED", invitationId: invitation.id, targetEmail: invitation.email, details: { role: invitation.role, emailSent: delivery.sent, reason: delivery.sent ? undefined : delivery.reason } });
      revalidateLiveContent();
      return NextResponse.json({ success: true, emailSent: delivery.sent, reason: delivery.sent ? null : delivery.reason });
    }

    const [target] = await db.select().from(staffTable).where(eq(staffTable.id, body.id)).limit(1);
    if (!target || target.isDeleted) return fail("User not found.", 404);
    if (body.action === "role") {
      const role = (body.role ?? "") as InvitableRole;
      if (!INVITABLE_ROLES.includes(role)) return fail("Choose a valid role.", 400);
      await db.update(staffTable).set({ role }).where(eq(staffTable.id, target.id));
      await audit(request, user, { action: "ROLE_CHANGED", targetId: target.id, targetEmail: target.email, details: { oldRole: target.role, newRole: role } });
      revalidateLiveContent();
      return NextResponse.json({ success: true });
    }
    if (body.action === "activate" || body.action === "deactivate" || body.action === "delete") {
      const activeSuperAdmins = await db.select({ id: staffTable.id }).from(staffTable).where(and(sql`${staffTable.role} in ('admin', 'super_admin')`, eq(staffTable.isActive, true), eq(staffTable.isDeleted, false)));
      if ((body.action === "deactivate" || body.action === "delete") && isSuperAdminRole(target.role) && activeSuperAdmins.length <= 1) {
        return fail("You cannot remove the last active Super Admin.", 409);
      }
      if (target.id === user.id && body.action !== "activate") return fail("You cannot deactivate or delete your own account.", 400);
      if (body.action === "activate") {
        await db.update(staffTable).set({ isActive: true }).where(eq(staffTable.id, target.id));
        await audit(request, user, { action: "USER_ACTIVATED", targetId: target.id, targetEmail: target.email });
      } else if (body.action === "deactivate") {
        await db.update(staffTable).set({ isActive: false }).where(eq(staffTable.id, target.id));
        await audit(request, user, { action: "USER_DEACTIVATED", targetId: target.id, targetEmail: target.email });
      } else {
        await db.update(staffTable).set({ isActive: false, isDeleted: true, deletedAt: new Date() }).where(eq(staffTable.id, target.id));
        await audit(request, user, { action: "USER_DELETED", targetId: target.id, targetEmail: target.email });
      }
      revalidateLiveContent();
      return NextResponse.json({ success: true });
    }
    return fail("Unknown user action.", 400);
  } catch (error) {
    console.error("Invitation/user update failed", error);
    return fail("Could not complete that action.", 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await superAdmin(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return fail("An invitation id is required.", 400);
  const [invitation] = await db.select().from(invitationsTable).where(eq(invitationsTable.id, id)).limit(1);
  if (!invitation || !["pending", "failed", "expired"].includes(invitation.status)) return fail("Invitation not found or already accepted.", 404);
  await db.update(invitationsTable).set({ status: "revoked", tokenHash: null, updatedAt: new Date() }).where(eq(invitationsTable.id, id));
  await audit(request, auth.user, { action: "INVITE_REVOKED", invitationId: id, targetEmail: invitation.email, details: { role: invitation.role } });
  revalidateLiveContent();
  return NextResponse.json({ success: true });
}