import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogTable, bookings, guestAccountsTable, guestsTable, invoicesTable, ordersTable, paymentsTable } from "@/db/schema";
import { isManagerRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guests/[id] — everything the motel knows about one person.
 *
 * The 360 answers the question the desk actually asks ("what is this guest's history and
 * what do they still owe?"), so:
 *   * bookings are found by guest id AND by their email, because bookings made before the
 *     identity rule existed still carry the email but no guest link — showing only the
 *     linked ones would hide exactly the history somebody is looking for;
 *   * balanceDue is summed from the invoices that are not settled, not from the booking
 *     totals, so a part payment or a discount is reflected rather than rounded away.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });

  try {
    const { id } = await context.params;
    const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, id)).limit(1);
    if (!guest) return NextResponse.json({ error: "Guest not found." }, { status: 404 });

    const email = (guest.email ?? "").toLowerCase();
    const stays = await db
      .select()
      .from(bookings)
      .where(email ? or(eq(bookings.guestId, guest.id), sql`lower(${bookings.email}) = ${email}`) : eq(bookings.guestId, guest.id))
      .orderBy(desc(bookings.checkIn));

    const bookingIds = stays.map((stay) => stay.id);
    const [invoices, payments, orders, accounts, audit] = await Promise.all([
      bookingIds.length
        ? db.select().from(invoicesTable).where(inArray(invoicesTable.bookingId, bookingIds)).orderBy(desc(invoicesTable.createdAt))
        : email
          ? db.select().from(invoicesTable).where(sql`lower(${invoicesTable.guestEmail}) = ${email}`).orderBy(desc(invoicesTable.createdAt))
          : Promise.resolve([]),
      bookingIds.length ? db.select().from(paymentsTable).where(inArray(paymentsTable.bookingId, bookingIds)).orderBy(desc(paymentsTable.createdAt)) : Promise.resolve([]),
      db.select().from(ordersTable).where(eq(ordersTable.guestId, guest.id)).orderBy(desc(ordersTable.createdAt)).limit(100),
      db.select({ id: guestAccountsTable.id, status: guestAccountsTable.status, updatedAt: guestAccountsTable.updatedAt }).from(guestAccountsTable).where(eq(guestAccountsTable.guestId, guest.id)),
      email
        ? db
            .select({ action: auditLogTable.action, summary: auditLogTable.summary, createdAt: auditLogTable.createdAt, actorLabel: auditLogTable.actorLabel, ip: auditLogTable.ip })
            .from(auditLogTable)
            .where(or(eq(auditLogTable.targetEmail, email), bookingIds.length ? inArray(auditLogTable.entityId, bookingIds) : eq(auditLogTable.targetEmail, email)))
            .orderBy(desc(auditLogTable.createdAt))
            .limit(60)
        : Promise.resolve([]),
    ]);

    const nights = stays.filter((stay) => stay.status !== "cancelled").reduce((sum, stay) => sum + stay.nights, 0);
    const spent = payments.filter((payment) => payment.status === "verified").reduce((sum, payment) => sum + payment.amount, 0);
    const balanceDue = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.balanceDue ?? 0), 0);
    const posSpend = orders.filter((order) => order.status !== "rejected").reduce((sum, order) => sum + order.total, 0);

    return NextResponse.json({
      guest: {
        id: guest.id,
        fullName: guest.fullName,
        email: guest.email,
        phone: guest.phone,
        country: guest.country,
        notes: guest.notes,
        isRegular: guest.isRegular,
        isNoShow: guest.isNoShow,
        marketingConsent: guest.marketingConsent,
        createdAt: guest.createdAt,
      },
      stats: {
        totalBookings: stays.length,
        totalNights: nights,
        stayCountOnRecord: guest.stayCount,
        lifetimeSpentOnRecord: guest.totalSpent,
        collectedVerified: spent,
        balanceDue,
        posSpend,
      },
      bookings: stays.map((stay) => ({
        id: stay.id,
        reference: stay.reference,
        bookingNumber: stay.bookingNumber,
        roomType: stay.roomType,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        nights: stay.nights,
        status: stay.status,
        totalAmount: stay.totalAmount,
        amountPaid: stay.amountPaid,
        linked: Boolean(stay.guestId),
      })),
      invoices: invoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, totalAmount: invoice.totalAmount, amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue, taxAmount: invoice.taxAmount, createdAt: invoice.createdAt })),
      payments: payments.map((payment) => ({ id: payment.id, reference: payment.reference, amount: payment.amount, channel: payment.channel, txnRef: payment.txnRef, status: payment.status, createdAt: payment.createdAt })),
      orders: orders.map((order) => ({ id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total, roomNumber: order.roomNumber, createdAt: order.createdAt })),
      accounts,
      audit,
    });
  } catch (error) {
    console.error("Guest 360 failed", error);
    return NextResponse.json({ error: "Could not load that guest." }, { status: 500 });
  }
}
