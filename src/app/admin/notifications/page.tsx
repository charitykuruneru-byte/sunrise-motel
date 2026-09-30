"use client";

import { FormEvent, useState } from "react";
import ImageUploader from "@/components/ImageUploader";

type SendState = { tone: "idle" | "ok" | "warn" | "err"; text: string; count?: number };

// New admin page: broadcast a push notification to ALL installed apps
// via POST /api/admin/send-notification (FCM topic "all_users").
export default function NotificationsAdminPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/unwind");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [state, setState] = useState<SendState>({ tone: "idle", text: "" });

  // --- WEB PUSH (VAPID) ------------------------------------------------------
  // A different channel from the Firebase one above: it reaches browsers and the
  // installed web app, needs no Google account, and each device is one row in
  // `push_subscriptions`. The button proves delivery instead of assuming it.
  const [webPushBusy, setWebPushBusy] = useState(false);
  async function testWebPush() {
    setWebPushBusy(true);
    setState({ tone: "idle", text: "" });
    try {
      const res = await fetch("/api/admin/push-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Sunrise Motel",
          body: body.trim() || "Web alerts are working — this is a test from the manager portal.",
          url: url || "/",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        sent?: number;
        pruned?: number;
        failed?: number;
        devices?: number;
      };
      if (!res.ok) throw new Error(data.error || "Web push test failed.");
      if (data.reason) {
        setState({ tone: "warn", text: data.reason });
        return;
      }
      if (data.sent) {
        const extra = [data.pruned ? `${data.pruned} stale subscription${data.pruned === 1 ? "" : "s"} removed` : "", data.failed ? `${data.failed} failed` : ""]
          .filter(Boolean)
          .join(", ");
        setState({ tone: "ok", text: `Web push delivered to ${data.sent} device${data.sent === 1 ? "" : "s"}${extra ? ` (${extra})` : ""}.` });
      } else {
        setState({
          tone: "warn",
          text: `No device is subscribed yet (${data.devices ?? 0} stored). Open the site on a phone, tap "Get alerts", then press this button again.`,
        });
      }
    } catch (err) {
      setState({ tone: "err", text: err instanceof Error ? err.message : "Web push test failed." });
    } finally {
      setWebPushBusy(false);
    }
  }

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
        successCount?: number;
        failureCount?: number;
        detail?: string;
      };
      if (!res.ok) throw new Error(data.detail || data.error || "Send failed.");
      if (data.delivered) {
        const n = typeof data.successCount === "number" ? ` Sent to ${data.successCount} device${data.successCount === 1 ? "" : "s"}.` : " Sent to all app users.";
        setState({ tone: "ok", text: n, count: data.successCount });
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

  // Dry run: proves the Firebase key + project work WITHOUT notifying anyone.
  async function testConfig() {
    setTesting(true);
    setState({ tone: "idle", text: "" });
    try {
      const res = await fetch("/api/admin/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Configuration test", body: body.trim() || "Dry run - nobody is notified.", url, dryRun: true }),
      });
      const data = (await res.json().catch(function () { return {}; })) as {
        error?: string;
        detail?: string;
        delivered?: boolean;
        reason?: string;
        messageId?: string;
      };
      if (!res.ok) throw new Error(data.detail || data.error || "Test failed.");
      if (data.delivered) {
        setState({ tone: "ok", text: "Firebase is configured - key valid, topic reachable. No notification was sent." + (data.messageId ? " " + data.messageId : "") });
      } else {
        setState({ tone: "warn", text: data.reason || "Firebase not configured - no test possible yet." });
      }
    } catch (err) {
      setState({ tone: "err", text: err instanceof Error ? err.message : "Test failed." });
    } finally {
      setTesting(false);
    }
  }

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
            <label className="form-input-label"><span>Poster image</span>
              <ImageUploader currentImage={imageUrl || null} onUploadComplete={(u) => setImageUrl(u)} />
            </label>
          </div>
          {state.tone !== "idle" && (
            <div className="booking-error-banner" style={state.tone === "ok" ? { borderColor: "var(--sage)" } : undefined}>
              <span>{state.text}</span>
            </div>
          )}
          {/* Phone mockup preview — exactly how it looks in the status bar. */}
          {(title.trim() || body.trim()) && (
            <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 16, padding: 14, background: '#0d0c0b', color: '#fff' }}>
              <small style={{ fontSize: 10, letterSpacing: 2, opacity: 0.6 }}>PHONE PREVIEW</small>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'flex-start' }}>
                <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
                <div>
                  <strong style={{ fontSize: 14 }}>{title.trim() || "Title"}</strong>
                  <p style={{ fontSize: 13, opacity: 0.85, margin: '2px 0 0' }}>{body.trim() || "Message"}</p>
                  <small style={{ fontSize: 11, opacity: 0.6 }}>Sunrise Motel · now · opens {url || "/"}</small>
                </div>
              </div>
              {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', marginTop: 10, borderRadius: 8, maxHeight: 180, objectFit: 'cover' }} />}
            </div>
          )}
          <button type="button" className="admin-btn admin-btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={testConfig} disabled={busy || testing}>
            {testing ? "Testing..." : "Test configuration (no notification sent)"}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={testWebPush}
            disabled={busy || testing || webPushBusy}
          >
            {webPushBusy ? "Sending…" : "Send test web push (browsers & installed web app)"}
          </button>
          <button type="submit" className="btn-submit-booking-request" disabled={busy || testing || !title.trim() || !body.trim()}>
            {busy ? "Sending…" : "Send to All App Users"}
          </button>
        </form>
      </main>
    </div>
  );
}
