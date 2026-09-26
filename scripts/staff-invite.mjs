#!/usr/bin/env node
/**
 * staff-invite — create (or repair) a manager-portal login and email the details.
 *
 * The portal can already do this from Admin → Staff accounts (admin only). This
 * tool exists for the chicken-and-egg case: nobody can sign in yet, or the login
 * needs to be created in a specific database (local live DB vs Neon).
 *
 * It reuses the app's own code for the two things that must never drift:
 *   - password hashing/salts  -> src/lib/password.ts
 *   - the credential email     -> src/lib/mail.ts (sendMail + staffCredentialsHtml)
 *
 * Usage (from the project root):
 *   npm run staff:invite -- --name "Willard Kulemeka" --email willard@example.com --role admin
 *
 * Flags:
 *   --name    "Full name"            (required)
 *   --email   login@example.com      (required)
 *   --role    admin | staff          (default: staff, least privilege)
 *   --phone   +265...                (optional)
 *   --password "..."                 (optional, min 6 — otherwise one is generated)
 *   --db      local | neon | postgres://...   (default: local = DATABASE_URL in .env)
 *   --no-email                       create/reset without sending mail
 *   --dry-run                        show what would happen, change nothing
 */

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const SCRIPT_DIR = new URL(".", import.meta.url);

// Load .env from the project root regardless of the current working directory.
dotenv.config({ path: fileURLToPath(new URL("../.env", SCRIPT_DIR)), quiet: true });
dotenv.config({ quiet: true });

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return !next || next.startsWith("--") ? true : next;
}

function usage(message) {
  console.log(`\nstaff-invite${message ? ` — ${message}` : ""}\n`);
  console.log('  npm run staff:invite -- --name "Willard Kulemeka" --email willard@example.com --role admin');
  console.log("\n  Flags: --name --email --role admin|staff --phone --password --db local|neon|<url> --no-email --dry-run\n");
}

// Mirrors nextStaffCode() in src/lib/staff-auth.ts so codes stay in one sequence.
function nextStaffCode(existing) {
  let max = 1;
  for (const code of existing) {
    const m = /^STF(\d+)$/.exec(String(code ?? "").trim().toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `STF${String(max + 1).padStart(3, "0")}`;
}

function connectionStringFor(target) {
  if (target.includes("://")) return target;
  if (target === "local") return process.env.DATABASE_URL;
  if (target === "neon") return process.env.NEON_DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL;
  throw new Error(`Unknown --db value "${target}". Use local, neon, or a postgres:// URL.`);
}

// Never print the credentials inside the connection string, just where it points.
function describeDb(connectionString) {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparsable connection string)";
  }
}

