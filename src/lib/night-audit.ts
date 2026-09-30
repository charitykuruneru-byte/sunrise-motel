// NIGHT AUDIT — the numbers the owner reads in the morning, computed from the rows the
// motel actually wrote, never from a parallel spreadsheet.
//
// Everything here is for ONE Malawi business date (CAT, UTC+2):
//   * rooms sold      — stays whose [checkIn, checkOut) covers that night
//   * room revenue    — the nightly rate of each of those stays
//   * ADR             — room revenue ÷ rooms sold
//   * RevPAR          — room revenue ÷ all sellable rooms
//   * occupancy       — rooms sold ÷ all sellable rooms
//   * POS revenue     — kitchen/bar/laundry orders placed that day, minus rejected ones
//   * expenses        — money the motel spent that day
//   * net profit      — total revenue − expenses
//
// Revenue counts what was SOLD that night, not what was collected: a guest who settles
// at check-out still occupied the room. Collection is the payments table's job.

import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { expensesTable, ordersTable, roomTypesTable, bookings } from "@/db/schema";

export type NightAuditFigures = {
  auditDate: string;
  roomsSold: number;
  roomsAvailable: number;
  occupancyBp: number;
  adr: number;
  revpar: number;
  roomRevenue: number;
  posRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
};

/** The UTC window of one Malawi calendar day (CAT = UTC+2, no daylight saving). */
export function malawiDayWindow(date: string) {
  const start = new Date(`${date}T00:00:00+02:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function computeNightAudit(auditDate: string): Promise<NightAuditFigures> {
  const [roomTypes, stays] = await Promise.all([
    db.select({ totalInventory: roomTypesTable.totalInventory }).from(roomTypesTable).where(eq(roomTypesTable.isActive, true)),
    db
      .select({ id: bookings.id, nightlyRate: bookings.nightlyRate })
      .from(bookings)
      .where(
        and(
          sql`${bookings.status} in ('confirmed', 'checked_in', 'checked_out')`,
          sql`${bookings.checkIn} <= ${auditDate}`,
          sql`${bookings.checkOut} > ${auditDate}`,
        ),
      ),
  ]);

  const roomsAvailable = roomTypes.reduce((sum, type) => sum + Math.max(0, type.totalInventory), 0);
  const roomsSold = stays.length;
  const roomRevenue = stays.reduce((sum, stay) => sum + Math.max(0, stay.nightlyRate), 0);

  const { start, end } = malawiDayWindow(auditDate);
  const [posRows, expenseRows] = await Promise.all([
    db
      .select({ total: ordersTable.total })
      .from(ordersTable)
      .where(and(ne(ordersTable.status, "rejected"), gte(ordersTable.placedAt, new Date(start)), lt(ordersTable.placedAt, new Date(end)))),
    db.select({ amount: expensesTable.amount }).from(expensesTable).where(eq(expensesTable.spentOn, auditDate)),
  ]);

  const posRevenue = posRows.reduce((sum, row) => sum + Math.max(0, row.total), 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const totalRevenue = roomRevenue + posRevenue;

  return {
    auditDate,
    roomsSold,
    roomsAvailable,
    occupancyBp: roomsAvailable > 0 ? Math.round((roomsSold / roomsAvailable) * 10_000) : 0,
    adr: roomsSold > 0 ? Math.round(roomRevenue / roomsSold) : 0,
    revpar: roomsAvailable > 0 ? Math.round(roomRevenue / roomsAvailable) : 0,
    roomRevenue,
    posRevenue,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
  };
}
