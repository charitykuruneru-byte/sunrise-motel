import { NextResponse } from "next/server";
import { removeSubscription } from "@/lib/web-push";

export const dynamic = "force-dynamic";

/** FORGET A DEVICE — the "turn alerts off" half of the opt-in. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = (body.endpoint ?? "").trim();
  if (!endpoint) return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  const removed = await removeSubscription(endpoint);
  return NextResponse.json({ ok: true, removed });
}
