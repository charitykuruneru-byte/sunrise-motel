import { and, desc, ilike, or, gte, lte, eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { db } from "@/db";
import { auditLogTable } from "@/db/schema";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function rowsFor(request: Request) {
  const user = await readSession(request);
  if (!user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) } as const;
  if (!isSuperAdminRole(user.role)) return { error: NextResponse.json({ error: "Super Admin access required." }, { status: 403 }) } as const;
  const params = new URL(request.url).searchParams;
  const filters: SQL[] = [];
  const from = params.get("from");
  const to = params.get("to");
  const actor = params.get("actor")?.trim();
  const action = params.get("action")?.trim();
  const target = params.get("target")?.trim();
  const family = params.get("family")?.trim();
  if (from && !Number.isNaN(Date.parse(from))) filters.push(gte(auditLogTable.createdAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) filters.push(lte(auditLogTable.createdAt, new Date(`${to}T23:59:59.999Z`)));
  if (actor) filters.push(or(ilike(auditLogTable.actorEmail, `%${actor}%`), ilike(auditLogTable.actorLabel, `%${actor}%`))!);
  if (action) filters.push(eq(auditLogTable.action, action));
  if (target) filters.push(or(ilike(auditLogTable.targetEmail, `%${target}%`), ilike(auditLogTable.targetId, `%${target}%`), ilike(auditLogTable.reference, `%${target}%`), ilike(auditLogTable.summary, `%${target}%`))!);
  if (family && family !== "all") {
    // The same classification the stat chips use — one expression, two places it is used,
    // kept together here so a chip and its filter can never disagree.
    const familyMatch: Record<string, SQL> = {
      Bookings: sql`(${auditLogTable.action} ilike '%booking%')`,
      Money: sql`(${auditLogTable.action} ilike '%pay%' or ${auditLogTable.action} ilike '%expense%' or ${auditLogTable.action} ilike '%night_audit%' or ${auditLogTable.action} ilike '%invoice%')`,
      Rooms: sql`(${auditLogTable.action} ilike '%room%')`,
      Guests: sql`(${auditLogTable.action} ilike '%guest%')`,
      "People & access": sql`(${auditLogTable.action} ilike '%invite%' or ${auditLogTable.action} ilike '%user%' or ${auditLogTable.action} ilike '%role%' or ${auditLogTable.action} ilike '%staff%')`,
      "Sign-ins": sql`(${auditLogTable.action} ilike '%login%' or ${auditLogTable.action} ilike '%auth%' or ${auditLogTable.action} ilike '%session%')`,
      Messages: sql`(${auditLogTable.action} ilike '%push%' or ${auditLogTable.action} ilike '%email%' or ${auditLogTable.action} ilike '%notification%')`,
    };
    const match = familyMatch[family];
    if (match) filters.push(match);
  }
  const rows = await db.select().from(auditLogTable).where(filters.length ? and(...filters) : undefined).orderBy(desc(auditLogTable.createdAt)).limit(1000);

  // ADDED: the numbers behind the page's stat cards, computed over the SAME filter window
  // as the rows — so "12 failures" always refers to the list somebody is looking at.
  const where = filters.length ? and(...filters) : undefined;
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct coalesce(${auditLogTable.actorEmail}, ${auditLogTable.actorLabel}))::int`,
      failures: sql<number>`count(*) filter (where ${auditLogTable.action} ilike '%fail%' or ${auditLogTable.action} ilike '%reject%' or ${auditLogTable.action} ilike '%revoke%' or ${auditLogTable.action} ilike '%denied%' or ${auditLogTable.action} ilike '%refus%')::int`,
      money: sql<number>`count(*) filter (where ${auditLogTable.action} ilike '%pay%' or ${auditLogTable.action} ilike '%invoice%' or ${auditLogTable.action} ilike '%expense%' or ${auditLogTable.action} ilike '%night_audit%' or ${auditLogTable.action} ilike '%refund%')::int`,
    })
    .from(auditLogTable)
    .where(where);

  const families = await db
    .select({
      family: sql<string>`case
        when ${auditLogTable.action} ilike 'booking%' or ${auditLogTable.action} ilike '%booking%' then 'Bookings'
        when ${auditLogTable.action} ilike '%pay%' or ${auditLogTable.action} ilike '%expense%' or ${auditLogTable.action} ilike '%night_audit%' then 'Money'
        when ${auditLogTable.action} ilike '%room%' then 'Rooms'
        when ${auditLogTable.action} ilike '%guest%' then 'Guests'
        when ${auditLogTable.action} ilike '%invite%' or ${auditLogTable.action} ilike '%user%' or ${auditLogTable.action} ilike '%role%' or ${auditLogTable.action} ilike '%staff%' then 'People & access'
        when ${auditLogTable.action} ilike '%login%' or ${auditLogTable.action} ilike '%auth%' or ${auditLogTable.action} ilike '%session%' then 'Sign-ins'
        when ${auditLogTable.action} ilike '%push%' or ${auditLogTable.action} ilike '%email%' or ${auditLogTable.action} ilike '%notification%' then 'Messages'
        else 'Other' end`,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogTable)
    .where(where)
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(9);

  return { rows, stats: { ...(totals ?? { total: 0, people: 0, failures: 0, money: 0 }), families } } as const;
}

export async function GET(request: Request) {
  const result = await rowsFor(request);
  if ("error" in result) return result.error;
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const header = ["Timestamp", "Actor", "Actor Email", "Role", "Action", "Entity", "Target", "Target Email", "IP", "Details"];
    const lines = [header.map(csv).join(","), ...result.rows.map((row) => [
      row.createdAt.toISOString(), row.actorLabel, row.actorEmail, row.actorRole, row.action, row.entity,
      row.targetId ?? row.entityId ?? row.reference, row.targetEmail, row.ip, JSON.stringify(row.details ?? row.metadataJson ?? ""),
    ].map(csv).join(","))];
    return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=Sunrise-audit-log.csv" } });
  }
  if (format === "pdf") {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([612, 792]);
    let y = 752;
    page.drawText("Sunrise Motel — Audit Log", { x: 40, y, size: 16, font: bold });
    y -= 28;
    for (const row of result.rows.slice(0, 500)) {
      if (y < 58) {
        page = pdf.addPage([612, 792]);
        y = 752;
      }
      const line = `${row.createdAt.toISOString()} | ${row.actorEmail ?? row.actorLabel ?? row.actor} (${row.actorRole ?? "—"}) | ${row.action} | ${row.targetEmail ?? row.targetId ?? row.reference ?? row.entity}`.slice(0, 128);
      page.drawText(line, { x: 40, y, size: 7.5, font });
      y -= 12;
      const details = JSON.stringify(row.details ?? row.metadataJson ?? "").slice(0, 180);
      if (details && details !== '""') {
        page.drawText(details, { x: 52, y, size: 6.5, font });
        y -= 10;
      }
    }
    const bytes = await pdf.save();
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=Sunrise-audit-log.pdf" } });
  }
  return NextResponse.json({ entries: result.rows, stats: result.stats });
}