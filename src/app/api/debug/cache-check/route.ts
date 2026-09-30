import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date().toISOString();

  return NextResponse.json(
    {
      ok: true,
      timestamp: now,
      cache: "no-store",
      source: "debug-cache-check",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
