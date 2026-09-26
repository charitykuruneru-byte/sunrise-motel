"use client";

import { FormEvent, useState } from "react";

type SendState = { tone: "idle" | "ok" | "warn" | "err"; text: string };

// New admin page: broadcast a push notification to ALL installed apps
// via POST /api/admin/send-notification (FCM topic "all_users").
export default function NotificationsAdminPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/unwind");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SendState>({ tone: "idle", text: "" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setState({ tone: "idle", text: "" });
    try {
      const res = await fetch("/api/admin/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url, imageUrl: imageUrl || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        delivered?: boolean;
        reason?: string;
      };
      if (!res.ok) throw new Error(data.error || "Send failed.");
      if (data.delivered) {
        setState({ tone: "ok", text: "Sent to all app users." });
        setTitle("");
        setBody("");
      } else {
        setState({ tone: "warn", text: data.reason || "Firebase not configured — message was NOT sent. Add FIREBASE_SERVICE_ACCOUNT_JSON in Vercel env." });
      }
    } catch (err) {
      setState({ tone: "err", text: err instanceof Error ? err.message : "Send failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sunrise-app-root">
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> APP PUSH</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>Notify all app users.</h1>
        <p className="hero-description">
          Sends an instant status-bar notification to every installed app (even closed).
          Tapping it opens the app at the page you choose. You must be signed in as an admin.
        </p>
        <form onSubmit={submit} className="form-fields-group" style={{ marginTop: 20 }}>
          <label className="form-input-label"><span>Title *</span><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Saturday BBQ Party — Live DJ at 7PM" /></label>
          <label className="form-input-label"><span>Message *</span><textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3} placeholder="Don't miss it — braai, drinks and music on the lawn." /></label>
          <div className="form-grid-2">
            <label className="form-input-label"><span>Open page in app</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/unwind" /></label>
            <label className="form-input-label"><span>Image URL (optional)</span><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/poster.jpg" /></label>
          </div>
          {state.tone !== "idle" && (
            <div className="booking-error-banner" style={state.tone === "ok" ? { borderColor: "var(--sage)" } : undefined}>
              <span>{state.text}</span>
            </div>
          )}
          <button type="submit" className="btn-submit-booking-request" disabled={busy || !title.trim() || !body.trim()}>
            {busy ? "Sending…" : "Send to All App Users"}
          </button>
        </form>
      </main>
    </div>
  );
}
