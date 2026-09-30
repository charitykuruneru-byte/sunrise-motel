// THE NO-ACCOUNT GUEST — the room session endpoint.
//
// POST   open a session from the QR value, room + PIN, or reference + phone
// GET    the same view of the stay an account guest gets, resolved from the room
// DELETE this device forgets the session (for a shared phone at the counter)
//
// Nothing here needs a password, and nothing here is second class: the menu, the
// room bill, the private thread to the desk and the receipt are identical.

import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  folioItemsTable,
  menuItemsTable,
  messageThreadsTable,
  messagesTable,
  orderItemsTable,
  ordersTable,
  serviceTasksTable,
} from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { accountUpgradeNudge, type GuestContext } from "@/lib/guest-context";
import { folioTotals, roomForBooking, serviceWindow } from "@/lib/hotel";
import { ROOM_PIN_RULES, clearRoomCookie, readRoomSession, setRoomCookie, startRoomSession } from "@/lib/room-session";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

/** openedVia → the channel recorded on every order, message and request. */
function channelFor(openedVia: string): GuestContext["channel"] {
  return openedVia === "qr" || openedVia === "pin" || openedVia === "reference" ? openedVia : "desk";
}


/** What the guest in Room 104 sees right now — always scoped to their own stay. */
export async function GET(request: Request) {
  const session = await readRoomSession(request);
  if (!session) {
    return NextResponse.json({
      active: false,
      methods: ["qr", "pin", "reference"],
      pinRules: ROOM_PIN_RULES,
      hint:
        "Scan the QR card in your room, or type your room number and the 4-digit PIN from your key sleeve, or your booking reference and phone number.",
    });
  }

  const { bookingId, roomNumber } = session;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  const room = booking ? await roomForBooking(booking) : null;

  const [folioItems, guestOrders, threads, tasks, menu] = await Promise.all([
    db.select().from(folioItemsTable).where(eq(folioItemsTable.bookingId, bookingId)),
    db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.bookingId, bookingId))
      .orderBy(desc(ordersTable.placedAt))
      .limit(10),
    db
      .select()
      .from(messageThreadsTable)
      .where(eq(messageThreadsTable.bookingId, bookingId))
      .orderBy(desc(messageThreadsTable.lastMessageAt))
      .limit(5),
    db
      .select()
      .from(serviceTasksTable)
      .where(eq(serviceTasksTable.bookingId, bookingId))
      .orderBy(desc(serviceTasksTable.createdAt))
      .limit(10),
    db.select().from(menuItemsTable).orderBy(menuItemsTable.category),
  ]);

  const orderIds = guestOrders.map((order) => order.id);
  const orderLines = orderIds.length
    ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];
  const threadIds = threads.map((thread) => thread.id);
  const threadMessages = threadIds.length
    ? await db
        .select()
        .from(messagesTable)
        .where(inArray(messagesTable.threadId, threadIds))
        .orderBy(messagesTable.createdAt)
    : [];

  const folio = folioTotals(folioItems);
  const paid = booking?.amountPaid ?? 0;

  // The nudge is the ONLY difference between this guest and an account guest: the
  // same payload carries it, so the app screen can render both paths from one shape.
  const ctx: GuestContext = {
    kind: "room",
    channel: channelFor(session.openedVia),
    sessionId: session.sessionId,
    guestName: session.guestName,
    guestId: booking?.guestId ?? null,
    accountId: null,
    status: "room_session",
    messagingMuted: false,
    roomNumber,
    bookingId,
    booking: booking ?? null,
  };

  return NextResponse.json({
    active: true,
    session: { sessionId: session.sessionId, roomNumber, guestName: session.guestName, via: session.openedVia },
    channel: ctx.channel,
    stay: booking
      ? {
          bookingId: booking.id,
          reference: booking.reference,
          roomNumber: room?.roomNumber ?? roomNumber,
          roomType: booking.roomType,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          nights: booking.nights,
          adults: booking.adults,
          children: booking.children,
          status: booking.status,
          nightlyRate: booking.nightlyRate,
        }
      : null,
    folio: {
      total: folio.total,
      byCategory: folio.byCategory,
      amountPaid: paid,
      balanceDue: Math.max(0, folio.total - paid),
      // Only the OPEN items are the bill — voided lines are not the guest's problem.
      items: folioItems
        .filter((item) => item.status === "open")
        .map((item) => ({
          id: item.id,
          category: item.category,
          description: item.description,
          qty: item.qty,
          unitPrice: item.unitPrice,
          amount: item.amount,
          createdAt: item.createdAt,
        })),
    },
    orders: guestOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      channel: order.channel,
      total: order.total,
      note: order.note,
      placedAt: order.placedAt,
      deliveredAt: order.deliveredAt,
      rejectedReason: order.rejectedReason,
      items: orderLines.filter((line) => line.orderId === order.id),
    })),
    threads: threads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      kind: thread.kind,
      status: thread.status,
      lastMessageAt: thread.lastMessageAt,
      messages: threadMessages
        .filter((message) => message.threadId === thread.id)
        .map((message) => ({
          id: message.id,
          direction: message.direction,
          body: message.body,
          kind: message.kind,
          createdAt: message.createdAt,
        })),
    })),
    requests: tasks.map((task) => ({
      id: task.id,
      kind: task.kind,
      note: task.note,
      status: task.status,
      priority: task.priority,
      dueBy: task.dueBy,
      createdAt: task.createdAt,
    })),
    menu: menu.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      isSpecial: item.isSpecial,
    })),
    service: serviceWindow(),
    upgrade: accountUpgradeNudge(ctx),
  });
}


/**
 * Prove "I am the person in Room 104 right now" with one of the three documented
 * methods. All three fail the same way to an outsider's eye: no method tells a
 * stranger whether a room is occupied, or whether a reference exists.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      qrToken?: string;
      roomNumber?: string;
      pin?: string;
      reference?: string;
      phone?: string;
    };
    const result = await startRoomSession({
      qrToken: body.qrToken ?? null,
      roomNumber: body.roomNumber ?? null,
      pin: body.pin ?? null,
      reference: body.reference ?? null,
      phone: body.phone ?? null,
    });
    revalidateLiveContent();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await logAudit({
      action: "room_session.opened",
      entity: "room_session",
      entityId: result.sessionId,
      reference: `Room ${result.roomNumber}`,
      summary: `${result.guestName} opened the guest menu for Room ${result.roomNumber} via ${result.via} — no account, full service.`,
      actor: "guest",
      actorLabel: result.guestName,
      ip: clientIp(request),
      metadata: { via: result.via },
    });

    const response = NextResponse.json({
      success: true,
      via: result.via,
      sessionId: result.sessionId,
      roomNumber: result.roomNumber,
      guestName: result.guestName,
    });
    setRoomCookie(response, result.sessionId);
    return response;
  } catch (error) {
    console.error("Room session failed", error);
    return NextResponse.json(
      { error: "Could not open the room menu. Please try again, or ask the front desk." },
      { status: 500 },
    );
  }
}

/** Leave the session on this device — for a phone passed across the counter. */
export async function DELETE(request: Request) {
  const session = await readRoomSession(request);
  const response = NextResponse.json({ success: true });
  clearRoomCookie(response);
  if (session) {
    await logAudit({
      action: "room_session.device_left",
      entity: "room_session",
      entityId: session.sessionId,
      reference: `Room ${session.roomNumber}`,
      summary: `A device left the no-account session for Room ${session.roomNumber}. The session stays open for the guest's own phone.`,
      actor: "guest",
      actorLabel: session.guestName,
      ip: clientIp(request),
    });
  }
  return response;
}

