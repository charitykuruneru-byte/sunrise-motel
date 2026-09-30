#!/usr/bin/env node
/**
 * PREVIEW LOGIN CHECK — do the two preview logins actually work, and are the
 * three views genuinely different?
 *
 * scripts/create-preview-accounts.mjs writes the rows and prints the passwords
 * once; this script proves the passwords open the doors they are supposed to
 * open — and, just as important, that they stay shut where they should.
 *
 * The point of a `staff` login is that it is NOT an admin login. A row in the
 * `staff` table is not evidence of that; the checks below are. Each one asks the
 * running site a question and compares the answer:
 *
 *   1. staff signs in at /api/admin/login            -> 200, role = staff (never admin)
 *   2. that session hits an admin-only API           -> 403 Admins only
 *   3. the same session opens /desk (the desk view)  -> 200
 *   4. the same session reads the desk API           -> 200
 *   5. guest signs in at /api/guest/auth             -> 200
 *   6. the guest session reads its own stay data     -> 200
 *   7. the guest session cannot touch staff APIs     -> 401/403
 *
 * The guest cookie is `Secure`, which is correct for production and fine in a
 * browser on localhost or https. Command-line HTTP clients refuse to replay a
 * Secure cookie over plain http, so check 6 sends the cookie value by hand: that
 * isolates "is the session real?" from "does this client honour Secure cookies?".
 *
 * Usage (the passwords are printed by create-preview-accounts.mjs and never stored):
 *   node --no-warnings scripts/verify-preview-logins.mjs --staff-pass <p> --guest-pass <p>
 *   npm run verify:preview -- --staff-pass <p> --guest-pass <p>
 *
 * Options:
 *   --base http://127.0.0.1:3000   the running site (default: PUBLIC_APP_URL in .env)
 *   --db local|neon|both|postgres://...   where to look for the preview rows (default: both)
 *
 * Read-only: it signs in, reads, and never writes a row. The sign-ins are visible
 * in audit_log, which is honest — a real sign-in happened.
 */
import "dotenv/config";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

