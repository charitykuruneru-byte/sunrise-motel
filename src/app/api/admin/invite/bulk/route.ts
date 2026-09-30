import { NextResponse } from "next/server";
import { DEFAULT_ADMIN_INVITES, createStaffInvitation, type InvitableRole, type InviteOutcome } from "@/lib/staff-invite";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

type BulkTarget = { email: string; role: InvitableRole };

/** The list the portal's "Invite all three" button uses — sent by the server, so the
 *  addresses live in exactly one place (src/lib/staff-invite.ts). */
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSuperAdminRole(user.role)) return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  return NextResponse.json({ defaults: DEFAULT_ADMIN_INVITES });
}

function summarise(outcome: InviteOutcome) {
  if (outcome.outcome === "invited") {
    return { email: outcome.email, role: outcome.role, status: "invited" as const, emailSent: outcome.emailSent, reason: outcome.reason, inviteLink: outcome.inviteLink };
  }
  if (outcome.outcome === "already_has_account") {
    return {
      email: outcome.email,
      role: outcome.role,
      status: outcome.roleUpdated ? ("role_granted" as const) : ("already_has_account" as const),
      emailSent: outcome.emailSent,
      reason: outcome.reason ?? "This address already has an account.",
      inviteLink: null,
    };
  }
  if (outcome.outcome === "already_invited") {
    return { email: outcome.email, role: null, status: "already_invited" as const, emailSent: false, reason: `An invitation is already ${outcome.status} for this address.`, inviteLink: null };
  }
  return { email: outcome.email, role: null, status: outcome.outcome, emailSent: false, reason: outcome.reason, inviteLink: null };
}

/**
 * POST /api/admin/invite/bulk
 *
 * Body: { emails?: (string | { email, role })[], role? } — omitted entirely it
 * invites the three addresses on file (sunrisemotelllw@gmail.com as Super Admin,
 * evone.azraa@yahoo.com and cchiwale25@gmail.com as Admin).
 *
 * Every address gets its own row in the reply, so "sent: 2, failed: 1" can never be
 * mistaken for a healthy run without saying which one needed attention.
 */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSuperAdminRole(user.role)) return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  try {
    const body = (await request.json().catch(() => ({}))) as {
      emails?: (string | { email?: string; role?: string })[];
      role?: string;
    };
    const targets: BulkTarget[] = (body.emails?.length
      ? body.emails.map((entry) =>
          typeof entry === "string"
            ? { email: entry, role: (body.role ?? "admin") as InvitableRole }
            : { email: entry.email ?? "", role: (entry.role ?? body.role ?? "admin") as InvitableRole },
        )
      : DEFAULT_ADMIN_INVITES);

    const results = [];
    for (const target of targets) {
      const outcome = await createStaffInvitation({
        request,
        actor: user,
        email: target.email,
        role: target.role,
        promoteExisting: true,
      });
      results.push(summarise(outcome));
    }

    const invited = results.filter((row) => row.status === "invited").length;
    const granted = results.filter((row) => row.status === "role_granted").length;
    const failed = results.filter((row) => row.status === "invalid" || row.status === "rate_limited").length;
    return NextResponse.json({
      sent: invited + granted,
      failed,
      invited,
      roleGranted: granted,
      alreadyInvited: results.filter((row) => row.status === "already_invited").length,
      results,
    });
  } catch (error) {
    console.error("Bulk invitation failed", error);
    return NextResponse.json({ error: "Could not send the invitations." }, { status: 500 });
  }
}
