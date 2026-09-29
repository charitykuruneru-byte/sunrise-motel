// ONE PHONE NUMBER = ONE GUEST.
//
// A guest writes their number differently every time: "0888 123 456",
// "+265 888 123 456", "888123456", "00265 888 123 456". Stored raw, each spelling is a
// different string — so a returning guest gets a NEW profile and the stay history
// splits in two. That is the duplicate-identity bug, and the fix is to reduce every
// number to one canonical form before it is compared or written:
//
//   0888 123 456   ->  +265888123456
//   +265888123456  ->  +265888123456   (already canonical, unchanged)
//   00265 888…     ->  +265888123456
//   888 123 456    ->  +265888123456
//   01766000       ->  +2651766000     (a Lilongwe landline: trunk 0 dropped)
//   +44 7700 9001..->  +447700900123   (not ours: kept, never guessed at)
//
// The identity is the NINE significant digits, which is also how the desk's
// "last six digits" checks already think — `phoneTail()` exists so those callers
// cannot drift from this rule.

const NATIONAL_DIGITS = 9;
/** Below this there is no number to match on — only a label somebody typed. */
const MIN_DIGITS = 6;

/** Every digit, in order. Punctuation, spaces and "+" are noise. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

/**
 * The nine significant digits — "is this the same number?" — or null when the value
 * is not a phone number at all. Null is the safe answer: two rows that both say
 * "n/a" are NOT the same guest.
 */
export function phoneKey(value: string | null | undefined): string | null {
  let digits = phoneDigits(value);
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2); // 00 is the international prefix
  if (digits.startsWith("265")) digits = digits.slice(3); // our country code, however typed
  if (digits.startsWith("0")) digits = digits.slice(1); // the national trunk prefix
  const key = digits.slice(-NATIONAL_DIGITS);
  return key.length >= MIN_DIGITS ? key : null;
}

/**
 * The ONE form this system stores and compares. Malawian numbers become
 * `+265…`; anything else keeps its own country code and is never re-guessed.
 */
export function normalisePhone(value: string | null | undefined): string | null {
  const key = phoneKey(value);
  if (!key) return null;
  // Malawi: mobile 08/09, landline 01/02/03 — so key prefixes 1, 2, 3, 8 and 9.
  return /^[12389]/.test(key) ? `+265${key}` : `+${phoneDigits(value)}`;
}

/** The same number, however it was written? */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = phoneKey(a);
  const right = phoneKey(b);
  return Boolean(left && right && left === right);
}

/** The last N digits — what `/track` and the review form match a booking on. */
export function phoneTail(value: string | null | undefined, length = 6): string {
  return phoneDigits(value).slice(-length);
}

/** Lower-cased and trimmed: the only form an email is ever stored or compared in. */
export function normaliseEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}
