import { NextResponse } from "next/server";
import { createStaffInvitation } from "@/lib/staff-invite";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/invite — the endpoint named in the brief.
 *
 * Body: { email, role, name? } → creates the invitation, emails the setup link and
 * returns that link. It is a thin shell over src/lib/staff-invite.ts so this route
 * and the portal's own /api/admin/invitations cannot drift apart.
 */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isSuperAdminRole(user.role)) return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; role?: string; name?: string };
    const result = await createStaffInvitation({
      request,
      actor: user,
      email: body.email ?? "",
      role: body.role ?? "staff",
      name: body.name,
      promoteExisting: true,
    });
    if (result.outcome === "invalid") return NextResponse.json({ error: result.reason }, { status: 400 });
    if (result.outcome === "rate_limited") return NextResponse.json({ error: result.reason }, { status: 429 });
    if (result.outcome === "already_invited") {
      return NextResponse.json({ error: "An invitation already exists for this email. Resend it from Admin → Users.", invitationId: result.invitationId }, { status: 409 });
    }
    if (result.outcome === "already_has_account") {
      return NextResponse.json(
        {
          success: true,
          email: result.email,
          role: result.role,
          alreadyHadAccount: true,
          roleUpdated: result.roleUpdated,
          emailSent: result.emailSent,
          reason: result.reason,
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        success: true,
        email: result.email,
        role: result.role,
        invitationId: result.invitationId,
        inviteLink: result.inviteLink,
        emailSent: result.emailSent,
        reason: result.reason,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Invitation failed", error);
    return NextResponse.json({ error: "Could not create the invitation." }, { status: 500 });
  }
}
