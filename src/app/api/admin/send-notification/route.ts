import { NextResponse } from "next/server";
import { readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

type Payload = {
  title?: string;
  body?: string;
  url?: string;
  imageUrl?: string;
};

// Sends a broadcast push to ALL installed apps via FCM topic "all_users".
// Requires FIREBASE_SERVICE_ACCOUNT_JSON in env (the raw service-account JSON).
// If Firebase is not configured, returns { queued: true, delivered: false } so
// the admin UI stays honest instead of claiming a send.
export async function POST(request: Request) {
  const user = readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

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
    const result = await sendToTopic({ projectId, accessToken: token, topic: "all_users", title, body, url, imageUrl });
    return NextResponse.json({ queued: true, delivered: true, messageId: result.name ?? null });
  } catch (err) {
    console.error("FCM send failed", err);
    return NextResponse.json({ error: "Push failed. Check Firebase keys and try again." }, { status: 500 });
  }
}
