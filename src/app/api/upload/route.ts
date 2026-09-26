import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

// Admin image upload: file picker -> Vercel Blob (public URL).
// No URL typing — managers pick from laptop/phone and get a URL back.
export async function POST(request: Request) {
  const user = readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are allowed." }, { status: 415 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 5 MB. Please compress it first." }, { status: 413 });

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Image storage is not connected. Add BLOB_READ_WRITE_TOKEN in Vercel env (Storage tab → Create Blob store), then redeploy." },
        { status: 500 },
      );
    }

    const safe = (file.name || "image").replace(/[^a-z0-9.-]+/gi, "-").toLowerCase().slice(0, 60) || "image";
    const blob = await put(`sunrise/${Date.now()}-${safe}`, file, { access: "public" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (error) {
    console.error("Blob upload failed", error);
    return NextResponse.json({ error: "Upload failed. Try a smaller image." }, { status: 500 });
  }
}
