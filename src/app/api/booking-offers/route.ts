import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { postsTable } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const offers = await db
      .select({
        id: postsTable.id,
        title: postsTable.title,
        detail: postsTable.detail,
        nightlyPrice: postsTable.bookingAddonPrice,
      })
      .from(postsTable)
      .where(andOfferFilter())
      .orderBy(desc(postsTable.createdAt));
    return NextResponse.json({ offers });
  } catch (error) {
    console.error("Booking offers load failed", error);
    return NextResponse.json({ error: "Could not load optional booking offers." }, { status: 500 });
  }
}

function andOfferFilter() {
  return and(eq(postsTable.category, "Offer"), eq(postsTable.isActive, true), isNotNull(postsTable.bookingAddonPrice));
}
