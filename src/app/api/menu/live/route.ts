import { NextResponse } from "next/server";
import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { menuItemsTable } from "@/db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 10;

export async function GET(request: Request) {
  try {
    const meal = new URL(request.url).searchParams.get("meal")?.trim().toLowerCase();
    if (meal && !["breakfast", "lunch", "dinner"].includes(meal)) {
      return NextResponse.json({ error: "Meal must be breakfast, lunch, or dinner." }, { status: 400 });
    }
    const rows = await db.select().from(menuItemsTable)
      .where(meal ? or(eq(menuItemsTable.mealPeriod, meal), sql`${menuItemsTable.mealPeriod} is null`) : undefined)
      .orderBy(asc(menuItemsTable.category), asc(menuItemsTable.name));
    return NextResponse.json(
      {
        items: rows.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          category: item.mealPeriod ?? item.category,
          mealPeriod: item.mealPeriod,
          menuCategory: item.category,
          image_url: item.imageUrl,
          is_available: item.isAvailable,
          description: item.description,
          prep_time_mins: item.prepTimeMins,
          is_special: item.isSpecial,
        })),
      },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=5" } },
    );
  } catch (error) {
    console.error("Live menu load failed", error);
    return NextResponse.json({ error: "The live menu is temporarily unavailable." }, { status: 500 });
  }
}
