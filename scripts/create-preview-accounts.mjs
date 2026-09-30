#!/usr/bin/env node
/**
 * PREVIEW ACCOUNTS — one look at every side of the system before a release.
 *
 * The owner needs to see what a GUEST sees, what a STAFF (front desk) member sees
 * and what an ADMIN sees, using the live database and the live site. Two of those
 * three logins did not exist:
 *
 *   - `staff` holds only role=admin rows (STF002, STF003), so the restricted
 *     front-desk view had no account to sign in with.
 *   - `guest_accounts` was empty, so no guest could sign in to see a stay.
 *
 * This script creates exactly two clearly-labelled rows and nothing else:
 *
 *   STF900  "Preview Front Desk"  role=staff   -> sign in at /admin, works /desk
 *   guest   "Preview Guest"       guest_accounts active -> sign in at /app
 *
 * It reuses the app's own primitives (`src/lib/password.ts` through Node's own
 * TypeScript support) so the hash format cannot drift from what the login routes
 * verify against — the same discipline as scripts/verify-guest-identity.mjs.
 *
 * It never touches real rows: it does not edit bookings, guests or staff that
 * already exist, and it never links itself to a real stay. `--delete` removes the
 * two preview rows it created (matched on their reserved preview addresses).
 *
 * Usage (from the project root):
 *   node --no-warnings scripts/create-preview-accounts.mjs            # create / reset
 *   node --no-warnings scripts/create-preview-accounts.mjs --delete   # remove again
 *   node --no-warnings scripts/create-preview-accounts.mjs --dry-run  # show, change nothing
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { generatePassword, hashPassword } from "../src/lib/password.ts";

const STAFF_CODE = "STF900";
const STAFF_EMAIL = "preview.desk@sunrisemotel.local";
const STAFF_NAME = "Preview Front Desk";
const GUEST_EMAIL = "preview.guest@sunrisemotel.local";
const GUEST_NAME = "Preview Guest";
const GUEST_PHONE = "+265999000900"; // canonical +265 form (src/lib/phone.ts), reserved for previews
const MARK = "preview-account"; // written to signup_source / notes so it is obvious

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const remove = args.has("--delete");
const dbFlag = (() => {
  const i = process.argv.indexOf("--db");
  return i === -1 ? "both" : process.argv[i + 1];
})();

/**
 * Which database to write to — the same `--db` convention as scripts/staff-invite.mjs.
 *
 * `both` is the default on purpose, because this project has two worlds: the site
 * you browse on this laptop reads DATABASE_URL (a local Postgres, sunrise_db) while
 * the deployed site reads NEON_DATABASE_URL. A preview login therefore has to exist
 * in both to be usable from the desk laptop and from a phone against production.
 */
function connectionStringFor(target) {
  if (target === "local") return process.env.DATABASE_URL;
  if (target === "neon") return process.env.NEON_DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL;
  return target; // a postgres:// URL
}

const targets = dbFlag === "both" ? ["local", "neon"] : [dbFlag];

const { default: pg } = await import("pg");
// No `ssl` option is forced: the connection string decides (Neon URLs carry
// ?sslmode=require). Exactly how scripts/verify-guest-identity.mjs connects.

const say = (label, value) => console.log(`      ${String(label).padEnd(30)} ${value}`);

// Generated ONCE so the same password works in every database we write to.
const staffPassword = generatePassword();
const guestPassword = generatePassword();

