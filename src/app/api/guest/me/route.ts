import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  folioItemsTable,
  guestAccountsTable,
  invoicesTable,
  menuItemsTable,
  messageThreadsTable,
  messagesTable,
  orderItemsTable,
  ordersTable,
  serviceTasksTable,
} from "@/db/schema";
import { readGuestSession } from "@/lib/guest-auth";
import { folioTotals, resolveStays, roomForBooking } from "@/lib/hotel";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Service hours for in-app ordering. Outside them the app says so plainly. */
function kitchenWindow() {
  const open = Number(process.env.KITCHEN_OPEN_HOUR ?? 7);
  const close = Number(process.env.KITCHEN_CLOSE_HOUR ?? 22);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Blantyre", hour: "2-digit", hour12: false }).format(new Date()),
  );
  return { open, close, isOpen: hour >= open && hour < close, hour };
}

/**
 * The guest app home payload (§3). Resolves "which room am I in?" from the
 * signed-in account, then returns exactly what that guest may see: their stay,
 * their own orders, their own thread and the running room bill. Never another
 * guest's data — enforced here, not in the app.
 */
export async function GET(request: Request) {
  const session = await readGuestSession(request);
  if (!session) return NextResponse.json({ signedIn: false }, { status: 401 });
  try {
    const today = malawiDatePart();
    const { active, upcoming, past } = await resolveStays(session.guestId, today);
    const [menu, account] = await Promise.all([
      db.select().from(menuItemsTable).orderBy(menuItemsTable.category),
      db.select().from(guestAccountsTable).where(eq(guestAccountsTable.id, session.accountId)).limit(1),
    ]);

    const stay = active[0] ?? null;
    const room = stay ? await roomForBooking(stay) : null;

    const [folioItems, guestOrders, threads, invoices, tasks] = await Promise.all([
      stay ? db.select().from(folioItemsTable).where(eq(folioItemsTable.bookingId, stay.id)) : Promise.resolve([]),
      stay
        ? db.select().from(ordersTable).where(eq(ordersTable.bookingId, stay.id)).orderBy(desc(ordersTable.placedAt))
        : Promise.resolve([]),
      db
        .select()
        .from(messageThreadsTable)
        .where(eq(messageThreadsTable.guestId, session.guestId))
        .orderBy(desc(messageThreadsTable.lastMessageAt)),
      stay ? db.select().from(invoicesTable).where(eq(invoicesTable.bookingRef, stay.reference)) : Promise.resolve([]),
      stay
        ? db
            .select()
            .from(serviceTasksTable)
            .where(eq(serviceTasksTable.bookingId, stay.id))
            .orderBy(desc(serviceTasksTable.createdAt))
        : Promise.resolve([]),
    ]);

    const orderIds = guestOrders.map((o) => o.id);
    const orderLines = orderIds.length
      ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
      : [];
    const threadIds = threads.map((t) => t.id);
    const threadMessages = threadIds.length
      ? await db
          .select()
          .from(messagesTable)
          .where(inArray(messagesTable.threadId, threadIds))
          .orderBy(messagesTable.createdAt)
      : [];

    const folio = folioTotals(folioItems);
    const roomCharge = folio.byCategory.room ?? 0;
    const ordersCharge = folio.byCategory.order ?? 0;
    const extrasCharge = folio.total - roomCharge - ordersCharge;
    return NextResponse.json({
      signedIn: true,
      guest: {
        guestName: session.guestName,
        email: session.email,
        phone: session.phone,
        marketingConsent: account[0]?.marketingConsent ?? false,
        status: session.status,
      },
      stay: stay
        ? {
            bookingId: stay.id,
            reference: stay.reference,
            roomNumber: room?.roomNumber ?? stay.assignedRoom?.replace(/[^0-9]/g, "") ?? null,
            roomType: stay.roomType,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            nights: stay.nights,
            adults: stay.adults,
            children: stay.children,
            status: stay.status,
            nightlyRate: stay.nightlyRate,
            nightsRemaining: Math.max(
              0,
              Math.ceil(
                (new Date(`${stay.checkOut}T12:00:00Z`).getTime() - Date.now()) / (24 * 3600 * 1000),
              ),
            ),
            roomState: room?.state ?? null,
          }
        : null,
      upcoming: upcoming.map((b) => ({
        bookingId: b.id, reference: b.reference, checkIn: b.checkIn, checkOut: b.checkOut,
        roomType: b.roomType, nights: b.nights, status: b.status,
      })),
      history: past.map((b) => ({
        bookingId: b.id, reference: b.reference, checkIn: b.checkIn, checkOut: b.checkOut,
        roomType: b.roomType, totalAmount: b.totalAmount, status: b.status,
      })),
      folio: {
        total: folio.total,
        byCategory: folio.byCategory,
        roomCharge,
        ordersCharge,
        extrasCharge,
        amountPaid: stay?.amountPaid ?? 0,
        balanceDue: Math.max(0, folio.total - (stay?.amountPaid ?? 0)),
        items: folioItems
          .filter((item) => item.status !== "voided")
          .map((item) => ({
            id: item.id, category: item.category, description: item.description, qty: item.qty,
            unitPrice: item.unitPrice, amount: item.amount, status: item.status, createdAt: item.createdAt,
          })),
      },
      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber, totalAmount: inv.totalAmount, amountPaid: inv.amountPaid,
        balanceDue: inv.balanceDue, status: inv.status, createdAt: inv.createdAt,
        url: `/api/invoices/${inv.bookingRef}`,
      })),
      orders: guestOrders.map((order) => ({
        id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total,
        note: order.note, service: order.service, placedAt: order.placedAt, deliveredAt: order.deliveredAt,
        rejectedReason: order.rejectedReason,
        items: orderLines.filter((line) => line.orderId === order.id),
      })),
      threads: threads.map((thread) => ({
        id: thread.id, roomNumber: thread.roomNumber, subject: thread.subject, kind: thread.kind,
        status: thread.status, priority: thread.priority, lastMessageAt: thread.lastMessageAt,
        resolutionNote: thread.resolutionNote,
        messages: threadMessages
          .filter((m) => m.threadId === thread.id)
          .map((m) => ({ id: m.id, direction: m.direction, body: m.body, kind: m.kind, createdAt: m.createdAt })),
      })),
      requests: tasks.map((task) => ({
        id: task.id, kind: task.kind, note: task.note, status: task.status, priority: task.priority,
        dueBy: task.dueBy, createdAt: task.createdAt,
      })),
      menu: menu.map((item) => ({
        id: item.id, name: item.name, category: item.category, description: item.description,
        price: item.price, imageUrl: item.imageUrl, isAvailable: item.isAvailable, isSpecial: item.isSpecial,
      })),
      service: kitchenWindow(),
    });
  } catch (error) {
    console.error("Guest home failed", error);
    return NextResponse.json({ error: "Could not load your stay." }, { status: 500 });
  }
}
