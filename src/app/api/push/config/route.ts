import { NextResponse } from "next/server";
import { vapidPublicKey, webPushConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

/**
 * What a browser needs before it can subscribe: the PUBLIC half of the VAPID
 * keypair. The private half never leaves the server. If push is not configured
 * yet, `configured: false` lets the UI say so instead of failing silently.
 */
export async function GET() {
  return NextResponse.json({ configured: await webPushConfigured(), publicKey: await vapidPublicKey() });
}
