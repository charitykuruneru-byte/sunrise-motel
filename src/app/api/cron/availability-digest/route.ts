import { NextResponse } from "next/server";
import { and, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, roomTypesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { setting, setSetting } from "@/lib/settings";
import { isManagerRole, readSession } from "@/lib/staff-auth";
import { malawiDatePart } from "@/lib/time";
import { sendWebPush } from "@/lib/web-push";

export const dynamic = "force-dynamic";

/**
 * "ROOMS FREE TONIGHT" — the one automatic message worth sending.
 *
 * A hotel does not need a notification every time a room is released: that is
 * noise, and noise is how an app gets muted. What is useful is ONE nudge a day,
 * sent only when there is something to say:
 *
 *   * at least one room is actually free tonight, AND
 *   * the number CHANGED since the last digest, AND
 *   * nothing has been sent yet today.
 *
 * Vercel calls it on a schedule (see `crons` in vercel.json, 16:00 Malawi time).
 * A manager can also call it by hand with `?force=1` from the portal, which skips
 * the day/changed guards but still refuses to announce a fully booked night.
 */
function dayAfter(datePart: string) {
  const next = new Date(`${datePart}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Free sellable rooms for one night — the same arithmetic the site's own bar uses. */
async function freeRoomsFor(checkIn: string, checkOut: string) {
  const types = await db.select().from(roomTypesTable).where(sql`${roomTypesTable.isActive} = true`);
  const overlapping = await db
    .select({ roomTypeId: bookings.roomTypeId })
    .from(bookings)
    .where(and(ne(bookings.status, "cancelled"), sql`${bookings.checkIn} < ${checkOut}`, sql`${bookings.checkOut} > ${checkIn}`));
  const booked: Record<string, number> = {};
  for (const row of overlapping) booked[row.roomTypeId] = (booked[row.roomTypeId] ?? 0) + 1;
  return types.reduce((sum, type) => sum + Math.max(0, type.totalInventory - (booked[type.id] ?? 0)), 0);
}

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (force) {
    const user = await readSession(request);
    if (!user || !isManagerRole(user.role)) {
      return NextResponse.json({ error: "Manager access required to send the digest by hand." }, { status: 403 });
    }
  }

  const today = malawiDatePart();
  const free = await freeRoomsFor(today, dayAfter(today));

  if (free <= 0) {
    return NextResponse.json({ sent: false, freeTonight: 0, reason: "No rooms free tonight — nothing worth telling anyone." });
  }
  const lastSentOn = await setting("DIGEST_LAST_SENT_ON");
  const lastCount = await setting("DIGEST_LAST_COUNT");
  if (!force && lastSentOn === today) {
    return NextResponse.json({ sent: false, freeTonight: free, reason: `Already sent today (${today}).` });
  }
  if (!force && lastCount === String(free)) {
    return NextResponse.json({ sent: false, freeTonight: free, reason: `Still ${free} free — unchanged since the last digest, so nobody needs pinging again.` });
  }

  const result = await sendWebPush({
    title: free === 1 ? "1 room free tonight at Sunrise Motel" : `${free} rooms free tonight at Sunrise Motel`,
    body: "Two taps and it is yours — no account needed.",
    url: "/",
    tag: "sunrise-rooms-tonight",
  });

  await setSetting("DIGEST_LAST_SENT_ON", today);
  await setSetting("DIGEST_LAST_COUNT", String(free));
  await logAudit({
    action: "push.availability_digest",
    entity: "push",
    summary: `"Rooms free tonight" digest${force ? " (sent by hand)" : ""}: ${free} free, delivered to ${result.sent} device(s) of ${result.devices}.`,
    actor: "system",
    actorLabel: force ? "manager" : "scheduled",
    ip: clientIp(request),
    metadata: { free, ...result, forced: force },
  });

  return NextResponse.json({
    sent: result.sent > 0,
    delivered: result.sent,
    failed: result.failed,
    pruned: result.pruned,
    devices: result.devices,
    freeTonight: free,
    forced: force,
    reason: result.reason,
  });
}
