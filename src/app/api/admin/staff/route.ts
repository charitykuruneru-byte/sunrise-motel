import { NextResponse } from "next/server";
import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { isManagerRole, isSuperAdminRole, readSession } from "@/lib/staff-auth";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function requireManager(request: Request) {
  const user = await readSession(request);
  if (!user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (!isManagerRole(user.role)) return { error: NextResponse.json({ error: "Manager access required." }, { status: 403 }) };
  return { user };
}

export async function GET(request: Request) {
  const { user, error } = await requireManager(request);
  if (error || !user) return error as NextResponse;
  const superAdmin = isSuperAdminRole(user.role);
  const rows = await db.select().from(staffTable).orderBy(desc(staffTable.createdAt));
  return NextResponse.json({
    staff: rows.map((s) => ({
      id: s.id, staffCode: s.staffCode, name: s.name,
      ...(superAdmin ? { email: s.email, phone: s.phone, invitedBy: s.invitedBy, isDeleted: s.isDeleted, lastLoginAt: s.lastLoginAt, createdAt: s.createdAt } : {}),
      role: s.role, isActive: s.isActive,
    })),
  });
}

export async function POST(request: Request) {
  return NextResponse.json({ error: "Direct account creation is disabled. Super Admins must send an invitation." }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Use the Super Admin user-management API." }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Use the Super Admin user-management API." }, { status: 410 });
}
