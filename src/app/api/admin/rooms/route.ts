import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, roomTypesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clientIp, logAudit } from "@/lib/audit";
import { isMotelManagerRole, readSession } from "@/lib/staff-auth";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

// Admin-only: add/remove rooms & services (room types + rates + inventory).
// Staff sessions get 403. Rooms are never hard-deleted while live bookings exist.
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isMotelManagerRole(user.role)) return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  const rooms = await db.select().from(roomTypesTable);
  return NextResponse.json({ rooms });
}

export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isMotelManagerRole(user.role)) return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const id = str(body.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-") || `room-${Date.now()}`;
    const name = str(body.name);
    const rate = Math.max(0, Math.round(Number(body.rate) || 0));
    const totalInventory = Math.max(1, Math.round(Number(body.totalInventory) || 1));
    if (!name || !rate) return NextResponse.json({ error: "Room name and rate are required." }, { status: 400 });
    const [exists] = await db.select().from(roomTypesTable).where(eq(roomTypesTable.id, id)).limit(1);
    if (exists) return NextResponse.json({ error: "A room with that ID already exists." }, { status: 409 });
    const [room] = await db.insert(roomTypesTable).values({
      id, name, slug: id,
      description: str(body.description) || name,
      rate, totalInventory,
      bed: str(body.bed) || "Bed",
      sleeps: str(body.sleeps) || "Sleeps 2",
      size: str(body.size) || "—",
      badge: str(body.badge) || null,
      features: Array.isArray(body.features) ? JSON.stringify(body.features) : "[]",
      images: Array.isArray(body.images) ? JSON.stringify(body.images) : "[]",
      // PRICING (added): defaults preserve today's behaviour — weekend 0 means "same as
      // rate", tax 1650bp means 16.50% VAT, no discounts unless asked for.
      weekendPrice: Math.max(0, Math.round(Number(body.weekendPrice) || 0)),
      extraBedPrice: Math.max(0, Math.round(Number(body.extraBedPrice) || 0)),
      cleaningFee: Math.max(0, Math.round(Number(body.cleaningFee) || 0)),
      taxRateBp: body.taxPercent !== undefined ? Math.max(0, Math.round((Number(body.taxPercent) || 0) * 100)) : Math.max(0, Math.round(Number(body.taxRateBp ?? 1650) || 0)),
      minNights: Math.max(1, Math.round(Number(body.minNights) || 1)),
      weeklyDiscountBp: Math.max(0, Math.round(Number(body.weeklyDiscountBp) || 0)),
      monthlyDiscountBp: Math.max(0, Math.round(Number(body.monthlyDiscountBp) || 0)),
      amenitiesCharges: Array.isArray(body.amenitiesCharges) ? JSON.stringify(body.amenitiesCharges) : "[]",
      isActive: true,
    }).returning();
    await logAudit({
      action: "ROOM_CREATED", entity: "room", entityId: room.id,
      summary: `${user.name} added room/service ${room.name} @ MWK ${room.rate.toLocaleString()}/night.`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
    });
    revalidateLiveContent();
    return NextResponse.json({ room }, { status: 201 });
  } catch (err) {
    console.error("Add room failed", err);
    return NextResponse.json({ error: "Could not add room." }, { status: 500 });
  }
}


export async function PATCH(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isMotelManagerRole(user.role)) return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    const update: Partial<typeof roomTypesTable.$inferInsert> = {};
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (body.rate !== undefined) update.rate = Math.max(0, Math.round(Number(body.rate) || 0));
    if (body.totalInventory !== undefined) update.totalInventory = Math.max(1, Math.round(Number(body.totalInventory) || 1));
    if (typeof body.description === "string") update.description = body.description;
    if (typeof body.bed === "string") update.bed = body.bed;
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (Array.isArray(body.features)) update.features = JSON.stringify(body.features);
    if (Array.isArray(body.images)) update.images = JSON.stringify(body.images);
    // ── PRICING (added). Each field is optional and only written when sent, so an
    //    existing caller that knows nothing about weekend prices changes nothing.
    if (body.weekendPrice !== undefined) update.weekendPrice = Math.max(0, Math.round(Number(body.weekendPrice) || 0));
    if (body.extraBedPrice !== undefined) update.extraBedPrice = Math.max(0, Math.round(Number(body.extraBedPrice) || 0));
    if (body.cleaningFee !== undefined) update.cleaningFee = Math.max(0, Math.round(Number(body.cleaningFee) || 0));
    if (body.taxRateBp !== undefined) update.taxRateBp = Math.max(0, Math.min(10_000, Math.round(Number(body.taxRateBp) || 0)));
    if (body.taxPercent !== undefined) update.taxRateBp = Math.max(0, Math.min(10_000, Math.round((Number(body.taxPercent) || 0) * 100)));
    if (body.minNights !== undefined) update.minNights = Math.max(1, Math.round(Number(body.minNights) || 1));
    if (body.weeklyDiscountBp !== undefined) update.weeklyDiscountBp = Math.max(0, Math.min(9_999, Math.round(Number(body.weeklyDiscountBp) || 0)));
    if (body.monthlyDiscountBp !== undefined) update.monthlyDiscountBp = Math.max(0, Math.min(9_999, Math.round(Number(body.monthlyDiscountBp) || 0)));
    if (Array.isArray(body.amenitiesCharges)) update.amenitiesCharges = JSON.stringify(body.amenitiesCharges);
    const [room] = await db.update(roomTypesTable).set(update).where(eq(roomTypesTable.id, id)).returning();
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    await logAudit({
      action: "ROOM_UPDATED", entity: "room", entityId: room.id,
      summary: `${user.name} updated room/service ${room.name}.`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
    });
    revalidateLiveContent();
    return NextResponse.json({ room });
  } catch (err) {
    console.error("Update room failed", err);
    return NextResponse.json({ error: "Could not update room." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isMotelManagerRole(user.role)) return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    const live = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.roomTypeId, id)).limit(1);
    if (live.length > 0) {
      await db.update(roomTypesTable).set({ isActive: false }).where(eq(roomTypesTable.id, id));
      await logAudit({
        action: "ROOM_UPDATED", entity: "room", entityId: id,
        summary: `${user.name} hid room/service ${id} (live bookings exist — deactivated).`,
        actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
      });
      revalidateLiveContent();
      return NextResponse.json({ success: true, deactivated: true });
    }
    await db.delete(roomTypesTable).where(eq(roomTypesTable.id, id));
    await logAudit({
      action: "ROOM_DELETED", entity: "room", entityId: id,
      summary: `${user.name} removed room/service ${id}.`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
    });
    revalidateLiveContent();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Remove room failed", err);
    return NextResponse.json({ error: "Could not remove room." }, { status: 500 });
  }
}
