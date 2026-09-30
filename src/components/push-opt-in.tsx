"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * "GET ALERTS" — the one tap that turns on web push for THIS device.
 *
 * Browsers only allow the notification permission prompt from a user gesture, so
 * this is a button and not something that happens on load. It is also honest
 * about the states a real phone can be in: unsupported, blocked by the guest,
 * switched off, and on — and it disappears entirely when the server has no VAPID
 * keys, because offering an alert that cannot be sent would be a lie.
 */
type Status = "checking" | "unsupported" | "hidden" | "blocked" | "off" | "on" | "busy";

/** VAPID public keys travel base64url; PushManager wants the raw bytes. */
function toApplicationServerKey(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export default function PushOptIn({
  className = "",
  heading,
  intro,
}: {
  className?: string;
  heading?: string;
  /** Shown only when the opt-in is actually available — so a box never appears with no way to act. */
  intro?: string;
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supported =
        typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("blocked");
        return;
      }
      try {
        const config = (await (await fetch("/api/push/config", { cache: "no-store" })).json()) as { configured?: boolean };
        if (!config.configured) {
          if (!cancelled) setStatus("hidden");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setStatus("busy");
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const config = (await (await fetch("/api/push/config", { cache: "no-store" })).json()) as { publicKey?: string };
      if (!config.publicKey) {
        setStatus("hidden");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(config.publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("Could not save this device.");
      setStatus("on");
      setNote("Alerts on — new offers and rooms free tonight will reach this phone.");
    } catch (error) {
      setStatus("off");
      setNote(error instanceof Error ? error.message : "Could not switch alerts on.");
    }
  }, []);

  const disable = useCallback(async () => {
    setStatus("busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
      setNote("Alerts off for this device.");
    } catch {
      setStatus("off");
    }
  }, []);

  if (status === "checking" || status === "unsupported" || status === "hidden") return null;

  return (
    <section className={`push-opt-in ${className}`.trim()}>
      {/* The heading and the intro live INSIDE this component on purpose: when the
          server has no VAPID keys nothing renders at all, so no page can end up with
          a "How to get alerts" box that has no button under it. */}
      {heading && <p className="push-opt-in-heading">{heading}</p>}
      {intro && <p className="push-opt-in-intro">{intro}</p>}
      <div className="push-opt-in-row">
        <button
          type="button"
          className={`push-opt-in-btn ${status === "on" ? "is-on" : ""}`}
          onClick={status === "on" ? disable : enable}
          disabled={status === "busy" || status === "blocked"}
        >
          {status === "busy" ? <Loader2 size={14} className="animate-spin" /> : status === "on" ? <BellRing size={14} /> : status === "blocked" ? <BellOff size={14} /> : <Bell size={14} />}
          {status === "busy" ? "Working…" : status === "on" ? "Alerts on" : status === "blocked" ? "Alerts blocked" : "Get alerts"}
        </button>
        <span className="push-opt-in-note">
          {status === "blocked"
            ? "Notifications are blocked for this site — allow them in the browser's site settings, then reload."
            : note || "New offers and rooms free tonight, straight to this phone. Off by default — one tap to change."}
        </span>
      </div>
    </section>
  );
}
