// Front-desk / admin console access, in one helper so every v2 route enforces
// the same rule: auditors read everything and change nothing, staff act on the
// desk work, admins do everything.

import { NextResponse } from "next/server";
import { isManagerRole, isMotelManagerRole, isRestaurantManagerRole, isSuperAdminRole, readSession, sessionLabel, type SessionUser } from "@/lib/staff-auth";

export async function deskActor(request: Request, opts: { write?: boolean } = {}) {
  const user = await readSession(request);
  if (!user) {
    return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) } as const;
  }
  if (opts.write && user.role === "auditor") {
    return {
      error: NextResponse.json({ error: "Auditors can read everything but change nothing." }, { status: 403 }),
    } as const;
  }
  return { user: user as SessionUser, label: sessionLabel(user) } as const;
}

/** Manager roles may use operational controls; sensitive account management is Super Admin-only. */
export function requireAdmin(user: SessionUser) {
  if (!isManagerRole(user.role)) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  return null;
}

export function requireSuperAdmin(user: SessionUser) {
  if (!isSuperAdminRole(user.role)) {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }
  return null;
}

export function requireMotelManager(user: SessionUser) {
  if (!isMotelManagerRole(user.role)) return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  return null;
}

export function requireRestaurantManager(user: SessionUser) {
  if (!isRestaurantManagerRole(user.role)) return NextResponse.json({ error: "Restaurant Manager access required." }, { status: 403 });
  return null;
}
