import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { roomTypeRatesTable, roomTypesTable } from "@/db/schema";
import { calculateStayQuote, nightsBetween } from "@/lib/pricing";
import { setting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/calculate-price
 *
 * The single quote endpoint: website widget, front desk and (later) any channel ask
 * this and get the same breakdown, night by night. It reads the room type, applies its
 * seasonal/length-of-stay rates, weekend price, extras, discounts and VAT — and it is
 * READ-ONLY, so quoting a stay can never block a room or create a booking.
 *
 * Existing bookings keep the price they were made at: nothing here recalculates them.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      roomTypeId?: string;
      roomId?: string; // accepted as an alias: the brief calls it roomId
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      extraBed?: number | boolean;
      extraBeds?: number;
      amenities?: string[];
      /** Override the motel's VAT mode for one quote. */
      taxInclusive?: boolean;
    };

    const id = (body.roomTypeId ?? body.roomId ?? "").trim();
    if (!id) return NextResponse.json({ error: "roomTypeId is required." }, { status: 400 });
    const checkIn = (body.checkIn ?? "").trim();
    const checkOut = (body.checkOut ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
      return NextResponse.json({ error: "checkIn and checkOut must look like 2026-10-01." }, { status: 400 });
    }
    if (nightsBetween(checkIn, checkOut) < 1) {
      return NextResponse.json({ error: "Check-out must be at least one night after check-in." }, { status: 400 });
    }

    const [room] = await db.select().from(roomTypesTable).where(eq(roomTypesTable.id, id)).limit(1);
    if (!room) return NextResponse.json({ error: "Room type not found." }, { status: 404 });

    const rates = await db
      .select({
        kind: roomTypeRatesTable.kind,
        label: roomTypeRatesTable.label,
        startDate: roomTypeRatesTable.startDate,
        endDate: roomTypeRatesTable.endDate,
        minNights: roomTypeRatesTable.minNights,
        nightlyRate: roomTypeRatesTable.nightlyRate,
        isActive: roomTypeRatesTable.isActive,
      })
      .from(roomTypeRatesTable)
      .where(eq(roomTypeRatesTable.roomTypeId, id));

    const activeRates = rates.filter((rate) => rate.isActive);
    const extraBeds = typeof body.extraBed === "boolean" ? (body.extraBed ? 1 : 0) : (body.extraBeds ?? (Number(body.extraBed) || 0));

    // VAT mode: default to what the motel actually does — the advertised price already
    // includes VAT. `POST` may override it explicitly rather than by accident.
    const taxInclusive = body.taxInclusive === undefined ? (await setting("PRICE_TAX_MODE")) !== "exclusive" : body.taxInclusive !== false;

    const quote = calculateStayQuote({
      room,
      rates: activeRates,
      checkIn,
      checkOut,
      guests: body.guests,
      extraBeds,
      amenities: Array.isArray(body.amenities) ? body.amenities.filter((name) => typeof name === "string") : [],
      taxInclusive,
    });

    return NextResponse.json({ roomTypeId: room.id, roomType: room.name, checkIn, checkOut, ...quote });
  } catch (error) {
    console.error("Price calculation failed", error);
    return NextResponse.json({ error: "Could not calculate that price." }, { status: 500 });
  }
}
