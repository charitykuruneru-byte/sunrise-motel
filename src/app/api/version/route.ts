import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// Public version truth for the Android wrapper: old apps poll this on launch
// and prompt to update when latestVersionCode > installed versionCode.
export async function GET() {
  try {
    const file = await fs.readFile(path.join(process.cwd(), "public", "version.json"), "utf8");
    return new Response(file, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Version file missing." }, { status: 500 });
  }
}
