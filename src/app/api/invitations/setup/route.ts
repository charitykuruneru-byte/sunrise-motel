import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { guestAccountsTable, guestsTable, invitationsTable, staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { appOrigin } from "@/lib/invitation-email";
import { notifyByEmail } from "@/lib/notify";
import { hashPassword } from "@/lib/password";
import { nextStaffCode } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findInvitation(token: string) {
  if (!token || token.length > 256) return null;
  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.tokenHash, hashInviteToken(token)))
    .limit(1);
  return invitation ?? null;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const invitation = await findInvitation(token);
  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json({ valid: false, reason: "This invitation is invalid, expired, revoked or already used." }, { status: 410 });
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await db.update(invitationsTable).set({ status: "expired", tokenHash: null, updatedAt: new Date() }).where(eq(invitationsTable.id, invitation.id));
    return NextResponse.json({ valid: false, reason: "Link expired. Contact Admin to resend your invite." }, { status: 410 });
  }
  return NextResponse.json({
    valid: true,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    accountType: invitation.accountType,
    expiresAt: invitation.expiresAt,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      name?: string;
      password?: string;
      confirmPassword?: string;
      acceptedTerms?: boolean;
    };
    const token = body.token ?? "";
    const name = (body.name ?? "").trim();
    const password = body.password ?? "";
    if (name.length < 2 || name.length > 160) return NextResponse.json({ error: "Enter a name between 2 and 160 characters." }, { status: 400 });
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json({ error: "Use at least 8 characters, including one uppercase letter and one number." }, { status: 400 });
    }
    if (password !== body.confirmPassword) return NextResponse.json({ error: "The two passwords do not match." }, { status: 400 });
    if (body.acceptedTerms !== true) return NextResponse.json({ error: "Accept the terms to create your account." }, { status: 400 });

    const base = appOrigin(request);
    const tokenHash = hashInviteToken(token);
    const first = await findInvitation(token);
    if (!first || first.status !== "pending" || first.expiresAt.getTime() <= Date.now()) {
      if (first?.status === "pending") {
        await db.update(invitationsTable).set({ status: "expired", tokenHash: null, updatedAt: new Date() }).where(eq(invitationsTable.id, first.id));
      }
      return NextResponse.json({ error: "This invitation has expired or was already used. Contact the Administrator for a new invite." }, { status: 410 });
    }

    const hashedPassword = await hashPassword(password);
    const created = await db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(invitationsTable)
        .where(eq(invitationsTable.id, first.id))
        .for("update");
      if (!invitation || invitation.tokenHash !== tokenHash || invitation.status !== "pending" || invitation.expiresAt.getTime() <= Date.now()) {
        return { error: "This invitation has expired or was already used." } as const;
      }

      let accountId: string;
      if (invitation.accountType === "guest") {
        if (!invitation.guestId) return { error: "The guest invitation is missing its booking identity. Contact the front desk." } as const;
        const [existing] = await tx
          .select({ id: guestAccountsTable.id })
          .from(guestAccountsTable)
          .where(sql`lower(${guestAccountsTable.loginEmail}) = ${invitation.email}`)
          .limit(1);
        if (existing) return { error: "This email already has a guest account. Sign in or contact the front desk to link the stay." } as const;
        accountId = randomUUID();
        await tx.insert(guestAccountsTable).values({
          id: accountId,
          guestId: invitation.guestId,
          loginEmail: invitation.email,
          status: "active",
          passwordHash: hashedPassword.hash,
          passwordSalt: hashedPassword.salt,
          emailVerifiedAt: new Date(),
          invitedByLabel: invitation.invitedByName,
          signupSource: "desk",
        });
      } else {
        const [existing] = await tx
          .select({ id: staffTable.id, staffCode: staffTable.staffCode, isDeleted: staffTable.isDeleted })
          .from(staffTable)
          .where(sql`lower(${staffTable.email}) = ${invitation.email}`)
          .limit(1);
        if (existing && !existing.isDeleted) return { error: "This email already has a staff account. Contact the Administrator." } as const;
        if (existing) {
          accountId = existing.id;
          await tx.update(staffTable).set({
            name,
            role: invitation.role,
            passwordHash: hashedPassword.hash,
            passwordSalt: hashedPassword.salt,
            isActive: true,
            isDeleted: false,
            deletedAt: null,
            invitedBy: invitation.invitedById,
          }).where(eq(staffTable.id, existing.id));
        } else {
          const staff = await tx.select({ staffCode: staffTable.staffCode }).from(staffTable);
          accountId = randomUUID();
          await tx.insert(staffTable).values({
            id: accountId,
            staffCode: nextStaffCode(staff.map((row) => row.staffCode)),
            name,
            email: invitation.email,
            role: invitation.role,
            passwordHash: hashedPassword.hash,
            passwordSalt: hashedPassword.salt,
            isActive: true,
            invitedBy: invitation.invitedById,
          });
        }
      }

      await tx.update(invitationsTable)
        .set({ status: "accepted", tokenHash: null, acceptedAt: new Date(), name, updatedAt: new Date() })
        .where(eq(invitationsTable.id, invitation.id));
      return { invitation, accountId } as const;
    });

    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
    const { invitation, accountId } = created;
    const guest = invitation.accountType === "guest";
    const loginUrl = guest ? `${base}/app` : `${base}/admin/login`;
    const escapedName = name.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
    const loginEmail = invitation.email.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
    const role = invitation.role.replaceAll("_", " ");
    const delivery = await notifyByEmail({
      to: invitation.email,
      subject: "Your Sunrise Motel Account is Ready",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#171513"><div style="background:#171513;padding:22px;text-align:center"><img src="${base}/images/sunrise-logo.svg" alt="Sunrise Motel" width="52" height="52"></div><div style="padding:26px"><p>Welcome ${escapedName}!</p><p>Your account as <strong>${role}</strong> is now active.</p><p>Email: <strong>${loginEmail}</strong></p><p><a href="${loginUrl}" style="display:inline-block;background:#f28c18;color:#171513;font-weight:bold;text-decoration:none;padding:12px 18px;border-radius:6px">Login Now</a></p><p>For security, this account setup link is now disabled.</p><p>Regards,<br>Sunrise Motel Team</p></div></div>`,
      text: `Welcome ${name}! Your account as ${role} is active. Email: ${invitation.email}. Login: ${loginUrl}. This setup link is now disabled.`,
      template: "account_ready",
      guestId: invitation.guestId,
    });
    await logAudit({
      action: "ACCOUNT_CREATED",
      entity: guest ? "guest_account" : "staff",
      entityId: accountId,
      targetId: accountId,
      targetEmail: invitation.email,
      actor: invitation.accountType === "guest" ? "guest" : "manager",
      actorLabel: name,
      actorId: accountId,
      actorEmail: invitation.email,
      actorRole: invitation.role,
      ip: clientIp(request),
      details: { role: invitation.role, accountType: invitation.accountType, invitedBy: invitation.invitedById, invitedByName: invitation.invitedByName },
    });
    if (!delivery.sent) {
      await logAudit({
        action: "EMAIL_FAILED",
        entity: "notification",
        entityId: accountId,
        targetId: accountId,
        targetEmail: invitation.email,
        actor: "system",
        actorId: accountId,
        actorEmail: invitation.email,
        actorRole: invitation.role,
        ip: clientIp(request),
        details: { template: "account_ready", reason: delivery.reason },
      });
    }
    return NextResponse.json({ success: true, accountType: invitation.accountType, emailSent: delivery.sent, loginUrl });
  } catch (error) {
    console.error("Invitation setup failed", error);
    return NextResponse.json({ error: "Could not create the account. Contact the Administrator." }, { status: 500 });
  }
}