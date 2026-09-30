// THE WAITLIST (addendum "landing page", Part 3.4) — what happens when the nights
// the guest wants are sold out.
//
// The landing page never says a bare "no". It offers the dates back as a lead and
// this endpoint stores it, so when a booking covering those dates is cancelled or
// released (`notifyWaitlistForDates` in src/lib/reviews.ts) the guest hears first.
//
// Only the details needed to reach someone are required: an email or a phone. The
// desk is told at the same moment, because a sold-out weekend often has a room that
// opens after a housekeeping check.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { waitlistTable } from "@/db/schema";
import { clientIp } from "@/lib/audit";
import { notifyInPortal } from "@/lib/notify";
import { addToWaitlist } from "@/lib/reviews";
import { revalidateLiveContent } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayPart() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Blantyre" }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      phone?: string;
      checkIn?: string;
      checkOut?: string;
      roomTypeId?: string;
      roomType?: string;
      adults?: number;
      children?: number;
      note?: string;
    };
    const checkIn = (body.checkIn ?? "").trim();
    const checkOut = (body.checkOut ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const phone = (body.phone ?? "").trim();

    if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) {
      return NextResponse.json({ error: "Pick an arrival and a departure date." }, { status: 400 });
    }
    if (checkOut <= checkIn) {
      return NextResponse.json({ error: "The departure date has to be after the arrival date." }, { status: 400 });
    }
    if (checkOut < todayPart()) {
      return NextResponse.json({ error: "Those dates are in the past — pick the dates you want." }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json(
        { error: "Leave an email address or a phone number so we can tell you the moment a room frees up." },
        { status: 400 },
      );
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "That email address does not look right." }, { status: 400 });
    }

    // Already waiting for the same window on the same contact? Say so once, not twice.
    const [duplicate] = await db
      .select()
      .from(waitlistTable)
      .where(
        and(
          eq(waitlistTable.checkIn, checkIn),
          eq(waitlistTable.checkOut, checkOut),
          eq(waitlistTable.status, "waiting"),
          email ? eq(waitlistTable.email, email) : eq(waitlistTable.phone, phone),
        ),
      )
      .limit(1);
    if (duplicate) {
      revalidateLiveContent();
      return NextResponse.json({
        success: true,
        alreadyWaiting: true,
        message: "You are already on the list for those dates — we will be in touch the moment a room frees up.",
      });
    }

    const result = await addToWaitlist({
      fullName: body.fullName ?? null,
      email: email || null,
      phone: phone || null,
      checkIn,
      checkOut,
      roomTypeId: body.roomTypeId ?? null,
      roomType: body.roomType ?? null,
      adults: body.adults,
      children: body.children,
      note: body.note ?? null,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await notifyInPortal({
      template: "waitlist_joined",
      subject: `WAITLIST · ${checkIn} → ${checkOut}${body.roomType ? ` · ${body.roomType}` : ""}`,
      body:
        `${result.entry.fullName ?? "A guest"} (${email || phone}) is waiting for those nights` +
        `${body.note ? ` — ${body.note}` : ""}. Ring them first if a room opens: ${phone || email}. (Logged from ${clientIp(request) ?? "the website"}.)`,
    });

    revalidateLiveContent();
    return NextResponse.json({
      success: true,
      checkIn,
      checkOut,
      message:
        "You are on the list. The moment those nights free up — a cancellation, a late release — we tell you first, before they go back on the website.",
      // The honest next step: try other dates, or call the desk for tonight.
      alternativesHref: "/?checkIn=" + checkIn + "&checkOut=" + checkOut,
      deskPhone: "+265 998 688 332",
    });
  } catch (error) {
    console.error("Waitlist join failed", error);
    return NextResponse.json({ error: "Could not add you to the list. Please try again." }, { status: 500 });
  }
}
