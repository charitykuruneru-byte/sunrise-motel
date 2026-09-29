import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  folioItemsTable,
  guestAccountsTable,
  guestsTable,
  messageThreadsTable,
  messagesTable,
  ordersTable,
} from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor } from "@/lib/desk-auth";
import { folioTotals } from "@/lib/hotel";
import { logNotification } from "@/lib/notify";
import { nowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const OPEN_STATES = ["open", "acknowledged", "in_progress", "escalated"];

/**
 * The issue queue (§5.4) — grouped BY ROOM, because that is how a front desk
 * thinks. Each thread carries the guest's context on the same screen: room,
 * nights, folio balance, open orders, previous stays and previous complaints.
 */
export async function GET(request: Request) {
  const auth = deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const now = nowDate();
    const [threads, messages, accounts, folio, orders, allBookings, guestRows] = await Promise.all([
      db.select().from(messageThreadsTable).orderBy(desc(messageThreadsTable.lastMessageAt)).limit(200),
      db.select().from(messagesTable).orderBy(messagesTable.createdAt),
      db.select().from(guestAccountsTable),
      db.select().from(folioItemsTable).where(eq(folioItemsTable.status, "open")),
      db.select().from(ordersTable).orderBy(desc(ordersTable.placedAt)).limit(100),
      db.select().from(bookings),
      db.select().from(guestsTable),
    ]);

    const enriched = threads.map((thread) => {
      const threadMessages = messages.filter((m) => m.threadId === thread.id);
      const booking = allBookings.find((b) => b.id === thread.bookingId);
      const guest = guestRows.find((g) => g.id === thread.guestId);
      const account = accounts.find((a) => a.guestId === thread.guestId);
      const roomFolio = folioTotals(folio.filter((item) => item.roomNumber === thread.roomNumber));
      const previousStays = allBookings.filter(
        (b) => b.guestId === thread.guestId && b.id !== thread.bookingId && b.status === "checked_out",
      ).length;
      const previousComplaints = threads.filter(
        (t) => t.guestId === thread.guestId && t.kind === "complaint" && t.id !== thread.id,
      ).length;
      const ageMinutes = Math.max(
        0,
        Math.round((now.getTime() - new Date(thread.lastMessageAt).getTime()) / 60000),
      );
      return {
        ...thread,
        ageMinutes,
        messages: threadMessages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          kind: m.kind,
          status: m.status,
          senderLabel: m.senderLabel,
          createdAt: m.createdAt,
          readByStaffAt: m.readByStaffAt,
          readByGuestAt: m.readByGuestAt,
        })),
        context: {
          stay: booking
            ? {
                reference: booking.reference,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
                status: booking.status,
                nights: booking.nights,
              }
            : null,
          folioBalance: roomFolio.total,
          openOrders: orders.filter(
            (o) => o.roomNumber === thread.roomNumber && ["placed", "accepted", "preparing", "ready"].includes(o.status),
          ).length,
          previousStays,
          previousComplaints,
          firstTime: previousStays === 0,
          appAccount: account?.status ?? null,
          marketingConsent: account?.marketingConsent ?? false,
        },
      };
    });

    const open = enriched.filter((t) => OPEN_STATES.includes(t.status));
    // Grouped by room, exactly as the desk board prints it.
    const byRoom = new Map<string, { roomNumber: string; threads: typeof open; emergency: boolean }>();
    for (const thread of open) {
      const key = thread.roomNumber ?? "unassigned";
      const entry = byRoom.get(key) ?? { roomNumber: key, threads: [], emergency: false };
      entry.threads.push(thread);
      if (thread.priority === "emergency" || thread.kind === "emergency") entry.emergency = true;
      byRoom.set(key, entry);
    }

    return NextResponse.json({
      rooms: [...byRoom.values()].sort((a, b) => (a.emergency === b.emergency ? a.roomNumber.localeCompare(b.roomNumber) : a.emergency ? -1 : 1)),
      threads: enriched,
      totals: {
        open: open.length,
        emergencies: open.filter((t) => t.priority === "emergency" || t.kind === "emergency").length,
        escalated: open.filter((t) => t.status === "escalated").length,
        unacknowledged: open.filter((t) => t.status === "open").length,
      },
    });
  } catch (error) {
    console.error("Issue queue failed", error);
    return NextResponse.json({ error: "Could not load the issue queue." }, { status: 500 });
  }
}

/**
 * Work a thread: acknowledge, reply, resolve, escalate, close or reopen.
 * Every transition is audited with actor, room and time, so "who knew about the
 * broken geyser in 201 and when" is always answerable (§5.5).
 */
