import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItemsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor } from "@/lib/desk-auth";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

/**
 * THE ONE MENU EXCEPTION (staff dashboard, Part 15.1).
 *
 * Menu *management* is admin only — add, edit a price, change a description, upload a photo,
 * delete. But during dinner service the kitchen runs out of chambo, and somebody at the desk must
 * be able to stop it being ordered IMMEDIATELY rather than wait for a manager.
 *
 * So staff get exactly one control on each dish: **sold out**, and un-sold-out when the kitchen
 * has more. It carries no money and no reputation risk, which is why it is safe to delegate —
 * the same shape as the housekeeping exception.
 *
 * Read: any signed-in session (staff, admin, auditor). Write: staff and admin, never an auditor.
 */
export async function GET(request: Request) {
  const auth = await deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const items = await db.select().from(menuItemsTable).orderBy(menuItemsTable.category, menuItemsTable.name);
    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        price: item.price,
        imageUrl: item.imageUrl,
        isAvailable: item.isAvailable,
        isSpecial: item.isSpecial,
      })),
      summary: {
        total: items.length,
        soldOut: items.filter((item) => !item.isAvailable).length,
        categories: [...new Set(items.map((item) => item.category))],
      },
    });
  } catch (error) {
    console.error("Desk menu load failed", error);
    return NextResponse.json({ error: "Could not load the menu." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as { menuItemId?: string; isAvailable?: boolean };
    if (!body.menuItemId) {
      return NextResponse.json({ error: "menuItemId is required." }, { status: 400 });
    }
    if (typeof body.isAvailable !== "boolean") {
      return NextResponse.json({ error: "isAvailable must be true or false." }, { status: 400 });
    }
    const [item] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, body.menuItemId)).limit(1);
    if (!item) return NextResponse.json({ error: "Menu item not found." }, { status: 404 });

    await db
      .update(menuItemsTable)
      .set({ isAvailable: body.isAvailable })
      .where(eq(menuItemsTable.id, item.id));

    // The audit entry is the honest part: the desk changed what a guest can buy, so it is
    // recorded with who did it, when, and in which direction.
    await logAudit({
      action: body.isAvailable ? "DISH_UPDATED" : "DISH_OUT_OF_STOCK",
      entity: "menu_item",
      entityId: item.id,
      summary: body.isAvailable
        ? `${auth.label} put "${item.name}" back on sale.`
        : `${auth.label} marked "${item.name}" SOLD OUT — it disappears from ordering now and returns tomorrow.`,
      actor: "manager",
      actorLabel: auth.label,
      ip: clientIp(request),
      metadata: { name: item.name, category: item.category, isAvailable: body.isAvailable },
    });

    revalidateLiveContent();
    return NextResponse.json({ success: true, id: item.id, name: item.name, isAvailable: body.isAvailable });
  } catch (error) {
    console.error("Desk menu update failed", error);
    return NextResponse.json({ error: "Could not update that dish." }, { status: 500 });
  }
}