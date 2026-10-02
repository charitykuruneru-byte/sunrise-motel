"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight, BellRing, CheckCircle2, History, RotateCcw, Send, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import { AdminPageFrame } from "@/components/admin/admin-navigation";

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
  const [broadcastSent, setBroadcastSent] = useState(false);

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

  // The "rooms free tonight" digest — the one message the site sends on its own.
  // Vercel calls the same endpoint daily (see crons in vercel.json); this button is
  // how a manager checks it in daylight instead of waiting for 16:00 and hoping.
  const [digestBusy, setDigestBusy] = useState(false);
  async function sendDigest() {
    setDigestBusy(true);
    setState({ tone: "idle", text: "" });
    try {
      const res = await fetch("/api/cron/availability-digest?force=1");
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        sent?: boolean;
        delivered?: number;
        devices?: number;
        freeTonight?: number;
      };
      if (!res.ok) throw new Error(data.error || "Digest failed.");
      if (data.reason) {
        setState({ tone: "warn", text: data.reason });
      } else {
        setState({
          tone: data.delivered ? "ok" : "warn",
          text: `Digest sent to ${data.delivered ?? 0} of ${data.devices ?? 0} subscribed device(s) — ${data.freeTonight ?? 0} room(s) free tonight.`,
        });
      }
    } catch (err) {
      setState({ tone: "err", text: err instanceof Error ? err.message : "Digest failed." });
    } finally {
      setDigestBusy(false);
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBroadcastSent(false);
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
        setBroadcastSent(true);
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
    <AdminPageFrame>
    <div className="sunrise-app-root">
      <style jsx global>{`
        .notification-page main.notification-main { max-width: 1320px; }
        .notification-hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-bottom: 22px; }
        .notification-hero-copy { max-width: 760px; }
        .notification-hero h1 { margin: 9px 0 8px; color: var(--ink); font: 600 clamp(34px, 3.5vw, 48px)/1.08 var(--serif); letter-spacing: -.035em; }
        .notification-hero p { color: var(--muted); font-size: 14px; line-height: 1.7; }
        .notification-status-pill { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid rgba(82,106,87,.2); border-radius: 999px; background: var(--sage-light); color: var(--sage); font-size: 12px; font-weight: 700; }
        .notification-layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); align-items: start; gap: 18px; }
        .notification-compose, .notification-side-card { min-width: 0; padding: 22px; border: 1px solid rgba(23,21,19,.09); border-radius: 18px; background: rgba(255,255,255,.84); box-shadow: 0 8px 30px rgba(23,21,19,.035); }
        .notification-section-title { margin-bottom: 16px; color: var(--ink); font-size: 15px; font-weight: 750; }
        .notification-compose > .form-input-label { display: grid; width: 100%; gap: 7px; margin-bottom: 16px; }
        .notification-compose .notification-field-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink); font-size: 12px; font-weight: 700; }
        .notification-compose .notification-field-count { display: inline-block; flex: 0 0 auto; margin-left: auto; color: var(--muted); font-size: 10px; font-weight: 500; white-space: nowrap; }
        .notification-field-hint { margin-top: -2px; color: var(--muted); font-size: 11px; line-height: 1.45; }
        .notification-compose .form-input-label input,
        .notification-compose .form-input-label textarea { display: block; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; border: 1px solid rgba(23,21,19,.13); border-radius: 12px; background: #fff; color: var(--ink); font-size: 14px; line-height: 1.5; padding: 12px 14px; outline: none; transition: border-color .16s, box-shadow .16s; }
        .notification-compose .form-input-label input { min-height: 46px; }
        .notification-compose textarea { min-height: 132px; resize: vertical; }
        .notification-compose .form-input-label input:focus,
        .notification-compose .form-input-label textarea:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(242,140,24,.14); }
        .notification-compose .form-input-label input::placeholder,
        .notification-compose .form-input-label textarea::placeholder { color: #a59a90; }
        .notification-compose > .form-grid-2 { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); align-items: start; gap: 16px; margin-top: 2px; }
        .notification-compose .notification-image-field { display: grid; min-width: 0; width: 100%; gap: 7px; }
        .notification-compose .notification-image-field > div { min-width: 0; padding: 8px !important; border: 1px solid rgba(23,21,19,.1) !important; border-radius: 14px !important; background: #fff; }
        .notification-compose .notification-image-field > div > div { display: grid; min-height: 108px; place-content: center; padding: 16px !important; border: 1px dashed rgba(23,21,19,.18) !important; border-radius: 10px !important; background: #fbf9f6; line-height: 1.5; }
        .notification-compose .notification-image-field img { border-radius: 10px !important; }
        .notification-compose .notification-image-field > div > div strong { display: block; margin-top: 3px; color: var(--orange-deep); }
        .notification-preview { margin-bottom: 18px; padding: 17px; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; background: linear-gradient(145deg, #211c18, #0d0c0b); color: #fff; box-shadow: 0 12px 28px rgba(13,12,11,.14); }
        .notification-preview-label { color: rgba(255,255,255,.6); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
        .notification-preview-content { display: flex; align-items: flex-start; gap: 11px; margin-top: 11px; }
        .notification-preview-content > img { width: 42px; height: 42px; flex: 0 0 auto; border-radius: 11px; object-fit: cover; }
        .notification-preview-copy { min-width: 0; overflow-wrap: anywhere; }
        .notification-preview-copy strong { font-size: 14px; line-height: 1.4; }
        .notification-preview-copy p { margin-top: 4px; color: rgba(255,255,255,.84); font-size: 13px; line-height: 1.5; }
        .notification-preview-copy small { display: block; margin-top: 7px; color: rgba(255,255,255,.58); font-size: 11px; }
        .notification-preview-image { width: 100%; max-height: 190px; margin-top: 12px; border-radius: 10px; object-fit: cover; }
        .notification-tool-list { display: grid; gap: 9px; }
        .notification-tool { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 13px; border: 1px solid rgba(23,21,19,.09); border-radius: 14px; background: #fff; color: var(--ink); text-align: left; transition: border-color .16s, transform .16s, box-shadow .16s; }
        .notification-tool:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(242,140,24,.45); box-shadow: 0 5px 16px rgba(23,21,19,.06); }
        .notification-tool:disabled { cursor: wait; opacity: .65; }
        .notification-tool-icon { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 11px; background: var(--orange-light); color: var(--orange-deep); }
        .notification-tool-copy { display: grid; gap: 3px; }
        .notification-tool-copy strong { font-size: 12px; }
        .notification-tool-copy small { color: var(--muted); font-size: 11px; line-height: 1.45; }
        .notification-helper { margin-top: 12px; padding: 12px 13px; border-radius: 12px; background: #f8f5f0; color: var(--muted); font-size: 11px; line-height: 1.55; }
        .notification-send-button { width: 100%; min-height: 48px; justify-content: center; margin-top: 14px; border-radius: 999px; font-weight: 750; }
        .notification-result { display: flex; align-items: flex-start; gap: 10px; padding: 13px; border: 1px solid rgba(23,21,19,.1); border-radius: 13px; background: #fbf9f6; color: var(--ink); font-size: 13px; line-height: 1.5; }
        .notification-result[data-tone="ok"] { border-color: rgba(82,106,87,.25); background: var(--sage-light); color: #304a36; }
        .notification-result[data-tone="warn"] { border-color: rgba(178,106,0,.22); background: #fff6e7; color: #774800; }
        .notification-result[data-tone="err"] { border-color: rgba(179,38,30,.22); background: #fcebea; color: #84251f; }
        .notification-follow-up { margin-top: 14px; padding: 16px; border: 1px solid rgba(82,106,87,.22); border-radius: 16px; background: linear-gradient(145deg, #f2f7f2, #fff); }
        .notification-follow-up h3 { display: flex; align-items: center; gap: 8px; color: #304a36; font-size: 14px; }
        .notification-follow-up p { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
        .notification-follow-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .notification-follow-actions .btn-action { border-radius: 999px; }
        .notification-compose-actions { display: grid; gap: 9px; margin-top: 16px; }
        .notification-compose-actions .admin-btn { width: 100%; justify-content: center; }
        .notification-send-button:disabled { cursor: not-allowed; opacity: .56; box-shadow: none; }
        @media (max-width: 920px) { .notification-layout { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 760px) {
          .notification-hero { align-items: flex-start; flex-direction: column; gap: 12px; }
          .notification-compose, .notification-side-card { padding: 17px; }
          .notification-compose > .form-grid-2 { grid-template-columns: minmax(0, 1fr); gap: 14px; }
          .notification-compose textarea { min-height: 120px; }
          .notification-compose .notification-image-field > div > div { min-height: 92px; }
        }
        @media (max-width: 380px) {
          .notification-compose, .notification-side-card { padding: 14px; }
          .notification-compose .notification-field-heading { font-size: 11px; }
          .notification-compose .form-input-label input,
          .notification-compose .form-input-label textarea { font-size: 13px; }
        }
      `}</style>
      <main className="notification-main">
        <section className="notification-hero">
          <div className="notification-hero-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> APP PUSH</span>
            <h1>Notify all app users.</h1>
            <p>Compose a clear update, preview it as a phone notification, then send it to installed Sunrise Motel apps.</p>
          </div>
          <span className="notification-status-pill"><ShieldCheck size={15} /> Manager-only broadcast</span>
        </section>
        <div className="notification-layout">
        <form onSubmit={submit} className="notification-compose">
          <div className="notification-section-title">Compose broadcast</div>
          <label className="form-input-label">
            <span className="notification-field-heading">Title <span className="notification-field-count">{title.length}/80</span></span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="Saturday BBQ Party — Live DJ at 7PM" />
          </label>
          <label className="form-input-label">
            <span className="notification-field-heading">Message <span className="notification-field-count">{body.length}/240</span></span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={240} rows={4} placeholder="Don't miss it — braai, drinks and music on the lawn." />
            <small className="notification-field-hint">Keep it short and useful. Guests will see this in their notification tray.</small>
          </label>
          <div className="form-grid-2">
            <label className="form-input-label">
              <span className="notification-field-heading">Open page in app</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/unwind" />
              <small className="notification-field-hint">Where a guest lands after tapping.</small>
            </label>
            <label className="form-input-label notification-image-field"><span className="notification-field-heading">Poster image <span className="notification-field-count">Optional</span></span>
              <ImageUploader currentImage={imageUrl || null} onUploadComplete={(u) => setImageUrl(u)} />
            </label>
          </div>
          {state.tone !== "idle" && (
            <div className="notification-result" role={state.tone === "err" ? "alert" : "status"} data-tone={state.tone}>
              {state.tone === "ok" ? <CheckCircle2 size={17} /> : state.tone === "err" ? <ShieldCheck size={17} /> : <BellRing size={17} />}
              <span>{state.text}</span>
            </div>
          )}
          {broadcastSent && (
            <section className="notification-follow-up" aria-live="polite">
              <h3><CheckCircle2 size={17} /> Broadcast sent</h3>
              <p>{typeof state.count === "number" ? `${state.count} device${state.count === 1 ? "" : "s"} reported success.` : "The broadcast was accepted for delivery."} Choose a follow-up action.</p>
              <div className="notification-follow-actions">
                <a className="btn-action" href="/admin/audit-logs"><History size={14} /> Review audit trail <ArrowUpRight size={13} /></a>
                <button className="btn-action" type="button" onClick={() => { setTitle(""); setBody(""); setImageUrl(""); setState({ tone: "idle", text: "" }); setBroadcastSent(false); }}><RotateCcw size={14} /> Compose another</button>
              </div>
            </section>
          )}
          <button type="submit" className="admin-btn admin-btn-primary notification-send-button" disabled={busy || testing || !title.trim() || !body.trim()}>
            <Send size={15} /> {busy ? "Sending broadcast…" : "Send to All App Users"}
          </button>
        </form>
        <aside className="notification-side-card">
          <div className="notification-section-title">Preview &amp; delivery tools</div>
          <div className="notification-preview">
            <div className="notification-preview-label">PHONE PREVIEW · SUNRISE MOTEL</div>
            <div className="notification-preview-content">
              <img src="/icon-192.png" alt="" width={42} height={42} />
              <div className="notification-preview-copy">
                <strong>{title.trim() || "Your notification title"}</strong>
                <p>{body.trim() || "Your message will appear here, just as guests receive it."}</p>
                <small>now · opens {url || "/"}</small>
              </div>
            </div>
            {imageUrl && <img className="notification-preview-image" src={imageUrl} alt="Notification poster preview" />}
          </div>
          <div className="notification-tool-list">
            <button type="button" className="notification-tool" onClick={testConfig} disabled={busy || testing}>
              <span className="notification-tool-icon"><ShieldCheck size={16} /></span>
              <span className="notification-tool-copy"><strong>{testing ? "Checking configuration…" : "Check Firebase configuration"}</strong><small>Validate the topic and credentials without notifying anyone.</small></span>
            </button>
            <button type="button" className="notification-tool" onClick={testWebPush} disabled={busy || testing || webPushBusy}>
              <span className="notification-tool-icon"><Smartphone size={16} /></span>
              <span className="notification-tool-copy"><strong>{webPushBusy ? "Sending web push test…" : "Send web push test"}</strong><small>Send a delivery test to subscribed browsers and installed web apps.</small></span>
            </button>
            <button type="button" className="notification-tool" onClick={sendDigest} disabled={busy || testing || digestBusy}>
              <span className="notification-tool-icon"><Sparkles size={16} /></span>
              <span className="notification-tool-copy"><strong>{digestBusy ? "Sending availability alert…" : "Send tonight’s availability alert"}</strong><small>Notify subscribers about rooms available tonight.</small></span>
            </button>
          </div>
          <p className="notification-helper">The availability alert normally runs at 16:00 Malawi time when availability changes. Sending it here runs it manually. Publishing an activity post can also alert subscribers automatically.</p>
        </aside>
        </div>
      </main>
    </div>
    </AdminPageFrame>
  );
}
