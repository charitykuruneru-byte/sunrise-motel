import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, invoicesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logBookingEvent } from "@/lib/booking-events";
import { clientIp, logAudit } from "@/lib/audit";
import { bookingMath } from "@/lib/pricing";
import { isMotelManagerRole, readSession } from "@/lib/staff-auth";
import { nowDate } from "@/lib/time";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

function nightsBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
}

// Extend a stay: new check-out -> extra nights x rate added to extensionFee + total.
//
// ADDENDUM (Part 6 + Part 27 §D3): extending a stay is an admin act — it changes money and the
// room's availability for the nights it now holds. Part A gap #6 left this open to any signed-in
// staff account; it is now enforced on the server.
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isMotelManagerRole(user.role)) {
    return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  }
  try {
    const body = (await request.json()) as { id?: string; newCheckOut?: string };
    if (!body.id || !body.newCheckOut) return NextResponse.json({ error: "Booking and new check-out date are required." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.newCheckOut)) return NextResponse.json({ error: "Use YYYY-MM-DD." }, { status: 400 });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, body.id)).limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (booking.status === "cancelled") return NextResponse.json({ error: "Cancelled bookings cannot be extended." }, { status: 400 });
    const extraNights = nightsBetween(booking.checkOut, body.newCheckOut);
    if (extraNights <= 0) return NextResponse.json({ error: "New check-out must be after the current one." }, { status: 400 });
    const additionalFee = extraNights * booking.nightlyRate;
    const math = bookingMath(booking.nightlyRate, booking.nights + extraNights, {
      serviceFee: booking.serviceFee ?? 0,
      extensionFee: (booking.extensionFee ?? 0) + additionalFee,
      discount: booking.discount ?? 0,
      extrasTotal: Math.max(0, booking.totalAmount - booking.nightlyRate * booking.nights - (booking.serviceFee ?? 0) - (booking.extensionFee ?? 0) + (booking.discount ?? 0)),
    });
    const [updated] = await db.update(bookings).set({
      checkOut: body.newCheckOut,
      nights: booking.nights + extraNights,
      extensionFee: (booking.extensionFee ?? 0) + additionalFee,
      totalAmount: math.total,
      updatedAt: nowDate(),
    }).where(eq(bookings.id, booking.id)).returning();
    if (updated.invoiceNumber) {
      await db.update(invoicesTable).set({
        checkOut: body.newCheckOut, nights: updated.nights,
        totalAmount: updated.totalAmount,
        balanceDue: Math.max(0, updated.totalAmount - updated.amountPaid),
      }).where(eq(invoicesTable.invoiceNumber, updated.invoiceNumber));
    }
    await logBookingEvent(booking.id, booking.reference, "extended", `Stay extended by ${extraNights} night(s) to ${body.newCheckOut}. Additional MWK ${additionalFee.toLocaleString()}.`, "manager", user);
    await logAudit({
      action: "booking.extended", entity: "booking", entityId: booking.id, reference: booking.reference,
      summary: `${user.name} extended ${booking.reference} by ${extraNights} night(s) to ${body.newCheckOut} (+MWK ${additionalFee.toLocaleString()}).`,
      actor: "manager", actorLabel: `${user.staffCode} — ${user.name}`, ip: clientIp(request),
      metadata: { extraNights, additionalFee, newCheckOut: body.newCheckOut },
    });
    revalidateLiveContent();
    return NextResponse.json({ booking: updated, additionalFee, extraNights });
  } catch (err) {
    console.error("Extend booking failed", err);
    return NextResponse.json({ error: "Could not extend booking." }, { status: 500 });
  }
}
