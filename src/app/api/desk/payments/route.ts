import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, paymentsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { logBookingEvent } from "@/lib/booking-events";
import { deskActor, requireMotelManager } from "@/lib/desk-auth";
import { buildFolioInvoice } from "@/lib/folio-invoice";
import { logNotification } from "@/lib/notify";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

/**
 * The payment verification queue (§9 + §12).
 *
 * Nothing moves money automatically: a claim is queued, a human verifies it
 * against the bank / Airtel / TNM statement, and only then does the booking
 * confirm. Cash is entered already verified.
 */
export async function GET(request: Request) {
  const auth = await deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const [payments, allBookings] = await Promise.all([
      db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)).limit(300),
      db.select().from(bookings),
    ]);
    const bookingById = new Map(allBookings.map((b) => [b.id, b]));
    const enrich = (row: (typeof payments)[number]) => {
      const booking = row.bookingId ? bookingById.get(row.bookingId) : undefined;
      return {
        ...row,
        booking: booking
          ? {
              reference: booking.reference,
              guestName: booking.guestName,
              totalAmount: booking.totalAmount,
              amountPaid: booking.amountPaid,
              status: booking.status,
              checkIn: booking.checkIn,
            }
          : null,
      };
    };
    const queue = payments.filter((p) => p.status === "pending_verification").map(enrich);
    const ledger = payments.filter((p) => p.status !== "pending_verification").map(enrich);
    const byChannel = payments
      .filter((p) => p.status === "verified")
      .reduce<Record<string, number>>((acc, p) => {
        acc[p.channel] = (acc[p.channel] ?? 0) + p.amount;
        return acc;
      }, {});
    return NextResponse.json({
      queue,
      ledger,
      totals: {
        queueCount: queue.length,
        queueAmount: queue.reduce((sum, p) => sum + p.amount, 0),
        verifiedAmount: payments.filter((p) => p.status === "verified").reduce((sum, p) => sum + p.amount, 0),
        rejectedCount: payments.filter((p) => p.status === "rejected").length,
        byChannel,
      },
    });
  } catch (error) {
    console.error("Payment queue failed", error);
    return NextResponse.json({ error: "Could not load the payment queue." }, { status: 500 });
  }
}

/**
 * Record, verify or reject a payment. Verifying updates the booking's paid total
 * and auto-confirms when the verified payments cover the total (§12), issuing the
 * receipt from the folio invoice.
 */
