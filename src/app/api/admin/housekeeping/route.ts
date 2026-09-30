import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { roomsTable, serviceTasksTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { readSession } from "@/lib/staff-auth";
import { ROOM_STATES } from "@/lib/hotel";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["open", "assigned", "in_progress"];
const BOARD_KINDS = ["cleaning", "towels", "linen", "maintenance", "amenity", "other"];

/**
 * GET /api/admin/housekeeping — the board's raw material: every room and its state,
 * plus every task still open. The board is drawn by the page from these two lists, so
 * it can never disagree with the desk or with `/api/desk/rooms`.
 */
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const [rooms, tasks] = await Promise.all([
    db.select().from(roomsTable).orderBy(roomsTable.roomNumber),
    db
      .select()
      .from(serviceTasksTable)
      .where(and(inArray(serviceTasksTable.status, OPEN_STATUSES), inArray(serviceTasksTable.kind, BOARD_KINDS)))
      .orderBy(desc(serviceTasksTable.priority), desc(serviceTasksTable.createdAt))
      .limit(300),
  ]);
  return NextResponse.json({
    rooms: rooms.map((room) => ({ id: room.id, roomNumber: room.roomNumber, roomType: room.roomType, floor: room.floor, state: room.state, oooReason: room.oooReason, notes: room.notes })),
    tasks: tasks.map((task) => ({ id: task.id, roomNumber: task.roomNumber, kind: task.kind, note: task.note, status: task.status, priority: task.priority, assignedTo: task.assignedTo, requestedByLabel: task.requestedByLabel, createdAt: task.createdAt })),
    states: ROOM_STATES,
  });
}

/** POST — open a task from the board (e.g. "start cleaning" on a vacated room). */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const body = (await request.json()) as { roomNumber?: string; kind?: string; note?: string; priority?: string; assignedTo?: string };
    const roomNumber = (body.roomNumber ?? "").trim();
    if (!roomNumber) return NextResponse.json({ error: "roomNumber is required." }, { status: 400 });
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.roomNumber, roomNumber)).limit(1);
    if (!room) return NextResponse.json({ error: "No room with that number." }, { status: 404 });
    const kind = BOARD_KINDS.includes(body.kind ?? "") ? (body.kind as string) : "cleaning";
    const priority = ["normal", "urgent", "emergency"].includes(body.priority ?? "") ? (body.priority as string) : "normal";
    const actor = `${user.staffCode} — ${user.name}`;
    const [task] = await db
      .insert(serviceTasksTable)
      .values({
        id: randomUUID(),
        roomNumber,
        kind,
        note: (body.note ?? "").trim() || null,
        requestedBy: "staff",
        requestedByLabel: actor,
        assignedTo: (body.assignedTo ?? "").trim() || null,
        priority,
        status: "in_progress",
      })
      .returning();
    await logAudit({
      action: "TASK_OPENED",
      entity: "service_task",
      entityId: task.id,
      summary: `${actor} started a ${kind} task for room ${roomNumber}.`,
      actor: "manager",
      actorLabel: actor,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: clientIp(request),
      metadata: { roomNumber, kind, priority },
    });
    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error) {
    console.error("Opening a Housekeeping task failed", error);
    return NextResponse.json({ error: "Could not open that task." }, { status: 500 });
  }
}

/** PATCH — move a room, or finish a task. Both write an audit row. */
export async function PATCH(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const body = (await request.json()) as { roomId?: string; state?: string; reason?: string; taskId?: string; status?: string; assignedTo?: string };
    const actor = `${user.staffCode} — ${user.name}`;

    if (body.taskId) {
      const [task] = await db.select().from(serviceTasksTable).where(eq(serviceTasksTable.id, body.taskId)).limit(1);
      if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
      const status = ["open", "assigned", "in_progress", "done", "cancelled"].includes(body.status ?? "") ? (body.status as string) : "in_progress";
      const done = status === "done";
      const [updated] = await db
        .update(serviceTasksTable)
        .set({
          status,
          assignedTo: (body.assignedTo ?? task.assignedTo ?? actor) || null,
          completedAt: done ? new Date() : null,
          completedBy: done ? actor : null,
        })
        .where(eq(serviceTasksTable.id, task.id))
        .returning();
      await logAudit({
        action: done ? "TASK_DONE" : "TASK_UPDATED",
        entity: "service_task",
        entityId: task.id,
        summary: `${actor} set task #${task.kind} for room ${task.roomNumber} to ${status}.`,
        actor: "manager",
        actorLabel: actor,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        ip: clientIp(request),
        metadata: { kind: task.kind, roomNumber: task.roomNumber, status },
      });
      return NextResponse.json({ success: true, task: updated });
    }

    if (!body.roomId || !ROOM_STATES.includes((body.state ?? "") as (typeof ROOM_STATES)[number])) {
      return NextResponse.json({ error: "Send a roomId and a valid state." }, { status: 400 });
    }
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, body.roomId)).limit(1);
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    const state = body.state as (typeof ROOM_STATES)[number];
    const [updated] = await db
      .update(roomsTable)
      .set({
        state,
        // An out-of-order room needs a reason; clearing the state clears the reason with it.
        oooReason: state === "out_of_order" ? (body.reason ?? "").trim() || room.oooReason || "Out of order" : null,
        updatedAt: new Date(),
      })
      .where(eq(roomsTable.id, room.id))
      .returning();

    // Marking a room clean closes the cleaning task that put it in the dirty column, so
    // the board and the desk cannot end up telling two different stories.
    if (state === "clean" || state === "inspected") {
      await db
        .update(serviceTasksTable)
        .set({ status: "done", completedAt: new Date(), completedBy: actor })
        .where(and(eq(serviceTasksTable.roomNumber, room.roomNumber), eq(serviceTasksTable.kind, "cleaning"), inArray(serviceTasksTable.status, OPEN_STATUSES)));
    }

    await logAudit({
      action: "ROOM_STATE_CHANGED",
      entity: "room",
      entityId: room.id,
      summary: `${actor} set room ${room.roomNumber} to ${state.replace(/_/g, " ")}.`,
      actor: "manager",
      actorLabel: actor,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: clientIp(request),
      metadata: { from: room.state, to: state, reason: updated.oooReason ?? null },
    });
    return NextResponse.json({ success: true, room: updated });
  } catch (error) {
    console.error("Housekeeping update failed", error);
    return NextResponse.json({ error: "Could not update that." }, { status: 500 });
  }
}
