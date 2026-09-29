// Front-desk / admin console access, in one helper so every v2 route enforces
// the same rule: auditors read everything and change nothing, staff act on the
// desk work, admins do everything.

import { NextResponse } from "next/server";
import { readSession, sessionLabel, type SessionUser } from "@/lib/staff-auth";

export function deskActor(request: Request, opts: { write?: boolean } = {}) {
  const user = readSession(request);
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

/** Only admins may touch money, rates, staff, deletion or broadcasts (§9). */
export function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  return null;
}
