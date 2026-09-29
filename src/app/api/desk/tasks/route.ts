import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { roomsTable, serviceTasksTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor } from "@/lib/desk-auth";
import { taskDueBy } from "@/lib/hotel";

export const dynamic = "force-dynamic";

const OPEN = ["open", "assigned", "in_progress"];

/**
 * Housekeeping / maintenance tasks (§6). A maintenance task that cannot be fixed
 * now is what sets a room `out_of_order` — the chain is: guest complains → task
 * created → cannot be fixed now → room out of order → availability drops → the
 * room is never sold to anyone else.
 */
export async function GET(request: Request) {
  const auth = deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const [tasks, rooms] = await Promise.all([
      db.select().from(serviceTasksTable).orderBy(desc(serviceTasksTable.createdAt)).limit(200),
      db.select().from(roomsTable).orderBy(roomsTable.roomNumber),
    ]);
    const now = new Date();
    const enriched = tasks.map((task) => ({
      ...task,
      overdue: Boolean(task.dueBy && new Date(task.dueBy) < now && OPEN.includes(task.status)),
      roomState: rooms.find((r) => r.roomNumber === task.roomNumber)?.state ?? null,
    }));
    const openTasks = enriched.filter((t) => OPEN.includes(t.status));
    return NextResponse.json({
      open: openTasks,
      done: enriched.filter((t) => !OPEN.includes(t.status)),
      byRoom: rooms
        .filter((room) => openTasks.some((t) => t.roomNumber === room.roomNumber))
        .map((room) => ({ roomNumber: room.roomNumber, state: room.state, tasks: openTasks.filter((t) => t.roomNumber === room.roomNumber) })),
      stats: {
        open: openTasks.length,
        overdue: openTasks.filter((t) => t.overdue).length,
        urgent: openTasks.filter((t) => t.priority !== "normal").length,
        doneToday: enriched.filter((t) => t.completedAt && new Date(t.completedAt).toDateString() === now.toDateString()).length,
      },
    });
  } catch (error) {
    console.error("Tasks load failed", error);
    return NextResponse.json({ error: "Could not load the task list." }, { status: 500 });
  }
}

/** Create a task (the desk can log one on a guest's behalf, e.g. by phone). */
export async function POST(request: Request) {
  const auth = deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      roomNumber?: string;
      kind?: string;
      note?: string;
      priority?: string;
      assignedTo?: string;
    };
    const roomNumber = (body.roomNumber ?? "").trim();
    if (!roomNumber) return NextResponse.json({ error: "roomNumber is required." }, { status: 400 });
    const priority = body.priority === "emergency" || body.priority === "urgent" ? body.priority : "normal";
    const [task] = await db
      .insert(serviceTasksTable)
      .values({
        id: crypto.randomUUID(),
        roomNumber,
        kind: body.kind ?? "other",
        note: body.note?.trim() || null,
        requestedBy: "staff",
        requestedByLabel: auth.label,
        assignedTo: body.assignedTo?.trim() || null,
        priority,
        status: body.assignedTo ? "assigned" : "open",
        dueBy: taskDueBy(priority),
      })
      .returning();
    await logAudit({
      action: "task.created",
      entity: "service_task",
      entityId: task.id,
      reference: `Room ${roomNumber}`,
      summary: `${auth.label} logged a ${task.kind} task for Room ${roomNumber} (${priority}).`,
      actor: "manager",
      actorLabel: auth.label,
      ip: clientIp(request),
    });
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Task create failed", error);
    return NextResponse.json({ error: "Could not create the task." }, { status: 500 });
  }
}
/**
 * Work a task: assign, start, complete, cancel — or send the room out of order
 * when the work cannot be finished now.
 */
export async function PATCH(request: Request) {
  const auth = deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      taskId?: string;
      action?: string;
      assignedTo?: string;
      note?: string;
      reason?: string;
      until?: string;
    };
    const taskId = body.taskId ?? "";
    const action = body.action ?? "";
    if (!taskId || !action) return NextResponse.json({ error: "taskId and action are required." }, { status: 400 });
    const [task] = await db.select().from(serviceTasksTable).where(eq(serviceTasksTable.id, taskId)).limit(1);
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    const now = new Date();

    if (action === "assign") {
      await db
        .update(serviceTasksTable)
        .set({ status: "assigned", assignedTo: body.assignedTo?.trim() || null })
        .where(eq(serviceTasksTable.id, task.id));
    } else if (action === "start") {
      await db.update(serviceTasksTable).set({ status: "in_progress" }).where(eq(serviceTasksTable.id, task.id));
    } else if (action === "done") {
      await db
        .update(serviceTasksTable)
        .set({ status: "done", completedAt: now, completedBy: auth.label })
        .where(eq(serviceTasksTable.id, task.id));
      // Housekeeping "done" means the room is clean again and sellable.
      if (["cleaning", "towels", "linen", "amenity"].includes(task.kind)) {
        await db
          .update(roomsTable)
          .set({ state: "clean", updatedAt: now })
          .where(eq(roomsTable.roomNumber, task.roomNumber));
      }
    } else if (action === "cancel") {
      await db
        .update(serviceTasksTable)
        .set({ status: "cancelled", completedAt: now, completedBy: auth.label })
        .where(eq(serviceTasksTable.id, task.id));
    } else if (action === "out_of_order") {
      // Cannot be fixed now → the room stops being sold (§6).
      const until = body.until?.trim() || null;
      await db
        .update(roomsTable)
        .set({
          state: "out_of_order",
          oooReason: body.reason?.trim() || task.note || `${task.kind} unresolved`,
          oooUntil: until,
          updatedAt: now,
        })
        .where(eq(roomsTable.roomNumber, task.roomNumber));
      await db
        .update(serviceTasksTable)
        .set({ status: "in_progress", note: `${task.note ?? ""}\nRoom set out of order: ${body.reason?.trim() || "unresolved"}`.trim() })
        .where(eq(serviceTasksTable.id, task.id));
      await logAudit({
        action: "room.out_of_order",
        entity: "room",
        entityId: task.roomNumber,
        reference: `Room ${task.roomNumber}`,
        summary: `${auth.label} set Room ${task.roomNumber} OUT OF ORDER — ${body.reason?.trim() || task.note || task.kind}. Availability reduced.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, outOfOrder: true });
    } else {
      return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
    }

    await logAudit({
      action: `task.${action}`,
      entity: "service_task",
      entityId: task.id,
      reference: `Room ${task.roomNumber}`,
      summary: `${auth.label} marked the ${task.kind} task for Room ${task.roomNumber} as ${action}${body.assignedTo ? ` (${body.assignedTo})` : ""}.`,
      actor: "manager",
      actorLabel: auth.label,
      ip: clientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Task update failed", error);
    return NextResponse.json({ error: "Could not update the task." }, { status: 500 });
  }
}
