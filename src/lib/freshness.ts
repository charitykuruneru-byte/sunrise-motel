// WHAT COUNTS AS "NEW" — one definition, so the website, the guest app and any
// future surface agree on the same answer.
//
// A post the manager publishes at 09:00 should read as NEW at 09:01 and stop
// shouting two days later; after that it is simply part of the feed. Keeping the
// window in one constant is what stops the badge drifting between surfaces.
export const NEW_WINDOW_HOURS = 48;

/** True when `publishedAt` is inside the NEW window. Anything unparseable is not new. */
export function isNew(publishedAt: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (!publishedAt) return false;
  const at = publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < NEW_WINDOW_HOURS * 60 * 60 * 1000;
}

/** "2 h ago" / "3 d ago" — the honest age, for a title attribute. */
export function ageLabel(publishedAt: string | Date | null | undefined, now: number = Date.now()): string {
  if (!publishedAt) return "";
  const at = publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  if (!Number.isFinite(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
