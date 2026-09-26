// Minimal FCM sender using only the service-account JSON + fetch.
// No firebase-admin dependency: mints a Google OAuth2 access token (RS256 JWT)
// and calls the FCM HTTP v1 API directly.

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getAccessToken(serviceAccountJson: string) {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  if (!sa.client_email || !sa.private_key) throw new Error("Bad service account JSON");

  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Token mint failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access token returned");
  return data.access_token;
}

export async function sendToTopic(opts: {
  projectId: string;
  accessToken: string;
  topic: string;
  title: string;
  body: string;
  url: string;
  imageUrl?: string;
}) {
  const message: Record<string, unknown> = {
    topic: opts.topic,
    notification: { title: opts.title, body: opts.body },
    data: { url: opts.url },
    android: { priority: "high" },
  };
  if (opts.imageUrl) {
    (message.android as Record<string, unknown>).notification = { image: opts.imageUrl };
  }
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${opts.projectId}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FCM send failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { name?: string; successCount?: number };
  return json;
}
