import { NextResponse } from "next/server";
import { saveSubscription, webPushConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/**
 * STORE A DEVICE. Called once, when a guest taps "Get alerts" and the browser
 * hands back its subscription. The same endpoint means the same device, so this
 * upserts rather than stacking duplicates every time the page is opened.
 *
 * The label is the browser's own User-Agent, so a human looking at the table can
 * tell "Chrome on Android" from "Safari on iPhone" without any extra input.
 */
export async function POST(request: Request) {
  if (!(await webPushConfigured())) {
    return NextResponse.json({ error: "Alerts are not switched on yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const endpoint = (body.endpoint ?? "").trim();
  const p256dh = (body.keys?.p256dh ?? "").trim();
  const auth = (body.keys?.auth ?? "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "That subscription is incomplete." }, { status: 400 });
  }
  const label = (request.headers.get("user-agent") ?? "").slice(0, 120);
  const id = await saveSubscription({ endpoint, p256dh, auth, label });
  return NextResponse.json({ ok: true, id });
}
