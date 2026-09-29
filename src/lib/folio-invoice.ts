// The invoice is GENERATED FROM THE FOLIO (§4.1). Nothing here is typed by hand,
// so the room bill, the guest's orders and the receipt always agree.
// Invoices are never physically deleted — a cancelled invoice is kept.

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, folioItemsTable, invoicesTable } from "@/db/schema";
import { malawiShortDate } from "@/lib/time";

/** Tax rate snapshot source. 0% unless the motel configures it in the env. */
export function taxRatePercent() {
  const value = Number(process.env.TAX_RATE_PERCENT ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function nextInvoiceNumber() {
  const prefix = `INV-${malawiShortDate()}-`;
  const rows = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .orderBy(desc(invoicesTable.createdAt))
    .limit(100);
  const sequence = rows.filter((r) => r.invoiceNumber.startsWith(prefix)).length + 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export type FolioInvoiceResult = {
  invoiceNumber: string;
  subtotal: number;
  extrasTotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  lineItems: { description: string; qty: number; unitPrice: number; amount: number; category: string }[];
};

/**
 * Build (or rebuild) the invoice for a booking from its open + settled folio
 * items. Voided items never reach the invoice.
 */
export async function buildFolioInvoice(bookingId: string, opts: { status?: string } = {}) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return null;

  const items = (await db.select().from(folioItemsTable).where(eq(folioItemsTable.bookingId, bookingId)))
    .filter((item) => item.status !== "voided")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const lineItems = items.map((item) => ({
    description: item.description,
    qty: item.qty,
    unitPrice: item.unitPrice,
    amount: item.amount,
    category: item.category,
  }));

  const roomSubtotal = items.filter((i) => i.category === "room").reduce((sum, i) => sum + i.amount, 0);
  const extrasTotal = items.filter((i) => i.category !== "room").reduce((sum, i) => sum + i.amount, 0);
  const subtotal = roomSubtotal + extrasTotal;
  const rate = taxRatePercent();
  const taxAmount = Math.round((subtotal * rate) / 100);
  const totalAmount = subtotal + taxAmount;
  const amountPaid = booking.amountPaid ?? 0;
  const balanceDue = Math.max(0, totalAmount - amountPaid);

  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.bookingRef, booking.reference))
    .limit(1);

  const status = opts.status ?? (amountPaid >= totalAmount && totalAmount > 0 ? "paid" : "proforma");
  const payload: Partial<typeof invoicesTable.$inferInsert> = {
    guestName: booking.guestName,
    guestEmail: booking.email,
    guestPhone: booking.phone,
    roomType: booking.roomType,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: booking.nights,
    subtotal: roomSubtotal,
    extrasTotal,
    taxAmount,
    totalAmount,
    amountPaid,
    balanceDue,
    status,
    lineItemsJson: JSON.stringify(lineItems),
  };

  if (existing) {
    await db.update(invoicesTable).set(payload).where(eq(invoicesTable.id, existing.id));
    await db
      .update(bookings)
      .set({ invoiceNumber: existing.invoiceNumber, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));
    return {
      invoiceNumber: existing.invoiceNumber,
      subtotal: roomSubtotal,
      extrasTotal,
      taxAmount,
      totalAmount,
      amountPaid,
      balanceDue,
      lineItems,
    } satisfies FolioInvoiceResult;
  }

  const invoiceNumber = await nextInvoiceNumber();
  await db.insert(invoicesTable).values({
    id: randomUUID(),
    invoiceNumber,
    bookingId: booking.id,
    bookingRef: booking.reference,
    ...payload,
    status,
  } as typeof invoicesTable.$inferInsert);
  await db.update(bookings).set({ invoiceNumber, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
  return {
    invoiceNumber,
    subtotal: roomSubtotal,
    extrasTotal,
    taxAmount,
    totalAmount,
    amountPaid,
    balanceDue,
    lineItems,
  } satisfies FolioInvoiceResult;
}

/** Mark every open folio line settled — called at check-out. */
export async function settleFolio(bookingId: string) {
  await db
    .update(folioItemsTable)
    .set({ status: "settled" })
    .where(and(eq(folioItemsTable.bookingId, bookingId), eq(folioItemsTable.status, "open")));
}
