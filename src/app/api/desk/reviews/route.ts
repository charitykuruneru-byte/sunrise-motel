// REVIEWS AND THE WAITLIST AT THE DESK (addendum "landing page", Parts 2.4 and 3.4).
//
// Two jobs, one screen, because they are the same conversation:
//
//   GET   every review — published and hidden — with the real average, plus the
//         waitlist, so the desk can see what the website is telling guests.
//   POST  moderate       publish / hide / feature a review (a hidden review is kept,
//                        never deleted: the record stays, the website just stops
//                        showing it)
//         add            a review the desk typed in, or a Google review being imported
//                        WITH its attribution — the landing page is honest about which
//                        reviews came from where
//         notify_waitlist when a room finally opens, ring everybody waiting on those
//                        exact dates at once
//
// Auditors can read all of it and change none of it (deskActor write gate).

import { NextResponse } from "next/server";
import { clientIp, logAudit } from "@/lib/audit";
import { deskActor, requireRestaurantManager } from "@/lib/desk-auth";
import {
  loadAllReviews,
  loadWaitlist,
  moderateReview,
  notifyWaitlistForDates,
  reviewSummary,
  submitReview,
} from "@/lib/reviews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await deskActor(request);
  if ("error" in auth) return auth.error;
  try {
    const [reviews, summary, waitlist] = await Promise.all([
      loadAllReviews(),
      reviewSummary(),
      loadWaitlist(100),
    ]);
    return NextResponse.json({
      reviews,
      summary,
      waitlist,
      note:
        "Hidden reviews stay on record — nothing is deleted. The landing page shows published reviews only, and its star average is computed from them.",
    });
  } catch (error) {
    console.error("Could not load reviews", error);
    return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await deskActor(request, { write: true });
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      action?: string;
      reviewId?: string;
      isPublished?: boolean;
      isFeatured?: boolean;
      guestName?: string;
      rating?: number;
      comment?: string;
      stayMonth?: string;
      source?: string;
      sourceUrl?: string;
      checkIn?: string;
      checkOut?: string;
    };
    const action = body.action ?? "";

    if (action === "moderate") {
      // ADDENDUM (authority matrix): moderating a review — publishing, hiding, featuring — is
      // admin only. Staff can see reviews and work the waitlist; they do not shape what the
      // public reads, and they certainly do not delete a bad review.
      const denied = requireRestaurantManager(auth.user);
      if (denied) return denied;
      if (!body.reviewId) return NextResponse.json({ error: "reviewId is required." }, { status: 400 });
      const row = await moderateReview({
        reviewId: body.reviewId,
        isPublished: body.isPublished,
        isFeatured: body.isFeatured,
        actorLabel: auth.label,
      });
      if (!row) return NextResponse.json({ error: "Review not found." }, { status: 404 });
      return NextResponse.json({ success: true, review: row });
    }

    if (action === "add") {
      const rating = Number(body.rating ?? 0);
      const guestName = (body.guestName ?? "").trim();
      if (!guestName || !rating) {
        return NextResponse.json({ error: "A guest name and a rating are required." }, { status: 400 });
      }
      const source = body.source === "google" ? "google" : "direct";
      if (source === "google" && !body.sourceUrl?.trim()) {
        return NextResponse.json(
          { error: "A Google review shows its source link on the page — add the link it came from." },
          { status: 400 },
        );
      }
      const review = await submitReview({
        guestName,
        rating,
        comment: body.comment ?? null,
        stayMonth: body.stayMonth ?? null,
        source,
        sourceUrl: body.sourceUrl?.trim() || null,
        collectedVia: source === "google" ? "import" : "desk",
        actorLabel: auth.label,
      });
      await logAudit({
        action: source === "google" ? "review.imported" : "review.recorded_by_desk",
        entity: "review",
        entityId: review.id,
        summary: `${auth.label} recorded a ${review.rating}-star review from ${review.guestName}${source === "google" ? " (Google, with attribution)" : ""}.`,
        actor: "manager",
        actorLabel: auth.label,
        ip: clientIp(request),
      });
      return NextResponse.json({ success: true, review });
    }

    if (action === "notify_waitlist") {
      const checkIn = (body.checkIn ?? "").trim();
      const checkOut = (body.checkOut ?? "").trim();
      if (!checkIn || !checkOut) {
        return NextResponse.json({ error: "Give the dates that have opened up." }, { status: 400 });
      }
      const result = await notifyWaitlistForDates({ checkIn, checkOut });
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json(
      { error: `Unknown action "${action}". Use moderate, add or notify_waitlist.` },
      { status: 400 },
    );
  } catch (error) {
    console.error("Review action failed", error);
    return NextResponse.json({ error: "Could not complete that review action." }, { status: 500 });
  }
}
