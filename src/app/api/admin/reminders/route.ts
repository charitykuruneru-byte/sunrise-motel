import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, staffTable } from "@/db/schema";
import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { logBookingEvent } from "@/lib/booking-events";
import { clientIp, logAudit } from "@/lib/audit";
import { publicBaseUrl, sendMail } from "@/lib/mail";
import { readSession, sessionLabel } from "@/lib/staff-auth";
import { nowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const REMIND_EVERY_HOURS = 2;
const ESCALATE_AFTER_HOURS = 12;

// GET: list bookings needing action (pending older than X) for the dashboard red dots.
export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const now = nowDate();
  const rows = await db.select().from(bookings);
  const pending = rows.filter((b) => b.status === "pending");
  const hoursSince = (iso: Date) => (now.getTime() - new Date(iso).getTime()) / 3_600_000;
  const due = pending.filter((b) => hoursSince(b.createdAt) >= REMIND_EVERY_HOURS);
  const escalated = pending.filter((b) => hoursSince(b.createdAt) >= ESCALATE_AFTER_HOURS && !b.escalatedAt);
  return NextResponse.json({
    pendingCount: pending.length,
    reminderDue: due.map((b) => ({ id: b.id, reference: b.reference, bookingNumber: b.bookingNumber, guestName: b.guestName, hours: Math.floor(hoursSince(b.createdAt)) })),
    escalateDue: escalated.map((b) => ({ id: b.id, reference: b.reference, bookingNumber: b.bookingNumber })),
  });
}

// POST: send reminders for stale pending bookings + escalate to admin after 12h.
export async function POST(request: Request) {
  const user = await readSession(request);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const now = nowDate();
    const rows = await db.select().from(bookings).where(and(ne(bookings.status, "cancelled"), eq(bookings.status, "pending")));
    const staff = await db.select().from(staffTable);
    const adminEmail = process.env.ADMIN_EMAIL;
    let reminded = 0;
    let escalated = 0;
    for (const b of rows) {
      const ageH = (now.getTime() - new Date(b.createdAt).getTime()) / 3_600_000;
      const sinceReminderH = b.lastReminderAt ? (now.getTime() - new Date(b.lastReminderAt).getTime()) / 3_600_000 : 99;
      if (ageH >= REMIND_EVERY_HOURS && sinceReminderH >= REMIND_EVERY_HOURS) {
        const assignee = staff.find((s) => s.id === b.assignedStaffId);
        const to = [assignee?.email, adminEmail].filter(Boolean) as string[];
        if (to.length > 0) {
          await sendMail({
            to,
            subject: `Action required: ${b.reference}${b.bookingNumber ? ` (${b.bookingNumber})` : ""} waiting ${Math.floor(ageH)}h`,
            html: `<p>Booking <strong>${b.reference}</strong> for <strong>${b.guestName}</strong> (${b.roomType}, ${b.checkIn} → ${b.checkOut}) has been pending for ${Math.floor(ageH)} hours.</p><p>Please confirm / approve / cancel or request follow-up in the <a href="${publicBaseUrl(request)}/admin">manager portal</a>.</p>`,
          });
        }
        await db.update(bookings).set({ lastReminderAt: now, reminderCount: (b.reminderCount ?? 0) + 1 }).where(eq(bookings.id, b.id));
        await logBookingEvent(b.id, b.reference, "reminder_sent", `Reminder ${(b.reminderCount ?? 0) + 1} sent after ${Math.floor(ageH)}h pending.`, "system");
        await logAudit({
          action: "booking.reminder_sent", entity: "booking", entityId: b.id, reference: b.reference,
          summary: `Reminder sent for ${b.reference} (pending ${Math.floor(ageH)}h).`,
          actor: "system", actorLabel: sessionLabel(user), ip: clientIp(request),
        });
        reminded += 1;
      }
      if (ageH >= ESCALATE_AFTER_HOURS && !b.escalatedAt) {
        await db.update(bookings).set({ escalatedAt: now }).where(eq(bookings.id, b.id));
        if (adminEmail) {
          await sendMail({
            to: adminEmail,
            subject: `ESCALATED: ${b.reference} pending ${Math.floor(ageH)}h`,
            html: `<p>Booking <strong>${b.reference}</strong> (${b.guestName}) has been pending for ${Math.floor(ageH)} hours with no staff action. Please review.</p>`,
          });
        }
        await logBookingEvent(b.id, b.reference, "escalated", `Escalated to admin after ${Math.floor(ageH)}h with no action.`, "system");
        await logAudit({
          action: "booking.escalated", entity: "booking", entityId: b.id, reference: b.reference,
          summary: `${b.reference} escalated to admin after ${Math.floor(ageH)}h.`,
          actor: "system", actorLabel: sessionLabel(user), ip: clientIp(request),
        });
        escalated += 1;
      }
    }
    void isNull;
    void lt;
    return NextResponse.json({ reminded, escalated });
  } catch (err) {
    console.error("Reminders failed", err);
    return NextResponse.json({ error: "Could not send reminders." }, { status: 500 });
  }
}
