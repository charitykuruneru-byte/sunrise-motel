import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { postsTable } from "@/db/schema";
import { seedDatabaseIfEmpty } from "@/db/seed";

export const dynamic = "force-dynamic";

/**
 * THE PUBLIC FEED — "What's on at Sunrise Motel".
 *
 * Read-only and unpaginated: this is the same published post set the landing page
 * shows, and the same one the guest app shows in its What's on tab. One source,
 * three surfaces (addendum "navigation & image standards", part 4/5 and the
 * landing-page addendum, part 7 — the app is the front door for the same content,
 * never a second copy of it).
 *
 * Only `is_active` posts are returned, so pausing a post in the manager portal
 * removes it from the website and the app at the same moment.
 * Writing (create / pause / delete) stays admin-only at /api/admin/posts.
 */
export async function GET() {
  try {
    await seedDatabaseIfEmpty();
    const posts = await db
      .select({
        id: postsTable.id,
        title: postsTable.title,
        category: postsTable.category,
        day: postsTable.day,
        date: postsTable.date,
        time: postsTable.time,
        detail: postsTable.detail,
        priceTag: postsTable.priceTag,
        imageUrl: postsTable.imageUrl,
        createdAt: postsTable.createdAt,
      })
      .from(postsTable)
      .where(eq(postsTable.isActive, true))
      .orderBy(desc(postsTable.createdAt));

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Failed to read the public feed:", error);
    return NextResponse.json({ error: "Could not load what's on." }, { status: 500 });
  }
}
