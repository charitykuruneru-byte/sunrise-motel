// ONE PLACE THAT ANSWERS "WHAT IS THIS DEPLOYMENT CONFIGURED WITH?"
//
// Precedence: an environment variable normally wins, because that is where a
// hosting platform (or a CI secret) should keep credentials, and the database is
// the fallback for a deployment whose owner cannot edit env vars at all.
//
// That is not enough on its own. A deployment can also hold a *stale* environment
// variable that nobody can edit — exactly what happened on the live site: an old
// `SMTP_USER`/`SMTP_PASS` pair from a different mailbox kept winning, and Gmail
// answered 535 "Username and Password not accepted" after the database already had
// the correct credentials. So the database can declare itself authoritative:
//
//     SETTINGS_SOURCE=db        (one row in app_settings)
//
// With that row present the stored value wins for every key the app reads here,
// and deleting the row hands control back to the environment — no deploy, no code
// change, no hosting dashboard. Keys the database does not hold still fall through
// to the environment either way.
//
// Values are read once per process and cached for a few seconds, so a page that
// sends three emails does not make three settings queries, and a settings read can
// never throw into a booking: a failure returns "no value" and the caller falls
// back as it always did.
import { db } from "@/db";
import { appSettingsTable } from "@/db/schema";

const CACHE_TTL_MS = 30_000;

/** The row that flips precedence: "db" makes the stored value win over the env. */
const SOURCE_KEY = "SETTINGS_SOURCE";

let cache: { at: number; values: Map<string, string> } | null = null;

async function load(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.values;
  try {
    const rows = await db.select().from(appSettingsTable);
    const values = new Map(rows.map((row) => [row.key, row.value]));
    cache = { at: Date.now(), values };
    return values;
  } catch (error) {
    console.error("Could not read app settings (falling back to env only)", error);
    return new Map();
  }
}

/** env first (unless the database has declared itself authoritative), then the db. */
export async function setting(key: string): Promise<string> {
  const stored = (await load()).get(key)?.trim() ?? "";
  const fromEnv = process.env[key]?.trim() ?? "";
  if (stored && (await databaseIsAuthoritative())) return stored;
  return fromEnv || stored;
}

/** Several keys at once — one query, one cache hit. */
export async function settings(...keys: string[]): Promise<Record<string, string>> {
  const values = await load();
  const authoritative = values.get(SOURCE_KEY)?.trim().toLowerCase() === "db";
  const out: Record<string, string> = {};
  for (const key of keys) {
    const stored = values.get(key)?.trim() ?? "";
    if (stored && authoritative) {
      out[key] = stored;
      continue;
    }
    out[key] = process.env[key]?.trim() || stored;
  }
  return out;
}

async function databaseIsAuthoritative(): Promise<boolean> {
  return (await load()).get(SOURCE_KEY)?.trim().toLowerCase() === "db";
}

/** Drop the cache — call after writing a setting so the next read sees it. */
export function forgetSettings() {
  cache = null;
}