// The default is the local site on purpose: PUBLIC_APP_URL in .env is a Cloudflare
// quick tunnel, and a quick tunnel gets a new hostname every restart, so an old one
// resolves to nothing. Pass --base https://... to test a public address.
const base = (arg("--base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const dbFlag = arg("--db") ?? "both";
const STAFF_EMAIL = "preview.desk@sunrisemotel.local";
const GUEST_EMAIL = "preview.guest@sunrisemotel.local";
const STAFF_PASSWORD = arg("--staff-pass") ?? process.env.PREVIEW_STAFF_PASSWORD;
const GUEST_PASSWORD = arg("--guest-pass") ?? process.env.PREVIEW_GUEST_PASSWORD;

if (!STAFF_PASSWORD || !GUEST_PASSWORD) {
  console.error("Missing passwords. Run create-preview-accounts.mjs first, then pass what it printed:");
  console.error("  npm run verify:preview -- --staff-pass <staff password> --guest-pass <guest password>");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} ${detail}`);
};

const jar = (response) => {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
};

async function main() {
  console.log(`\nChecking the two preview logins against ${base}\n`);

  // --- the staff login: an operational seat, not a manager -------------------
  const staffLogin = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  });
  const staffBody = await staffLogin.json().catch(() => ({}));
  const staffCookie = jar(staffLogin);
  check(
    "staff password signs in at /api/admin/login",
    staffLogin.status === 200 && staffBody?.success === true,
    `${staffLogin.status}${staffBody?.error ? ` ${staffBody.error}` : ""}`,
  );
  check(
    "the session is role=staff (not admin)",
    staffBody?.user?.role === "staff",
    `role=${staffBody?.user?.role} code=${staffBody?.user?.staffCode}`,
  );
  check("a staff cookie was issued", Boolean(staffCookie), staffCookie ? "sunrise_session set" : "no Set-Cookie");

  const withStaff = (path) => fetch(`${base}${path}`, { headers: { cookie: staffCookie }, redirect: "manual" });

  const adminOnly = await withStaff("/api/admin/staff");
  check(
    "staff is BLOCKED from admin-only /api/admin/staff",
    adminOnly.status === 403,
    `${adminOnly.status}${adminOnly.status === 403 ? " Admins only" : ""}`,
  );

  const deskPage = await withStaff("/desk");
  check("staff OPENS the desk view at /desk", deskPage.status === 200, `${deskPage.status}`);

  const deskApi = await withStaff("/api/desk/guests");
  check("staff READS the desk API /api/desk/guests", deskApi.status === 200, `${deskApi.status}`);

  // --- the guest login: their own stay data, nothing else --------------------
  const guestLogin = await fetch(`${base}/api/guest/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: GUEST_EMAIL, password: GUEST_PASSWORD, deviceLabel: "verify-preview-logins" }),
  });
  const guestBody = await guestLogin.json().catch(() => ({}));
  const guestCookie = jar(guestLogin);
  check(
    "guest password signs in at /api/guest/auth",
    guestLogin.status === 200 && guestBody?.success === true,
    `${guestLogin.status} ${guestBody?.guest?.guestName ?? guestBody?.error ?? ""}`,
  );
  check("a guest cookie was issued (Secure)", Boolean(guestCookie), guestCookie ? "sunrise_guest set" : "no Set-Cookie");

  const me = await fetch(`${base}/api/guest/me`, { headers: { cookie: guestCookie }, redirect: "manual" });
  const meBody = await me.json().catch(() => ({}));
  const stayCount = Array.isArray(meBody?.stays)
    ? meBody.stays.length
    : Array.isArray(meBody?.history)
      ? meBody.history.length
      : "n/a";
  check(
    "guest session reads its own data at /api/guest/me",
    me.status === 200,
    `${me.status} signedIn=${meBody?.signedIn ?? "?"} stays=${stayCount}`,
  );

  const guestOnStaffApi = await fetch(`${base}/api/admin/staff`, {
    headers: { cookie: guestCookie },
    redirect: "manual",
  });
  check(
    "guest is BLOCKED from the staff/admin APIs",
    guestOnStaffApi.status === 401 || guestOnStaffApi.status === 403,
    `${guestOnStaffApi.status}`,
  );

  // The same guest, signing in with the phone number instead of the email — the
  // second valid login name. Worth checking separately because the account row is
  // matched as an EXACT trimmed string (`src/lib/guest-auth.ts:315`), not through
  // `normalisePhone()`: a number stored as "+265 999 000 900" would sign in by
  // email but never by phone, and nothing else in the suite would notice.
  const guestPhone = arg("--guest-phone") ?? "+265999000900";
  const phoneLogin = await fetch(`${base}/api/guest/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: guestPhone, password: GUEST_PASSWORD, deviceLabel: "verify-preview-logins (phone)" }),
  });
  const phoneBody = await phoneLogin.json().catch(() => ({}));
  check(
    `guest signs in with the phone number (${guestPhone})`,
    phoneLogin.status === 200 && phoneBody?.success === true,
    `${phoneLogin.status}${phoneBody?.error ? ` ${phoneBody.error}` : ""}`,
  );

  // --- and the rows exist in the database(s) we think they do ---------------
  const targets = dbFlag === "both" ? ["local", "neon"] : [dbFlag];
  const { default: pg } = await import("pg");
  for (const target of targets) {
    const connectionString =
      target === "local"
        ? process.env.DATABASE_URL
        : target === "neon"
          ? process.env.NEON_DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL
          : target;
    if (!connectionString) continue;
    const client = new pg.Client({ connectionString });
    await client.connect();
    const staff = await client.query("select count(*)::int n from staff where staff_code = $1", ["STF900"]);
    const account = await client.query("select count(*)::int n from guest_accounts where lower(login_email) = lower($1)", [
      GUEST_EMAIL,
    ]);
    await client.end();
    const host = new URL(connectionString).hostname;
    check(
      `rows exist in ${target} (${host})`,
      staff.rows[0].n === 1 && account.rows[0].n === 1,
      `staff=${staff.rows[0].n} guest_accounts=${account.rows[0].n}`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  const summary = failed.length
    ? ` — FAILED: ${failed.map((f) => f.name).join("; ")}`
    : "";
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${summary}\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nCould not reach ${base}: ${error.message}`);
  console.error("Start the site first (npm run dev, or npm run build && npm start), or pass --base <url>.\n");
  process.exit(2);
});