async function run(target) {
  const connectionString = connectionStringFor(target);
  if (!connectionString) {
    console.log(`SKIP ${target}: no connection string in .env`);
    return;
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  const where = new URL(connectionString);
  console.log(`\n=== ${target}: ${where.hostname}/${where.pathname.slice(1)} ===`);
  try {
    if (remove) {
      // Nothing in the schema has a foreign key pointing at guests or guest_accounts
      // (checked with pg_constraint), so the order below is tidiness rather than
      // necessity: the preview's device sessions are cleared explicitly instead of
      // being left pointing at an account that no longer exists.
      const staff = await client.query("delete from staff where staff_code = $1 or email = $2 returning staff_code", [
        STAFF_CODE,
        STAFF_EMAIL,
      ]);
      const sessions = await client.query(
        `delete from guest_sessions
          where account_id in (select id from guest_accounts where login_email = $1 or login_phone = $2)
          returning id`,
        [GUEST_EMAIL, GUEST_PHONE],
      );
      const accounts = await client.query(
        "delete from guest_accounts where login_email = $1 or login_phone = $2 returning id",
        [GUEST_EMAIL, GUEST_PHONE],
      );
      const guest = await client.query("delete from guests where email = $1 or phone = $2 returning id", [
        GUEST_EMAIL,
        GUEST_PHONE,
      ]);
      console.log("Removed:");
      say("staff rows", staff.rowCount);
      say("guest device sessions", sessions.rowCount);
      say("guest_accounts rows", accounts.rowCount);
      say("guests rows", guest.rowCount);
      console.log("\nReal staff, real guests and real bookings were not touched.");
      console.log("The audit_log rows from preview sign-ins are deliberately kept.");
    } else {
      const staff = await hashPassword(staffPassword);
      const guest = await hashPassword(guestPassword);

      console.log(dryRun ? "DRY RUN — nothing will be written.\n" : "Creating the two preview logins…\n");

      if (!dryRun) {
        // 1) Front desk, role=staff (least privilege: the desk view, not the money).
        await client.query(
          `insert into staff (id, staff_code, name, email, phone, role, password_hash, password_salt, is_active)
           values ($1, $2, $3, $4, $5, 'staff', $6, $7, true)
           on conflict (email) do update
             set password_hash = excluded.password_hash,
                 password_salt = excluded.password_salt,
                 role          = 'staff',
                 is_active     = true,
                 name          = excluded.name`,
          [randomUUID(), STAFF_CODE, STAFF_NAME, STAFF_EMAIL, null, staff.hash, staff.salt],
        );

        // 2) The guest the preview account belongs to. Matched on lower(email) the
        //    way src/lib/hotel.ts does it: migration 0007 puts the unique index on
        //    lower(email), so `on conflict (email)` is not a valid conflict target —
        //    the match has to be explicit. No stay is attached here; the desk creates
        //    a real test booking against this address when it wants one.
        const existingGuest = await client.query(
          "select id from guests where lower(email) = lower($1) limit 1",
          [GUEST_EMAIL],
        );
        const guestId = existingGuest.rows[0]?.id ?? randomUUID();
        if (existingGuest.rowCount === 0) {
          await client.query("insert into guests (id, full_name, phone, email, notes) values ($1, $2, $3, $4, $5)", [
            guestId,
            GUEST_NAME,
            GUEST_PHONE,
            GUEST_EMAIL,
            MARK,
          ]);
        }

        // 3) The sign-in itself: active + email verified, exactly how a desk-created
        //    account ends up once the guest is handed the password in person.
        //    guest_accounts has no unique index on login_email at all, so this match
        //    is explicit too — never a blind insert that could double up.
        const existingAccount = await client.query(
          "select id from guest_accounts where lower(login_email) = lower($1) limit 1",
          [GUEST_EMAIL],
        );
        if (existingAccount.rowCount > 0) {
          await client.query(
            `update guest_accounts
                set guest_id          = $2,
                    password_hash     = $3,
                    password_salt     = $4,
                    status            = 'active',
                    email_verified_at = now(),
                    failed_attempts   = 0,
                    locked_until      = null
              where id = $1`,
            [existingAccount.rows[0].id, guestId, guest.hash, guest.salt],
          );
        } else {
          await client.query(
            `insert into guest_accounts (id, guest_id, login_email, login_phone, password_hash, password_salt,
                                         status, email_verified_at, signup_source, invited_by_label)
             values ($1, $2, $3, $4, $5, $6, 'active', now(), $7, $8)`,
            [randomUUID(), guestId, GUEST_EMAIL, GUEST_PHONE, guest.hash, guest.salt, MARK, STAFF_NAME],
          );
        }
      }

      if (!dryRun) console.log("      preview rows written.");
    }
  } finally {
    await client.end();
  }
}

for (const target of targets) await run(target);

console.log(`\nPREVIEW LOGINS${dryRun ? " (not written)" : ""}`);
console.log("  Front desk / admin console  ->  /admin   (or /desk once signed in)");
say("email", STAFF_EMAIL);
say("password", staffPassword);
say("role", "staff — operational desk only");
say("staff code", STAFF_CODE);
console.log("");
console.log("  Guest app                   ->  /app");
say("email", GUEST_EMAIL);
say("password", guestPassword);
say("linked guest", GUEST_NAME);
console.log("");
console.log("Your own admin logins and ADMIN_PASSWORD were left untouched.");
console.log("Remove both preview rows again with:  npm run preview:accounts:delete");
console.log("");
console.log("Testing on a phone: the guest cookie is `Secure`, so guest sign-in only sticks on");
console.log("localhost or https — use the tunnel address, not a plain http:// LAN IP.");
console.log("Staff/admin cookies carry no Secure flag, so those work over plain http as well.");
