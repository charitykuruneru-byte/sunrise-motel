import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { serviceTasksTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { GUEST_AUTH_HINT, resolveGuestContext } from "@/lib/guest-context";
import { taskDueBy } from "@/lib/hotel";
import { logNotification } from "@/lib/notify";

export const dynamic = "force-dynamic";

const KINDS = ["cleaning", "towels", "linen", "maintenance", "amenity", "taxi", "wake_up", "other"];

/**
 * Quick requests (§6) — one tap from the app becomes a tracked task ON THE ROOM,
 * with a due time from its priority, so housekeeping sees it on the room map and
 * the guest sees it progress.
 *
 * ADDENDUM (two guest paths): the caller is resolved by `resolveGuestContext`, so a
 * guest who never made an account — in the room with the QR card, the key-sleeve PIN
 * or a booking reference — raises exactly the same task. Ordering to a room needs an
 * open session for that room; the room number comes from the session, never the body.
 */
export async function POST(request: Request) {
  const ctx = await resolveGuestContext(request);
  if (!ctx) return NextResponse.json({ error: GUEST_AUTH_HINT }, { status: 401 });
  try {
    const body = (await request.json()) as { kind?: string; note?: string; priority?: string };
    const kind = KINDS.includes(body.kind ?? "") ? (body.kind as string) : "other";
    const roomNumber = ctx.roomNumber;
    if (!roomNumber) {
      return NextResponse.json(
        { error: "We could not match your request to a room. Please call the front desk on +265 998 688 332." },
        { status: 409 },
      );
    }
    const priority = ["urgent", "emergency"].includes(body.priority ?? "") ? (body.priority as string) : "normal";
    const [task] = await db
      .insert(serviceTasksTable)
      .values({
        id: crypto.randomUUID(),
        roomNumber,
        bookingId: ctx.bookingId,
        guestAccountId: ctx.accountId,
        channel: ctx.channel,
        roomSessionId: ctx.kind === "room" ? ctx.sessionId : null,
        kind,
        note: body.note?.trim() || null,
        requestedBy: "guest",
        requestedByLabel: ctx.guestName,
        priority,
        status: "open",
        dueBy: taskDueBy(priority),
      })
      .returning();

    await logNotification({
      channel: "portal",
      template: `task_${kind}`,
      recipient: `Room ${roomNumber}`,
      subject: `${priority === "normal" ? "" : `${priority.toUpperCase()} · `}${kind.replace("_", " ")} · Room ${roomNumber}`,
      body: `${ctx.guestName}: ${body.note?.trim() || kind.replace("_", " ")}${ctx.kind === "room" ? ` · no app (via ${ctx.channel}) — call or SMS ${ctx.booking?.phone ?? "the number on the booking"}` : ""}`,
      status: "sent",
      guestId: ctx.guestId,
      bookingId: ctx.bookingId,
    });
    await logAudit({
      action: "task.requested_by_guest",
      entity: "service_task",
      entityId: task!.id,
      reference: `Room ${roomNumber}`,
      summary: `${ctx.guestName} asked for ${kind.replace("_", " ")} in Room ${roomNumber}${body.note ? ` — ${body.note.trim()}` : ""}${ctx.kind === "room" ? ` (no account, via ${ctx.channel})` : ""}.`,
      actor: "guest",
      actorLabel: ctx.guestName,
      ip: clientIp(request),
      metadata: { kind, priority, channel: ctx.channel },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Guest request failed", error);
    return NextResponse.json({ error: "Could not log your request." }, { status: 500 });
  }
}
