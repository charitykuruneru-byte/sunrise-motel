import { NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  folioItemsTable,
  guestAccountsTable,
  messageThreadsTable,
  roomsTable,
  serviceTasksTable,
} from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor } from "@/lib/desk-auth";
import { ensureRoomsSeeded, folioTotals, roomIsFree, ROOM_STATES } from "@/lib/hotel";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The room map (§8.4) — one grid of every physical room with its occupant, its
 * housekeeping state, its open issue count and its folio balance. This is the
 * screen the desk and the manager actually work from.
 */
export async function GET(request: Request) {
  const auth = deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    await ensureRoomsSeeded();
    const today = malawiDatePart();
    const [rooms, liveBookings, threads, tasks, folio] = await Promise.all([
      db.select().from(roomsTable).orderBy(roomsTable.roomNumber),
      db
        .select()
        .from(bookings)
        .where(and(inArray(bookings.status, ["confirmed", "checked_in"]), ne(bookings.assignedRoomId, ""))),
      db.select().from(messageThreadsTable).where(ne(messageThreadsTable.status, "closed")),
      db.select().from(serviceTasksTable).where(inArray(serviceTasksTable.status, ["open", "assigned", "in_progress"])),
      db.select().from(folioItemsTable).where(eq(folioItemsTable.status, "open")),
    ]);

    const accounts = await db
      .select({ guestId: guestAccountsTable.guestId, status: guestAccountsTable.status })
      .from(guestAccountsTable);
    const accountByGuest = new Map(accounts.map((a) => [a.guestId, a]));

    const map = rooms.map((room) => {
      const occupant = liveBookings.find(
        (b) => b.assignedRoomId === room.id && b.checkIn <= today && today < b.checkOut,
      );
      const arrivalToday = liveBookings.find((b) => b.assignedRoomId === room.id && b.checkIn === today);
      const departureToday = liveBookings.find((b) => b.assignedRoomId === room.id && b.checkOut === today);
      const totals = folioTotals(folio.filter((item) => item.roomNumber === room.roomNumber));
      const account = occupant?.guestId ? accountByGuest.get(occupant.guestId) : undefined;
      return {
        id: room.id,
        roomNumber: room.roomNumber,
        roomTypeId: room.roomTypeId,
        roomType: room.roomType,
        floor: room.floor,
        state: room.state,
        oooReason: room.oooReason,
        oooUntil: room.oooUntil,
        occupant: occupant
          ? {
              bookingId: occupant.id,
              reference: occupant.reference,
              guestName: occupant.guestName,
              phone: occupant.phone,
              checkIn: occupant.checkIn,
              checkOut: occupant.checkOut,
              status: occupant.status,
              guestId: occupant.guestId,
              appAccount: account?.status ?? null,
            }
          : null,
        arrivalToday: arrivalToday
          ? {
              bookingId: arrivalToday.id,
              reference: arrivalToday.reference,
              guestName: arrivalToday.guestName,
              status: arrivalToday.status,
            }
          : null,
        departureToday: departureToday
          ? { reference: departureToday.reference, guestName: departureToday.guestName }
          : null,
        openIssues: threads.filter((t) => t.roomNumber === room.roomNumber).length,
        emergency: threads.some(
          (t) => t.roomNumber === room.roomNumber && (t.priority === "emergency" || t.kind === "emergency"),
        ),
        openTasks: tasks.filter((t) => t.roomNumber === room.roomNumber).length,
        folio: { balance: totals.total, openItems: totals.openCount },
      };
    });

    return NextResponse.json({ today, rooms: map, states: ROOM_STATES });
  } catch (error) {
    console.error("Room map failed", error);
    return NextResponse.json({ error: "Could not load the room map." }, { status: 500 });
  }
}

/**
 * Change a room's housekeeping state, or assign a booking to a physical room.
 *
 * Assignment is VALIDATED (§31 of the spec): the room must exist, must not be
 * out of order, and must not already hold another stay for an overlapping night
 * range. `assignedRoom` (the v1 free text) is kept in step so older screens keep
 * working.
 */
