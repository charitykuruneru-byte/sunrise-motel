import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, invoicesTable } from "@/db/schema";
import { buildInvoicePdf, parseExtras } from "@/lib/invoice-pdf";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await context.params;
    const ref = decodeURIComponent(reference).trim().toUpperCase();
    const [booking] = await db.select().from(bookings).where(eq(bookings.reference, ref)).limit(1);
    if (!booking) return NextResponse.json({ error: `No booking found for reference ${ref}.` }, { status: 404 });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.bookingId, booking.id)).limit(1);

    const pdf = await buildInvoicePdf({
      invoiceNumber: booking.invoiceNumber || `INV-${booking.reference}`,
      reference: booking.reference,
      status: booking.status,
      issueDate: new Date(booking.createdAt),
      guestName: booking.guestName,
      phone: booking.phone,
      email: booking.email,
      roomType: booking.roomType,
      assignedRoom: booking.assignedRoom,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      adults: booking.adults,
      children: booking.children,
      nightlyRate: booking.nightlyRate,
      roomSubtotal: invoice?.subtotal,
      discountAmount: booking.discount,
      extras: parseExtras(booking.extras),
      extrasTotal: invoice?.extrasTotal ?? parseExtras(booking.extras).reduce((sum, extra) => sum + (extra.amount ?? 0), 0),
      taxAmount: invoice?.taxAmount,
      taxRateBp: invoice?.taxRateBp,
      taxInclusive: invoice?.taxInclusive,
      totalAmount: booking.totalAmount,
      amountPaid: booking.amountPaid,
      requests: booking.requests,
    });

    const filename = `${booking.invoiceNumber || booking.reference}-sunrise-motel.pdf`;
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);
    return NextResponse.json({ error: "Could not generate the invoice PDF." }, { status: 500 });
  }
}
