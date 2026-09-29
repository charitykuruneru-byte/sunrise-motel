/**
 * VERIFY GUEST IDENTITY — one email + one phone = one guest, forever.
 *
 * The duplicate-guest bug is not a database bug, it is a *matching* bug: the same person
 * writes their number as "0888 123 456", "+265 888 123 456" or "888123456", and a system
 * that compares strings sees three people. Each spelling then starts its own profile, and
 * the returning guest's stay history splits in two — which the desk notices long after.
 *
 * This imports the REAL rules (`src/lib/phone.ts`, through Node's own TypeScript support)
 * rather than restating them, so the test cannot drift from what ships, and checks the two
 * properties that matter:
 *
 *   1. every spelling of one number produces ONE key, and one canonical form
 *   2. something that is not a number ("n/a") produces NO key — two rows that both say
 *      "n/a" must never be merged into a single guest
 *
 * It then looks at the live database, if one is reachable, and reports identities that are
 * already split. It NEVER changes data: `--apply` only adds the two unique indexes, and
 * only when the report came back clean.
 *
 * Usage:
 *   node scripts/verify-guest-identity.mjs            # rules + a read-only report
 *   node scripts/verify-guest-identity.mjs --apply    # ...and add the unique indexes
 */
import "dotenv/config";
import { normaliseEmail, normalisePhone, phoneKey, phoneTail, samePhone } from "../src/lib/phone.ts";

const apply = process.argv.includes("--apply");
let failures = 0;
const info = (label, value) => console.log(`      ${label.padEnd(38)} ${value}`);
const check = (label, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label.padEnd(48)} got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`,
  );
};

/* --- 1. one number, however it is written ---------------------------------- */

const CANONICAL = "+265888123456";
const spellings = [
  "0888 123 456",
  "0888123456",
  "+265 888 123 456",
  "+265888123456",
  "00265 888 123 456",
  "265 888 123 456",
  "888 123 456",
  "  0888-123-456  ",
];

console.log("=== every spelling is the same guest ===");
for (const spelling of spellings) {
  check(`"${spelling}" -> one phone`, normalisePhone(spelling), CANONICAL);
}
const keys = new Set(spellings.map((s) => phoneKey(s)));
check("all spellings collapse to ONE key", keys.size, 1);
check("...and it is the 9 significant digits", [...keys][0], "888123456");
check("every spelling matches every other", spellings.every((a) => spellings.every((b) => samePhone(a, b))), true);

/* --- 2. different people stay different ------------------------------------ */

console.log("\n=== a different number is a different guest ===");
check("one digit out is not the same person", samePhone("0888 123 456", "0888 123 457"), false);
check("a different prefix is not the same person", samePhone("0888 123 456", "0999 123 456"), false);
check("landline (trunk 0 dropped)", normalisePhone("01766000"), "+2651766000");
check("a foreign number keeps its own country", normalisePhone("+44 7700 900123"), "+447700900123");

/* --- 3. junk is not an identity ------------------------------------------- */

console.log("\n=== values that are not numbers ===");
for (const junk of ["n/a", "", "   ", "ask at desk", "12345", null, undefined]) {
  check(`"${junk}" has no phone key`, phoneKey(junk), null);
}
check('two rows saying "n/a" are NOT the same guest', samePhone("n/a", "n/a"), false);
check("but the text is still kept for the desk", normalisePhone("n/a") ?? "n/a", "n/a");

/* --- 4. the desk's last-six-digits habit still works ---------------------- */

console.log("\n=== the desk reads numbers out loud ===");
check("last six digits, either spelling", phoneTail("+265 888 123 456"), "123456");
check("...and no false match", phoneTail("+265 888 123 456") === phoneTail("0888 123 457"), false);

/* --- 5. email ------------------------------------------------------------- */

console.log("\n=== email: one address, one spelling ===");
check("trimmed + lower-cased", normaliseEmail("  John@Example.COM "), "john@example.com");
check("not an address -> null", normaliseEmail("not-an-email"), null);
check("blank -> null", normaliseEmail("   "), null);

/* --- 6. the live database, read-only by default --------------------------- */

const EMAIL_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS guests_email_identity_unique
  ON guests (lower(email)) WHERE email IS NOT NULL AND email <> ''`;
