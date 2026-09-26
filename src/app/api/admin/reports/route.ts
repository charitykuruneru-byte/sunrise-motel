import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { desc } from "drizzle-orm";
import { readSession } from "@/lib/staff-auth";
import { formatMalawi } from "@/lib/time";

export const dynamic = "force-dynamic";

// Daily bookings PDF (print) + revenue CSV (Excel) for the office desktop.
export async function GET(request: Request) {
  const user = readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "pdf";
  const rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt));
  const money = (n: number) => `MWK ${Math.round(n).toLocaleString("en-US")}`;
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
