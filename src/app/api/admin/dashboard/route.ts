import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { readSession } from "@/lib/staff-auth";
import { nowDate } from "@/lib/time";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Revenue + losses dashboard: paid vs pending vs cancelled, today/week/month.
export async function GET(request: Request) {
  const user = readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt));
    const live = rows.filter((b) => b.status !== "cancelled");
    const paid = rows.filter((b) => (b.amountPaid ?? 0) >= b.totalAmount && b.totalAmount > 0);
    const collected = rows.reduce((s, b) => s + (b.amountPaid ?? 0), 0);
    const outstanding = live.reduce((s, b) => s + Math.max(0, b.totalAmount - (b.amountPaid ?? 0)), 0);
    const cancelledLoss = rows.filter((b) => b.status === "cancelled").reduce((s, b) => s + b.totalAmount, 0);
    const now = nowDate();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(dayStart);
    monthStart.setDate(1);
    const inRange = (iso: Date, from: Date) => iso >= from;
    const created = (b: (typeof rows)[number]) => new Date(b.createdAt);
    const sum = (list: typeof rows) => list.reduce((s, b) => s + b.totalAmount, 0);
    const todayRows = rows.filter((b) => inRange(created(b), dayStart));
    const weekRows = rows.filter((b) => inRange(created(b), weekStart));
    const monthRows = rows.filter((b) => inRange(created(b), monthStart));
    const byStaff: Record<string, { label: string; bookings: number; collected: number }> = {};
    for (const b of rows) {
      const key = b.assignedStaffId ?? "unassigned";
      byStaff[key] ??= { label: key, bookings: 0, collected: 0 };
      byStaff[key].bookings += 1;
      byStaff[key].collected += b.amountPaid ?? 0;
    }
    return NextResponse.json({
      totals: {
        bookings: rows.length, pending: rows.filter((b) => b.status === "pending").length,
        confirmed: rows.filter((b) => ["confirmed", "checked_in", "checked_out", "awaiting_payment"].includes(b.status)).length,
        cancelled: rows.filter((b) => b.status === "cancelled").length,
        paid: paid.length, collected, outstanding, cancelledLoss,
      },
      today: { bookings: todayRows.length, revenue: sum(todayRows), collected: todayRows.reduce((s, b) => s + (b.amountPaid ?? 0), 0) },
      week: { bookings: weekRows.length, revenue: sum(weekRows), collected: weekRows.reduce((s, b) => s + (b.amountPaid ?? 0), 0) },
      month: { bookings: monthRows.length, revenue: sum(monthRows), collected: monthRows.reduce((s, b) => s + (b.amountPaid ?? 0), 0) },
      byStaff,
    });
  } catch (err) {
    console.error("Dashboard failed", err);
    return NextResponse.json({ error: "Could not load dashboard." }, { status: 500 });
  }
}

