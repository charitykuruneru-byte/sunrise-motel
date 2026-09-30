import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookingEventsTable, bookings } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

/** Guest-facing tracker: reference + the phone number used at booking (no account needed). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { reference?: string; phone?: string };
    const reference = (body.reference || "").trim().toUpperCase();
    const phoneDigits = (body.phone || "").replace(/\D/g, "");

    if (!reference || phoneDigits.length < 6) {
      return NextResponse.json({ error: "Enter your booking reference and the phone number you booked with." }, { status: 400 });
    }

    const [booking] = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!booking) return NextResponse.json({ error: `We could not find booking ${reference}. Check the reference on your confirmation screen or WhatsApp us.` }, { status: 404 });

    const storedDigits = booking.phone.replace(/\D/g, "");
    if (!storedDigits.endsWith(phoneDigits.slice(-6))) {
      return NextResponse.json({ error: "The phone number does not match this booking." }, { status: 403 });
    }

    const events = await db.select().from(bookingEventsTable).where(eq(bookingEventsTable.bookingId, booking.id)).orderBy(asc(bookingEventsTable.createdAt));

    revalidateLiveContent();
    return NextResponse.json({
      booking: {
        reference: booking.reference,
        status: booking.status,
        guestName: booking.guestName,
        roomType: booking.roomType,
        assignedRoom: booking.assignedRoom,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        adults: booking.adults,
        children: booking.children,
        totalAmount: booking.totalAmount,
        amountPaid: booking.amountPaid,
        invoiceNumber: booking.invoiceNumber,
        invoiceUrl: `/api/invoices/${booking.reference}`,
        createdAt: booking.createdAt,
      },
      events: events.filter((e) => e.action !== "note").map((e) => ({ action: e.action, note: e.note, createdAt: e.createdAt })),
    });
  } catch (error) {
    console.error("Tracking failed:", error);
    return NextResponse.json({ error: "Could not look up that booking right now." }, { status: 500 });
  }
}
