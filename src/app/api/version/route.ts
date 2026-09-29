import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * Public version truth for the Android wrappers.
 *
 * Two apps, two release lines, one endpoint:
 *   GET /api/version                  → the guest app  (public/version.json)
 *   GET /api/version?app=admin        → the manager app (public/version-admin.json)
 *   GET /api/version?app=guest        → explicit guest, same as no parameter
 *
 * Each app polls this on launch and prompts to update only when
 * latestVersionCode > the versionCode it was built with. Anything other than a
 * known app name falls back to the guest app, so an older build that called this
 * without a parameter keeps working exactly as before.
 */
const VERSION_FILES: Record<string, string> = {
  guest: "version.json",
  admin: "version-admin.json",
};

export async function GET(request: Request) {
  const requested = (new URL(request.url).searchParams.get("app") ?? "guest").trim().toLowerCase();
  const fileName = VERSION_FILES[requested] ?? VERSION_FILES.guest;
  try {
    const file = await fs.readFile(path.join(process.cwd(), "public", fileName), "utf8");
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        // Which release line answered — useful when reading logs after a release.
        "X-Sunrise-App": VERSION_FILES[requested] ? requested : "guest",
      },
    });
  } catch {
    return NextResponse.json({ error: `Version file missing (${fileName}).` }, { status: 500 });
  }
}