export async function PATCH(request: Request) {
  const auth = deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      roomId?: string;
      state?: string;
      reason?: string;
      until?: string;
      bookingId?: string;
      notes?: string;
    };

    // --- Assign (or reassign) a booking to a physical room. ---
    if (body.bookingId && body.roomId) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1);
      if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, body.roomId)).limit(1);
      if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
      if (room.state === "out_of_order") {
        return NextResponse.json(
          { error: `Room ${room.roomNumber} is out of order (${room.oooReason ?? "no reason recorded"}).` },
          { status: 409 },
        );
      }
      // A dirty room is not sellable. Without this guard the assignment below would silently flip the
      // room's housekeeping state to occupied/available, losing the "needs cleaning" signal entirely.
      // The desk clears it first by patching the room state to "clean" (see the state branch below).
      if (room.state === "dirty") {
        return NextResponse.json(
          {
            error: `Room ${room.roomNumber} is still dirty. Mark it clean before assigning a guest to it.`,
          },
          { status: 409 },
        );
      }
      const free = await roomIsFree(room.id, booking.checkIn, booking.checkOut, booking.id);
      if (!free) {
        return NextResponse.json(
          {
            error: `Room ${room.roomNumber} already holds another stay that overlaps ${booking.checkIn} → ${booking.checkOut}.`,
          },
          { status: 409 },
        );
      }
      await db
        .update(bookings)
        .set({ assignedRoomId: room.id, assignedRoom: `Room ${room.roomNumber}`, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
      await db
        .update(roomsTable)
        .set({ state: booking.status === "checked_in" ? "occupied" : "available", updatedAt: new Date() })
        .where(eq(roomsTable.id, room.id));
      await logAudit({
        action: "booking.room_assigned",
        entity: "booking",
        entityId: booking.id,
        reference: booking.reference,
        summary: `${auth.label} assigned Room ${room.roomNumber} (${room.roomType}) to ${booking.guestName} · ${booking.reference}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { roomNumber: room.roomNumber, roomId: room.id },
      });
      return NextResponse.json({ success: true, roomNumber: room.roomNumber });
    }

    // --- Housekeeping / out-of-order state. ---
    const roomId = body.roomId ?? "";
    if (!roomId) return NextResponse.json({ error: "roomId is required." }, { status: 400 });
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId)).limit(1);
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const patch: Partial<typeof roomsTable.$inferInsert> = { updatedAt: new Date() };
    if (body.state) {
      if (!ROOM_STATES.includes(body.state as (typeof ROOM_STATES)[number])) {
        return NextResponse.json({ error: `Unknown room state "${body.state}".` }, { status: 400 });
      }
      patch.state = body.state;
      if (body.state === "out_of_order") {
        patch.oooReason = body.reason?.trim() || "Maintenance";
        patch.oooUntil = body.until?.trim() || null;
      } else {
        patch.oooReason = null;
        patch.oooUntil = null;
      }
    }
    if (typeof body.notes === "string") patch.notes = body.notes;

    await db.update(roomsTable).set(patch).where(eq(roomsTable.id, roomId));
    await logAudit({
      action: body.state ? "room.state_changed" : "room.updated",
      entity: "room",
      entityId: room.id,
      summary: `${auth.label} set Room ${room.roomNumber} to ${patch.state ?? room.state}${patch.oooReason ? ` — ${patch.oooReason}` : ""}.`,
      actor: "manager",
      actorLabel: auth.label,
      ip: clientIp(request),
      metadata: { state: patch.state ?? room.state },
    });
    return NextResponse.json({ success: true, roomNumber: room.roomNumber, state: patch.state ?? room.state });
  } catch (error) {
    console.error("Room update failed", error);
    return NextResponse.json({ error: "Could not update the room." }, { status: 500 });
  }
}
