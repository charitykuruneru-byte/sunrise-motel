// Password primitives: salted scrypt hashing + readable starter passwords.
//
// Kept in its own dependency-free module (node:crypto only) so the
// `staff-invite` CLI can reuse the exact same hash format as the web app
// instead of re-implementing it. Import from "@/lib/staff-auth" as before —
// that module re-exports everything here.

import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  return { salt: "bcrypt", hash: await bcrypt.hash(password, 12) };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  if (/^\$2[aby]\$/.test(hash)) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
  try {
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// Readable-but-strong starter password (e.g. Sunrise-Kp7q-4821) so an admin can
// also dictate it over the phone or WhatsApp. Ambiguous characters (0/O, 1/l/I)
// are deliberately left out.
export function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `Sunrise-${pick(4)}-${digits}`;
}
