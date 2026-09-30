// LIVE VERIFICATION (temporary) — proves the addenda's server-side rules against a running server.
// Mints signed session cookies with the same HMAC scheme as src/lib/staff-auth.ts, then checks that
// each admin-only operation is 403 for staff, 401 without a session, and allowed for an admin.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.VERIFY_BASE ?? "http://127.0.0.1:3112";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const secret = env.SESSION_SECRET ?? env.ADMIN_PASSWORD ?? "sunrise-motel-local-dev-secret";
const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");
const cookieFor = (user) => {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `sunrise_session=${payload}.${sign(payload)}`;
};

const STAFF = cookieFor({ id: "v-staff", staffCode: "STF902", name: "Verify Staff", email: "v.staff@test", role: "staff" });
const ADMIN = cookieFor({ id: "v-admin", staffCode: "ADM902", name: "Verify Admin", email: "v.admin@test", role: "admin" });
const AUDITOR = cookieFor({ id: "v-auditor", staffCode: "AUD902", name: "Verify Auditor", email: "v.audit@test", role: "auditor" });
// The old forgeable format: base64url JSON with NO signature, claiming to be an admin.
const FORGED = "sunrise_session=" + Buffer.from(
  JSON.stringify({ id: "mallory", staffCode: "ADM000", name: "Mallory", email: "m@x", role: "admin" }),
  "utf8",
).toString("base64url");
const FORGED_SIG = FORGED + ".deadbeef";

let pass = 0;
let fail = 0;

