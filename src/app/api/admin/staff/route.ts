import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { generatePassword, hashPassword, nextStaffCode, readSession } from "@/lib/staff-auth";
import { publicBaseUrl, sendMail, staffCredentialsHtml } from "@/lib/mail";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function requireAdmin(request: Request) {
  const user = readSession(request);
  if (!user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { user };
}

// Emails the login details to the account owner. Never throws: the account is
// already created, so a mail failure is reported back instead of rolled over.
async function emailCredentials(opts: {
  request: Request;
  name: string;
  email: string;
  password: string;
  staffCode: string;
  role: "admin" | "staff";
  createdBy: string;
  reset?: boolean;
}) {
  try {
    const result = await sendMail({
      to: opts.email,
      subject: `${opts.reset ? "Your new" : "Your"} Sunrise Motel manager portal login`,
      html: staffCredentialsHtml({
        name: opts.name,
        email: opts.email,
        password: opts.password,
        staffCode: opts.staffCode,
        role: opts.role,
        portalUrl: publicBaseUrl(opts.request),
        createdBy: opts.createdBy,
        reset: opts.reset,
      }),
    });
    if (!result.sent) return { emailed: false, reason: result.reason };
    return { emailed: true };
  } catch (err) {
    console.error("Credential email failed", err);
    return { emailed: false, reason: "Email could not be sent. Share the password manually." };
  }
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
    const body = (await request.json()) as { name?: string; email?: string; phone?: string; role?: string; password?: string; sendCredentials?: boolean };
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "staff";
    const sendCredentials = body.sendCredentials === true;
    const typedPassword = (body.password ?? "").trim();
    if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
    }
    // A password is either typed here, or generated and emailed on request.
    if (!typedPassword && !sendCredentials) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }
    if (typedPassword && typedPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }
    const password = typedPassword || generatePassword();
    const existing = await db.select().from(staffTable);
    if (existing.some((s) => s.email === email)) {
      return NextResponse.json({ error: "A staff account already uses that email." }, { status: 409 });
    }
    const { salt, hash } = await hashPassword(password);
    const [created] = await db.insert(staffTable).values({
      id: randomUUID(),
      staffCode: nextStaffCode(existing.map((s) => s.staffCode)),
      name, email, phone: (body.phone ?? "").trim() || null,
      role, passwordHash: hash, passwordSalt: salt, isActive: true,
    }).returning();
    const delivery = sendCredentials
      ? await emailCredentials({
          request, name: created.name, email: created.email, password,
          staffCode: created.staffCode, role: role as "admin" | "staff", createdBy: `${user.staffCode} — ${user.name}`,
        })
      : null;
    await logAudit({
      action: "staff.created", entity: "staff", entityId: created.id,
      summary: `${user.name} added ${role} ${created.staffCode} — ${created.name} (${created.email})${sendCredentials ? `, login details emailed${delivery?.emailed ? "" : " — email failed"}` : ""}.`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
      metadata: { emailed: Boolean(delivery?.emailed) },
    });
    return NextResponse.json({
      staff: { id: created.id, staffCode: created.staffCode, name: created.name, email: created.email, role: created.role },
      // Returned once so the admin can also send it on WhatsApp — it is never stored in plain text.
      credentials: delivery ? { password, ...delivery } : null,
    }, { status: 201 });
  } catch (err) {
    console.error("Add staff failed", err);
    return NextResponse.json({ error: "Could not add staff." }, { status: 500 });
  }
}


export async function PATCH(request: Request) {
  const { user, error } = requireAdmin(request);
  if (error || !user) return error as NextResponse;
  try {
    const body = (await request.json()) as { id?: string; isActive?: boolean; role?: string; password?: string; sendCredentials?: boolean };
    if (!body.id) return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, body.id)).limit(1);
    if (!row) return NextResponse.json({ error: "Staff not found." }, { status: 404 });
    if (row.id === user.id && body.isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    const update: Partial<typeof staffTable.$inferInsert> = {};
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (body.role === "admin" || body.role === "staff") update.role = body.role;
    // Reset the password: typed by the admin, or generated when they only asked
    // for the details to be emailed.
    const typedPassword = (body.password ?? "").trim();
    let newPassword = "";
    if (typedPassword || body.sendCredentials) {
      if (typedPassword && typedPassword.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
      }
      newPassword = typedPassword || generatePassword();
      const { salt, hash } = await hashPassword(newPassword);
      update.passwordSalt = salt;
      update.passwordHash = hash;
    }
    const changed = Object.keys(update).length > 0;
    const updated = changed
      ? (await db.update(staffTable).set(update).where(eq(staffTable.id, body.id)).returning())[0]
      : row;
    const delivery = body.sendCredentials
      ? await emailCredentials({
          request, name: updated.name, email: updated.email, password: newPassword,
          staffCode: updated.staffCode, role: updated.role as "admin" | "staff",
          createdBy: `${user.staffCode} — ${user.name}`, reset: true,
        })
      : null;
    await logAudit({
      action: "staff.updated", entity: "staff", entityId: updated.id,
      summary: `${user.name} updated ${updated.staffCode} — ${updated.name}.${newPassword ? " Password reset." : ""}${body.sendCredentials ? ` New login details emailed${delivery?.emailed ? "" : " — email failed"}.` : ""}`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
      metadata: newPassword ? { passwordReset: true, emailed: Boolean(delivery?.emailed) } : null,
    });
    return NextResponse.json({
      success: true,
      credentials: delivery ? { password: newPassword, ...delivery } : null,
    });
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
