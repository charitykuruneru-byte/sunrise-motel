import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogTable,
  bookings,
  folioItemsTable,
  messageThreadsTable,
  ordersTable,
  paymentsTable,
  roomsTable,
  serviceTasksTable,
} from "@/db/schema";
import { deskActor } from "@/lib/desk-auth";
import { ensureRoomsSeeded, ROOM_HOLDING_STATUSES } from "@/lib/hotel";
import { malawiDatePart, nowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The admin dashboard's Overview tab (§8.2 + §8.3): the action centre — nothing
 * can sit unattended without appearing here — plus the KPI row and the day's
 * arrivals / departures / in-house lists.
 */
export async function GET(request: Request) {
  const auth = deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    await ensureRoomsSeeded();
    const today = malawiDatePart();
    const now = nowDate();

    const [allBookings, rooms, threads, orders, tasks, payments, folioItems, activity] = await Promise.all([
      db.select().from(bookings).orderBy(desc(bookings.createdAt)),
      db.select().from(roomsTable),
      db.select().from(messageThreadsTable).orderBy(desc(messageThreadsTable.lastMessageAt)),
      db.select().from(ordersTable).orderBy(desc(ordersTable.placedAt)).limit(100),
      db.select().from(serviceTasksTable).orderBy(desc(serviceTasksTable.createdAt)).limit(100),
      db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)).limit(200),
      db.select().from(folioItemsTable).where(eq(folioItemsTable.status, "open")),
      db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(12),
    ]);

    const live = allBookings.filter((b) => !["cancelled", "released_unpaid"].includes(b.status));
    const arrivals = live.filter((b) => b.checkIn === today && ["pending", "awaiting_payment", "confirmed"].includes(b.status));
    const departures = allBookings.filter((b) => b.checkOut === today && b.status === "checked_in");
    const inHouse = allBookings.filter((b) => b.status === "checked_in");
    const unassigned = arrivals.filter((b) => !b.assignedRoomId && !b.assignedRoom);

    const sellableRooms = rooms.filter((r) => r.isActive && r.state !== "out_of_order");
    const soldToday = live.filter((b) => ROOM_HOLDING_STATUSES.includes(b.status) && b.checkIn <= today && today < b.checkOut);
    const roomRevenueToday = soldToday.reduce((sum, b) => sum + b.nightlyRate, 0);
    const occupancy = sellableRooms.length ? Math.round((soldToday.length / sellableRooms.length) * 100) : 0;
    const adr = soldToday.length ? Math.round(roomRevenueToday / soldToday.length) : 0;
    const revpar = sellableRooms.length ? Math.round(roomRevenueToday / sellableRooms.length) : 0;

    const openThreads = threads.filter((t) => !["closed", "resolved"].includes(t.status));
    const emergencies = openThreads.filter((t) => t.priority === "emergency" || t.kind === "emergency");
    const complaints = openThreads.filter((t) => t.kind === "complaint");
    const pendingPayments = payments.filter((p) => p.status === "pending_verification");
    const unverifiedTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    const verifiedPayments = payments.filter((p) => p.status === "verified");
    const collectedByChannel = verifiedPayments.reduce<Record<string, number>>((acc, p) => {
      acc[p.channel] = (acc[p.channel] ?? 0) + p.amount;
      return acc;
    }, {});
    const collected = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);

    const activeOrders = orders.filter((o) => ["placed", "accepted", "preparing", "ready"].includes(o.status));
    const waitingOrders = activeOrders.filter((o) => now.getTime() - new Date(o.placedAt).getTime() > 20 * 60_000);
    const openTasks = tasks.filter((t) => ["open", "assigned", "in_progress"].includes(t.status));
    const folioOutstanding = folioItems.reduce((sum, item) => sum + item.amount, 0);

    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const sumSince = (from: Date) =>
      allBookings.filter((b) => new Date(b.createdAt) >= from).reduce((sum, b) => sum + b.totalAmount, 0);

    const oldestThread = [...openThreads].sort(
      (a, b) => new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime(),
    )[0];

    const byRoomId = new Map(rooms.map((r) => [r.id, r]));
    const roomNumberFor = (b: (typeof allBookings)[number]) => {
      if (b.assignedRoomId) return byRoomId.get(b.assignedRoomId)?.roomNumber ?? null;
      return b.assignedRoom?.replace(/[^0-9]/g, "") || null;
    };
    return NextResponse.json({
      today,
      actionCentre: {
        paymentsToVerify: { count: pendingPayments.length, amount: unverifiedTotal },
        unassignedArrivals: {
          count: unassigned.length,
          list: unassigned.slice(0, 6).map((b) => ({
            id: b.id, reference: b.reference, guestName: b.guestName, roomType: b.roomType, checkIn: b.checkIn,
          })),
        },
        emergencies: {
          count: emergencies.length,
          room: emergencies[0]?.roomNumber ?? null,
          subject: emergencies[0]?.subject ?? null,
        },
        complaints: {
          count: complaints.length,
          oldestMinutes: oldestThread
            ? Math.round((now.getTime() - new Date(oldestThread.lastMessageAt).getTime()) / 60000)
            : 0,
        },
        escalatedBookings: { count: allBookings.filter((b) => b.escalatedAt && b.status === "pending").length },
        ordersWaiting: {
          count: waitingOrders.length,
          oldestMinutes: waitingOrders[0]
            ? Math.round((now.getTime() - new Date(waitingOrders[0].placedAt).getTime()) / 60000)
            : 0,
        },
        openTasks: {
          count: openTasks.length,
          overdue: openTasks.filter((t) => t.dueBy && new Date(t.dueBy) < now).length,
        },
      },
      kpis: {
        occupancy,
        adr,
        revpar,
        roomsSoldToday: soldToday.length,
        sellableRooms: sellableRooms.length,
        outOfOrder: rooms.filter((r) => r.state === "out_of_order").length,
        arrivals: arrivals.length,
        departures: departures.length,
        unassigned: unassigned.length,
        inHouse: inHouse.length,
        revenueToday: sumSince(new Date(new Date().setHours(0, 0, 0, 0))),
        revenueWeek: sumSince(weekStart),
        revenueMonth: sumSince(monthStart),
        collected,
        collectedByChannel,
        outstanding: folioOutstanding,
        unverifiedPayments: unverifiedTotal,
        openOrders: activeOrders.length,
        openIssues: openThreads.length,
        openTasks: openTasks.length,
      },
      arrivals: arrivals.map((b) => ({
        id: b.id, reference: b.reference, guestName: b.guestName, phone: b.phone, email: b.email,
        roomType: b.roomType, nights: b.nights, adults: b.adults, children: b.children,
        status: b.status, totalAmount: b.totalAmount, amountPaid: b.amountPaid,
        roomNumber: roomNumberFor(b), guestId: b.guestId, arrival: b.arrival, requests: b.requests,
      })),
      departures: departures.map((b) => ({
        id: b.id, reference: b.reference, guestName: b.guestName, roomNumber: roomNumberFor(b),
        checkOut: b.checkOut, totalAmount: b.totalAmount, amountPaid: b.amountPaid, status: b.status,
      })),
      inHouse: inHouse.map((b) => ({
        id: b.id, reference: b.reference, guestName: b.guestName, phone: b.phone,
        roomNumber: roomNumberFor(b), checkIn: b.checkIn, checkOut: b.checkOut,
        balance: b.totalAmount - b.amountPaid, guestId: b.guestId,
      })),
      roomStates: rooms.reduce<Record<string, number>>((acc, room) => {
        acc[room.state] = (acc[room.state] ?? 0) + 1;
        return acc;
      }, {}),
      outOfOrderRooms: rooms
        .filter((r) => r.state === "out_of_order")
        .map((r) => ({ roomNumber: r.roomNumber, reason: r.oooReason, until: r.oooUntil })),
      recentActivity: activity.map((row) => ({
        id: row.id, action: row.action, summary: row.summary, actor: row.actor,
        actorLabel: row.actorLabel, createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    console.error("Desk overview failed", error);
    return NextResponse.json({ error: "Could not load the front-desk board." }, { status: 500 });
  }
}
