import { NextResponse } from "next/server";
import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { cookieValue, getStaffByEmail, readSession, verifyPassword } from "@/lib/staff-auth";
import { nowDate } from "@/lib/time";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function isAuthed(request: Request) {
  return Boolean(readSession(request));
}

export async function GET(request: Request) {
  const user = readSession(request);
  return NextResponse.json({ authed: Boolean(user), user });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    // 1) Staff account login (preferred — gives per-staff audit IDs)
    if (email) {
      const staff = await getStaffByEmail(email);
      if (!staff || !staff.isActive) {
        await logAudit({ action: "auth.login_failed", entity: "auth", summary: `Failed login for ${email}.`, actor: "manager", ip: clientIp(request) });
        return NextResponse.json({ error: "No active staff account for that email." }, { status: 401 });
      }
      const ok = await verifyPassword(password, staff.passwordSalt, staff.passwordHash);
      if (!ok) {
        await logAudit({ action: "auth.login_failed", entity: "auth", summary: `Failed login for ${staff.name} (${staff.staffCode}).`, actor: "manager", actorLabel: `${staff.staffCode} — ${staff.name}`, ip: clientIp(request) });
        return NextResponse.json({ error: "Wrong password. Please try again." }, { status: 401 });
      }
      await db.update(staffTable).set({ lastLoginAt: nowDate() }).where(eq(staffTable.id, staff.id));
      const res = NextResponse.json({
        success: true,
        user: { id: staff.id, staffCode: staff.staffCode, name: staff.name, email: staff.email, role: staff.role },
      });
      res.cookies.set(
        "sunrise_session",
        cookieValue({ id: staff.id, staffCode: staff.staffCode, name: staff.name, email: staff.email, role: staff.role as "admin" | "staff" }),
        { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 },
      );
      await logAudit({
        action: "auth.login", entity: "auth", entityId: staff.id,
        summary: `${staff.role === "admin" ? "Admin" : `Staff ${staff.staffCode}`} — ${staff.name} signed in.`,
        actor: "manager", actorLabel: `${staff.staffCode} — ${staff.name}`, ip: clientIp(request),
      });
      return res;
    }

    // 2) Legacy single-password login (ADMIN_PASSWORD) — kept for continuity, treated as admin
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not set on the server. Add it to .env and restart." },
        { status: 500 },
      );
    }
    if (password !== expected) {
      await logAudit({
        action: "auth.login_failed", entity: "auth",
        summary: "Failed manager login attempt.", actor: "manager", ip: clientIp(request),
      });
      return NextResponse.json({ error: "Wrong password. Please try again." }, { status: 401 });
    }
    const res = NextResponse.json({
      success: true,
      user: { id: "legacy-admin", staffCode: "ADM000", name: "Manager", email: "", role: "admin" as const },
    });
    res.cookies.set("sunrise_session", cookieValue({ id: "legacy-admin", staffCode: "ADM000", name: "Manager", email: "", role: "admin" }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    // keep legacy cookie too so old sessions keep working
    res.cookies.set("sunrise_admin", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    await logAudit({
      action: "auth.login", entity: "auth",
      summary: "Manager signed in to the portal.", actor: "manager", ip: clientIp(request),
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = readSession(request);
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
