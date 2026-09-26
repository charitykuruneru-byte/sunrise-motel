import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const safe = path.basename(file);
  const ext = path.extname(safe).toLowerCase();
  const type = TYPES[ext];
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const data = await fs.readFile(path.join(process.cwd(), "uploads", safe));
    return new Response(data, { status: 200, headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
