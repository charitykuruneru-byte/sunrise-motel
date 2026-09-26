import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The system source-code download was removed. This endpoint now returns 410
// (Gone) so old links/bookmarks fail closed instead of leaking the codebase.
export async function GET() {
  return NextResponse.json(
    { error: "System package downloads have been disabled by the manager." },
    { status: 410 },
  );
}

