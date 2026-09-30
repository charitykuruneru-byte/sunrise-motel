/**
 * MERGE DUPLICATE GUESTS — for rows written before "one email + one phone = one
 * profile" became a database rule.
 *
 * `scripts/verify-guest-identity.mjs` already proves the *matching* rules and reports
 * identities that are split. What it deliberately does not do is change guest data.
 * This is that second half: it finds profiles that are the same person and folds them
 * into one, oldest row first, moving every reference across rather than deleting
 * history.
 *
 * Rules:
 *   * dry run by default — prints what it would do and touches nothing;
 *   * `--apply` merges inside ONE transaction, so a failure leaves the database
 *     exactly as it was;
 *   * the master is the OLDEST row (created_at) and its empty fields are filled from
 *     the duplicates, so nothing the desk typed is lost;
 *   * stay_count and total_spent are summed onto the master — that is the point of
 *     merging: the returning guest's history becomes whole again;
 *   * the tables it updates are DISCOVERED from information_schema (any table with a
 *     guest_id column), so a table added later cannot be silently left behind.
 *
 * Usage:
 *   node scripts/merge-duplicate-guests.mjs            # report only
 *   node scripts/merge-duplicate-guests.mjs --apply    # merge them
 */
import "dotenv/config";
import { Client } from "pg";

const apply = process.argv.includes("--apply");
const connectionString =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL || "";
if (!connectionString) {
  console.error("No DATABASE_URL (or NEON_DATABASE_URL) found — set one in .env first.");
  process.exit(1);
}

const needsSsl = !/localhost|127\.0\.0\.1/.test(connectionString);
const client = new Client({ connectionString, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });

const money = (value) => `MWK ${Math.round(Number(value) || 0).toLocaleString("en-US")}`;

/** Every table that stores a guest id — discovered, not hard-coded. */
async function guestReferenceTables() {
  const { rows } = await client.query(
    `select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'guest_id'
      order by table_name`,
  );
  return rows.map((row) => row.table_name);
}

/** Groups of guest ids that are the same person, oldest first. */
async function duplicateGroups() {
  const byEmail = await client.query(
    `select lower(email) as identity, 'email' as matched_on, array_agg(id order by created_at asc) as ids
       from guests
      where email is not null and email <> ''
      group by 1 having count(*) > 1`,
  );
  const byPhone = await client.query(
    `select right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) as identity, 'phone' as matched_on,
            array_agg(id order by created_at asc) as ids
       from guests
      where phone is not null and length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 6
      group by 1 having count(*) > 1`,
  );
  // One person can appear in both lists; key by master id so a row is only absorbed once.
  const merges = new Map();
  for (const group of [...byEmail.rows, ...byPhone.rows]) {
    const [master, ...duplicates] = group.ids;
    const existing = merges.get(master) ?? { master, duplicates: new Set(), matchedOn: new Set() };
    duplicates.forEach((id) => existing.duplicates.add(id));
    existing.matchedOn.add(group.matched_on === "email" ? `email ${group.identity}` : `phone …${group.identity}`);
    merges.set(master, existing);
  }
  return [...merges.values()].map((merge) => ({ ...merge, duplicates: [...merge.duplicates], matchedOn: [...merge.matchedOn] }));
}

async function main() {
  await client.connect();
  const tables = await guestReferenceTables();
  const merges = await duplicateGroups();

  console.log(`Tables holding a guest id: ${tables.join(", ") || "(none)"}`);
  console.log(
    merges.length === 0
      ? "No duplicate guest profiles found — nothing to do."
      : `${merges.length} duplicate group(s) found.`,
  );

  for (const merge of merges) {
    const { rows } = await client.query(
      `select id, full_name, email, phone, stay_count, total_spent, created_at
         from guests where id = any($1::text[]) order by created_at asc`,
      [[merge.master, ...merge.duplicates]],
    );
    const master = rows[0];
    console.log(
      `\n— keep ${master.full_name} <${master.email ?? "no email"}> (${master.id}, created ${master.created_at.toISOString().slice(0, 10)}, matched on ${merge.matchedOn.join(" + ")})`,
    );
    for (const row of rows.slice(1)) {
      const references = [];
      for (const table of tables) {
        const count = await client.query(`select count(*)::int as n from "${table}" where guest_id = $1`, [row.id]);
        if (count.rows[0].n > 0) references.push(`${table}: ${count.rows[0].n}`);
      }
      console.log(
        `   absorb ${row.full_name} <${row.email ?? "no email"}> (${row.id}) — ${references.join(", ") || "no references"} · ${row.stay_count} stays · ${money(row.total_spent)}`,
      );
    }
  }

  if (merges.length === 0) {
    await client.end();
    return;
  }
  if (!apply) {
    console.log("\nReport only — nothing was changed. Re-run with --apply to merge.");
    await client.end();
    return;
  }

  await client.query("begin");
  try {
    for (const merge of merges) {
      const duplicates = merge.duplicates;
      const { rows } = await client.query(
        `select id, email, phone, country, notes, stay_count, total_spent, marketing_consent
           from guests where id = any($1::text[]) order by created_at asc`,
        [[merge.master, ...duplicates]],
      );
      const keeper = rows[0];
      const absorbed = rows.slice(1);

      for (const table of tables) {
        await client.query(`update "${table}" set guest_id = $1 where guest_id = any($2::text[])`, [merge.master, duplicates]);
      }

      const email = keeper.email ?? absorbed.find((row) => row.email)?.email ?? null;
      const phone = keeper.phone ?? absorbed.find((row) => row.phone)?.phone ?? null;
      const country = keeper.country ?? absorbed.find((row) => row.country)?.country ?? null;
      const notes = keeper.notes ?? absorbed.find((row) => row.notes)?.notes ?? null;
      const marketingConsent = keeper.marketing_consent || absorbed.some((row) => row.marketing_consent);
      const stayCount = rows.reduce((sum, row) => sum + (row.stay_count ?? 0), 0);
      const totalSpent = rows.reduce((sum, row) => sum + (row.total_spent ?? 0), 0);
      await client.query(
        `update guests set email = $2, phone = $3, country = $4, notes = $5, marketing_consent = $6,
                           stay_count = $7, total_spent = $8, updated_at = now()
          where id = $1`,
        [merge.master, email, phone, country, notes, marketingConsent, stayCount, totalSpent],
      );
      await client.query(`delete from guests where id = any($1::text[])`, [duplicates]);
      console.log(`merged ${absorbed.length} profile(s) into ${merge.master} — ${stayCount} stays, ${money(totalSpent)}`);
    }
    await client.query("commit");
    console.log("\nDone. Every booking that pointed at an absorbed profile now points at the keeper.");
  } catch (error) {
    await client.query("rollback");
    console.error("Merge failed and was rolled back — nothing changed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(async (error) => {
  console.error("merge-duplicate-guests failed:", error instanceof Error ? error.message : error);
  await client.end().catch(() => {});
  process.exit(1);
});

