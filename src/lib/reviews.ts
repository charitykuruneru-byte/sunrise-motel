// Guest reviews (addendum "landing page", Part 2.4) and the sold-out waitlist
// (Part 3.4). Both exist because the landing page has to be a booking engine that
// answers "can I stay, and what does it cost" — and, when the answer is no, still
// keeps the guest.
//
// Nothing here invents a number: the rating on the page is the real published rows.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { bookings, reviewsTable, waitlistTable } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { notifyByEmail } from "@/lib/notify";
import { formatMalawiDate } from "@/lib/time";

export type ReviewRow = typeof reviewsTable.$inferSelect;

/** Published reviews, newest first — what the landing page renders. */
export async function loadPublishedReviews(limit = 9) {
  return db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.isPublished, true))
    .orderBy(desc(reviewsTable.isFeatured), desc(reviewsTable.createdAt))
    .limit(limit);
}

/**
 * Average rating + count for the trust strip and the schema.org markup. Google's
 * rich results want both, and inventing either would be dishonest.
 */
export async function reviewSummary() {
  const rows = await db
    .select({ rating: reviewsTable.rating })
    .from(reviewsTable)
    .where(eq(reviewsTable.isPublished, true));
  if (rows.length === 0) return { count: 0, average: 0, averageDisplay: null as string | null };
  const total = rows.reduce((sum, row) => sum + row.rating, 0);
  const average = Math.round((total / rows.length) * 10) / 10;
  return { count: rows.length, average, averageDisplay: average.toFixed(1) };
}

/** Record a review (guest, desk, or an imported Google review). */
export async function submitReview(input: {
  guestName: string;
  rating: number;
  comment?: string | null;
  bookingId?: string | null;
  guestId?: string | null;
  stayMonth?: string | null;
  source?: string;
  sourceUrl?: string | null;
  collectedVia?: string;
  actorLabel?: string | null;
}) {
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const [row] = await db
    .insert(reviewsTable)
    .values({
      id: randomUUID(),
      bookingId: input.bookingId ?? null,
      guestId: input.guestId ?? null,
      guestName: input.guestName.slice(0, 160),
      stayMonth: input.stayMonth ?? null,
      rating,
      comment: input.comment?.slice(0, 2000) ?? null,
      source: input.source ?? "direct",
      sourceUrl: input.sourceUrl ?? null,
      collectedVia: input.collectedVia ?? "check_out",
      isPublished: true,
      publishedByLabel: input.actorLabel ?? null,
    })
    .returning();
  await logAudit({
    action: "review.submitted",
    entity: "review",
    entityId: row!.id,
    summary: `${input.guestName} left a ${rating}-star review (${input.collectedVia ?? "check_out"}).`,
    actor: input.actorLabel ? "manager" : "guest",
    actorLabel: input.actorLabel ?? input.guestName,
  });
  return row!;
}

/**
 * Ask a checked-out guest how their stay was — one tap, five stars, optional
 * comment (addendum Part 2.4). Never asked twice for the same stay.
 */
