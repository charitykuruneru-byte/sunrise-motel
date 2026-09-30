// ONE PLACE THAT ANSWERS "WHAT IS THIS DEPLOYMENT CONFIGURED WITH?"
//
// Precedence is deliberate: an environment variable always wins, because that is
// where a hosting platform (or a CI secret) should keep credentials. The database
// is the fallback, and it exists for a real situation: a deployment whose owner
// cannot edit environment variables — no dashboard access, no CLI token — where
// the choice was otherwise "payments and email silently switched off".
//
// Values are read once per process and cached for a few seconds, so a page that
// sends three emails does not make three settings queries, and a settings read can
// never throw into a booking: a failure returns "no value" and the caller falls
// back as it always did.
import { db } from "@/db";
import { appSettingsTable } from "@/db/schema";

const CACHE_TTL_MS = 30_000;

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

/** env first, then the database. Returns "" when neither has a value. */
export async function setting(key: string): Promise<string> {
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return (await load()).get(key)?.trim() ?? "";
}

/** Several keys at once — one query, one cache hit. */
export async function settings(...keys: string[]): Promise<Record<string, string>> {
  const stored = await load();
  const out: Record<string, string> = {};
  for (const key of keys) {
    const fromEnv = process.env[key];
    out[key] = typeof fromEnv === "string" && fromEnv.trim() ? fromEnv.trim() : (stored.get(key)?.trim() ?? "");
  }
  return out;
}

/** Drop the cache — call after writing a setting so the next read sees it. */
export function forgetSettings() {
  cache = null;
}
