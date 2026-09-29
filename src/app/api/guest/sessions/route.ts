// THIS GUEST'S DEVICES — Settings → Devices, in one endpoint.
//
// The addendum "staying signed in" says there is no session timeout: a device stays
// signed in until the guest ends it. That makes this screen the safety valve, so it
// has to be real:
//
//   GET     every device that is still signed in, newest use first, with the one
//           you are holding marked as current — plus any ROOM SESSION this device
//           is carrying, because a no-account guest must be able to end that too.
//   DELETE  `?id=<sessionId>` signs that device out; `?all=1` signs every device out
//           ("lost my phone"). Ending the device you are using clears the cookie here.
//
// Only the account's own sessions are ever listed or touched — the accountId comes
// from the cookie, never from the query string.

import { NextResponse } from "next/server";
import { clientIp, logAudit } from "@/lib/audit";
import { GUEST_COOKIE, listDeviceSessions, readGuestSession, revokeAllSessions, revokeSession } from "@/lib/guest-auth";
import { ROOM_COOKIE, readRoomSession } from "@/lib/room-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await readGuestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Please sign in to see your devices." }, { status: 401 });
  }
  const devices = await listDeviceSessions(session.accountId, session.sessionId);
  // A phone can hold BOTH: an account session and the room session for the stay.
  const room = await readRoomSession(request);
  return NextResponse.json({
    devices,
    currentSessionId: session.sessionId,
    roomSession: room
      ? {
          sessionId: room.sessionId,
          roomNumber: room.roomNumber,
          openedVia: room.openedVia,
          // Ends at check-out — the PIN and QR card die with the stay.
          endsNote: "This room session ends by itself at check-out.",
        }
      : null,
    // The guest is told plainly why a stale device matters more than a stale cookie.
    note: "There is no timeout on the app: a device stays signed in until you sign it out here.",
  });
}

export async function DELETE(request: Request) {
  const session = await readGuestSession(request);
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  const targetId = searchParams.get("id");

  if (!session) {
    // Nothing to revoke, but still clear whatever this device is holding, including
    // a room session, so the response is truthful about the device being clean.
    const response = NextResponse.json({ success: true, signedOut: false, forgotRoomSession: false });
    response.cookies.set(GUEST_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    response.cookies.set(ROOM_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  }

  const devices = await listDeviceSessions(session.accountId, session.sessionId);
  if (!all && targetId && !devices.some((device) => device.id === targetId)) {
    // An id that is not this account's device: refuse rather than quietly revoke.
    return NextResponse.json({ error: "That device is not signed in to this account." }, { status: 404 });
  }

  const endedCurrent = all || targetId === session.sessionId;
  if (all) {
    await revokeAllSessions(session.accountId, "signed out everywhere from Settings → Devices");
  } else if (targetId) {
    await revokeSession(targetId, "signed out from Settings → Devices");
  } else {
    await revokeSession(session.sessionId, "signed out from Settings → Devices");
  }

  await logAudit({
    action: all ? "guest.signed_out_everywhere" : "guest.device_signed_out",
    entity: "guest_account",
    entityId: session.accountId,
    summary: all
      ? `${session.guestName} signed out of every device from Settings → Devices.`
      : `${session.guestName} signed out one device from Settings → Devices${
          endedCurrent ? " — the device they were using" : ""
        }.`,
    actor: "guest",
    actorLabel: session.email ?? session.phone,
    ip: clientIp(request),
    metadata: { all, endedCurrent, devicesRemaining: all ? 0 : Math.max(0, devices.length - 1) },
  });

  const response = NextResponse.json({
    success: true,
    all,
    signedOutEverywhere: all,
    devicesRemaining: all ? 0 : Math.max(0, devices.length - 1),
  });
  if (endedCurrent) {
    response.cookies.set(GUEST_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    response.cookies.set(ROOM_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
  return response;
}
