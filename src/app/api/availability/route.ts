import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, roomTypesTable } from "@/db/schema";
import { seedDatabaseIfEmpty } from "@/db/seed";
import { and, ne, sql } from "drizzle-orm";
import { blockedCountByRoomType } from "@/lib/room-blocks";

export const dynamic = "force-dynamic";

/**
 * Live availability for a stay window.
 * available = total sellable rooms of the type − bookings (not cancelled) whose nights overlap the requested nights.
 * Overlap rule: booking.checkIn < requested.checkOut AND booking.checkOut > requested.checkIn
 * (a room that checks out on your check-in day is free again that night).
 */
export async function GET(request: Request) {
  try {
    await seedDatabaseIfEmpty();

    const { searchParams } = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);
    const checkIn = searchParams.get("checkIn") || today;
    const checkOut = searchParams.get("checkOut") || today;

    const allRoomTypes = await db.select().from(roomTypesTable).where(sql`${roomTypesTable.isActive} = true`);

    const overlapping = await db
      .select({ roomTypeId: bookings.roomTypeId, reference: bookings.reference, checkIn: bookings.checkIn, checkOut: bookings.checkOut, status: bookings.status })
      .from(bookings)
      .where(and(ne(bookings.status, "cancelled"), sql`${bookings.checkIn} < ${checkOut}`, sql`${bookings.checkOut} > ${checkIn}`));

    const bookedCounts: Record<string, number> = {};
    for (const b of overlapping) bookedCounts[b.roomTypeId] = (bookedCounts[b.roomTypeId] || 0) + 1;

    // Rooms held back by a dated block come off sale too (empty blocks table = no change).
    const blockedCounts = await blockedCountByRoomType(checkIn, checkOut);

    const rooms = allRoomTypes.map((room) => {
      const booked = bookedCounts[room.id] || 0;
      const blocked = blockedCounts[room.id] || 0;
      const available = Math.max(0, room.totalInventory - booked - blocked);
      const isSoldOut = available <= 0;
      const statusText = isSoldOut
        ? blocked >= room.totalInventory
          ? "Closed for maintenance for these dates"
          : "Fully booked for these dates"
        : booked === 0 && blocked === 0
          ? `All ${room.totalInventory} rooms available`
          : available === 1
            ? `Only 1 of ${room.totalInventory} rooms left`
            : `${available} of ${room.totalInventory} rooms available`;

      return {
        id: room.id,
        name: room.name,
        slug: room.slug,
        description: room.description,
        rate: room.rate,
        // Added: the weekend rate and VAT show on /stay when a manager sets them, so
        // "Fri & Sat costs more" is visible before the guest picks dates.
        weekendPrice: room.weekendPrice,
        taxRateBp: room.taxRateBp,
        totalInventory: room.totalInventory,
        bookedCount: booked,
        blockedCount: blocked,
        availableCount: available,
        isSoldOut,
        statusText,
        bed: room.bed,
        sleeps: room.sleeps,
        size: room.size,
        badge: room.badge,
        features: JSON.parse(room.features || "[]") as string[],
        images: JSON.parse(room.images || "[]") as string[],
      };
    });

    return NextResponse.json({ checkIn, checkOut, rooms, overlappingBookings: overlapping.length });
  } catch (error) {
    console.error("Availability check failed:", error);
    return NextResponse.json({ error: "Failed to calculate availability." }, { status: 500 });
  }
}
