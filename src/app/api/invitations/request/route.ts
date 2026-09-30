import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogTable, staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { notifyInPortal } from "@/lib/notify";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
    return NextResponse.json({ error: "Enter the email address on your invitation." }, { status: 400 });
  }
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: auditLogTable.id })
    .from(auditLogTable)
    .where(and(eq(auditLogTable.action, "INVITE_REQUESTED"), eq(auditLogTable.actorLabel, email), gt(auditLogTable.createdAt, since)))
    .limit(3);
  if (recent.length >= 3) return NextResponse.json({ error: "Request limit reached. Try again later." }, { status: 429 });

  const admins = await db
    .select({ id: staffTable.id, name: staffTable.name, email: staffTable.email })
    .from(staffTable)
    .where(and(eq(staffTable.isActive, true), eq(staffTable.isDeleted, false), eq(staffTable.role, "super_admin")));
  const legacyAdmins = admins.length ? admins : await db
    .select({ id: staffTable.id, name: staffTable.name, email: staffTable.email })
    .from(staffTable)
    .where(and(eq(staffTable.isActive, true), eq(staffTable.isDeleted, false), eq(staffTable.role, "admin")));

  await logAudit({
    action: "INVITE_REQUESTED",
    entity: "invitation",
    targetEmail: email,
    summary: `A user requested a new invitation for ${email}.`,
    actor: "guest",
    actorLabel: email,
    ip: clientIp(request),
    details: { requestedEmail: email },
  });
  await Promise.all(legacyAdmins.map((admin) => notifyInPortal({
    template: "invite_requested",
    recipient: admin.email,
    subject: "Account setup link requested",
    body: `A user requested a new account invitation for ${email}. Verify the request before sending another invite.`,
  })));
  if (legacyAdmins.length) {
    await sendMail({
      to: legacyAdmins.map((admin) => admin.email),
      subject: "Sunrise Motel — new account invitation request",
      html: `<p>A user requested a new setup invitation for <strong>${email.replace(/[&<>"']/g, "")}</strong>.</p><p>Verify the request in the Admin portal before sending a replacement invite.</p>`,
      text: `A user requested a new setup invitation for ${email}. Verify the request in the Admin portal.`,
    }).catch(() => ({ sent: false as const }));
  }
  return NextResponse.json({ success: true, message: "Your request has been sent to the Administrator. They will verify it before sending another invitation." }, { status: 202 });
}