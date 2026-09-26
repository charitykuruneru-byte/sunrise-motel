import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { uploadedImagesTable } from "@/db/schema";
import { readSession, sessionLabel, type SessionUser } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Postgres fallback store. Keeps admin uploads working on the tunnel / local dev,
 * and online whenever BLOB_READ_WRITE_TOKEN is missing (or a Blob call fails).
 * The bytes are served back by /api/images/[id] with long-lived cache headers.
 */
async function storeInDatabase(file: File, user: SessionUser, safe: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const filename = safe.slice(0, 140) || "image";
  await db.insert(uploadedImagesTable).values({
    id,
    filename,
    contentType: file.type,
    size: bytes.byteLength,
    data: bytes.toString("base64"),
    uploadedBy: sessionLabel(user).slice(0, 160),
  });
  return { id, filename };
}

// Admin image upload: file picker -> Vercel Blob (public CDN URL), falling back to
// Postgres when Blob is not configured. Managers pick from laptop/phone and always
// get a URL back — no URL typing.
export async function POST(request: Request) {
  const user = readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are allowed." }, { status: 415 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 5 MB. Please compress it first." }, { status: 413 });

    const safe = (file.name || "image").replace(/[^a-z0-9.-]+/gi, "-").toLowerCase().slice(0, 60) || "image";

    // Preferred: Vercel Blob.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(`sunrise/${Date.now()}-${safe}`, file, { access: "public" });
        return NextResponse.json({ url: blob.url, storage: "blob" }, { status: 201 });
      } catch (error) {
        console.error("Blob upload failed — storing in Postgres instead", error);
      }
    }

    // Fallback: keep the image in Postgres so the upload still succeeds.
    const stored = await storeInDatabase(file, user, safe);
    return NextResponse.json(
      { url: `/api/images/${stored.id}`, name: stored.filename, storage: "database" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json({ error: "Upload failed. Try a smaller image." }, { status: 500 });
  }
}
