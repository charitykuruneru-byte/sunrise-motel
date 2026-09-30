import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { roomBlocksTable, roomsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { isManagerRole, readSession } from "@/lib/staff-auth";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

const REASONS = ["maintenance", "hold", "ooo", "other"];

/** GET /api/admin/room-blocks — today's and future blocks, newest first. */
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  const today = malawiDatePart();
  const rows = await db.select().from(roomBlocksTable).orderBy(desc(roomBlocksTable.startDate)).limit(200);
  return NextResponse.json({ today, blocks: rows.filter((row) => row.endDate > today), past: rows.filter((row) => row.endDate <= today).length });
}

/**
 * POST /api/admin/room-blocks — hold a room back for a window of nights.
 * The block is what the availability arithmetic subtracts, so this is the same action
 * that takes the room off the website for those dates.
 */
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  try {
    const body = (await request.json()) as { roomNumber?: string; startDate?: string; endDate?: string; reason?: string; note?: string };
    const roomNumber = (body.roomNumber ?? "").trim();
    const startDate = (body.startDate ?? "").trim();
    const endDate = (body.endDate ?? "").trim();
    if (!roomNumber) return NextResponse.json({ error: "Which room?" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: "Dates look like 2026-10-01." }, { status: 400 });
    }
    if (endDate <= startDate) return NextResponse.json({ error: "The last night must be after the first." }, { status: 400 });

    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.roomNumber, roomNumber)).limit(1);
    if (!room) return NextResponse.json({ error: "No room with that number." }, { status: 404 });
    if (!REASONS.includes(body.reason ?? "maintenance")) return NextResponse.json({ error: "Choose a valid reason." }, { status: 400 });

    const [block] = await db
      .insert(roomBlocksTable)
      .values({
        id: randomUUID(),
        roomNumber,
        roomTypeId: room.roomTypeId,
        startDate,
        endDate,
        reason: body.reason ?? "maintenance",
        note: (body.note ?? "").trim() || null,
        createdBy: `${user.staffCode} — ${user.name}`,
      })
      .returning();

    await logAudit({
      action: "ROOM_BLOCKED",
      entity: "room",
      entityId: room.id,
      summary: `${user.name} blocked room ${roomNumber} from ${startDate} to ${endDate} (${block.reason}). Those nights are off sale.`,
      actor: "manager",
      actorLabel: `${user.staffCode} — ${user.name}`,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ip: clientIp(request),
      metadata: { roomNumber, startDate, endDate, reason: block.reason },
    });

    return NextResponse.json({ success: true, block }, { status: 201 });
  } catch (error) {
    console.error("Blocking a room failed", error);
    return NextResponse.json({ error: "Could not block that room." }, { status: 500 });
  }
}

/** DELETE /api/admin/room-blocks?id=… — release the dates. */
export async function DELETE(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "A block id is required." }, { status: 400 });
  const [row] = await db.select().from(roomBlocksTable).where(eq(roomBlocksTable.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Block not found." }, { status: 404 });
  await db.delete(roomBlocksTable).where(eq(roomBlocksTable.id, id));
  await logAudit({
    action: "ROOM_UNBLOCKED",
    entity: "room",
    entityId: row.roomNumber,
    summary: `${user.name} released room ${row.roomNumber} for ${row.startDate} → ${row.endDate}.`,
    actor: "manager",
    actorLabel: `${user.staffCode} — ${user.name}`,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    ip: clientIp(request),
    metadata: { roomNumber: row.roomNumber, startDate: row.startDate, endDate: row.endDate },
  });
  return NextResponse.json({ success: true });
}
