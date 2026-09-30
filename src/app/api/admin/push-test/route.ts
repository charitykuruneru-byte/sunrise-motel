import { NextResponse } from "next/server";
import { clientIp, logAudit } from "@/lib/audit";
import { isManagerRole, readSession } from "@/lib/staff-auth";
import { countSubscriptions, sendWebPush, webPushConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

/**
 * "SEND TEST PUSH" — proves web push works without waiting for a real event.
 *
 * Manager-only, and it reports exactly what happened: how many devices accepted
 * the message, how many were pruned because the browser said they are gone, and
 * how many failed. An unconfigured site says so plainly instead of pretending.
 */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { title?: string; body?: string; url?: string };
  const title = (body.title ?? "Sunrise Motel").trim() || "Sunrise Motel";
  const message = (body.body ?? "Web alerts are working — this is a test from the manager portal.").trim();
  const url = (body.url ?? "/").trim() || "/";

  const devices = await countSubscriptions();
  const result = await sendWebPush({ title, body: message, url, tag: "sunrise-test" });

  await logAudit({
    action: "push.test",
    entity: "push",
    summary: `Web push test: ${result.sent} delivered, ${result.pruned} pruned, ${result.failed} failed (${devices} device(s) stored).`,
    actor: "manager",
    actorLabel: `${user.staffCode} — ${user.name}`,
    ip: clientIp(request),
    metadata: { sent: result.sent, pruned: result.pruned, failed: result.failed, devices },
  });

  return NextResponse.json({ ...result, devices, configured: await webPushConfigured() });
}
