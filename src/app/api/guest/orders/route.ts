import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { menuItemsTable, orderItemsTable, ordersTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { GUEST_AUTH_HINT, canChargeRoom, resolveGuestContext } from "@/lib/guest-context";
import { nextOrderNumber, postFolioItem, roomForBooking, serviceWindow } from "@/lib/hotel";
import { logNotification } from "@/lib/notify";
import { malawiShortDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The guest's own orders only — whether they signed in or proved they are in the
 * room with the QR card, the PIN or their booking reference.
 */
export async function GET(request: Request) {
  const ctx = await resolveGuestContext(request);
  if (!ctx) return NextResponse.json({ error: GUEST_AUTH_HINT }, { status: 401 });
  if (!ctx.bookingId) return NextResponse.json({ orders: [] });
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.bookingId, ctx.bookingId))
    .orderBy(desc(ordersTable.placedAt));
  const ids = orders.map((o) => o.id);
  const lines = ids.length ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, ids)) : [];
  return NextResponse.json({
    orders: orders.map((order) => ({ ...order, items: lines.filter((l) => l.orderId === order.id) })),
  });
}

/**
 * Place an order from the Dine menu to the room (§4.2).
 *
 * ADDENDUM (two guest paths): the caller is resolved by `resolveGuestContext`, so the
 * guest who scanned the QR card in Room 104 orders exactly as an app guest does. Orders
 * can only be placed against an ACTIVE STAY with an open session for that room — never
 * for a room that is not occupied. Items are priced from `menu_items` at order time and
 * each one posts to the folio as `open`, so the room bill grows in real time.
 */
export async function POST(request: Request) {
  const ctx = await resolveGuestContext(request);
  if (!ctx) return NextResponse.json({ error: GUEST_AUTH_HINT }, { status: 401 });
  try {
    const body = (await request.json()) as {
      items?: { menuItemId?: string; qty?: number }[];
      note?: string;
      service?: string;
    };
    const wanted = (body.items ?? []).filter((i) => i.menuItemId && (i.qty ?? 1) > 0);
    if (wanted.length === 0) {
      return NextResponse.json({ error: "Add at least one item to your order." }, { status: 400 });
    }

    // A charge may only land on a folio with an ACTIVE STAY, and ordering to a room
    // requires an open session for that room. Both are already settled in `ctx`,
    // whichever path the guest arrived by.
    const chargeable = canChargeRoom(ctx);
    const stay = ctx.booking;
    if (!stay || !chargeable.ok) {
      return NextResponse.json(
        {
          error:
            chargeable.ok || chargeable.reason === "stay_closed"
              ? "Your stay is closed, so room ordering is off. The front desk can take the order for you at the counter."
              : "We have no active stay for this room or phone, so room ordering is closed. The front desk can take the order for you at the counter.",
        },
        { status: 403 },
      );
    }
    const room = await roomForBooking(stay);
    const window = serviceWindow();
    if (!window.isOpen) {
      return NextResponse.json(
        {
          error: `The kitchen is closed right now (service hours ${window.openLabel}–${window.closeLabel}). Ask the front desk if you need something tonight.`,
        },
        { status: 409 },
      );
    }

    const menuRows = await db.select().from(menuItemsTable);
    const lines = wanted
      .map((want) => {
        const item = menuRows.find((m) => m.id === want.menuItemId);
        if (!item || !item.isAvailable) return null;
        const qty = Math.max(1, Math.min(20, Math.round(want.qty ?? 1)));
        return { item, qty, amount: item.price * qty };
      })
      .filter(Boolean) as { item: (typeof menuRows)[number]; qty: number; amount: number }[];
    if (lines.length === 0) {
      return NextResponse.json({ error: "Those items are not available right now." }, { status: 409 });
    }
    const unavailable = wanted.length - lines.length;
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const todayOrders = await db.select().from(ordersTable).where(eq(ordersTable.bookingId, stay.id));
    const orderNumber = nextOrderNumber(malawiShortDate(), todayOrders.length + 1);
    const [order] = await db
      .insert(ordersTable)
      .values({
        id: crypto.randomUUID(),
        orderNumber,
        bookingId: stay.id,
        roomNumber: room?.roomNumber ?? stay.assignedRoom?.replace(/[^0-9]/g, "") ?? ctx.roomNumber,
        guestId: ctx.guestId,
        guestAccountId: ctx.accountId,
        guestName: ctx.guestName,
        status: "placed",
        service: body.service === "takeaway" ? "takeaway" : "room_service",
        // How the order arrived: app | qr | pin | reference | desk.
        channel: ctx.channel,
        roomSessionId: ctx.kind === "room" ? ctx.sessionId : null,
        note: body.note?.trim() || null,
        total,
        placedByLabel: ctx.kind === "room" ? `${ctx.guestName} (Room ${ctx.roomNumber}, no app)` : ctx.guestName,
      })
      .returning();

    for (const line of lines) {
      await db.insert(orderItemsTable).values({
        id: crypto.randomUUID(),
        orderId: order!.id,
        menuItemId: line.item.id,
        name: line.item.name,
        qty: line.qty,
        unitPrice: line.item.price,
        amount: line.amount,
        status: "open",
      });
      await postFolioItem({
        bookingId: stay.id,
        roomNumber: order!.roomNumber,
        category: "order",
        description: `${line.item.name}${line.qty > 1 ? ` ×${line.qty}` : ""}`,
        qty: line.qty,
        unitPrice: line.item.price,
        orderId: order!.id,
        postedByLabel: ctx.kind === "room" ? `${ctx.guestName} (Room ${ctx.roomNumber}, no app)` : `${ctx.guestName} (app)`,
      });
    }

    const summary = lines.map((l) => `${l.qty}× ${l.item.name}`).join(", ");
    await logNotification({
      channel: "portal",
      template: "order_placed",
      recipient: order!.roomNumber ? `Room ${order!.roomNumber}` : "counter",
      subject: `NEW ORDER · ${order!.orderNumber} · ${order!.roomNumber ? `Room ${order!.roomNumber}` : "counter"}`,
      // The desk can see at a glance whether this guest has the app (push) or only a
      // phone (call / WhatsApp), because the two paths are served the same board.
      body: `${summary} — MWK ${total.toLocaleString()}${body.note ? ` · Note: ${body.note}` : ""}${ctx.kind === "room" ? ` · via ${ctx.channel}, no account — reach the guest on ${stay.phone}` : " · app guest"}`,
      status: "sent",
      guestId: ctx.guestId,
      bookingId: stay.id,
    });
    await logAudit({
      action: "order.placed",
      entity: "order",
      entityId: order!.id,
      reference: stay.reference,
      summary: `${ctx.guestName} ordered ${summary} to Room ${order!.roomNumber ?? "—"} — MWK ${total.toLocaleString()}${ctx.kind === "room" ? ` (no account, via ${ctx.channel})` : ""}.`,
      actor: "guest",
      actorLabel: ctx.guestName,
      ip: clientIp(request),
      metadata: { orderNumber: order!.orderNumber, total, unavailable, channel: ctx.channel },
    });

    return NextResponse.json({
      success: true,
      order: { ...order!, items: lines.map((l) => ({ name: l.item.name, qty: l.qty, amount: l.amount })) },
      unavailable,
    });
  } catch (error) {
    console.error("Guest order failed", error);
    return NextResponse.json({ error: "Could not place your order." }, { status: 500 });
  }
}
