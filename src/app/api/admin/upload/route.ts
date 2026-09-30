import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { clientIp, logAudit } from "@/lib/audit";
import { isManagerRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * LEGACY image path. The admin Pictures tab uses `POST /api/upload` instead, which stores in
 * Vercel Blob or in Postgres — anything written to `./uploads` here is wiped on every Vercel
 * deploy (Part 26 §2.6). It is kept only for local use, and is now admin-only: an anonymous
 * caller can no longer write files into the server.
 */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: "Only JPG, PNG, WEBP or GIF images are allowed." }, { status: 415 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 8 MB. Please compress it first." }, { status: 413 });

    const dir = path.join(process.cwd(), "uploads");
    await fs.mkdir(dir, { recursive: true });
    const base = (file.name || "image").replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase().slice(0, 40) || "image";
    const name = `${base}-${randomUUID().slice(0, 8)}${ext}`;
    await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

    await logAudit({
      action: "upload.stored", entity: "upload", entityId: name,
      summary: `Image uploaded: ${name} (${Math.round(file.size / 1024)} KB).`,
      actor: "manager", ip: clientIp(request), metadata: { size: file.size, type: file.type },
    });

    return NextResponse.json({ url: `/api/uploads/${name}`, name }, { status: 201 });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed. Try a smaller image." }, { status: 500 });
  }
}
