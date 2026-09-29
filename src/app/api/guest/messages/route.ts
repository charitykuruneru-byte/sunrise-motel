import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messageThreadsTable, messagesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { GUEST_AUTH_HINT, resolveGuestContext } from "@/lib/guest-context";
import { logNotification } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * The private guest ↔ desk thread (§5). The room number is attached
 * automatically — the guest never types it — and the thread is only readable by
 * this guest and the desk, enforced here on the server.
 *
 * ADDENDUM (two guest paths): the caller is resolved by `resolveGuestContext`, so a
 * guest with NO account — who proved they are in Room 104 with the QR card, the PIN
 * or their booking reference — gets exactly this thread. The only difference is the
 * channel recorded on it (`qr` / `pin` / `reference` instead of `app`), which tells
 * the desk how to reply: push for the app, SMS/WhatsApp for the room session.
 */
export async function POST(request: Request) {
  const ctx = await resolveGuestContext(request);
  if (!ctx) return NextResponse.json({ error: GUEST_AUTH_HINT }, { status: 401 });
  if (ctx.messagingMuted) {
    return NextResponse.json(
      {
        error:
          "Messaging is paused on this account. You can still order and see your bill — or call the front desk on +265 998 688 332.",
      },
      { status: 403 },
    );
  }
  try {
    const body = (await request.json()) as { body?: string; kind?: string; subject?: string };
    const text = (body.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "Type your message first." }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: "Please keep it under 2000 characters." }, { status: 400 });

    const kind = ["message", "request", "complaint", "emergency"].includes(body.kind ?? "")
      ? (body.kind as string)
      : "message";
    const roomNumber = ctx.roomNumber;
    const now = new Date();

    // Find this guest's thread for this stay, or open one.
    let [thread] = ctx.bookingId
      ? await db.select().from(messageThreadsTable).where(eq(messageThreadsTable.bookingId, ctx.bookingId)).limit(1)
      : [];
    if (!thread) {
      const [created] = await db
        .insert(messageThreadsTable)
        .values({
          id: crypto.randomUUID(),
          bookingId: ctx.bookingId,
          roomNumber,
          guestId: ctx.guestId,
          guestAccountId: ctx.accountId,
          guestName: ctx.guestName,
          subject: body.subject?.trim() || (kind === "complaint" ? "Guest complaint" : "Guest message"),
          channel: ctx.channel,
          roomSessionId: ctx.kind === "room" ? ctx.sessionId : null,
          kind,
          priority: kind === "emergency" ? "emergency" : kind === "complaint" ? "urgent" : "normal",
          status: "open",
          lastMessageAt: now,
        })
        .returning();
      thread = created!;
    }
    const [message] = await db
      .insert(messagesTable)
      .values({
        id: crypto.randomUUID(),
        threadId: thread.id,
        bookingId: ctx.bookingId,
        roomNumber,
        guestId: ctx.guestId,
        direction: "guest_to_desk",
        body: text,
        kind,
        status: "sent",
        senderLabel: ctx.guestName,
      })
      .returning();
    await db
      .update(messageThreadsTable)
      .set({
        lastMessageAt: now,
        status: thread.status === "resolved" || thread.status === "closed" ? "open" : thread.status,
        kind: kind === "emergency" ? "emergency" : thread.kind,
        priority: kind === "emergency" ? "emergency" : thread.priority,
        escalatedAt: kind === "emergency" ? now : thread.escalatedAt,
      })
      .where(eq(messageThreadsTable.id, thread.id));

    await logNotification({
      channel: "portal",
      template: `guest_${kind}`,
      recipient: roomNumber ? `Room ${roomNumber}` : "unassigned",
      subject: `${kind === "emergency" ? "EMERGENCY · " : ""}${roomNumber ? `Room ${roomNumber} · ` : ""}${ctx.guestName}`,
      // A no-account guest cannot be reached by push: the desk needs the number they
      // booked with so they can reply by SMS/WhatsApp, so it travels in the alert.
      body: `${text}${ctx.kind === "room" ? ` · reply to ${ctx.booking?.phone ?? "the number on the booking"} (no app — arrived via ${ctx.channel})` : ""}`,
      status: "sent",
      guestId: ctx.guestId,
      bookingId: ctx.bookingId,
    });
    await logAudit({
      action: `message.guest_${kind}`,
      entity: "message_thread",
      entityId: thread.id,
      reference: roomNumber ? `Room ${roomNumber}` : null,
      summary: `${ctx.guestName} (${roomNumber ? `Room ${roomNumber}` : "no room"}${ctx.kind === "room" ? `, no account, via ${ctx.channel}` : ""}) sent a ${kind}: ${text.slice(0, 160)}`,
      actor: "guest",
      actorLabel: ctx.guestName,
      ip: clientIp(request),
      metadata: { kind, channel: ctx.channel, priority: kind === "emergency" ? "emergency" : "normal" },
    });

    return NextResponse.json({ success: true, message, threadId: thread.id, emergency: kind === "emergency" });
  } catch (error) {
    console.error("Guest message failed", error);
    return NextResponse.json({ error: "Could not send your message." }, { status: 500 });
  }
}