async function main() {
  const name = typeof flag("name") === "string" ? flag("name").trim() : "";
  const email = typeof flag("email") === "string" ? flag("email").trim().toLowerCase() : "";
  const phone = typeof flag("phone") === "string" ? flag("phone").trim() : "";
  const role = flag("role") === "admin" ? "admin" : "staff";
  const typedPassword = typeof flag("password") === "string" ? flag("password") : "";
  const sendEmail = !flag("no-email");
  const dryRun = Boolean(flag("dry-run"));
  const dbTarget = typeof flag("db") === "string" ? flag("db") : "local";

  if (!name || !email) return usage("--name and --email are both required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return usage(`"${email}" is not a valid email address`);
  if (typedPassword && typedPassword.length < 6) return usage("--password must be at least 6 characters");

  // Reuse the app's password + mail code. Node 24 runs these .ts files directly.
  let passwordLib;
  let mailLib;
  try {
    passwordLib = await import(new URL("../src/lib/password.ts", SCRIPT_DIR).href);
    mailLib = await import(new URL("../src/lib/mail.ts", SCRIPT_DIR).href);
  } catch (err) {
    throw new Error(`Could not load the app's shared modules (${err.message}). Run this with Node 24 or newer.`);
  }
  const { hashPassword, verifyPassword, generatePassword } = passwordLib;
  const { sendMail, staffCredentialsHtml } = mailLib;

  const connectionString = connectionStringFor(dbTarget);
  if (!connectionString) {
    throw new Error(`No connection string for --db ${dbTarget}. Set DATABASE_URL (or NEON_DATABASE_URL) in .env.`);
  }
  const dbLabel = describeDb(connectionString);
  const password = typedPassword || generatePassword();

  console.log(`\nMoni — preparing a portal login on ${dbLabel}`);
  console.log(`  ${role === "admin" ? "Admin (full control)" : "Staff (bookings only)"} · ${name} <${email}>\n`);

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const table = await client.query(
      "select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'staff'",
    );
    if (table.rowCount === 0) {
      throw new Error(`No "staff" table in ${dbLabel}. Run "npx drizzle-kit migrate" against that database first.`);
    }


    const rows = (await client.query("select id, staff_code, email from staff")).rows;
    const found = rows.find((r) => String(r.email).toLowerCase() === email);
    const { salt, hash } = await hashPassword(password);
    const summary = `${name} (${email}) ${found ? "password reset" : "added"} as ${role} via scripts/staff-invite.mjs.`;

    let id;
    let staffCode;
    if (found) {
      id = found.id;
      staffCode = found.staff_code;
      if (dryRun) {
        console.log(`[dry-run] would reset the password for ${staffCode} — ${email}`);
      } else {
        await client.query(
          `update staff
              set name = $1, phone = coalesce(nullif($2, ''), phone), role = $3,
                  password_hash = $4, password_salt = $5, is_active = true
            where id = $6`,
          [name, phone, role, hash, salt, id],
        );
        console.log(`Password reset for existing account ${staffCode} — ${email}`);
      }
    } else {
      id = randomUUID();
      staffCode = nextStaffCode(rows.map((r) => r.staff_code));
      if (dryRun) {
        console.log(`[dry-run] would create ${staffCode} — ${email} as ${role}`);
      } else {
        await client.query(
          `insert into staff (id, staff_code, name, email, phone, role, password_hash, password_salt, is_active)
           values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [id, staffCode, name, email, phone || null, role, hash, salt],
        );
        console.log(`Created ${staffCode} — ${name} <${email}> as ${role}`);
      }
    }

    if (dryRun) {
      console.log("\n[dry-run] nothing was written and no email was sent.\n");
      return;
    }

    // Append-only record, same table the portal writes to.
    await client.query(
      `insert into audit_log (id, action, entity, entity_id, summary, actor, actor_label, metadata_json)
       values ($1, $2, 'staff', $3, $4, 'manager', $5, $6)`,
      [
        randomUUID(),
        found ? "staff.credentials_reset" : "staff.created",
        id,
        summary,
        "staff-invite CLI",
        JSON.stringify({ tool: "scripts/staff-invite.mjs", db: dbLabel, emailed: sendEmail }),
      ],
    );

    // Prove the stored row works with the app's own verifier before handing it over.
    const stored = (await client.query("select password_hash, password_salt from staff where id = $1", [id])).rows[0];
    const verified = await verifyPassword(password, stored.password_salt, stored.password_hash);
    console.log(verified ? "Password verified against the stored hash." : "WARNING: password does NOT verify — do not share it.");

    let mailLine = "Email skipped (--no-email).";
    if (sendEmail) {
      try {
        const result = await sendMail({
          to: email,
          subject: `${found ? "Your new" : "Your"} Sunrise Motel manager portal login`,
          html: staffCredentialsHtml({
            name,
            email,
            password,
            staffCode,
            role,
            createdBy: "the Sunrise Motel owner",
            reset: Boolean(found),
          }),
        });
        mailLine = result.sent ? `Login details emailed to ${email}.` : `Email NOT sent: ${result.reason}`;
      } catch (err) {
        mailLine = `Email NOT sent: ${err.message}`;
      }
    }

    const portal = (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const line = "-".repeat(64);
    console.log(`\n${line}`);
    console.log("  KEEP THIS — the password is not stored anywhere in plain text");
    console.log(line);
    console.log(`  Staff ID   ${staffCode}  (${role})`);
    console.log(`  Name       ${name}`);
    console.log(`  Email      ${email}`);
    console.log(`  Password   ${password}`);
    console.log(`  Sign in    ${portal ? `${portal}/admin` : "/admin"}`);
    console.log(`  Database   ${dbLabel}`);
    console.log(line);
    console.log(`  ${mailLine}\n`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\nstaff-invite failed: ${err.message}\n`);
  process.exitCode = 1;
});
