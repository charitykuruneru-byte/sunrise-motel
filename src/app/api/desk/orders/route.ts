import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { folioItemsTable, orderItemsTable, ordersTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor } from "@/lib/desk-auth";
import { logNotification } from "@/lib/notify";
import { malawiDatePart, nowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Waiting time in minutes, used to highlight orders over 20 minutes (§4.3). */
function waitingMinutes(placedAt: Date | string, now: Date) {
  return Math.max(0, Math.round((now.getTime() - new Date(placedAt).getTime()) / 60000));
}

/**
 * The order board (§8.4 Orders tab): live orders grouped by status with a
 * waiting-time clock, plus the history and the voids.
 */
export async function GET(request: Request) {
  const auth = await deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const now = nowDate();
    const [orders, items] = await Promise.all([
      db.select().from(ordersTable).orderBy(desc(ordersTable.placedAt)).limit(200),
      db.select().from(orderItemsTable),
    ]);
    const today = malawiDatePart();
    const withItems = orders.map((order) => ({
      ...order,
      waitingMinutes: waitingMinutes(order.placedAt, now),
      overdue:
        ["placed", "accepted", "preparing"].includes(order.status) &&
        waitingMinutes(order.placedAt, now) > 20,
      items: items.filter((item) => item.orderId === order.id),
    }));
    return NextResponse.json({
      today,
      board: {
        placed: withItems.filter((o) => o.status === "placed"),
        accepted: withItems.filter((o) => o.status === "accepted"),
        preparing: withItems.filter((o) => o.status === "preparing"),
        ready: withItems.filter((o) => o.status === "ready"),
      },
      history: withItems.filter((o) => ["delivered", "rejected"].includes(o.status)),
      totals: {
        live: withItems.filter((o) => ["placed", "accepted", "preparing", "ready"].includes(o.status)).length,
        revenueToday: withItems
          .filter((o) => new Date(o.placedAt).toISOString().slice(0, 10) === today)
          .filter((o) => o.status !== "rejected")
          .reduce((sum, o) => sum + o.total, 0),
        voids: items.filter((i) => i.status === "voided").length,
      },
    });
  } catch (error) {
    console.error("Order board failed", error);
    return NextResponse.json({ error: "Could not load the order board." }, { status: 500 });
  }
}

/**
 * Advance an order. Every change is notified (logged) to the guest and audited.
 * A void REQUIRES a reason — voids are the classic place money quietly
 * disappears, so the reason is mandatory and recorded.
 */
export async function PATCH(request: Request) {
  const auth = await deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as { orderId?: string; action?: string; reason?: string; itemId?: string };
    const orderId = body.orderId ?? "";
    const action = body.action ?? "";
    if (!orderId || !action) return NextResponse.json({ error: "orderId and action are required." }, { status: 400 });

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const now = new Date();
    const patch: Partial<typeof ordersTable.$inferInsert> = { updatedAt: now };
    let guestMessage = "";

    if (action === "accept") {
      patch.status = "accepted";
      patch.acceptedAt = now;
      guestMessage = "Order accepted";
    } else if (action === "prepare") {
      patch.status = "preparing";
      guestMessage = "Your order is being prepared";
    } else if (action === "ready") {
      patch.status = "ready";
      patch.readyAt = now;
      guestMessage = `Ready — coming to ${order.roomNumber ? `Room ${order.roomNumber}` : "the counter"}`;
    } else if (action === "deliver") {
      patch.status = "delivered";
      patch.deliveredAt = now;
      patch.closedAt = now;
      guestMessage = "Delivered — enjoy your order";
    } else if (action === "reject") {
      if (!body.reason?.trim()) {
        return NextResponse.json(
          { error: "A reason is required to reject an order (the guest is told why)." },
          { status: 400 },
        );
      }
      patch.status = "rejected";
      patch.rejectedAt = now;
      patch.rejectedReason = body.reason.trim();
      patch.closedAt = now;
      // The order leaves the bill: every folio line it posted is voided.
      await db
        .update(folioItemsTable)
        .set({
          status: "voided",
          voidReason: `Order rejected: ${body.reason.trim()}`,
          voidedByLabel: auth.label,
          voidedAt: now,
        })
        .where(eq(folioItemsTable.orderId, order.id));
      await db.update(orderItemsTable).set({ status: "voided" }).where(eq(orderItemsTable.orderId, order.id));
      guestMessage = `Order rejected — ${body.reason.trim()}`;
    } else if (action === "void_item") {
      const itemId = body.itemId ?? "";
      if (!itemId) return NextResponse.json({ error: "itemId is required to void a line." }, { status: 400 });
      if (!body.reason?.trim()) {
        return NextResponse.json({ error: "A reason is required to void a line." }, { status: 400 });
      }
      const [item] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId)).limit(1);
      if (!item || item.orderId !== order.id) {
        return NextResponse.json({ error: "Order line not found." }, { status: 404 });
      }
      await db.update(orderItemsTable).set({ status: "voided" }).where(eq(orderItemsTable.id, itemId));
      // Void the folio line that this exact item posted (match on description).
      const lines = await db.select().from(folioItemsTable).where(eq(folioItemsTable.orderId, order.id));
      const matching = lines.find((line) => line.description.startsWith(item.name) && line.status === "open");
      if (matching) {
        await db
          .update(folioItemsTable)
          .set({ status: "voided", voidReason: body.reason.trim(), voidedByLabel: auth.label, voidedAt: now })
          .where(eq(folioItemsTable.id, matching.id));
      }
      const remaining = (await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id))).filter(
        (row) => row.status !== "voided",
      );
      const total = remaining.reduce((sum, row) => sum + row.amount, 0);
      await db.update(ordersTable).set({ total, updatedAt: now }).where(eq(ordersTable.id, order.id));
      await logAudit({
        action: "order.line_voided",
        entity: "order",
        entityId: order.id,
        summary: `${auth.label} voided "${item.name}" on ${order.orderNumber} — ${body.reason.trim()}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { orderNumber: order.orderNumber, item: item.name, reason: body.reason.trim() },
      });
      return NextResponse.json({ success: true, total });
    } else {
      return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
    }

    await db.update(ordersTable).set(patch).where(eq(ordersTable.id, order.id));
    await logNotification({
      channel: "portal",
      template: `order_${action}`,
      recipient: order.roomNumber ? `Room ${order.roomNumber}` : "counter",
      subject: `${order.orderNumber}: ${guestMessage}`,
      body: `${order.guestName ?? "Guest"} · ${order.orderNumber} · MWK ${order.total.toLocaleString()}`,
      status: "sent",
      guestId: order.guestId,
      bookingId: order.bookingId,
    });
    await logAudit({
      action: `order.${action}`,
      entity: "order",
      entityId: order.id,
      summary: `${auth.label} set ${order.orderNumber} (${order.roomNumber ? `Room ${order.roomNumber}` : "counter"}) to ${patch.status}.`,
      actor: "manager",
      actorLabel: auth.label,
      ip: clientIp(request),
      metadata: { orderNumber: order.orderNumber, status: patch.status, reason: body.reason ?? null },
    });
    return NextResponse.json({ success: true, status: patch.status, guestMessage });
  } catch (error) {
    console.error("Order update failed", error);
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  }
}
