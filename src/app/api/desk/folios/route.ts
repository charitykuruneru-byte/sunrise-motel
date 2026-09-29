import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, folioItemsTable, invoicesTable, roomsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor, requireAdmin } from "@/lib/desk-auth";
import { buildFolioInvoice } from "@/lib/folio-invoice";
import { folioTotals, postFolioItem } from "@/lib/hotel";

export const dynamic = "force-dynamic";

/**
 * Folios & invoices (§8.4) — every open room bill with its line items, plus every
 * invoice with its status. Invoices are always regenerated FROM the folio.
 */
export async function GET(request: Request) {
  const auth = deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const [items, allBookings, rooms, invoices] = await Promise.all([
      db.select().from(folioItemsTable).orderBy(desc(folioItemsTable.createdAt)).limit(500),
      db.select().from(bookings).orderBy(desc(bookings.checkIn)).limit(300),
      db.select().from(roomsTable),
      db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt)).limit(100),
    ]);
    const bookingById = new Map(allBookings.map((b) => [b.id, b]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const roomNumberFor = (bookingId: string | null) => {
      if (!bookingId) return null;
      const booking = bookingById.get(bookingId);
      if (!booking) return null;
      if (booking.assignedRoomId) return roomById.get(booking.assignedRoomId)?.roomNumber ?? null;
      return booking.assignedRoom?.replace(/[^0-9]/g, "") || null;
    };
    const billIds = [...new Set(items.filter((i) => i.status === "open" && i.bookingId).map((i) => i.bookingId as string))];
    const bills = billIds.map((bookingId) => {
      const booking = bookingById.get(bookingId);
      const billItems = items.filter((i) => i.bookingId === bookingId);
      const totals = folioTotals(billItems);
      const invoice = booking ? invoices.find((inv) => inv.bookingRef === booking.reference) : undefined;
      return {
        bookingId,
        reference: booking?.reference ?? "—",
        guestName: booking?.guestName ?? "—",
        guestId: booking?.guestId ?? null,
        roomNumber: roomNumberFor(bookingId),
        status: booking?.status ?? "—",
        checkIn: booking?.checkIn ?? null,
        checkOut: booking?.checkOut ?? null,
        amountPaid: booking?.amountPaid ?? 0,
        balanceDue: Math.max(0, totals.total - (booking?.amountPaid ?? 0)),
        invoice: invoice
          ? {
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              totalAmount: invoice.totalAmount,
              balanceDue: invoice.balanceDue,
            }
          : null,
        items: billItems.map((i) => ({
          id: i.id,
          category: i.category,
          description: i.description,
          qty: i.qty,
          unitPrice: i.unitPrice,
          amount: i.amount,
          status: i.status,
          voidReason: i.voidReason,
          postedByLabel: i.postedByLabel,
          createdAt: i.createdAt,
        })),
        totals,
      };
    });
    return NextResponse.json({
      bills,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        bookingRef: inv.bookingRef,
        guestName: inv.guestName,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        balanceDue: inv.balanceDue,
        status: inv.status,
        taxAmount: inv.taxAmount,
        createdAt: inv.createdAt,
        sentAt: inv.sentAt,
      })),
      totals: {
        openBills: bills.length,
        outstanding: bills.reduce((sum, b) => sum + b.balanceDue, 0),
        invoiced: invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
      },
    });
  } catch (error) {
    console.error("Folio load failed", error);
    return NextResponse.json({ error: "Could not load folios." }, { status: 500 });
  }
}


/**
 * Post a charge to a room bill, void a line (admin only, reason mandatory), or
 * regenerate the invoice from the folio.
 */
export async function POST(request: Request) {
  const auth = deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      action?: string;
      bookingId?: string;
      roomNumber?: string;
      category?: "extras" | "late_checkout" | "damage" | "adjustment";
      description?: string;
      qty?: number;
      unitPrice?: number;
      itemId?: string;
      reason?: string;
    };
    const action = body.action ?? "";

    // ADDENDUM (authority matrix + staff dashboard §6.2): the whole money surface beyond cash —
    // a manual charge, voiding a room-bill line, and regenerating an invoice — is admin only.
    // Staff read every folio and invoice and download the PDF; they cannot move a figure.
    const denied = requireAdmin(auth.user);
    if (denied) return denied;

    if (action === "add_charge") {
      const unitPrice = Math.round(Number(body.unitPrice) || 0);
      if (!body.description?.trim() || unitPrice === 0) {
        return NextResponse.json({ error: "A description and a unit price are required." }, { status: 400 });
      }
      if (!body.bookingId && !body.roomNumber) {
        return NextResponse.json({ error: "Link the charge to a booking or a room." }, { status: 400 });
      }
      const item = await postFolioItem({
        bookingId: body.bookingId ?? null,
        roomNumber: body.roomNumber ?? null,
        category: body.category ?? "extras",
        description: body.description.trim(),
        qty: Math.max(1, Math.round(Number(body.qty) || 1)),
        unitPrice,
        postedByLabel: auth.label,
      });
      if (body.bookingId) await buildFolioInvoice(body.bookingId);
      await logAudit({
        action: "folio.charge_posted",
        entity: "folio_item",
        entityId: item.id,
        reference: body.roomNumber ? `Room ${body.roomNumber}` : null,
        summary: `${auth.label} posted ${item.description} (MWK ${item.amount.toLocaleString()}) to ${body.roomNumber ? `Room ${body.roomNumber}` : "a booking"}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, item });
    }

    if (action === "void_item") {
      if (auth.user.role !== "admin") {
        return NextResponse.json({ error: "Only an admin can void a room-bill line." }, { status: 403 });
      }
      if (!body.itemId || !body.reason?.trim()) {
        return NextResponse.json({ error: "itemId and a reason are required." }, { status: 400 });
      }
      const [item] = await db.select().from(folioItemsTable).where(eq(folioItemsTable.id, body.itemId)).limit(1);
      if (!item) return NextResponse.json({ error: "Folio line not found." }, { status: 404 });
      await db
        .update(folioItemsTable)
        .set({ status: "voided", voidReason: body.reason.trim(), voidedByLabel: auth.label, voidedAt: new Date() })
        .where(eq(folioItemsTable.id, item.id));
      if (item.bookingId) await buildFolioInvoice(item.bookingId);
      await logAudit({
        action: "folio.line_voided",
        entity: "folio_item",
        entityId: item.id,
        reference: item.roomNumber ? `Room ${item.roomNumber}` : null,
        summary: `${auth.label} VOIDED "${item.description}" (MWK ${item.amount.toLocaleString()}) on ${item.roomNumber ? `Room ${item.roomNumber}` : "a booking"} — ${body.reason.trim()}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { voidedAmount: item.amount, reason: body.reason.trim() },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "regenerate_invoice") {
      if (!body.bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
      const invoice = await buildFolioInvoice(body.bookingId);
      await logAudit({
        action: "invoice.regenerated",
        entity: "invoice",
        entityId: invoice?.invoiceNumber ?? null,
        summary: `${auth.label} regenerated invoice ${invoice?.invoiceNumber ?? "—"} from the folio.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, invoice });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    console.error("Folio action failed", error);
    return NextResponse.json({ error: "Could not complete that folio action." }, { status: 500 });
  }
}