export async function POST(request: Request) {
  const auth = deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      threadId?: string;
      action?: string;
      body?: string;
      note?: string;
      canned?: string;
    };
    const threadId = body.threadId ?? "";
    const action = body.action ?? "";
    if (!threadId || !action) return NextResponse.json({ error: "threadId and action are required." }, { status: 400 });

    const [thread] = await db.select().from(messageThreadsTable).where(eq(messageThreadsTable.id, threadId)).limit(1);
    if (!thread) return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    const now = new Date();
    const roomLabel = thread.roomNumber ? `Room ${thread.roomNumber}` : "—";

    if (action === "reply") {
      const text = (body.body ?? body.canned ?? "").trim();
      if (!text) return NextResponse.json({ error: "Write a reply, or pick a canned reply." }, { status: 400 });
      const [message] = await db
        .insert(messagesTable)
        .values({
          id: crypto.randomUUID(),
          threadId: thread.id,
          bookingId: thread.bookingId,
          roomNumber: thread.roomNumber,
          guestId: thread.guestId,
          direction: "desk_to_guest",
          body: text,
          kind: "message",
          status: "sent",
          senderLabel: auth.label,
          readByStaffAt: now,
        })
        .returning();
      await db
        .update(messagesTable)
        .set({ readByStaffAt: now, status: "read" })
        .where(eq(messagesTable.threadId, thread.id));
      await db
        .update(messageThreadsTable)
        .set({ status: thread.status === "open" ? "in_progress" : thread.status, lastMessageAt: now })
        .where(eq(messageThreadsTable.id, thread.id));
      await logNotification({
        channel: "portal",
        template: "guest_message_reply",
        recipient: roomLabel,
        subject: `Reply sent to ${thread.guestName ?? "guest"} (${roomLabel})`,
        body: text,
        status: "sent",
        guestId: thread.guestId,
        bookingId: thread.bookingId,
      });
      await logAudit({
        action: "message.replied",
        entity: "message_thread",
        entityId: thread.id,
        reference: thread.roomNumber ? `Room ${thread.roomNumber}` : null,
        summary: `${auth.label} replied to ${thread.guestName ?? "guest"} (${roomLabel}): ${text.slice(0, 140)}`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, message });
    }

    if (action === "acknowledge") {
      await db
        .update(messageThreadsTable)
        .set({ status: "acknowledged" })
        .where(eq(messageThreadsTable.id, thread.id));
      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        threadId: thread.id,
        bookingId: thread.bookingId,
        roomNumber: thread.roomNumber,
        guestId: thread.guestId,
        direction: "desk_to_guest",
        body: "We have seen your message and we are on it.",
        kind: "system",
        status: "sent",
        senderLabel: auth.label,
      });
      await logAudit({
        action: "issue.acknowledged",
        entity: "message_thread",
        entityId: thread.id,
        summary: `${auth.label} acknowledged the open issue on ${roomLabel}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true });
    }
    if (action === "resolve") {
      const note = (body.note ?? "").trim();
      if (!note) return NextResponse.json({ error: "Add a short resolution note (the guest sees it)." }, { status: 400 });
      await db
        .update(messageThreadsTable)
        .set({ status: "resolved", resolutionNote: note, resolvedAt: now })
        .where(eq(messageThreadsTable.id, thread.id));
      await db.insert(messagesTable).values({
        id: crypto.randomUUID(),
        threadId: thread.id,
        bookingId: thread.bookingId,
        roomNumber: thread.roomNumber,
        guestId: thread.guestId,
        direction: "desk_to_guest",
        body: `Resolved: ${note}`,
        kind: "system",
        status: "sent",
        senderLabel: auth.label,
      });
      await logAudit({
        action: "issue.resolved",
        entity: "message_thread",
        entityId: thread.id,
        reference: thread.roomNumber ? `Room ${thread.roomNumber}` : null,
        summary: `${auth.label} resolved the issue on ${roomLabel}: ${note}`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "escalate") {
      await db
        .update(messageThreadsTable)
        .set({ status: "escalated", escalatedAt: now, priority: "urgent" })
        .where(eq(messageThreadsTable.id, thread.id));
      await logNotification({
        channel: "portal",
        template: "issue_escalated",
        recipient: "admin",
        subject: `ESCALATED · ${roomLabel} · ${thread.subject ?? "issue"}`,
        body: body.note ?? "Escalated by the front desk.",
        status: "sent",
        guestId: thread.guestId,
        bookingId: thread.bookingId,
      });
      await logAudit({
        action: "issue.escalated",
        entity: "message_thread",
        entityId: thread.id,
        reference: thread.roomNumber ? `Room ${thread.roomNumber}` : null,
        summary: `${auth.label} escalated the ${thread.kind} on ${roomLabel} to the admin.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "close" || action === "reopen") {
      const status = action === "close" ? "closed" : "open";
      await db
        .update(messageThreadsTable)
        .set({ status, resolvedAt: action === "close" ? now : null })
        .where(eq(messageThreadsTable.id, thread.id));
      await logAudit({
        action: action === "close" ? "issue.closed" : "issue.reopened",
        entity: "message_thread",
        entityId: thread.id,
        summary: `${auth.label} marked the ${roomLabel} thread ${status}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, status });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    console.error("Issue action failed", error);
    return NextResponse.json({ error: "Could not complete that issue action." }, { status: 500 });
  }
}
