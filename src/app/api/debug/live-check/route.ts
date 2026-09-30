import { NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { galleryImagesTable, menuItemsTable, postsTable, reviewsTable, roomTypesTable } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * IS THE SITE ACTUALLY LIVE? — ask the database and watch the clock.
 *
 *   GET /api/debug/live-check   twice, ten seconds apart
 *
 * `timestamp` must differ every call (a cached answer would repeat it), and each
 * count is a real `count(*)` against the live database — so if it changes, the
 * public pages are reading that same row a moment later. No identifying data is
 * exposed: counts of published content only, never a booking or a guest.
 */
export async function GET() {
  try {
    const [gallery, posts, menu, reviews, roomTypes] = await Promise.all([
      db.select({ value: count() }).from(galleryImagesTable),
      db.select({ value: count() }).from(postsTable),
      db.select({ value: count() }).from(menuItemsTable),
      db.select({ value: count() }).from(reviewsTable),
      db.select({ value: count() }).from(roomTypesTable),
    ]);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        galleryCount: Number(gallery[0]?.value ?? 0),
        postsCount: Number(posts[0]?.value ?? 0),
        menuCount: Number(menu[0]?.value ?? 0),
        reviewCount: Number(reviews[0]?.value ?? 0),
        roomTypeCount: Number(roomTypes[0]?.value ?? 0),
        cache: "no-store",
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
  } catch (error) {
    console.error("live-check failed", error);
    return NextResponse.json({ error: "Could not read the live counters." }, { status: 500 });
  }
}