async function call(label, { url, method = "GET", body, cookie, expect }) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const wanted = Array.isArray(expect) ? expect : [expect];
  const ok = wanted.includes(res.status);
  if (ok) pass += 1;
  else fail += 1;
  const text = await res.text().catch(() => "");
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(res.status).padEnd(3)} (want ${wanted.join("/")})  ${label}`);
  if (!ok) console.log(`      body: ${text.slice(0, 200)}`);
  return res;
}

function check(label, condition) {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`${condition ? "PASS" : "FAIL"}        ${label}`);
}

// Real ids to aim the money and stay routes at.
const listJson = await (await fetch(`${BASE}/api/desk/payments`, { headers: { cookie: ADMIN } })).json().catch(() => ({}));
const anyPayment = (listJson.queue ?? [])[0] ?? (listJson.ledger ?? [])[0] ?? null;
console.log(`(targets: payment=${anyPayment?.id?.slice(0, 8) ?? "none"})\n`);

console.log("--- sessions (the fix for Part A gap #2) ---");
await call("audit trail, no session", { url: "/api/admin/audit", expect: 401 });
await call("audit trail, forged unsigned cookie", { url: "/api/admin/audit", cookie: FORGED, expect: 401 });
await call("audit trail, forged bad signature", { url: "/api/admin/audit", cookie: FORGED_SIG, expect: 401 });
await call("audit trail, signed staff session (staff CAN read)", { url: "/api/admin/audit", cookie: STAFF, expect: 200 });
await call("audit trail, signed auditor session", { url: "/api/admin/audit", cookie: AUDITOR, expect: 200 });

console.log("--- Part 27 §B5 / §I: the previously unauthenticated admin routes ---");
await call("POST manual invoice, no session", { url: "/api/admin/invoices", method: "POST", expect: 401 });
await call("POST manual invoice, staff", { url: "/api/admin/invoices", method: "POST", cookie: STAFF, expect: 403 });
await call("GET invoices, no session", { url: "/api/admin/invoices", expect: 401 });
await call("POST legacy file upload, no session", { url: "/api/admin/upload", method: "POST", expect: 401 });

console.log("--- Part 29 §4.5 + staff Part 11: verify / reject a claimed payment ---");
if (anyPayment) {
  await call("POST payment verify, no session", { url: "/api/desk/payments", method: "POST", body: { action: "verify", paymentId: anyPayment.id }, expect: 401 });
  await call("POST payment verify, STAFF (admin only)", { url: "/api/desk/payments", method: "POST", cookie: STAFF, body: { action: "verify", paymentId: anyPayment.id }, expect: 403 });
  await call("POST payment reject, STAFF (admin only)", { url: "/api/desk/payments", method: "POST", cookie: STAFF, body: { action: "reject", paymentId: anyPayment.id, reason: "verify test" }, expect: 403 });
  // The admin passes the role gate; the date is then refused by validation (400), never by a 403.
  await call("POST payment verify, ADMIN passes the gate", { url: "/api/desk/payments", method: "POST", cookie: ADMIN, body: { action: "verify", paymentId: anyPayment.id }, expect: [200, 409] });
}
await call("POST cash at the desk, STAFF (allowed, reaches the handler)", { url: "/api/desk/payments", method: "POST", cookie: STAFF, body: { action: "record_cash", bookingId: "nonexistent", amount: 100 }, expect: 404 });

console.log("--- Part 6 / §C3-C5: manual charge, void, invoice regeneration ---");
await call("POST add_charge, STAFF (admin only)", { url: "/api/desk/folios", method: "POST", cookie: STAFF, body: { action: "add_charge", bookingId: "x", description: "t", unitPrice: 5000 }, expect: 403 });
await call("POST void_item, STAFF (admin only)", { url: "/api/desk/folios", method: "POST", cookie: STAFF, body: { action: "void_item", itemId: "x", reason: "t" }, expect: 403 });
await call("POST regenerate_invoice, STAFF (admin only)", { url: "/api/desk/folios", method: "POST", cookie: STAFF, body: { action: "regenerate_invoice", bookingId: "x" }, expect: 403 });
await call("GET folios, staff may READ every balance", { url: "/api/desk/folios", cookie: STAFF, expect: 200 });

console.log("--- Part 6 / §D3: extending a stay ---");
await call("POST extend stay, no session", { url: "/api/admin/bookings/extend", method: "POST", body: { id: "x", newCheckOut: "2030-01-01" }, expect: 401 });
await call("POST extend stay, STAFF (admin only)", { url: "/api/admin/bookings/extend", method: "POST", cookie: STAFF, body: { id: "x", newCheckOut: "2030-01-01" }, expect: 403 });
// An admin reaches the handler and gets "booking not found" — proof the role gate opened, and this
// deliberately uses a non-existent id so the live database is never mutated by the verification.
await call("POST extend stay, ADMIN passes the gate (no mutation)", { url: "/api/admin/bookings/extend", method: "POST", cookie: ADMIN, body: { id: "00000000-0000-0000-0000-000000000000", newCheckOut: "2030-01-01" }, expect: 404 });

console.log("--- staff Part 10.4-10.5: guest account status and marketing consent ---");
await call("POST set_status (disable), STAFF (admin only)", { url: "/api/desk/guests", method: "POST", cookie: STAFF, body: { action: "set_status", accountId: "x", status: "disabled" }, expect: 403 });
await call("POST set_consent, STAFF (admin only)", { url: "/api/desk/guests", method: "POST", cookie: STAFF, body: { action: "set_consent", accountId: "x", consent: true }, expect: 403 });
await call("GET guests, staff may READ the CRM", { url: "/api/desk/guests", cookie: STAFF, expect: 200 });

console.log("--- Part 29 §4.14: review moderation stays with the admin ---");
await call("POST review moderate, STAFF (admin only)", { url: "/api/desk/reviews", method: "POST", cookie: STAFF, body: { action: "moderate", reviewId: "x", isPublished: false }, expect: 403 });
await call("GET reviews, staff may READ", { url: "/api/desk/reviews", cookie: STAFF, expect: 200 });

console.log("--- auditor: read everything, change nothing ---");
await call("GET menu, AUDITOR may read", { url: "/api/desk/menu", cookie: AUDITOR, expect: 200 });
await call("POST sold-out toggle, AUDITOR is refused", { url: "/api/desk/menu", method: "POST", cookie: AUDITOR, body: { menuItemId: "menu-5", isAvailable: false }, expect: 403 });

console.log("--- staff Part 15.1: the sold-out toggle (staff ALLOWED) ---");
await call("GET menu, staff", { url: "/api/desk/menu", cookie: STAFF, expect: 200 });
await call("POST sold-out toggle, no session", { url: "/api/desk/menu", method: "POST", body: { menuItemId: "menu-5", isAvailable: false }, expect: 401 });
const menuJson = await (await fetch(`${BASE}/api/desk/menu`, { headers: { cookie: STAFF } })).json().catch(() => ({}));
const dish = (menuJson.items ?? []).find((i) => i.isAvailable) ?? (menuJson.items ?? [])[0];
if (dish) {
  const on = await call(`POST sold-out ON for "${dish.name}"`, { url: "/api/desk/menu", method: "POST", cookie: STAFF, body: { menuItemId: dish.id, isAvailable: false }, expect: 200 });
  const after = await (await fetch(`${BASE}/api/desk/menu`, { headers: { cookie: STAFF } })).json();
  const now = (after.items ?? []).find((i) => i.id === dish.id);
  check(`sold-out state persisted for "${now?.name}" (isAvailable=${now?.isAvailable})`, now?.isAvailable === false);
  const dineSoldOut = await (await fetch(`${BASE}/dine`)).text();
  check('/dine greets the guest with "Sold out today"', dineSoldOut.includes("Sold out today"));
  await call(`POST sold-out OFF for "${dish.name}"`, { url: "/api/desk/menu", method: "POST", cookie: STAFF, body: { menuItemId: dish.id, isAvailable: true }, expect: 200 });
  const dineBack = await (await fetch(`${BASE}/dine`)).text();
  check("/dine returns to normal once the dish is back on sale", !dineBack.includes("Sold out today"));
}

console.log("--- the menu the guest reads now comes from the database ---");
const dine = await (await fetch(`${BASE}/dine`)).text();
check('/dine renders the seeded dish "Area 5 Garden Crunch Salad" (absent from the old hard-coded array)', dine.includes("Area 5 Garden Crunch Salad"));

console.log("--- Part 29 §8.4 / §52: posts and gallery were 401-only, now admin-only ---");
// Before this fix a `staff` session could publish a post or delete a gallery image: both handlers
// checked only that *someone* was signed in. They now call requireAdmin, so every write is 403 for
// staff and auditors. These probes are all rejected, so they mutate nothing.
await call("POST post, no session", { url: "/api/admin/posts", method: "POST", body: { title: "x", detail: "y" }, expect: 401 });
await call("POST post, STAFF", { url: "/api/admin/posts", method: "POST", body: { title: "x", detail: "y" }, cookie: STAFF, expect: 403 });
await call("POST post, AUDITOR", { url: "/api/admin/posts", method: "POST", body: { title: "x", detail: "y" }, cookie: AUDITOR, expect: 403 });
await call("PATCH post (activate), STAFF", { url: "/api/admin/posts", method: "PATCH", body: { id: "post-1", isActive: false }, cookie: STAFF, expect: 403 });
await call("PATCH post (activate), no session", { url: "/api/admin/posts", method: "PATCH", body: { id: "post-1", isActive: false }, expect: 401 });
await call("DELETE post, STAFF", { url: "/api/admin/posts?id=post-1", method: "DELETE", cookie: STAFF, expect: 403 });
await call("DELETE post, no session", { url: "/api/admin/posts?id=post-1", method: "DELETE", expect: 401 });
await call("POST gallery image, no session", { url: "/api/admin/gallery", method: "POST", body: { title: "x", imageUrl: "y" }, expect: 401 });
await call("POST gallery image, STAFF", { url: "/api/admin/gallery", method: "POST", body: { title: "x", imageUrl: "y" }, cookie: STAFF, expect: 403 });
await call("POST gallery image, AUDITOR", { url: "/api/admin/gallery", method: "POST", body: { title: "x", imageUrl: "y" }, cookie: AUDITOR, expect: 403 });
await call("DELETE gallery image, STAFF", { url: "/api/admin/gallery?id=gal-1", method: "DELETE", cookie: STAFF, expect: 403 });
await call("DELETE gallery image, no session", { url: "/api/admin/gallery?id=gal-1", method: "DELETE", expect: 401 });
// Reading is still public content, so a guest page never breaks and a staff session can still load the tab.
// Reading is still public content, so a guest page never breaks and a staff session can still load the tab.
await call("GET posts, staff may READ", { url: "/api/admin/posts", cookie: STAFF, expect: 200 });
const postsJson = await (await fetch(`${BASE}/api/admin/posts`, { headers: { cookie: STAFF } })).json().catch(() => ({}));
check("GET posts still returns a posts array", Array.isArray(postsJson.posts));
await call("GET gallery, staff may READ", { url: "/api/admin/gallery", cookie: STAFF, expect: 200 });
const galJson = await (await fetch(`${BASE}/api/admin/gallery`, { headers: { cookie: STAFF } })).json().catch(() => ({}));
check("GET gallery still returns an images array", Array.isArray(galJson.images));

console.log("--- Part C §29.5 / §31: a dirty room cannot be handed to a guest ---");
// The guard sits before any write, so a refused assignment mutates nothing. We do flip one room's
// housekeeping state to "dirty" to provoke it, and put it back in a finally block.
const roomsJson = await (await fetch(`${BASE}/api/desk/rooms`, { headers: { cookie: ADMIN } })).json().catch(() => ({}));
const ovJson = await (await fetch(`${BASE}/api/desk/overview`, { headers: { cookie: ADMIN } })).json().catch(() => ({}));
const testRoom = (roomsJson.rooms ?? []).find((r) => r.state !== "occupied" && r.state !== "out_of_order");
// The dirty guard fires before the overlap check, so *any* booking that exists proves it. Prefer an
// unassigned arrival (the honest desk scenario) and fall back to any booking still on file.
const bookingsJson = await (await fetch(`${BASE}/api/admin/bookings`, { headers: { cookie: ADMIN } })).json().catch(() => ({}));
const allBookings = bookingsJson.bookings ?? [];
const testArrival =
  (ovJson.actionCentre?.unassignedArrivals?.list ?? [])[0] ??
  allBookings.find((b) => !["cancelled", "checked_out"].includes(b.status)) ??
  allBookings[0];
if (!testRoom || !testArrival) {
  console.log(`SKIP  no free room / unassigned arrival pair to test with (room=${testRoom?.roomNumber ?? "none"}, arrival=${testArrival?.reference ?? "none"})`);
} else {
  const originalState = testRoom.state;
  const setState = (state) =>
    fetch(`${BASE}/api/desk/rooms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: ADMIN },
      body: JSON.stringify({ roomId: testRoom.id, state }),
    });
  const readState = async () => {
    const j = await (await fetch(`${BASE}/api/desk/rooms`, { headers: { cookie: ADMIN } })).json().catch(() => ({}));
    return (j.rooms ?? []).find((r) => r.id === testRoom.id)?.state;
  };
  try {
    await setState("dirty");
    check(`Room ${testRoom.roomNumber} set to dirty for the test`, (await readState()) === "dirty");
    const refused = await fetch(`${BASE}/api/desk/rooms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: ADMIN },
      body: JSON.stringify({ roomId: testRoom.id, bookingId: testArrival.id }),
    });
    check(`assigning ${testArrival.reference} to dirty Room ${testRoom.roomNumber} is refused with 409`, refused.status === 409);
    const refusedBody = await refused.json().catch(() => ({}));
    check("the refusal explains the room needs cleaning first", /dirty/i.test(refusedBody.error ?? ""));
    await call("assigning a guest to a dirty room, no session", {
      url: "/api/desk/rooms", method: "PATCH", body: { roomId: testRoom.id, bookingId: testArrival.id }, expect: 401,
    });
    check(`Room ${testRoom.roomNumber} is still dirty — the refused assignment mutated nothing`, (await readState()) === "dirty");
  } finally {
    await setState(originalState);
    check(`Room ${testRoom.roomNumber} restored to "${originalState}"`, (await readState()) === originalState);
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);