// PUBLIC REVIEWS (addendum "landing page", Part 2.4).
//
//   GET   the published reviews + the real average — what the landing page renders
//         and what the schema.org aggregateRating is built from. Nothing is invented:
//         if there are no reviews yet, the page gets count 0 and says so.
//   POST  a guest rating a just-finished stay. One tap, five stars, optional sentence.
//
// Who may post is the interesting part. A review is accepted when EITHER
//   * the caller is a signed-in guest, or holds a room session with an active stay
//     (resolved by resolveGuestContext — a no-account guest reviews exactly like an
//     app guest), OR
//   * they produce the booking reference AND the phone they booked with, and that
//     stay has finished.
// So the link in the check-out email works for a guest who never installed anything,
// and a stranger with a made-up name cannot post. One review per stay: a second
// submission edits the first rather than stacking a second rating.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, reviewsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { resolveGuestContext } from "@/lib/guest-context";
import { loadPublishedReviews, reviewSummary, submitReview } from "@/lib/reviews";
import { phoneTail } from "@/lib/phone";
import { malawiDatePart } from "@/lib/time";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

/** "Sep 2026" — the month the guest stayed, derived from the stay, never guessed. */
function monthLabel(datePart: string | null | undefined) {
  if (!datePart) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Blantyre", month: "short", year: "numeric" }).format(
    new Date(`${datePart}T12:00:00Z`),
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 9)));
    const [reviews, summary] = await Promise.all([loadPublishedReviews(limit), reviewSummary()]);
    return NextResponse.json({
      summary,
      reviews: reviews.map((review) => ({
        id: review.id,
        guestName: review.guestName,
        stayMonth: review.stayMonth,
        rating: review.rating,
        comment: review.comment,
        source: review.source,
        sourceUrl: review.sourceUrl,
        isFeatured: review.isFeatured,
        createdAt: review.createdAt,
      })),
    });
  } catch (error) {
    console.error("Could not load reviews", error);
    return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      rating?: number;
      comment?: string;
      reference?: string;
      phone?: string;
      guestName?: string;
    };
    const rating = Number(body.rating ?? 0);
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Choose between one and five stars." }, { status: 400 });
    }

    const ctx = await resolveGuestContext(request);
    let bookingId: string | null = ctx?.bookingId ?? null;
    let guestId: string | null = ctx?.guestId ?? null;
    let guestName = ctx?.guestName ?? (body.guestName ?? "").trim();
    let stayMonth = monthLabel(ctx?.booking?.checkOut);
    let collectedVia = ctx ? (ctx.kind === "room" ? "check_out" : "app") : "check_out";

    if (!bookingId && ctx?.guestId) {
      // A signed-in guest with no stay in progress: their most recent finished stay.
      const rows = await db.select().from(bookings).where(eq(bookings.guestId, ctx.guestId));
      const finished = rows
        .filter((row) => ["checked_out", "no_show"].includes(row.status) || row.checkOut <= malawiDatePart())
        .sort((a, b) => (a.checkOut < b.checkOut ? 1 : -1))[0];
      if (finished) {
        bookingId = finished.id;
        guestName = guestName || finished.guestName;
        stayMonth = monthLabel(finished.checkOut);
      }
    }

    // --- The no-account path: the reference in the check-out link + their phone. ---
    if (!bookingId) {
      const reference = (body.reference ?? "").trim().toUpperCase();
      // The last six digits: somebody reads their number out over the phone, so the
      // comparison must survive "+265 888 123 456" vs "0888 123 456" (§lib/phone.ts).
      const phone = phoneTail(body.phone ?? "");
      if (!reference || !phone) {
        return NextResponse.json(
          {
            error:
              "Open the link from your check-out email, or enter the booking reference and the phone number you booked with.",
          },
          { status: 400 },
        );
      }
      const [found] = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
      if (!found || phone !== phoneTail(found.phone)) {
        // One answer for "no such reference" and "wrong phone": no probing.
        return NextResponse.json({ error: "We could not match that reference and phone number to a stay." }, { status: 403 });
      }
      if (!["checked_out", "no_show"].includes(found.status) && found.checkOut > malawiDatePart()) {
        return NextResponse.json(
          { error: "That stay has not finished yet — we will ask you the moment you check out." },
          { status: 403 },
        );
      }
      bookingId = found.id;
      guestId = found.guestId;
      guestName = guestName || found.guestName;
      stayMonth = monthLabel(found.checkOut);
      collectedVia = "check_out";
    }

    // One review per stay: a second submission EDITS the first one.
    const [existing] = await db.select().from(reviewsTable).where(eq(reviewsTable.bookingId, bookingId)).limit(1);
    if (existing) {
      const [updated] = await db
        .update(reviewsTable)
        .set({
          rating: Math.max(1, Math.min(5, Math.round(rating))),
          comment: (body.comment ?? "").trim().slice(0, 2000) || existing.comment,
          stayMonth: existing.stayMonth ?? stayMonth,
        })
        .where(eq(reviewsTable.id, existing.id))
        .returning();
      await logAudit({
        action: "review.updated",
        entity: "review",
        entityId: existing.id,
        summary: `${updated?.guestName ?? guestName} changed their rating to ${updated?.rating}/5.`,
        actor: "guest",
        actorLabel: updated?.guestName ?? guestName,
        ip: clientIp(request),
        metadata: { bookingId },
      });
      revalidateLiveContent();
      return NextResponse.json({ success: true, updated: true, review: { id: existing.id, rating: updated?.rating } });
    }

    const review = await submitReview({
      guestName: guestName || "Sunrise Motel guest",
      rating,
      comment: body.comment ?? null,
      bookingId,
      guestId,
      stayMonth,
      source: "direct",
      collectedVia,
    });
    await logAudit({
      action: "review.submitted",
      entity: "review",
      entityId: review.id,
      summary: `${review.guestName} rated the stay ${review.rating}/5${body.comment ? `: ${body.comment.slice(0, 120)}` : ""}.`,
      actor: "guest",
      actorLabel: review.guestName,
      ip: clientIp(request),
      metadata: { bookingId, collectedVia },
    });
    revalidateLiveContent();
    return NextResponse.json({ success: true, review: { id: review.id, rating: review.rating } });
  } catch (error) {
    console.error("Could not save the review", error);
    return NextResponse.json({ error: "Could not save your review." }, { status: 500 });
  }
}

