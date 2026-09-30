#!/usr/bin/env node
/**
 * PUSH LOCAL CONFIG INTO A DATABASE.
 *
 * `src/lib/settings.ts` reads the ENVIRONMENT first and these rows second, so this
 * never overrides a real env var — it fills the gap for a deployment whose
 * environment variables nobody can edit (no hosting dashboard, no CLI token).
 * That gap is why the live site had no mailbox and no web-push keys.
 *
 *   node --no-warnings scripts/set-remote-config.mjs --db both
 *   node --no-warnings scripts/set-remote-config.mjs --db neon --keys SMTP_USER,SMTP_PASS
 *
 * Values are read from .env. Empty values are SKIPPED (so a blank in .env can
 * never erase a setting that already works), and nothing secret is ever printed.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

/** The keys the app will look up in the database when env has nothing. */
const KNOWN_KEYS = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "FROM_NAME",
  "FROM_EMAIL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  // Not secrets, but the same problem: without these the live site cannot tell
  // anyone about a booking (see the notifyTargets block in /api/bookings).
  "ADMIN_EMAIL",
  "STAFF_NOTIFY_EMAILS",
];

const arg = (name, fallback = "") => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? (process.argv[index + 1] ?? "").trim() : fallback;
};

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const envValue = (key) => {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(envText);
  if (!match) return "";
  return match[1].trim().replace(/^"|"$/g, "").trim();
};

const target = arg("db", "both");
const wanted = (arg("keys") ? arg("keys").split(",") : KNOWN_KEYS).map((k) => k.trim()).filter(Boolean);
const unknown = wanted.filter((k) => !KNOWN_KEYS.includes(k));
if (unknown.length) {
  console.error(`These keys are never read from the database, so writing them would be a lie: ${unknown.join(", ")}`);
  process.exit(1);
}

const TARGETS = {
  local: { label: "local Postgres (npm run dev)", url: envValue("DATABASE_URL") },
  neon: { label: "Neon (the deployed website)", url: envValue("NEON_DATABASE_URL_UNPOOLED") || envValue("NEON_DATABASE_URL") },
};
if (target !== "both" && !TARGETS[target]) {
  console.error("--db must be local, neon or both");
  process.exit(1);
}

const values = wanted.map((key) => [key, envValue(key)]).filter(([, value]) => value !== "");
if (!values.length) {
  console.error("Nothing to write: those keys are empty (or absent) in .env.");
  process.exit(1);
}

console.log(`Writing ${values.length} setting(s) — ${values.map(([key]) => key).join(", ")}`);

async function apply(targetKey) {
  const { label, url } = TARGETS[targetKey];
  if (!url) {
    console.log(`SKIP   ${label} — no connection string in .env`);
    return 0;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const [key, value] of values) {
      await client.query(
        "insert into app_settings (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
        [key, value],
      );
      // Only the shape is printed: a length and where it came from, never the value.
      console.log(`  ${label.padEnd(32)} ${key.padEnd(18)} ${String(value).length} chars`);
    }
    return values.length;
  } finally {
    await client.end();
  }
}

const keys = target === "both" ? ["local", "neon"] : [target];
let total = 0;
for (const key of keys) {
  try {
    total += await apply(key);
  } catch (error) {
    console.error(`FAILED ${TARGETS[key].label}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
console.log(`\nDone — ${total} row(s) written. The app reads env first, these second.`);
