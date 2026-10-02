import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItemsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { requireRestaurantManager } from "@/lib/desk-auth";
import { readSession } from "@/lib/staff-auth";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

type MenuInput = {
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  isSpecial: boolean;
  mealPeriod: string | null;
  prepTimeMins: number;
};

function parseMenuInput(body: Record<string, unknown>): MenuInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const price = body.price;
  const isAvailable = body.isAvailable;
  const isSpecial = body.isSpecial;
  const mealPeriodValue = body.mealPeriod;
  if (mealPeriodValue !== undefined && mealPeriodValue !== null && mealPeriodValue !== "" && typeof mealPeriodValue !== "string") {
    return "Meal period must be breakfast, lunch, dinner, or all day.";
  }
  const mealPeriod = typeof mealPeriodValue === "string" && mealPeriodValue !== "" ? mealPeriodValue : null;
  const prepTimeMins = body.prepTimeMins === undefined ? 20 : body.prepTimeMins;

  if (!name || name.length > 160) return "Name is required and must be 160 characters or fewer.";
  if (!category || category.length > 80) return "Category is required and must be 80 characters or fewer.";
  if (!description || description.length > 2000) return "Description is required and must be 2,000 characters or fewer.";
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0 || price > 50_000_000) {
    return "Price must be a whole MWK amount between 0 and 50,000,000.";
  }
  const isLocalImage = imageUrl.startsWith("/") && !imageUrl.startsWith("//") && !imageUrl.includes("\\");
  let isRemoteImage = false;
  if (imageUrl && !imageUrl.startsWith("/")) {
    try {
      const parsedUrl = new URL(imageUrl);
      isRemoteImage = (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") && Boolean(parsedUrl.hostname);
    } catch {
      isRemoteImage = false;
    }
  }
  if (!imageUrl || imageUrl.length > 2048 || (!isLocalImage && !isRemoteImage)) {
    return "Choose a site image path or an HTTP/HTTPS image URL.";
  }
  if (isAvailable !== undefined && typeof isAvailable !== "boolean") return "Availability must be true or false.";
  if (isSpecial !== undefined && typeof isSpecial !== "boolean") return "Special status must be true or false.";
  if (mealPeriod !== null && !["breakfast", "lunch", "dinner"].includes(mealPeriod)) {
    return "Meal period must be breakfast, lunch, dinner, or all day.";
  }
  if (!Number.isInteger(prepTimeMins) || Number(prepTimeMins) < 1 || Number(prepTimeMins) > 240) {
    return "Preparation time must be between 1 and 240 minutes.";
  }

  return {
    name,
    category,
    description,
    price,
    imageUrl,
    isAvailable: isAvailable === undefined ? true : isAvailable,
    isSpecial: isSpecial === undefined ? false : isSpecial,
    mealPeriod,
    prepTimeMins: Number(prepTimeMins),
  };
}

async function manager(request: Request) {
  const user = await readSession(request);
  if (!user) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const denied = requireRestaurantManager(user);
  return denied ? { error: denied } : { user };
}

export async function GET(request: Request) {
  const auth = await manager(request);
  if ("error" in auth) return auth.error;
  try {
    const items = await db.select().from(menuItemsTable).orderBy(menuItemsTable.category, menuItemsTable.name);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Admin menu load failed", error);
    return NextResponse.json({ error: "Could not load menu items." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await manager(request);
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseMenuInput(body);
    if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

    const [item] = await db.insert(menuItemsTable).values({ id: randomUUID(), ...parsed }).returning();
    await logAudit({
      action: "MENU_ITEM_CREATED",
      entity: "menu_item",
      entityId: item.id,
      summary: `${auth.user.name} added "${item.name}" at MWK ${item.price.toLocaleString()}.`,
      actor: "manager",
      actorLabel: auth.user.name,
      ip: clientIp(request),
      metadata: { name: item.name, category: item.category, price: item.price, isSpecial: item.isSpecial },
    });
    revalidateLiveContent();
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Admin menu item create failed", error);
    return NextResponse.json({ error: "Could not add that menu item." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await manager(request);
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Menu item ID is required." }, { status: 400 });

    let values: Partial<MenuInput>;
    if (Object.keys(body).every((key) => key === "id" || key === "isAvailable") && typeof body.isAvailable === "boolean") {
      values = { isAvailable: body.isAvailable };
    } else {
      const parsed = parseMenuInput(body);
      if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
      values = parsed;
    }

    const [item] = await db.update(menuItemsTable).set(values).where(eq(menuItemsTable.id, id)).returning();
    if (!item) return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
    await logAudit({
      action: values.isAvailable === undefined ? "MENU_ITEM_UPDATED" : values.isAvailable ? "MENU_ITEM_AVAILABLE" : "MENU_ITEM_SOLD_OUT",
      entity: "menu_item",
      entityId: id,
      summary: values.isAvailable === undefined
        ? `${auth.user.name} updated "${item.name}" (${item.category}, MWK ${item.price.toLocaleString()}).`
        : `${auth.user.name} marked "${item.name}" ${values.isAvailable ? "available" : "sold out"}.`,
      actor: "manager",
      actorLabel: auth.user.name,
      ip: clientIp(request),
      metadata: { name: item.name, category: item.category, price: item.price, isAvailable: item.isAvailable },
    });
    revalidateLiveContent();
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Admin menu item update failed", error);
    return NextResponse.json({ error: "Could not update that menu item." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await manager(request);
  if ("error" in auth) return auth.error;
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Menu item ID is required." }, { status: 400 });
    const [item] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, id)).limit(1);
    if (!item) return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
    await db.delete(menuItemsTable).where(eq(menuItemsTable.id, id));
    await logAudit({
      action: "MENU_ITEM_DELETED",
      entity: "menu_item",
      entityId: id,
      summary: `${auth.user.name} removed "${item.name}" from the menu.`,
      actor: "manager",
      actorLabel: auth.user.name,
      ip: clientIp(request),
      metadata: { name: item.name, category: item.category, price: item.price },
    });
    revalidateLiveContent();
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Admin menu item delete failed", error);
    return NextResponse.json({ error: "Could not remove that menu item." }, { status: 500 });
  }
}
