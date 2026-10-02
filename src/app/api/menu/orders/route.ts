import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { menuItemsTable, orderItemsTable, ordersTable } from "@/db/schema";
import { nextOrderNumber } from "@/lib/hotel";
import { malawiDatePart, malawiShortDate, nowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

type RequestedItem = { menuItemId?: string; qty?: number };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      guestName?: string;
      guestPhone?: string;
      items?: RequestedItem[];
      note?: string;
      isAutoNudge?: boolean;
      nudgeType?: string;
      scheduledFor?: string;
    };
    const guestName = body.guestName?.trim() ?? "";
    const guestPhone = body.guestPhone?.trim() ?? "";
    if (guestName.length < 2 || guestName.length > 160) {
      return NextResponse.json({ error: "Enter your name (2 to 160 characters)." }, { status: 400 });
    }
    if (!/^[+()\d\s.-]{7,40}$/.test(guestPhone)) {
      return NextResponse.json({ error: "Enter a valid phone number so the kitchen can contact you." }, { status: 400 });
    }
    const phoneDigits = guestPhone.replace(/\D/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return NextResponse.json({ error: "Enter a valid phone number so the kitchen can contact you." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      return NextResponse.json({ error: "Choose at least one menu item." }, { status: 400 });
    }
    if (body.note && body.note.length > 500) return NextResponse.json({ error: "Order note is too long." }, { status: 400 });
    const nudgeType = body.nudgeType;
    if (body.isAutoNudge && !["breakfast", "lunch", "dinner", "late_night_preorder", "custom"].includes(nudgeType ?? "")) {
      return NextResponse.json({ error: "The meal alert type is invalid." }, { status: 400 });
    }

    const requested = body.items.filter((item) => typeof item.menuItemId === "string" && Number.isInteger(item.qty) && Number(item.qty) >= 1);
    if (requested.length !== body.items.length) {
      return NextResponse.json({ error: "Every order line needs a menu item and quantity." }, { status: 400 });
    }
    const menu = await db.select().from(menuItemsTable);
    const lines = requested.map((want) => {
      const item = menu.find((row) => row.id === want.menuItemId);
      if (!item || !item.isAvailable) return null;
      const qty = Math.min(20, Number(want.qty));
      return { item, qty, amount: item.price * qty };
    });
    if (lines.some((line) => !line) || lines.length === 0) {
      return NextResponse.json({ error: "One or more selected dishes are no longer available. Refresh the menu and try again." }, { status: 409 });
    }
    const availableLines = lines.filter((line) => line !== null);
    const total = availableLines.reduce((sum, line) => sum + line.amount, 0);
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
      return NextResponse.json({ error: "This order total is too large. Reduce the quantities and try again." }, { status: 400 });
    }
    const date = malawiShortDate();
    const existing = await db.select({ id: ordersTable.id, placedAt: ordersTable.placedAt })
      .from(ordersTable)
      .orderBy(desc(ordersTable.placedAt))
      .limit(1000);
    const sequence = existing.filter((order) => malawiDatePart(order.placedAt) === malawiDatePart()).length + 1;
    const now = nowDate();
    const preorder = body.isAutoNudge === true && nudgeType === "late_night_preorder";
    const order = await db.transaction(async (tx) => {
      const [createdOrder] = await tx.insert(ordersTable).values({
        id: randomUUID(),
        orderNumber: nextOrderNumber(date, sequence),
        guestName,
        guestPhone,
        status: preorder ? "preorder_pending" : "placed",
        service: "takeaway",
        channel: "app",
        isAutoNudge: body.isAutoNudge === true,
        nudgeType: body.isAutoNudge ? nudgeType : null,
        scheduledFor: body.isAutoNudge ? now : null,
        note: body.note?.trim() || null,
        total,
        placedByLabel: `${guestName} · ${guestPhone}`,
        placedAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(orderItemsTable).values(availableLines.map(({ item, qty, amount }) => ({
        id: randomUUID(),
        orderId: createdOrder.id,
        menuItemId: item.id,
        name: item.name,
        qty,
        unitPrice: item.price,
        amount,
        status: "open",
      })));
      return createdOrder;
    });

    return NextResponse.json({ order: { ...order, items: availableLines }, message: preorder ? "Pre-order sent to the front desk for confirmation." : "Order sent to the kitchen." }, { status: 201 });
  } catch (error) {
    console.error("Public menu order failed", error);
    return NextResponse.json({ error: "Could not submit your order. Please try again or contact the front desk." }, { status: 500 });
  }
}
