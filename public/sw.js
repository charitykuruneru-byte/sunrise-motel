/* Sunrise Motel service worker — makes the site installable (PWA direct install).
 * Strategy: precache the app shell; navigations are network-first with cache
 * fallback so the installed icon always opens, even briefly offline.
 *
 * LIVE DATA IS NEVER CACHED. `/api/` is handed straight back to the browser,
 * because a cached availability answer is a wrong answer: it shows a room as
 * taken long after it is free again, and — since the query string is the cache
 * key — it survives every deploy. This is what made the landing page say
 * "Rooms are loading…" forever: one failed call had been stored, and was then
 * served back on every reload for those same dates. The version was bumped so
 * those stored answers are deleted the moment this worker activates. */

const CACHE = "sunrise-motel-v3";
const CORE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  // NO skipWaiting() here, on purpose. A freshly deployed worker WAITS until the
  // guest says so — that is what the "A newer version is ready" card is for.
  // Activating it immediately (`skipWaiting`) claims the page and fires
  // `controllerchange`, which reloads the page under the guest's hands mid-booking.
  // That reload was measured to land ~1.5 s after the deploy was noticed, and it
  // replaced the document before the update card could paint. The `SKIP_WAITING`
  // message below is what the card's "Update now" button sends.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// PUSH — a real notification in the phone's status bar, even with the site
// closed. The payload is JSON from our own API: { title, body, url, tag }.
// A push with nothing readable still shows something honest rather than nothing.
self.addEventListener("push", (event) => {
  let data = { title: "Sunrise Motel", body: "Something new is on at the motel.", url: "/", tag: "sunrise" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* keep the defaults — a malformed payload must not lose the alert */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping the notification lands on the page it is about: an already-open tab is
// reused and focused (so a guest does not end up with five Sunrise tabs), and if
// none is open the browser opens one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.navigate(target).then(() => client.focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Live data first: /api/ always reaches the server. Returning without calling
  // respondWith() hands the request back to the browser's own stack, so nothing
  // in this file can answer a question about tonight's rooms.
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: try network first, fall back to cached home shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only a good page is worth keeping: an error page stored as the shell
          // would be handed to the next offline visitor as if it were the site.
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets: cache first, then network.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          // Same rule for assets: one failed fetch must not turn into a
          // permanently broken image or stylesheet.
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
