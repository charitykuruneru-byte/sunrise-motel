import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { postsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { seedDatabaseIfEmpty } from "@/db/seed";
import { readSession } from "@/lib/staff-auth";
import { requireRestaurantManager } from "@/lib/desk-auth";
import { desc, eq } from "drizzle-orm";

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

    revalidatePath("/");
    revalidatePath("/stay");
    revalidatePath("/gallery");
    revalidatePath("/dine");
    revalidatePath("/admin");
    revalidatePath("/desk");

    return NextResponse.json({ post: newPost }, { status: 201 });
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
    revalidatePath("/");
    revalidatePath("/stay");
    revalidatePath("/gallery");
    revalidatePath("/dine");
    revalidatePath("/admin");
    revalidatePath("/desk");
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

    revalidatePath("/");
    revalidatePath("/stay");
    revalidatePath("/gallery");
    revalidatePath("/dine");
    revalidatePath("/admin");
    revalidatePath("/desk");

    return NextResponse.json({ post: updated });
  } catch (error) {
    console.error("Failed to toggle post:", error);
    return NextResponse.json({ error: "Could not update post." }, { status: 500 });
  }
}
