import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogTable } from "@/db/schema";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

// Read-only audit trail for the manager portal.
// Append-only by design: there is no UPDATE or DELETE here on purpose.
//
// ADDENDUM (authority matrix): the audit trail is readable by staff, admin and auditor — but
// never by an anonymous caller. A signed-in session is required, and nobody can edit or delete.
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSuperAdminRole(user.role)) return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const entity = searchParams.get("entity")?.trim() ?? "";
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200));

    const filters: SQL[] = [];
    if (q) {
      filters.push(
        or(
          ilike(auditLogTable.action, `%${q}%`),
          ilike(auditLogTable.reference, `%${q}%`),
          ilike(auditLogTable.summary, `%${q}%`),
          ilike(auditLogTable.actorLabel, `%${q}%`),
        ) as SQL,
      );
    }
    if (entity && entity !== "all") filters.push(eq(auditLogTable.entity, entity));
    const rows =
      filters.length > 0
        ? await db.select().from(auditLogTable).where(and(...filters)).orderBy(desc(auditLogTable.createdAt)).limit(limit)
        : await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit);

    return NextResponse.json({ entries: rows });
  } catch (error) {
    console.error("Failed to load audit log:", error);
    return NextResponse.json({ error: "Could not load audit trail." }, { status: 500 });
  }
}
