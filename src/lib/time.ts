// Single source of truth for date/time across the Sunrise Motel system.
// Malawi (Lilongwe) is Africa/Blantyre = UTC+2, no daylight saving.
// The PC/Postgres here report South Africa Standard Time which is the same
// offset, but we always format explicitly in Africa/Blantyre so the wall
// clock stays correct no matter where the server or browser sits.

export const MALAWI_TZ = "Africa/Blantyre";

/** Current instant (UTC underneath). Store this / let Postgres defaultNow() store it. */
export function nowDate() {
  return new Date();
}

/** YYYY-MM-DD in Malawi — used for reference numbers, invoice numbers, folders. */
export function malawiDatePart(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAWI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // YYYY-MM-DD
}

/** Compact YYMMDD in Malawi, e.g. 260926 */
export function malawiShortDate(d = new Date()) {
  return malawiDatePart(d).slice(2).replace(/-/g, "");
}

/** Full year in Malawi, e.g. 2026 */
export function malawiYear(d = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: MALAWI_TZ, year: "numeric" }).format(d),
  );
}

/** Display helper for the admin portal + tracking pages. Always Malawi time. */
export function formatMalawi(
  input: string | Date | null | undefined,
  opts: { withSeconds?: boolean; withYear?: boolean } = {},
) {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAWI_TZ,
    day: "2-digit",
    month: "short",
    ...(opts.withYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    ...(opts.withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  }).format(d);
}

/** "26 Sep 2026" in Malawi — for invoices/PDFs. */
export function formatMalawiDate(input: string | Date | null | undefined) {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAWI_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "26 Sep 2026, 10:04 CAT" — footer stamp for PDFs and audit exports. */
export function malawiStamp(d = new Date()) {
  return `${formatMalawi(d, { withYear: true })} CAT`;
}

/** ISO instant for DB/API payloads. */
export function toISO(d = new Date()) {
  return d.toISOString();
}
