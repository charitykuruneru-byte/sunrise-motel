import { and, desc, ilike, or, gte, lte, eq, type SQL } from "drizzle-orm";
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
  if (from && !Number.isNaN(Date.parse(from))) filters.push(gte(auditLogTable.createdAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) filters.push(lte(auditLogTable.createdAt, new Date(`${to}T23:59:59.999Z`)));
  if (actor) filters.push(or(ilike(auditLogTable.actorEmail, `%${actor}%`), ilike(auditLogTable.actorLabel, `%${actor}%`))!);
  if (action) filters.push(eq(auditLogTable.action, action));
  if (target) filters.push(or(ilike(auditLogTable.targetEmail, `%${target}%`), ilike(auditLogTable.targetId, `%${target}%`), ilike(auditLogTable.reference, `%${target}%`), ilike(auditLogTable.summary, `%${target}%`))!);
  const rows = await db.select().from(auditLogTable).where(filters.length ? and(...filters) : undefined).orderBy(desc(auditLogTable.createdAt)).limit(1000);
  return { rows } as const;
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
  return NextResponse.json({ entries: result.rows });
}