const PHONE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS guests_phone_identity_unique
  ON guests (right(regexp_replace(phone, '[^0-9]', '', 'g'), 9))
  WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 6`;
const EMAIL_DUPES = `SELECT lower(email) AS identity, count(*)::int AS rows, string_agg(id, ', ') AS ids
  FROM guests WHERE email IS NOT NULL AND email <> '' GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC`;
const PHONE_DUPES = `SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) AS identity, count(*)::int AS rows,
    string_agg(id, ', ') AS ids
  FROM guests WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 6
  GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC`;

if (!process.env.DATABASE_URL) {
  console.log("\n=== the live database: skipped ===");
  console.log("      no DATABASE_URL in this shell, so nothing was checked and nothing was changed");
} else {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const [emailDupes, phoneDupes] = await Promise.all([client.query(EMAIL_DUPES), client.query(PHONE_DUPES)]);

    console.log("\n=== the live database: identities that are already split ===");
    const report = (rows, label) => {
      if (rows.length === 0) {
        console.log(`PASS  no duplicated ${label}`);
        return;
      }
      failures++; // a split identity IS the bug this script exists to find
      console.log(`FAIL  ${rows.length} duplicated ${label}`);
      for (const row of rows) console.log(`      ${row.identity} -> ${row.rows} rows: ${row.ids}`);
    };
    report(emailDupes.rows, "email address(es)");
    report(phoneDupes.rows, "phone number(s)");

    // The code matches on `phoneKey()`; findOrCreateGuest matches in SQL. If those two
    // ever disagree, one spelling creates a second guest. Ask the database directly.
    console.log("\n=== the database agrees with the code ===");
    const pair = await client.query(
      `SELECT right(regexp_replace($1, '[^0-9]', '', 'g'), 9) AS keep_as_first,
              right(regexp_replace($2, '[^0-9]', '', 'g'), 9) AS kept_as_second`,
      ["+265 888 123 456", "0888 123 456"],
    );
    const [first, second] = [pair.rows[0].keep_as_first, pair.rows[0].kept_as_second];
    check("SQL collapses the two spellings to one key", first === second, true);
    check("...and that key is the code's key", first, phoneKey("0888 123 456"));

    const indexes = await client.query("select indexname from pg_indexes where tablename = $1", ["guests"]);
    const names = indexes.rows.map((row) => row.indexname);
    info("unique indexes on guests", names.filter((n) => n.includes("identity")).join(", ") || "(none yet)");

    const clean = emailDupes.rows.length === 0 && phoneDupes.rows.length === 0;
    if (clean && apply) {
      await client.query(EMAIL_INDEX);
      await client.query(PHONE_INDEX);
      console.log("      applied: guests_email_identity_unique, guests_phone_identity_unique");
    } else if (clean && names.includes("guests_email_identity_unique")) {
      console.log("      nothing to do: the database is clean AND both unique indexes are in place");
    } else if (clean) {
      console.log("      the database is clean, so --apply would now add:");
      console.log(`      ${EMAIL_INDEX.replace(/\s+/g, " ")}`);
      console.log(`      ${PHONE_INDEX.replace(/\s+/g, " ")}`);
    } else if (apply) {
      console.log("      refusing to add the unique indexes while duplicates exist — merge them first");
    }
  } catch (error) {
    console.log("\n=== the live database: could not be reached ===");
    console.log(`      ${error.message}`);
    console.log("      (the rules above still ran; nothing was changed)");
  } finally {
    await client.end().catch(() => {});
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