export async function POST(request: Request) {
  const auth = await deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      action?: string;
      paymentId?: string;
      bookingId?: string;
      amount?: number;
      channel?: string;
      txnRef?: string;
      payerName?: string;
      payerPhone?: string;
      reason?: string;
      note?: string;
    };
    const action = body.action ?? "";
    const now = new Date();

    // ---- Record money received at the desk (cash is already verified). ----
    if (action === "record_cash") {
      const amount = Math.round(Number(body.amount) || 0);
      if (!body.bookingId || amount <= 0) {
        return NextResponse.json({ error: "A booking and a positive amount are required." }, { status: 400 });
      }
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, body.bookingId)).limit(1);
      if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      const [payment] = await db
        .insert(paymentsTable)
        .values({
          id: crypto.randomUUID(),
          bookingId: booking.id,
          reference: booking.reference,
          amount,
          channel: body.channel ?? "cash",
          txnRef: body.txnRef ?? null,
          payerName: body.payerName ?? booking.guestName,
          payerPhone: body.payerPhone ?? booking.phone,
          status: "verified",
          claimedBy: "staff",
          verifiedByLabel: auth.label,
          verifiedAt: now,
          note: body.note ?? "Recorded at the front desk",
        })
        .returning();
      const result = await applyVerifiedAmount(booking.id, amount, auth.label, request, auth.user);
      revalidateLiveContent();
      return NextResponse.json({ success: true, payment, booking: result });
    }

    if (!body.paymentId) return NextResponse.json({ error: "paymentId is required." }, { status: 400 });

    // ADDENDUM (authority matrix): only an admin VERIFIES or REJECTS a claimed payment. Staff
    // record cash at the desk and can see the whole queue — they never confirm a claim, so a
    // staff account that calls this endpoint directly gets 403 rather than a verified payment.
    const denied = requireMotelManager(auth.user);
    if (denied) return denied;

    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, body.paymentId)).limit(1);
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    if (action === "verify") {
      if (payment.status !== "pending_verification") {
        return NextResponse.json({ error: `That payment is already ${payment.status}.` }, { status: 409 });
      }
      await db
        .update(paymentsTable)
        .set({ status: "verified", verifiedByLabel: auth.label, verifiedAt: now, note: body.note ?? payment.note })
        .where(eq(paymentsTable.id, payment.id));
      const result = payment.bookingId
        ? await applyVerifiedAmount(payment.bookingId, payment.amount, auth.label, request, auth.user)
        : null;
      await logAudit({
        action: "payment.verified",
        entity: "payment",
        entityId: payment.id,
        reference: payment.reference,
        summary: `${auth.label} verified MWK ${payment.amount.toLocaleString()} via ${payment.channel}${payment.txnRef ? ` (ref ${payment.txnRef})` : ""}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
        metadata: { channel: payment.channel, amount: payment.amount, bookingConfirmed: result?.confirmed ?? false },
      });
      revalidateLiveContent();
      return NextResponse.json({ success: true, booking: result });
    }
    if (action === "reject") {
      if (!body.reason?.trim()) {
        return NextResponse.json({ error: "A reason is required when rejecting a payment claim." }, { status: 400 });
      }
      await db
        .update(paymentsTable)
        .set({ status: "rejected", rejectedReason: body.reason.trim(), verifiedByLabel: auth.label, verifiedAt: now })
        .where(eq(paymentsTable.id, payment.id));
      if (payment.bookingId) {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
        if (booking) {
          await logBookingEvent(
            booking.id,
            booking.reference,
            "payment_rejected",
            `${auth.label}: rejected MWK ${payment.amount.toLocaleString()} via ${payment.channel} — ${body.reason.trim()}`,
            "manager",
            auth.user,
          );
        }
      }
      await logAudit({
        action: "payment.rejected",
        entity: "payment",
        entityId: payment.id,
        reference: payment.reference,
        summary: `${auth.label} rejected a MWK ${payment.amount.toLocaleString()} claim — ${body.reason.trim()}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      revalidateLiveContent();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    console.error("Payment action failed", error);
    return NextResponse.json({ error: "Could not complete that payment action." }, { status: 500 });
  }
}

/**
 * Add a verified amount to a booking. When the verified total covers the booking,
 * the booking confirms and the pro-forma becomes a receipt (§12 auto-confirm).
 */
async function applyVerifiedAmount(bookingId: string, amount: number, actorLabel: string, request: Request, actor: import("@/lib/staff-auth").SessionUser) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return null;
  const amountPaid = (booking.amountPaid ?? 0) + amount;
  const covered = amountPaid >= booking.totalAmount && booking.totalAmount > 0;
  const status = covered && ["pending", "awaiting_payment"].includes(booking.status) ? "confirmed" : booking.status;
  await db.update(bookings).set({ amountPaid, status, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  await logBookingEvent(
    booking.id,
    booking.reference,
    "payment_recorded",
    `${actorLabel}: MWK ${amount.toLocaleString()} verified — total paid MWK ${amountPaid.toLocaleString()} of ${booking.totalAmount.toLocaleString()}`,
    "manager",
    actor,
  );
  const invoice = await buildFolioInvoice(booking.id, { status: covered ? "paid" : undefined });
  if (covered) {
    await logNotification({
      channel: "portal",
      template: "payment_confirmed",
      recipient: booking.email ?? booking.phone,
      subject: `Payment received — ${booking.reference}`,
      body: `MWK ${amount.toLocaleString()} verified. Booking confirmed. Invoice ${invoice?.invoiceNumber ?? "—"}. Balance MWK ${(invoice?.balanceDue ?? 0).toLocaleString()}.`,
      status: "sent",
      guestId: booking.guestId,
      bookingId: booking.id,
    });
    await logAudit({
      action: "booking.auto_confirmed",
      entity: "booking",
      entityId: booking.id,
      reference: booking.reference,
      summary: `Verified payments cover ${booking.reference} — booking confirmed and receipt issued (${invoice?.invoiceNumber ?? "—"}).`,
      actor: "system",
      actorLabel,
      ip: clientIp(request),
    });
  }
  return { amountPaid, confirmed: covered, status, invoice };
}
