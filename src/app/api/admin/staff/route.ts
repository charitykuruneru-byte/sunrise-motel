import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { hashPassword, nextStaffCode, readSession } from "@/lib/staff-auth";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function requireAdmin(request: Request) {
  const user = readSession(request);
  if (!user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { user };
}

export async function GET(request: Request) {
  const { user, error } = requireAdmin(request);
  if (error || !user) return error as NextResponse;
  const rows = await db.select().from(staffTable).orderBy(desc(staffTable.createdAt));
  return NextResponse.json({
    staff: rows.map((s) => ({
      id: s.id, staffCode: s.staffCode, name: s.name, email: s.email,
      phone: s.phone, role: s.role, isActive: s.isActive,
      lastLoginAt: s.lastLoginAt, createdAt: s.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const { user, error } = requireAdmin(request);
  if (error || !user) return error as NextResponse;
  try {
    const body = (await request.json()) as { name?: string; email?: string; phone?: string; role?: string; password?: string };
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "staff";
    if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
    }
    if (!body.password || body.password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }
    const existing = await db.select().from(staffTable);
    if (existing.some((s) => s.email === email)) {
      return NextResponse.json({ error: "A staff account already uses that email." }, { status: 409 });
    }
    const { salt, hash } = await hashPassword(body.password);
    const [created] = await db.insert(staffTable).values({
      id: randomUUID(),
      staffCode: nextStaffCode(existing.map((s) => s.staffCode)),
      name, email, phone: (body.phone ?? "").trim() || null,
      role, passwordHash: hash, passwordSalt: salt, isActive: true,
    }).returning();
    await logAudit({
      action: "staff.created", entity: "staff", entityId: created.id,
      summary: `${user.name} added ${role} ${created.staffCode} — ${created.name} (${created.email}).`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
    });
    return NextResponse.json({ staff: { id: created.id, staffCode: created.staffCode, name: created.name, email: created.email, role: created.role } }, { status: 201 });
  } catch (err) {
    console.error("Add staff failed", err);
    return NextResponse.json({ error: "Could not add staff." }, { status: 500 });
  }
}


export async function PATCH(request: Request) {
  const { user, error } = requireAdmin(request);
  if (error || !user) return error as NextResponse;
  try {
    const body = (await request.json()) as { id?: string; isActive?: boolean; role?: string; password?: string };
    if (!body.id) return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, body.id)).limit(1);
    if (!row) return NextResponse.json({ error: "Staff not found." }, { status: 404 });
    if (row.id === user.id && body.isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    const update: Partial<typeof staffTable.$inferInsert> = {};
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (body.role === "admin" || body.role === "staff") update.role = body.role;
    if (body.password) {
      if (body.password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
      const { salt, hash } = await hashPassword(body.password);
      update.passwordSalt = salt;
      update.passwordHash = hash;
    }
    const [updated] = await db.update(staffTable).set(update).where(eq(staffTable.id, body.id)).returning();
    await logAudit({
      action: "staff.updated", entity: "staff", entityId: updated.id,
      summary: `${user.name} updated ${updated.staffCode} — ${updated.name}.`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update staff failed", err);
    return NextResponse.json({ error: "Could not update staff." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { user, error } = requireAdmin(request);
  if (error || !user) return error as NextResponse;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
    if (id === user.id) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Staff not found." }, { status: 404 });
    await db.delete(staffTable).where(eq(staffTable.id, id));
    await logAudit({
      action: "staff.removed", entity: "staff", entityId: id,
      summary: `${user.name} removed ${row.staffCode} — ${row.name} (${row.email}).`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Remove staff failed", err);
    return NextResponse.json({ error: "Could not remove staff." }, { status: 500 });
  }
}
