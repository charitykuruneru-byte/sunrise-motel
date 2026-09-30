// WEB PUSH (W3C Push API) — the notification channel that needs no Google
// account, no service-account JSON and no new app store release.
//
//   * the browser's own push service delivers the message (Chrome, Edge,
//     Firefox, and Safari 16.4+ once the site is on the home screen);
//   * we authenticate with a VAPID keypair we generated ourselves, which lives in
//     two env vars (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — nothing to paste from
//     a console;
//   * each device is one row in `push_subscriptions`.
//
// Firebase (src/lib/fcm.ts) is still the channel for the *installed Android app*.
// The two are independent: this one reaches the website, that one reaches the app.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptionsTable } from "@/db/schema";
import { randomUUID } from "node:crypto";

import { setting, settings } from "@/lib/settings";

export type PushMessage = {
  title: string;
  body: string;
  /** Where a tap should land — a path on this site. */
  url?: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
};

export type PushResult = {
  sent: number;
  pruned: number;
  failed: number;
  devices: number;
  reason?: string;
};

/** The VAPID keypair: env first, then the database (see src/lib/settings.ts). */
async function vapidKeys() {
  const values = await settings("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT");
  return {
    publicKey: values.VAPID_PUBLIC_KEY,
    privateKey: values.VAPID_PRIVATE_KEY,
    subject: values.VAPID_SUBJECT || "mailto:admin@sunrisemotel.mw",
  };
}

export async function webPushConfigured() {
  const keys = await vapidKeys();
  return Boolean(keys.publicKey && keys.privateKey);
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

type StoredSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

async function loadWebPush() {
  const keys = await vapidKeys();
  const mod = (await import("web-push")) as unknown as { default?: typeof import("web-push") } & typeof import("web-push");
  const webpush = mod.default ?? mod;
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return webpush;
}

/** Send one message to every subscribed device, pruning the ones that are gone. */
export async function sendWebPush(message: PushMessage): Promise<PushResult> {
  if (!(await webPushConfigured())) {
    return { sent: 0, pruned: 0, failed: 0, devices: 0, reason: "Web push is not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY." };
  }
  const webpush = await loadWebPush();
  const rows = await db.select().from(pushSubscriptionsTable);
  const payload = JSON.stringify({ ...message, url: message.url || "/" });

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  // Sequential on purpose: a burst of parallel pushes to one push service is how
  // a small motel gets rate-limited, and the list is short.
  for (const row of rows) {
    const subscription: StoredSubscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 });
      sent += 1;
      await db
        .update(pushSubscriptionsTable)
        .set({ lastSeenAt: new Date(), failureCount: 0 })
        .where(eq(pushSubscriptionsTable.id, row.id));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410) {
        // The device unsubscribed, was reset, or the subscription expired.
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, row.id));
        pruned += 1;
      } else {
        failed += 1;
        await db
          .update(pushSubscriptionsTable)
          .set({ failureCount: row.failureCount + 1 })
          .where(eq(pushSubscriptionsTable.id, row.id));
      }
    }
  }

  return { sent, pruned, failed, devices: rows.length };
}

/** Store (or refresh) one device. Same endpoint = same device, so it upserts. */
export async function saveSubscription(input: { endpoint: string; p256dh: string; auth: string; label?: string | null }) {
  const [row] = await db
    .insert(pushSubscriptionsTable)
    .values({
      id: randomUUID(),
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label: (input.label ?? "").slice(0, 120) || null,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { p256dh: input.p256dh, auth: input.auth, label: (input.label ?? "").slice(0, 120) || null, lastSeenAt: new Date(), failureCount: 0 },
    })
    .returning({ id: pushSubscriptionsTable.id });
  return row?.id ?? null;
}

export async function removeSubscription(endpoint: string) {
  const removed = await db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
    .returning({ id: pushSubscriptionsTable.id });
  return removed.length;
}

export async function countSubscriptions() {
  const rows = await db.select({ id: pushSubscriptionsTable.id }).from(pushSubscriptionsTable);
  return rows.length;
}
