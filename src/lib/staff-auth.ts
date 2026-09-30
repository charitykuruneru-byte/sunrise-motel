// Staff auth: session cookies + staff lookups.
// Roles: "admin" (full control) vs "staff" (operational desk only) vs "auditor" (read everything).
// Password hashing lives in ./password and is re-exported below.
//
// ADDENDUM (admin & staff dashboards, §5 the authority matrix): every admin-only block is
// enforced ON THE SERVER, and hiding a button is cosmetic. That is only true if the session
// itself cannot be forged — so the cookie is now an HMAC-SHA256 signed payload. An unsigned,
// hand-written `sunrise_session` claiming `role: "admin"` is refused outright.

import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { staffTable } from "@/db/schema";
import { eq } from "drizzle-orm";

// Re-exported so existing `import { hashPassword } from "@/lib/staff-auth"` keeps working.
export { hashPassword, verifyPassword, generatePassword } from "./password";

export type SessionRole = "admin" | "super_admin" | "motel_manager" | "restaurant_manager" | "staff" | "auditor";

export type SessionUser = {
  id: string;
  staffCode: string;
  name: string;
  email: string;
  role: SessionRole;
};

export function isSuperAdminRole(role: SessionRole | string) {
  return role === "admin" || role === "super_admin";
}

export function isManagerRole(role: SessionRole | string) {
  return isSuperAdminRole(role) || role === "motel_manager" || role === "restaurant_manager";
}

export function isMotelManagerRole(role: SessionRole | string) {
  return isSuperAdminRole(role) || role === "motel_manager";
}

export function isRestaurantManagerRole(role: SessionRole | string) {
  return isSuperAdminRole(role) || role === "restaurant_manager";
}

export function nextStaffCode(existing: string[]) {
  let max = 1;
  for (const code of existing) {
    const m = /^STF(\d+)$/.exec(code.trim().toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `STF${String(max + 1).padStart(3, "0")}`;
}

/**
 * Production requires a strong SESSION_SECRET; only local development has a fallback.
 */
function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters in production.");
  }
  return "sunrise-motel-local-dev-secret";
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** Constant-time comparison, so a wrong signature cannot be discovered byte by byte. */
function signatureMatches(payload: string, signature: string) {
  const expected = Buffer.from(sign(payload), "utf8");
  const given = Buffer.from(signature, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The signed cookie body: base64url(JSON) + "." + HMAC. Base64url never contains ".". */
export function cookieValue(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The break-glass manager marker, signed with the same secret so `=1` cannot be hand-written. */
export function legacyAdminCookieValue() {
  return sign("legacy-admin-marker");
}

function readSignedSession(value: string): SessionUser | null {
  const [payload, signature] = value.split(".");
  // No signature at all = the old forgeable format. Refuse it: sign in again.
  if (!payload || !signature) return null;
  if (!signatureMatches(payload, signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
    if (
      parsed &&
      ["admin", "super_admin", "motel_manager", "restaurant_manager", "staff", "auditor"].includes(parsed.role) &&
      parsed.name
    ) {
      return parsed;
    }
  } catch {
    // Tampered payload — treat as no session.
  }
  return null;
}

export async function readSession(request: Request): Promise<SessionUser | null> {
  const parts = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim());
  const session = parts.find((part) => part.startsWith("sunrise_session="));
  if (session) {
    const user = readSignedSession(session.slice("sunrise_session=".length));
    if (!user || user.id === "legacy-admin") return null;
    const [staff] = await db
      .select()
      .from(staffTable)
      .where(eq(staffTable.id, user.id))
      .limit(1);
    if (!staff || !staff.isActive || staff.isDeleted) return null;
    return {
      id: staff.id,
      staffCode: staff.staffCode,
      name: staff.name,
      email: staff.email,
      role: staff.role as SessionRole,
    };
  }
  return null;
}

export function sessionLabel(user: SessionUser | null) {
  if (!user) return "anonymous";
  if (isSuperAdminRole(user.role)) return `Super Admin — ${user.name}`;
  if (user.role === "auditor") return `Auditor ${user.staffCode} — ${user.name}`;
  if (user.role === "motel_manager" || user.role === "restaurant_manager") {
    return `${user.role === "motel_manager" ? "Motel Manager" : "Restaurant Manager"} — ${user.name}`;
  }
  return `Staff ${user.staffCode} — ${user.name}`;
}

export async function getStaffByEmail(email: string) {
  const [row] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.email, email.trim().toLowerCase()))
    .limit(1);
  return row && !row.isDeleted ? row : null;
}
