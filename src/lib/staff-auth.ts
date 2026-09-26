// Staff auth: session cookies + staff lookups.
// Roles: "admin" (full control) vs "staff" (view + approve/confirm/cancel/follow-up only).
// Password hashing lives in ./password and is re-exported below.

import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { eq } from "drizzle-orm";

// Re-exported so existing `import { hashPassword } from "@/lib/staff-auth"` keeps working.
export { hashPassword, verifyPassword, generatePassword } from "./password";

export type SessionRole = "admin" | "staff";

export type SessionUser = {
  id: string;
  staffCode: string;
  name: string;
  email: string;
  role: SessionRole;
  /** Legacy single-password manager session (ADMIN_PASSWORD) — treated as admin. */
  legacy?: boolean;
};

export function nextStaffCode(existing: string[]) {
  let max = 1;
  for (const code of existing) {
    const m = /^STF(\d+)$/.exec(code.trim().toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `STF${String(max + 1).padStart(3, "0")}`;
}

function cookieValue(user: SessionUser) {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

export function readSession(request: Request): SessionUser | null {
  const cookie = request.headers.get("cookie") ?? "";
  // New signed-style session
  const match = /(?:^|;\s*)sunrise_session=([^;]+)/.exec(cookie);
  if (match) {
    try {
      const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as SessionUser;
      if (parsed && (parsed.role === "admin" || parsed.role === "staff") && parsed.name) return parsed;
    } catch {
      // fall through to legacy cookie
    }
  }
  // Legacy ADMIN_PASSWORD cookie — full admin
  if (cookie.split(";").some((part) => part.trim().startsWith("sunrise_admin=1"))) {
    return { id: "legacy-admin", staffCode: "ADM000", name: "Manager", email: "", role: "admin", legacy: true };
  }
  return null;
}

export function sessionLabel(user: SessionUser | null) {
  if (!user) return "anonymous";
  return `${user.role === "admin" ? "Admin" : `Staff ${user.staffCode}`} — ${user.name}`;
}

export async function getStaffByEmail(email: string) {
  const [row] = await db.select().from(staffTable).where(eq(staffTable.email, email.trim().toLowerCase())).limit(1);
  return row ?? null;
}

export { cookieValue };
