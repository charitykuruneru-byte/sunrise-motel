/**
 * VERIFY THE SERVICE WORKER — what the worker claims, and what it may store.
 *
 * Answers one question with evidence rather than opinion: can the installed worker still hand a
 * guest a stale (or failed) availability answer, and can one bad response become permanent?
 *
 * No browser is needed. This loads the shipped `public/sw.js` exactly as the browser would, with
 * stubbed service-worker globals (`self`, `caches`, `fetch`), so the subject of the test is the
 * real worker rather than a copy of its rules:
 *   1. `/api/` is left to the browser — the worker must not call `respondWith()` for it (§12.1),
 *      because a cached availability answer is a wrong answer
 *   2. the shell, the navigations and the immutable assets are still claimed, so the PWA keeps
 *      working offline
 *   3. a non-OK, or opaque, response is never written to the cache
 *   4. the cache version is reported, so a rule change shows up as a fresh cache
 *
 * Usage:  node scripts/verify-service-worker.mjs [path/to/sw.js]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const FILE = process.argv[2] ?? path.join(process.cwd(), "public", "sw.js");
const src = readFileSync(FILE, "utf8");
const ORIGIN = "https://sunrise.test";

const handlers = {};
const stored = [];
let response = { ok: true, type: "basic", status: 200 };

const caches = {
  match: async () => undefined,
  open: async () => ({
    addAll: async () => {},
    put: async (request) => stored.push(request.url ?? String(request)),
  }),
  keys: async () => ["sunrise-motel-v1"],
  delete: async () => true,
};
const fetchStub = async () => ({ ...response, clone: () => ({ ...response }) });
const self = {
  location: { origin: ORIGIN },
  addEventListener: (type, fn) => { handlers[type] = fn; },
  skipWaiting: () => {},
  clients: { claim: async () => {} },
};

// The worker runs against these stubs instead of a browser's globals.
new Function("self", "caches", "fetch", src)(self, caches, fetchStub);

const request = (url, method = "GET", mode = "cors") => ({
  method,
  url: url.startsWith("http") ? url : `${ORIGIN}${url}`,
  mode,
});

/** Does the worker take this request over (`respondWith`), or step aside for it? */
function claims(req) {
  let responded = false;
  handlers.fetch({ request: req, respondWith: () => { responded = true; } });
  return responded;
}

/** How many cache entries a request leaves behind once its response has settled. */
async function storedBy(req, res) {
  await new Promise((r) => setTimeout(r, 20)); // drain anything an earlier case started
  response = res;
  stored.length = 0;
  let pending;
  handlers.fetch({ request: req, respondWith: (p) => { pending = p; } });
  await pending;
  await new Promise((r) => setTimeout(r, 5));
  return stored.length;
}

let failures = 0;
const check = (label, got, expected) => {
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(36)} got=${got} expected=${expected}`);
};

console.log("=== live data is left to the browser (must NOT be claimed) ===");
check("GET availability (the bug)", claims(request("/api/availability?checkIn=2026-10-01&checkOut=2026-10-03")), false);
check("GET posts feed", claims(request("/api/posts")), false);
check("GET admin gallery", claims(request("/api/admin/gallery")), false);
check("GET uploaded image", claims(request("/api/images/42")), false);
check("POST booking", claims(request("/api/bookings", "POST")), false);

console.log("=== shell + assets still served by the worker (must be claimed) ===");
check("navigate /", claims(request("/", "GET", "navigate")), true);
check("navigate /stay", claims(request("/stay", "GET", "navigate")), true);
check("immutable /_next asset", claims(request("/_next/static/chunks/main.js")), true);
check("manifest", claims(request("/manifest.json")), true);

console.log("=== left alone by design ===");
check("cross-origin request", claims(request("https://fonts.example/x")), false);

console.log("=== a failed or opaque response is never stored ===");
check("nav 500 -> entries stored", await storedBy(request("/", "GET", "navigate"), { ok: false, type: "basic", status: 500 }), 0);
check("nav opaque -> entries stored", await storedBy(request("/", "GET", "navigate"), { ok: true, type: "opaque", status: 0 }), 0);
check("nav 200 -> entries stored", await storedBy(request("/", "GET", "navigate"), { ok: true, type: "basic", status: 200 }), 1);
check("asset 503 -> entries stored", await storedBy(request("/_next/static/x.js"), { ok: false, type: "basic", status: 503 }), 0);
check("asset 200 -> entries stored", await storedBy(request("/_next/static/x.js"), { ok: true, type: "basic", status: 200 }), 1);

const version = src.match(/const CACHE = "([^"]+)"/)?.[1] ?? "(not found)";
console.log(`\ncache version: ${version}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);