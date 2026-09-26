import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploadedImagesTable } from "@/db/schema";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only ever echo back known-safe image types, never a stored string blindly.
const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Serves images stored by the Postgres upload fallback (see /api/upload).
 * Public on purpose: these URLs are embedded in the public gallery and blog.
 * Ids are immutable, so the response is cached hard at the CDN and in browsers.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  // Tolerate a trailing extension (/api/images/<id>.png) for nicer links.
  const key = (id ?? "").replace(/\.(?:jpe?g|png|webp|gif)$/i, "");
  if (!UUID.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const [row] = await db
      .select({
        contentType: uploadedImagesTable.contentType,
        data: uploadedImagesTable.data,
      })
      .from(uploadedImagesTable)
      .where(eq(uploadedImagesTable.id, key))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const bytes = Buffer.from(row.data, "base64");
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": SAFE_TYPES.has(row.contentType) ? row.contentType : "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Stored image fetch failed", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
