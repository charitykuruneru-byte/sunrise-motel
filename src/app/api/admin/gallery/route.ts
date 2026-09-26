import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { galleryImagesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { seedDatabaseIfEmpty } from "@/db/seed";
import { asc, eq } from "drizzle-orm";

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
  try {
    const body = (await request.json()) as {
      title: string;
      category?: string;
      imageUrl: string;
      altText?: string;
      caption?: string;
    };

    if (!body.title || !body.imageUrl) {
      return NextResponse.json({ error: "Title and Image URL are required." }, { status: 400 });
    }

    const [newImg] = await db
      .insert(galleryImagesTable)
      .values({
        id: randomUUID(),
        title: body.title.trim(),
        category: body.category || "Property",
        imageUrl: body.imageUrl.trim(),
        altText: body.altText?.trim() || body.title.trim(),
        caption: body.caption?.trim() || "",
        displayOrder: 99,
      })
      .returning();

    await logAudit({
      action: "gallery.image_added", entity: "gallery", entityId: newImg.id,
      summary: `Gallery image added: ${newImg.title} (${newImg.category}).`,
      actor: "manager", ip: clientIp(request), metadata: { title: newImg.title, category: newImg.category, imageUrl: newImg.imageUrl },
    });

    return NextResponse.json({ image: newImg }, { status: 201 });
  } catch (error) {
    console.error("Failed to add image:", error);
    return NextResponse.json({ error: "Could not add image." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Image ID is required." }, { status: 400 });
    }

    await db.delete(galleryImagesTable).where(eq(galleryImagesTable.id, id));
    await logAudit({
      action: "gallery.image_removed", entity: "gallery", entityId: id,
      summary: `Gallery image removed (id ${id}).`, actor: "manager", ip: clientIp(request),
    });
    return NextResponse.json({ success: true, message: "Image removed from gallery." });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json({ error: "Could not delete image." }, { status: 500 });
  }
}
