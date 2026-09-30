import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoicesTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { malawiYear, nowDate } from "@/lib/time";
import { isMotelManagerRole, readSession } from "@/lib/staff-auth";
import { desc, eq } from "drizzle-orm";

// ADDENDUM (Part 27 §B5): a manual invoice is an admin act — it issues a numbered document
// that is not tied to a booking (a day workspace, a function deposit, a corporate charge).
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const invoices = await db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt));
    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
    return NextResponse.json({ error: "Could not fetch invoices." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isMotelManagerRole(user.role)) {
    return NextResponse.json({ error: "Motel Manager access required." }, { status: 403 });
  }
  try {
    const body = (await request.json()) as {
      bookingRef: string;
      guestName: string;
      guestEmail?: string;
      guestPhone?: string;
      roomType: string;
      checkIn: string;
      checkOut: string;
      nights: number;
      subtotal: number;
      extrasTotal?: number;
      totalAmount: number;
      paymentInstructions?: string;
      sendEmailNow?: boolean;
    };

    const seq = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${malawiYear(nowDate())}-${seq}`;

    const [newInvoice] = await db
      .insert(invoicesTable)
      .values({
        id: randomUUID(),
        invoiceNumber,
        bookingRef: body.bookingRef,
        guestName: body.guestName,
        guestEmail: body.guestEmail || null,
        guestPhone: body.guestPhone || null,
        roomType: body.roomType,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        nights: body.nights,
        subtotal: body.subtotal,
        extrasTotal: body.extrasTotal || 0,
        taxAmount: 0,
        totalAmount: body.totalAmount,
        amountPaid: 0,
        balanceDue: body.totalAmount,
        status: body.sendEmailNow ? "sent" : "proforma",
        sentToEmail: body.sendEmailNow ? body.guestEmail : null,
        sentAt: body.sendEmailNow ? nowDate() : null,
        paymentInstructions:
          body.paymentInstructions ||
          "National Bank of Malawi | Account: 1009876543 | Airtel Money: +265 998 688 332 (Ref: " +
            body.bookingRef +
            ")",
      })
      .returning();

    await logAudit({
      action: "invoice.created", entity: "invoice", entityId: newInvoice.invoiceNumber, reference: newInvoice.bookingRef,
      summary: `Manual invoice ${newInvoice.invoiceNumber} for ${newInvoice.bookingRef} (MWK ${newInvoice.totalAmount.toLocaleString()}).`,
      actor: "manager", ip: clientIp(request), metadata: { totalAmount: newInvoice.totalAmount },
    });

    return NextResponse.json({ invoice: newInvoice }, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json({ error: "Could not create invoice." }, { status: 500 });
  }
}
