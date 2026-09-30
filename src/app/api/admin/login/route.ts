import { NextResponse } from "next/server";
import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { cookieValue, getStaffByEmail, readSession, verifyPassword } from "@/lib/staff-auth";
import type { SessionRole } from "@/lib/staff-auth";
import { nowDate } from "@/lib/time";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function isAuthed(request: Request) {
  return Boolean(await readSession(request));
}

export async function GET(request: Request) {
  const user = await readSession(request);
  return NextResponse.json({ authed: Boolean(user), user });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Enter your invitation email and password." }, { status: 400 });
    }
    const staff = await getStaffByEmail(email);
    if (!staff) {
      await logAudit({
        action: "LOGIN_FAILED", entity: "auth", targetEmail: email,
        summary: `Failed staff login for ${email}.`, actor: "manager", actorLabel: email,
        actorEmail: email, ip: clientIp(request), details: { reason: "unknown_email" },
      });
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    if (!staff.isActive || staff.isDeleted) {
      await logAudit({
        action: "LOGIN_FAILED", entity: "auth", targetId: staff.id, targetEmail: email,
        summary: `Login blocked for deactivated account ${email}.`, actor: "manager", actorLabel: email,
        actorId: staff.id, actorEmail: email, actorRole: staff.role, ip: clientIp(request), details: { reason: "deactivated" },
      });
      return NextResponse.json({ error: "Your account has been deactivated. Contact Super Admin." }, { status: 403 });
    }
    const ok = await verifyPassword(password, staff.passwordSalt, staff.passwordHash);
    if (!ok) {
      await logAudit({
        action: "LOGIN_FAILED", entity: "auth", targetId: staff.id, targetEmail: email,
        summary: `Failed login for ${staff.name} (${staff.staffCode}).`, actor: "manager",
        actorLabel: `${staff.staffCode} — ${staff.name}`, actorId: staff.id, actorEmail: email,
        actorRole: staff.role, ip: clientIp(request), details: { reason: "wrong_password" },
      });
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    await db.update(staffTable).set({ lastLoginAt: nowDate() }).where(eq(staffTable.id, staff.id));
    const res = NextResponse.json({
      success: true,
      user: { id: staff.id, staffCode: staff.staffCode, name: staff.name, email: staff.email, role: staff.role },
    });
    res.cookies.set(
      "sunrise_session",
      cookieValue({ id: staff.id, staffCode: staff.staffCode, name: staff.name, email: staff.email, role: staff.role as SessionRole }),
      { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, secure: process.env.NODE_ENV === "production" },
    );
    await logAudit({
      action: "LOGIN_SUCCESS", entity: "auth", entityId: staff.id, targetId: staff.id, targetEmail: staff.email,
      summary: `${staff.role} ${staff.name} signed in.`, actor: "manager", actorLabel: staff.name,
      actorId: staff.id, actorEmail: staff.email, actorRole: staff.role, ip: clientIp(request),
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await readSession(request);
  const res = NextResponse.json({ success: true });
  res.cookies.set("sunrise_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set("sunrise_admin", "", { httpOnly: true, path: "/", maxAge: 0 });
  await logAudit({
    action: "auth.logout", entity: "auth",
    summary: user ? `${user.name} locked the portal.` : "Manager locked the portal.",
    actor: "manager", actorLabel: user ? `${user.staffCode} — ${user.name}` : null, ip: clientIp(request),
  });
  return res;
}

export { isAuthed };
