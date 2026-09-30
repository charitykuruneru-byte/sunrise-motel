#!/usr/bin/env node
/**
 * CREATE OR RESET A PORTAL LOGIN.
 *
 * The site you log into in production reads **Neon**, while `npm run dev` reads
 * the local Postgres — so "the login works on my laptop but not on the website"
 * is almost always this. `--db both` writes to each.
 *
 *   node --no-warnings scripts/staff-login.mjs \
 *     --email you@example.com --password 'secret' --role super_admin --db both
 *
 * It reuses the app's OWN hashing (`src/lib/password.ts` → bcrypt cost 12), so the
 * password it writes verifies against `POST /api/admin/login` exactly like one
 * issued by an invitation.
 *
 * Flags
 *   --email     (required) the login address (matched case-insensitively)
 *   --password  (required) the password to set
 *   --name      display name (default: the part before @)
 *   --role      super_admin|admin|motel_manager|restaurant_manager|staff|auditor
 *               (default: keep the existing role, or `staff` for a new row)
 *   --db        local|neon|both   (default: both)
 *   --dry-run   report what would change and write nothing
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });

// Read the connection strings from .env ITSELF. `next dev` also prefers .env, and a
// shell that happens to export DATABASE_URL must never be able to redirect this
// script — that is exactly how "reset the live login" silently ends up touching
// only one database and lying about which one.
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const envValue = (key) =>
  (new RegExp(`^${key}=(.+)$`, "m").exec(envText)?.[1] ?? "").trim().replace(/^"|"$/g, "");

const { hashPassword } = await import("../src/lib/password.ts");

const arg = (name, fallback = "") => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? (process.argv[index + 1] ?? "").trim() : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const email = arg("email").toLowerCase();
const password = arg("password");
const role = arg("role");
const name = arg("name") || email.split("@")[0];
const target = arg("db", "both");
const dryRun = has("dry-run");

if (!email || !password) {
  console.error("Usage: node --no-warnings scripts/staff-login.mjs --email you@example.com --password 'secret' [--name 'Full Name'] [--role super_admin] [--db local|neon|both] [--dry-run]");
  process.exit(1);
}
const ROLES = ["super_admin", "admin", "motel_manager", "restaurant_manager", "staff", "auditor"];
if (role && !ROLES.includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
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

const { salt, hash } = await hashPassword(password);

async function nextStaffCode(client) {
  const { rows } = await client.query("select staff_code from staff");
  let max = 1;
  for (const row of rows) {
    const match = /^STF(\d+)$/.exec(String(row.staff_code ?? "").trim().toUpperCase());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `STF${String(max + 1).padStart(3, "0")}`;
}

async function apply(targetKey) {
  const { label, url } = TARGETS[targetKey];
  if (!url) {
    console.log(`SKIP  ${label} — no connection string in .env`);
    return false;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select id, staff_code, name, role, is_active, is_deleted from staff where lower(email) = $1 limit 1",
      [email],
    );
    const existing = rows[0];

    if (existing) {
      const nextRole = role || existing.role;
      console.log(`${dryRun ? "WOULD UPDATE" : "UPDATED"}  ${label}`);
      console.log(`   ${existing.staff_code} ${existing.name} — role ${existing.role} → ${nextRole}, password replaced, account re-activated`);
      if (!dryRun) {
        await client.query(
          "update staff set password_salt = $2, password_hash = $3, name = $4, role = $5, is_active = true, is_deleted = false, deleted_at = null where id = $1",
          [existing.id, salt, hash, name || existing.name, nextRole],
        );
      }
      return true;
    }

    const staffCode = await nextStaffCode(client);
    const nextRole = role || "staff";
    console.log(`${dryRun ? "WOULD CREATE" : "CREATED"}  ${label}`);
    console.log(`   ${staffCode} ${name} <${email}> — role ${nextRole}`);
    if (!dryRun) {
      await client.query(
        "insert into staff (id, staff_code, name, email, role, password_hash, password_salt, is_active, is_deleted) values ($1,$2,$3,$4,$5,$6,$7,true,false)",
        [randomUUID(), staffCode, name, email, nextRole, hash, salt],
      );
    }
    return true;
  } finally {
    await client.end();
  }
}

const keys = target === "both" ? ["local", "neon"] : [target];
let touched = 0;
for (const key of keys) {
  try {
    if (await apply(key)) touched += 1;
  } catch (error) {
    console.error(`FAILED  ${TARGETS[key].label}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
console.log(`\n${dryRun ? "Dry run — nothing written." : `Done — ${touched} database(s) updated.`} Sign in at /admin/login with ${email}.`);
