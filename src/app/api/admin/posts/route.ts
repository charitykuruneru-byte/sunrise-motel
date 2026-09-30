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
      imageUrl?: string;
    };

    if (!body.title || !body.detail) {
      return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
    }

    const [newPost] = await db
      .insert(postsTable)
      .values({
        id: randomUUID(),
        title: body.title.trim(),
        category: body.category || "Event",
        day: body.day?.trim() || "SPECIAL",
        date: body.date?.trim() || "NOW",
        time: body.time?.trim() || "All day",
        detail: body.detail.trim(),
        priceTag: body.priceTag?.trim() || "",
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
    const body = (await request.json()) as { id: string; isActive: boolean };
    if (!body.id) {
      return NextResponse.json({ error: "Post ID is required." }, { status: 400 });
    }

    const [updated] = await db
      .update(postsTable)
      .set({ isActive: body.isActive })
      .where(eq(postsTable.id, body.id))
      .returning();

    await logAudit({
      action: body.isActive ? "ACTIVITY_ACTIVATED" : "ACTIVITY_PAUSED", entity: "post", entityId: body.id,
      summary: `Post ${body.isActive ? "activated" : "deactivated"} (id ${body.id}).`,
      actor: "manager", ip: clientIp(request),
    });

    revalidateLiveContent();

    return NextResponse.json({ post: updated });
  } catch (error) {
    console.error("Failed to toggle post:", error);
    return NextResponse.json({ error: "Could not update post." }, { status: 500 });
  }
}
