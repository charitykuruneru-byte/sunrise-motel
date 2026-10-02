import { randomUUID } from "node:crypto";
import { revalidateLiveContent } from "@/lib/revalidate";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { galleryImagesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { seedDatabaseIfEmpty } from "@/db/seed";
import { readSession } from "@/lib/staff-auth";
import { requireMotelManager } from "@/lib/desk-auth";
import { asc, eq, inArray, max } from "drizzle-orm";

const GALLERY_CATEGORIES = ["Rooms", "Property", "Dining", "Events", "Work"] as const;

function isAllowedImageUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f]/.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    await seedDatabaseIfEmpty();
    const images = await db.select().from(galleryImagesTable).orderBy(asc(galleryImagesTable.displayOrder));
    return NextResponse.json({ images });
  } catch (error) {
    console.error("Failed to get gallery images:", error);
    return NextResponse.json({ error: "Could not fetch gallery images." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  // ADDENDUM (authority matrix): gallery images are public content, so adding and removing one is
  // admin-only. A staff session is the front desk — it reads the gallery, it does not write it.
  const denied = requireMotelManager(user);
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      title: string;
      category?: string;
      imageUrl: string;
      altText?: string;
      caption?: string;
      displayOrder?: number;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!title || !imageUrl) {
      return NextResponse.json({ error: "Title and Image URL are required." }, { status: 400 });
    }
    if (title.length > 160) return NextResponse.json({ error: "Picture title must be 160 characters or fewer." }, { status: 400 });
    if (imageUrl.length > 2048) return NextResponse.json({ error: "Image URL must be 2,048 characters or fewer." }, { status: 400 });
    if (!isAllowedImageUrl(imageUrl)) return NextResponse.json({ error: "Use an http(s) image link or a path from this website." }, { status: 400 });
    if (body.category && !GALLERY_CATEGORIES.includes(body.category as (typeof GALLERY_CATEGORIES)[number])) {
      return NextResponse.json({ error: "Choose a valid picture category." }, { status: 400 });
    }
    if (body.displayOrder !== undefined && (!Number.isInteger(body.displayOrder) || body.displayOrder < 0)) {
      return NextResponse.json({ error: "Display position must be a whole number of 0 or more." }, { status: 400 });
    }

    const [currentOrder] = await db.select({ value: max(galleryImagesTable.displayOrder) }).from(galleryImagesTable);

    const [newImg] = await db
      .insert(galleryImagesTable)
      .values({
        id: randomUUID(),
        title,
        category: body.category || "Property",
        imageUrl,
        altText: typeof body.altText === "string" ? body.altText.trim().slice(0, 500) || title : title,
        caption: typeof body.caption === "string" ? body.caption.trim().slice(0, 500) : "",
        displayOrder: body.displayOrder ?? (currentOrder.value ?? 0) + 1,
      })
      .returning();

    await logAudit({
      action: "gallery.image_added", entity: "gallery", entityId: newImg.id,
      summary: `Gallery image added: ${newImg.title} (${newImg.category}).`,
      actor: "manager", ip: clientIp(request), metadata: { title: newImg.title, category: newImg.category, imageUrl: newImg.imageUrl },
    });

    revalidateLiveContent();

    return NextResponse.json({ image: newImg }, { status: 201 });
  } catch (error) {
    console.error("Failed to add image:", error);
    return NextResponse.json({ error: "Could not add image." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const denied = requireMotelManager(user);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      category?: string;
      imageUrl?: string;
      altText?: string;
      caption?: string;
      displayOrder?: number;
    };
    if (typeof body.id !== "string" || !body.id.trim()) return NextResponse.json({ error: "Picture ID is required." }, { status: 400 });

    const changes: Partial<typeof galleryImagesTable.$inferInsert> = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160) {
        return NextResponse.json({ error: "Enter a title of 1–160 characters." }, { status: 400 });
      }
      changes.title = body.title.trim();
    }
    if (body.category !== undefined) {
      if (!GALLERY_CATEGORIES.includes(body.category as (typeof GALLERY_CATEGORIES)[number])) {
        return NextResponse.json({ error: "Choose a valid picture category." }, { status: 400 });
      }
      changes.category = body.category;
    }
    if (body.imageUrl !== undefined) {
      if (typeof body.imageUrl !== "string" || !body.imageUrl.trim() || body.imageUrl.trim().length > 2048 || !isAllowedImageUrl(body.imageUrl.trim())) {
        return NextResponse.json({ error: "Enter a valid image URL." }, { status: 400 });
      }
      changes.imageUrl = body.imageUrl.trim();
    }
    if (body.altText !== undefined) {
      if (typeof body.altText !== "string" || body.altText.length > 500) {
        return NextResponse.json({ error: "Alt text must be 500 characters or fewer." }, { status: 400 });
      }
      changes.altText = body.altText.trim();
    }
    if (body.caption !== undefined) {
      if (typeof body.caption !== "string" || body.caption.length > 500) {
        return NextResponse.json({ error: "Caption must be 500 characters or fewer." }, { status: 400 });
      }
      changes.caption = body.caption.trim();
    }
    if (body.displayOrder !== undefined) {
      if (!Number.isInteger(body.displayOrder) || body.displayOrder < 0) {
        return NextResponse.json({ error: "Display position must be a whole number of 0 or more." }, { status: 400 });
      }
      changes.displayOrder = body.displayOrder;
    }
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "No picture changes were provided." }, { status: 400 });
    }

    const [image] = await db.update(galleryImagesTable)
      .set(changes)
      .where(eq(galleryImagesTable.id, body.id))
      .returning();
    if (!image) return NextResponse.json({ error: "Picture not found." }, { status: 404 });

    await logAudit({
      action: "gallery.image_updated",
      entity: "gallery",
      entityId: image.id,
      summary: `Gallery image updated: ${image.title} (${image.category}).`,
      actor: "manager",
      ip: clientIp(request),
      metadata: { changedFields: Object.keys(changes), title: image.title, category: image.category, displayOrder: image.displayOrder },
    });
    revalidateLiveContent();
    return NextResponse.json({ image });
  } catch (error) {
    console.error("Failed to update gallery image:", error);
    return NextResponse.json({ error: "Could not update picture." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const denied = requireMotelManager(user);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const ids = [...new Set(searchParams.getAll("id").map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Image ID is required." }, { status: 400 });
    }

    const removed = await db.delete(galleryImagesTable)
      .where(inArray(galleryImagesTable.id, ids))
      .returning({ id: galleryImagesTable.id, title: galleryImagesTable.title, category: galleryImagesTable.category });
    if (removed.length === 0) return NextResponse.json({ error: "No matching pictures were found." }, { status: 404 });

    for (const image of removed) {
      await logAudit({
        action: "gallery.image_removed", entity: "gallery", entityId: image.id,
        summary: `Gallery image removed: ${image.title} (${image.category}).`, actor: "manager", ip: clientIp(request),
      });
    }
    revalidateLiveContent();
    return NextResponse.json({ success: true, removed: removed.length, message: `${removed.length} picture${removed.length === 1 ? "" : "s"} removed from the gallery.` });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json({ error: "Could not delete image." }, { status: 500 });
  }
}
