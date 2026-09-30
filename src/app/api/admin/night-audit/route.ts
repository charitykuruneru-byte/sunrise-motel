import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { nightAuditTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { computeNightAudit } from "@/lib/night-audit";
import { isManagerRole, readSession } from "@/lib/staff-auth";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/admin/night-audit?date=YYYY-MM-DD
 *  Without a date: the last 30 stored audits, plus TODAY's figures computed live —
 *  so the owner can see this evening's numbers without closing the day early. */
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });

  const date = new URL(request.url).searchParams.get("date");
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Use a date like 2026-09-30." }, { status: 400 });
    const [stored] = await db.select().from(nightAuditTable).where(eq(nightAuditTable.auditDate, date)).limit(1);
    return NextResponse.json({ date, stored: stored ?? null, live: await computeNightAudit(date) });
  }

  const today = malawiDatePart();
  const [history, live] = await Promise.all([
    db.select().from(nightAuditTable).orderBy(desc(nightAuditTable.auditDate)).limit(30),
    computeNightAudit(today),
  ]);
  return NextResponse.json({ today, live, history });
}

/** POST /api/admin/night-audit  { date?, note? } — close the day (re-runnable). */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string; note?: string };
    const date = body.date ?? malawiDatePart();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Use a date like 2026-09-30." }, { status: 400 });

    const figures = await computeNightAudit(date);
    const values = {
      ...figures,
      runBy: user.name,
      note: body.note ?? null,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(nightAuditTable)
      .values({ id: randomUUID(), ...values })
      .onConflictDoUpdate({ target: nightAuditTable.auditDate, set: values })
      .returning();

    await logAudit({
      action: "NIGHT_AUDIT_RUN",
      entity: "night_audit",
      entityId: date,
      summary: `Night audit ${date}: ${figures.roomsSold}/${figures.roomsAvailable} rooms, ADR MWK ${figures.adr.toLocaleString()}, RevPAR MWK ${figures.revpar.toLocaleString()}, revenue MWK ${figures.totalRevenue.toLocaleString()}, net MWK ${figures.netProfit.toLocaleString()}.`,
      actor: "manager",
      actorLabel: `${user.staffCode} — ${user.name}`,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: clientIp(request),
      metadata: { ...figures },
    });

    return NextResponse.json({ success: true, audit: row });
  } catch (error) {
    console.error("Night audit failed", error);
    return NextResponse.json({ error: "Could not run the night audit." }, { status: 500 });
  }
}
