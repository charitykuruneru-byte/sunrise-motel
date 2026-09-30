import { NextResponse } from "next/server";
import { clientIp, logAudit } from "@/lib/audit";
import { isManagerRole, readSession, sessionLabel } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

type Payload = {
  title?: string;
  body?: string;
  url?: string;
  imageUrl?: string;
  /** Validate the Firebase setup without sending anything to real phones. */
  dryRun?: boolean;
};

// Sends a broadcast push to ALL installed apps via FCM topic "all_users".
// Requires FIREBASE_SERVICE_ACCOUNT_JSON in env (the raw service-account JSON).
// If Firebase is not configured, returns { queued: true, delivered: false } so
// the admin UI stays honest instead of claiming a send.
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });

  let payload: Payload = {};
  try {
    payload = (await request.json()) as Payload;
  } catch {
    payload = {};
  }
  const title = (payload.title ?? "").trim();
  const body = (payload.body ?? "").trim();
  if (!title || !body) return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  const url = (payload.url ?? "/").trim() || "/";
  const imageUrl = (payload.imageUrl ?? "").trim();
  const dryRun = payload.dryRun === true;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    (() => {
      try {
        return (JSON.parse(serviceAccount ?? "{}") as { project_id?: string }).project_id ?? "";
      } catch {
        return "";
      }
    })();

  if (!serviceAccount || !projectId) {
    return NextResponse.json(
      {
        queued: true,
        delivered: false,
        reason: "Firebase not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON to Vercel env, then retry — the message was NOT sent.",
      },
      { status: 200 },
    );
  }

  try {
    const { getAccessToken, sendToTopic } = await import("@/lib/fcm");
    const token = await getAccessToken(serviceAccount);
    const result = await sendToTopic({
      projectId,
      accessToken: token,
      topic: "all_users",
      title,
      body,
      url,
      imageUrl,
      validateOnly: dryRun,
    });
    const successCount =
      typeof (result as { successCount?: unknown }).successCount === "number"
        ? ((result as { successCount?: number }).successCount as number)
        : undefined;
    const messageId = result.name ?? null;
    await logAudit({
      action: dryRun ? "NOTIFICATION_TESTED" : "NOTIFICATION_SENT",
      entity: "notification",
      entityId: messageId,
      summary: (dryRun ? "Firebase dry run OK (no notification sent): " : "Broadcast push sent to topic all_users: ") + JSON.stringify(title),
      actor: "manager",
      actorLabel: sessionLabel(user),
      ip: clientIp(request),
      metadata: { topic: "all_users", dryRun, messageId, successCount, url, imageUrl: imageUrl || null },
      details: { recipientCount: successCount ?? null, topic: "all_users", dryRun },
    });
    return NextResponse.json({ queued: true, delivered: true, dryRun, messageId, successCount });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("FCM send failed", err);
    await logAudit({
      action: "notification.failed",
      entity: "notification",
      summary: "Push send failed: " + detail.slice(0, 300),
      actor: "manager",
      actorLabel: sessionLabel(user),
      ip: clientIp(request),
      metadata: { topic: "all_users", dryRun },
    });
    return NextResponse.json(
      {
        error: dryRun ? "Firebase test failed. Check the key, project id and that the Cloud Messaging API is enabled." : "Push failed. Check Firebase keys and try again.",
        detail: detail.slice(0, 300),
        dryRun,
      },
      { status: 500 },
    );
  }
}
