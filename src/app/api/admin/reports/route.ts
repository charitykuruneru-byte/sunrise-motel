import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, expensesTable, nightAuditTable } from "@/db/schema";
import { desc } from "drizzle-orm";
import { readSession } from "@/lib/staff-auth";
import { formatMalawi } from "@/lib/time";

export const dynamic = "force-dynamic";

// Daily bookings PDF (print) + revenue CSV (Excel) for the office desktop.
//
// ADDED: `report=night-audit` and `report=expenses` exports, so the finance page's
// numbers can leave the building as a file. CSV opens straight in Excel; the HTML
// variant prints to PDF from the browser, which is why it exists alongside the CSV —
// no PDF library involved, so nothing can render differently from what is on screen.
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "pdf";
  const report = searchParams.get("report") ?? "bookings";
  const money = (n: number) => `MWK ${Math.round(n).toLocaleString("en-US")}`;

  if (report === "night-audit") {
    const rows = await db.select().from(nightAuditTable).orderBy(desc(nightAuditTable.auditDate));
    if (format === "csv") {
      const header = "date,rooms_sold,rooms_available,occupancy_pct,adr,revpar,room_revenue,pos_revenue,total_revenue,total_expenses,net_profit,run_by";
      const lines = rows.map((row) =>
        [row.auditDate, row.roomsSold, row.roomsAvailable, (row.occupancyBp / 100).toFixed(2), row.adr, row.revpar, row.roomRevenue, row.posRevenue, row.totalRevenue, row.totalExpenses, row.netProfit, `"${(row.runBy ?? "").replace(/"/g, '""')}"`].join(","),
      );
      return new Response([header, ...lines].join("\n"), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sunrise-night-audit.csv"' },
      });
    }
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Sunrise night audit</title><style>body{font-family:Arial,sans-serif;color:#171513}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:6px;text-align:right}td:first-child,th:first-child{text-align:left}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div><h1>Sunrise Motel — Night audit</h1><p>${rows.length} closed day(s) · generated ${formatMalawi(new Date(), { withYear: true })} CAT</p><table><tr><th>Date</th><th>Rooms</th><th>Occupancy</th><th>ADR</th><th>RevPAR</th><th>Rooms rev</th><th>POS rev</th><th>Expenses</th><th>Net</th></tr>${rows.map((row) => `<tr><td>${esc(row.auditDate)}</td><td>${row.roomsSold}/${row.roomsAvailable}</td><td>${(row.occupancyBp / 100).toFixed(2)}%</td><td>${money(row.adr)}</td><td>${money(row.revpar)}</td><td>${money(row.roomRevenue)}</td><td>${money(row.posRevenue)}</td><td>${money(row.totalExpenses)}</td><td>${money(row.netProfit)}</td></tr>`).join("")}</table></body></html>`;
    return new Response(doc, { headers: { "Content-Type": "text/html" } });
  }

  if (report === "expenses") {
    const rows = await db.select().from(expensesTable).orderBy(desc(expensesTable.spentOn));
    if (format === "csv") {
      const header = "date,category,description,amount,method,paid_to,approved_by,note";
      const quote = (value: string | null) => `"${(value ?? "").replace(/"/g, '""')}"`;
      const lines = rows.map((row) => [row.spentOn, row.category, quote(row.description), row.amount, row.method, quote(row.paidTo), quote(row.approvedBy), quote(row.note)].join(","));
      return new Response([header, ...lines].join("\n"), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sunrise-expenses.csv"' },
      });
    }
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Sunrise expenses</title><style>body{font-family:Arial,sans-serif;color:#171513}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:6px}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div><h1>Sunrise Motel — Expenses</h1><p>${rows.length} entries · total ${money(total)} · generated ${formatMalawi(new Date(), { withYear: true })} CAT</p><table><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid to</th><th>Method</th><th>Amount</th></tr>${rows.map((row) => `<tr><td>${esc(row.spentOn)}</td><td>${esc(row.category)}</td><td>${esc(row.description)}</td><td>${esc(row.paidTo ?? "")}</td><td>${esc(row.method)}</td><td>${money(row.amount)}</td></tr>`).join("")}</table></body></html>`;
    return new Response(doc, { headers: { "Content-Type": "text/html" } });
  }
  const rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt));
  if (format === "csv") {
    const header = "booking_number,reference,guest,email,phone,room,check_in,check_out,nights,total,paid,balance,status,staff,created_cat";
    const lines = rows.map((b) => [
      b.bookingNumber ?? "", b.reference, `"${(b.guestName ?? "").replace(/"/g, '""')}"`, b.email ?? "", b.phone,
      `"${(b.roomType ?? "").replace(/"/g, '""')}"`, b.checkIn, b.checkOut, b.nights, b.totalAmount,
      b.amountPaid ?? 0, Math.max(0, b.totalAmount - (b.amountPaid ?? 0)), b.status,
      b.assignedStaffId ?? "", formatMalawi(b.createdAt, { withYear: true }),
    ].join(","));
    return new Response([header, ...lines].join("\n"), {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sunrise-revenue.csv"' },
    });
  }
  const collected = rows.reduce((s, b) => s + (b.amountPaid ?? 0), 0);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Sunrise Daily Bookings</title><style>body{font-family:Arial,sans-serif;color:#171513}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:6px}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div><h1>Sunrise Motel — Daily bookings</h1><p>${rows.length} bookings · Collected ${money(collected)} · Generated ${formatMalawi(new Date(), { withYear: true })} CAT</p><table><tr><th>Ref</th><th>Guest</th><th>Room</th><th>Dates</th><th>Total</th><th>Paid</th><th>Status</th></tr>${rows.map((b) => `<tr><td>${esc(b.bookingNumber ?? b.reference)}<br><small>${esc(b.reference)}</small></td><td>${esc(b.guestName)}<br><small>${esc(b.phone)}</small></td><td>${esc(b.roomType)}</td><td>${esc(b.checkIn)} → ${esc(b.checkOut)}</td><td>${money(b.totalAmount)}</td><td>${money(b.amountPaid ?? 0)}</td><td>${esc(b.status)}</td></tr>`).join("")}</table></body></html>`;
  return new Response(doc, { headers: { "Content-Type": "text/html" } });
}
