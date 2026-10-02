import { randomUUID } from "node:crypto";
import { revalidateLiveContent } from "@/lib/revalidate";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { postsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { seedDatabaseIfEmpty } from "@/db/seed";
import { readSession } from "@/lib/staff-auth";
import { requireRestaurantManager } from "@/lib/desk-auth";
import { setting, setSetting } from "@/lib/settings";
import { sendWebPush } from "@/lib/web-push";
import { desc, eq } from "drizzle-orm";

/**
 * A post that nobody hears about is a diary entry. So publishing one pings every
 * browser/installed-web-app that opted in to alerts — automatically, no second step.
 *
 * Two deliberate brakes, because an alert channel that shouts stops being read:
 *   * at most one publish alert per 10 minutes (editing a batch must not machine-gun
 *     everyone), and
 *   * the announcement never blocks the publish — if push is down, the post still goes
 *     live and the reply says why nothing was sent.
 */
const PUBLISH_PUSH_COOLDOWN_MS = 10 * 60 * 1000;

async function announcePost(post: { id: string; title: string; detail: string; imageUrl: string | null }, request: Request) {
  try {
    const lastAt = Number(await setting("PUBLISH_PUSH_LAST_AT")) || 0;
    const sinceMs = Date.now() - lastAt;
    if (lastAt > 0 && sinceMs < PUBLISH_PUSH_COOLDOWN_MS) {
      const minutes = Math.ceil((PUBLISH_PUSH_COOLDOWN_MS - sinceMs) / 60000);
      return { delivered: 0, devices: 0, reason: `Held back: a post was announced minutes ago (next allowed in ~${minutes} min).` };
    }
    const result = await sendWebPush({
      title: post.title,
      body: post.detail.slice(0, 160),
      url: "/unwind",
      tag: "sunrise-post",
    });
    await setSetting("PUBLISH_PUSH_LAST_AT", String(Date.now()));
    await logAudit({
      action: "push.published",
      entity: "post",
      entityId: post.id,
      summary: `Alert for "${post.title}": delivered to ${result.sent} of ${result.devices} subscribed device(s).`,
      actor: "system",
      actorLabel: "automatic on publish",
      ip: clientIp(request),
      metadata: { ...result },
    });
    return { delivered: result.sent, devices: result.devices, reason: result.reason };
  } catch (error) {
    console.error("Publish alert failed:", error);
    return { delivered: 0, devices: 0, reason: "Alert could not be sent — the post is live regardless." };
  }
}

export async function GET() {
  try {
    await seedDatabaseIfEmpty();
    const allPosts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
    return NextResponse.json({ posts: allPosts });
  } catch (error) {
    console.error("Failed to get posts:", error);
    return NextResponse.json({ error: "Could not fetch posts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  // ADDENDUM (authority matrix): posts are public content, so publishing, pausing and deleting one
  // is admin-only. A staff session is the front desk — it reads posts, it does not write them.
  const denied = requireRestaurantManager(user);
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      title: string;
      category?: string;
      day?: string;
      date?: string;
      time?: string;
      detail: string;
      priceTag?: string;
      bookingAddonPrice?: number | null;
      imageUrl?: string;
    };

    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200 || typeof body.detail !== "string" || !body.detail.trim()) {
      return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
    }
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Event";
    const bookingAddonPrice = body.bookingAddonPrice === undefined || body.bookingAddonPrice === null
      ? null
      : body.bookingAddonPrice;
    if (bookingAddonPrice !== null && (!Number.isSafeInteger(bookingAddonPrice) || bookingAddonPrice < 0 || bookingAddonPrice > 50_000_000)) {
      return NextResponse.json({ error: "Booking add-on price must be a whole MWK amount between 0 and 50,000,000." }, { status: 400 });
    }
    if (bookingAddonPrice !== null && category !== "Offer") {
      return NextResponse.json({ error: "Only Offer posts can be selected as booking add-ons." }, { status: 400 });
    }

    const [newPost] = await db
      .insert(postsTable)
      .values({
        id: randomUUID(),
        title: body.title.trim(),
        category,
        day: body.day?.trim() || "SPECIAL",
        date: body.date?.trim() || "NOW",
        time: body.time?.trim() || "All day",
        detail: body.detail.trim(),
        priceTag: body.priceTag?.trim() || "",
        bookingAddonPrice,
        imageUrl: body.imageUrl?.trim() || "https://images.pexels.com/photos/18852576/pexels-photo-18852576.jpeg",
        isActive: true,
      })
      .returning();

    await logAudit({
      action: "ACTIVITY_POSTED", entity: "post", entityId: newPost.id,
      summary: `Post published: ${newPost.title} (${newPost.category}).`,
      actor: "manager", ip: clientIp(request), metadata: { title: newPost.title, category: newPost.category },
    });

    // Automatic: everyone who opted in to alerts on this site hears about it now.
    const push = await announcePost(newPost, request);

    revalidateLiveContent();

    return NextResponse.json({ post: newPost, push }, { status: 201 });
  } catch (error) {
    console.error("Failed to add post:", error);
    return NextResponse.json({ error: "Could not add post." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const denied = requireRestaurantManager(user);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Post ID is required." }, { status: 400 });
    }

    await db.delete(postsTable).where(eq(postsTable.id, id));
    await logAudit({
      action: "ACTIVITY_DELETED", entity: "post", entityId: id,
      summary: `Post removed (id ${id}).`, actor: "manager", ip: clientIp(request),
    });
    revalidateLiveContent();
    return NextResponse.json({ success: true, message: "Post removed successfully." });
  } catch (error) {
    console.error("Failed to delete post:", error);
    return NextResponse.json({ error: "Could not delete post." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const denied = requireRestaurantManager(user);
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      id: string;
      isActive?: boolean;
      title?: string;
      category?: string;
      day?: string;
      date?: string;
      time?: string;
      detail?: string;
      priceTag?: string;
      bookingAddonPrice?: number | null;
      imageUrl?: string;
    };
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "Post ID is required." }, { status: 400 });
    }

    const updates: Partial<typeof postsTable.$inferInsert> = {};
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200) return NextResponse.json({ error: "A title of 1–200 characters is required." }, { status: 400 });
      updates.title = body.title.trim();
    }
    if (body.category !== undefined) {
      if (typeof body.category !== "string" || !body.category.trim() || body.category.length > 64) return NextResponse.json({ error: "A valid category is required." }, { status: 400 });
      updates.category = body.category.trim();
    }
    for (const field of ["day", "date", "time", "priceTag", "imageUrl"] as const) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== "string") return NextResponse.json({ error: `Invalid ${field}.` }, { status: 400 });
        if (field === "day") updates.day = body.day!.trim();
        if (field === "date") updates.date = body.date!.trim();
        if (field === "time") updates.time = body.time!.trim();
        if (field === "priceTag") updates.priceTag = body.priceTag!.trim();
        if (field === "imageUrl") updates.imageUrl = body.imageUrl!.trim();
      }
    }
    if (body.detail !== undefined) {
      if (typeof body.detail !== "string" || !body.detail.trim()) return NextResponse.json({ error: "Post details are required." }, { status: 400 });
      updates.detail = body.detail.trim();
    }
    if (body.bookingAddonPrice !== undefined) {
      if (body.bookingAddonPrice !== null && (!Number.isSafeInteger(body.bookingAddonPrice) || body.bookingAddonPrice < 0 || body.bookingAddonPrice > 50_000_000)) {
        return NextResponse.json({ error: "Booking add-on price must be a whole MWK amount between 0 and 50,000,000." }, { status: 400 });
      }
      const effectiveCategory = updates.category ?? (await db.select({ category: postsTable.category }).from(postsTable).where(eq(postsTable.id, body.id)).then(([post]) => post?.category));
      if (body.bookingAddonPrice !== null && effectiveCategory !== "Offer") {
        return NextResponse.json({ error: "Only Offer posts can have a booking add-on price." }, { status: 400 });
      }
      updates.bookingAddonPrice = body.bookingAddonPrice;
    }
    if (updates.category && updates.category !== "Offer") updates.bookingAddonPrice = null;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No post changes were provided." }, { status: 400 });

    const [updated] = await db
      .update(postsTable)
      .set(updates)
      .where(eq(postsTable.id, body.id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Post not found." }, { status: 404 });

    await logAudit({
      action: updates.isActive !== undefined
        ? updates.isActive ? "ACTIVITY_ACTIVATED" : "ACTIVITY_PAUSED"
        : "ACTIVITY_UPDATED",
      entity: "post",
      entityId: body.id,
      summary: updates.isActive !== undefined
        ? `Post ${updates.isActive ? "activated" : "deactivated"}: ${updated.title}.`
        : `Post updated: ${updated.title} (${updated.category}).`,
      actor: "manager", ip: clientIp(request),
    });

    revalidateLiveContent();

    return NextResponse.json({ post: updated });
  } catch (error) {
    console.error("Failed to toggle post:", error);
    return NextResponse.json({ error: "Could not update post." }, { status: 500 });
  }
}