export async function requestReview(bookingId: string) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { sent: false as const, reason: "Booking not found." };
  const already = await db
    .select({ id: reviewsTable.id })
    .from(reviewsTable)
    .where(eq(reviewsTable.bookingId, bookingId))
    .limit(1);
  if (already.length > 0) return { sent: false as const, reason: "This guest has already reviewed this stay." };
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/review?reference=${encodeURIComponent(booking.reference)}`;
  const result = await notifyByEmail({
    to: booking.email,
    subject: "How was your stay at Sunrise Motel?",
    html:
      `<p>Thank you for staying with us, ${booking.guestName}.</p>` +
      `<p>One tap is all we ask: <a href="${link}">rate your stay</a>.</p>` +
      `<p>Five stars, a sentence if you have one — it goes straight to the manager and it is never edited.</p>`,
    text: `How was your stay at Sunrise Motel? Rate it here: ${link}`,
    template: "guest_review_request",
    guestId: booking.guestId,
    bookingId: booking.id,
  });
  await logAudit({
    action: "review.requested",
    entity: "booking",
    entityId: booking.id,
    reference: booking.reference,
    summary: `Asked ${booking.guestName} how the stay was.`,
    actor: "system",
    metadata: { emailSent: result.sent },
  });
  return { sent: result.sent, reason: result.reason ?? null, link };
}

/** Every review for the admin moderation list, hidden ones included. */
export async function loadAllReviews(limit = 200) {
  return db.select().from(reviewsTable).orderBy(desc(reviewsTable.createdAt)).limit(limit);
}

export async function moderateReview(input: {
  reviewId: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  actorLabel: string;
}) {
  const patch: Partial<typeof reviewsTable.$inferInsert> = { publishedByLabel: input.actorLabel };
  if (typeof input.isPublished === "boolean") patch.isPublished = input.isPublished;
  if (typeof input.isFeatured === "boolean") patch.isFeatured = input.isFeatured;
  const [row] = await db.update(reviewsTable).set(patch).where(eq(reviewsTable.id, input.reviewId)).returning();
  if (!row) return null;
  await logAudit({
    action: "review.moderated",
    entity: "review",
    entityId: row.id,
    summary: `${input.actorLabel} set the review by ${row.guestName} to ${row.isPublished ? "published" : "hidden"}${
      row.isFeatured ? " and featured" : ""
    }.`,
    actor: "manager",
    actorLabel: input.actorLabel,
  });
  return row;
}

// ---------------------------------------------------------------------------
// The waitlist: what turns a sold-out week into next month's revenue.
// ---------------------------------------------------------------------------

export async function addToWaitlist(input: {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  checkIn: string;
  checkOut: string;
  roomTypeId?: string | null;
  roomType?: string | null;
  adults?: number;
  children?: number;
  note?: string | null;
}) {
  if (!input.email && !input.phone) {
    return { ok: false as const, error: "Leave an email address or a phone number so we can reach you." };
  }
  const [row] = await db
    .insert(waitlistTable)
    .values({
      id: randomUUID(),
      fullName: input.fullName?.slice(0, 160) ?? null,
      email: input.email?.trim().toLowerCase() ?? null,
      phone: input.phone?.trim() ?? null,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      roomTypeId: input.roomTypeId ?? null,
      roomType: input.roomType ?? null,
      adults: Math.max(1, input.adults ?? 1),
      children: Math.max(0, input.children ?? 0),
      note: input.note?.slice(0, 500) ?? null,
    })
    .returning();
  await logAudit({
    action: "waitlist.joined",
    entity: "waitlist",
    entityId: row!.id,
    summary: `${input.fullName ?? input.email ?? input.phone} joined the waitlist for ${input.checkIn} → ${input.checkOut}.`,
    actor: "guest",
    actorLabel: input.email ?? input.phone ?? null,
  });
  return { ok: true as const, entry: row! };
}

export async function loadWaitlist(limit = 100) {
  return db.select().from(waitlistTable).orderBy(asc(waitlistTable.checkIn)).limit(limit);
}

/**
 * Tell everyone waiting on a window that a room has come free. Called when a
 * booking covering those dates is cancelled or released.
 */
export async function notifyWaitlistForDates(opts: {
  checkIn: string;
  checkOut: string;
  roomTypeId?: string | null;
}) {
  const waiting = await db
    .select()
    .from(waitlistTable)
    .where(
      and(
        eq(waitlistTable.status, "waiting"),
        lte(waitlistTable.checkIn, opts.checkOut),
        gte(waitlistTable.checkOut, opts.checkIn),
      ),
    );
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const reached: string[] = [];
  for (const entry of waiting) {
    await notifyByEmail({
      to: entry.email,
      subject: "A room has come free at Sunrise Motel",
      html:
        `<p>${entry.fullName ?? "Hello"},</p>` +
        `<p>You asked to be told if a room came free for ${formatMalawiDate(entry.checkIn)} → ` +
        `${formatMalawiDate(entry.checkOut)}. One has just been released.</p>` +
        `<p><a href="${base}/?checkIn=${entry.checkIn}&checkOut=${entry.checkOut}">Check the dates and book it</a> — first come, first served.</p>`,
      text: `A room has come free for ${entry.checkIn} → ${entry.checkOut}. Book: ${base}/?checkIn=${entry.checkIn}&checkOut=${entry.checkOut}`,
      template: "waitlist_room_free",
    });
    await db
      .update(waitlistTable)
      .set({ status: "notified", notifiedAt: new Date() })
      .where(eq(waitlistTable.id, entry.id));
    reached.push(entry.email ?? entry.phone ?? entry.id);
  }
  if (reached.length > 0) {
    await logAudit({
      action: "waitlist.notified",
      entity: "waitlist",
      summary: `${reached.length} waiting guest(s) were told a room came free for ${opts.checkIn} → ${opts.checkOut}.`,
      actor: "system",
    });
  }
  return { notified: reached.length, reached };
}
