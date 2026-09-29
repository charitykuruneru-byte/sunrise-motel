"use client";

// ASK THE GUEST HOW IT WENT (addendum "landing page", Part 2.4).
//
// This is the page the check-out email links to (`/review?reference=…`), the page the
// app offers after checkout, and the page the desk can print on a card. Two things
// matter more than anything else here:
//
//   1. One tap to a star rating. The sentence is optional; the stars are the point.
//   2. The rating on the landing page is these rows and nothing else. A guest who has
//      rated once edits their own review rather than stacking a second one — the
//      endpoint enforces that, so this page just has to say so.

import { AlertCircle, CheckCircle2, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Published = {
  summary: { count: number; average: number; averageDisplay: string | null };
  reviews: { id: string; guestName: string; stayMonth: string | null; rating: number; comment: string | null }[];
};

export default function ReviewForm() {
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [needsIdentity, setNeedsIdentity] = useState(false);
  const [published, setPublished] = useState<Published | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ updated: boolean } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReference((params.get("reference") ?? "").toUpperCase());
    setPhone(params.get("phone") ?? "");
    const wanted = Number(params.get("rating") ?? 0);
    if (wanted >= 1 && wanted <= 5) setRating(wanted);

    void (async () => {
      try {
        const response = await fetch("/api/reviews?limit=3");
        if (response.ok) setPublished((await response.json()) as Published);
      } catch {
        // Social proof is a bonus: the form works without it.
      }
    })();
    void (async () => {
      try {
        // A guest who is already signed in on this phone (or holds a live room
        // session) proves who they are without typing anything.
        const response = await fetch("/api/guest/me");
        if (!response.ok) setNeedsIdentity(true);
      } catch {
        setNeedsIdentity(true);
      }
    })();
  }, []);

  const send = async (stars: number) => {
    if (stars < 1 || stars > 5) {
      setError("Choose between one and five stars.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: stars, comment, reference, phone }),
      });
      const data = (await response.json()) as { error?: string; updated?: boolean };
      if (!response.ok) throw new Error(data.error ?? "We could not save your review.");
      setDone({ updated: Boolean(data.updated) });
      setRating(stars);
    } catch (err) {
      // Either the reference/phone pair is needed, or it did not match. Either way the
      // fix is the same: show the two fields and let the guest fill them in.
      setNeedsIdentity(true);
      setError(err instanceof Error ? err.message : "We could not save your review.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rv-card rv-done">
        <span className="rv-done-icon"><CheckCircle2 size={26} /></span>
        <p className="rv-eyebrow">Thank you</p>
        <h1>That is on the record.</h1>
        <p className="rv-sub">
          {done.updated
            ? "You had already rated this stay, so we changed it rather than counting you twice."
            : "Your rating is published as you gave it. It is never edited, and your room number is never on it."}
        </p>
        <div className="rv-done-actions">
          <Link className="rv-btn rv-btn-primary" href="/">
            Back to Sunrise Motel
          </Link>
          <a className="rv-btn" href="/app">
            Open the guest app
          </a>
        </div>
        <p className="rv-note">
          Something not right about the stay? A rating is not a complaint channel — tell the front desk directly and the
          manager sees it in minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="rv-card">
      <p className="rv-eyebrow">One tap, and it is published</p>
      <h1>How was your stay?</h1>
      <p className="rv-sub">
        Tap the stars. A sentence is welcome but never required, and it goes straight to the manager — nothing here is
        edited afterwards.
      </p>

      <div className="rv-stars" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            className={`rv-star ${(hover || rating) >= star ? "is-on" : ""}`}
            disabled={busy}
            onClick={() => void send(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
          >
            <Star size={28} fill={(hover || rating) >= star ? "currentColor" : "none"} />
          </button>
        ))}
        <span className="rv-star-readout">
          {busy ? "Saving…" : rating > 0 ? `${rating} out of 5` : "Tap a star"}
        </span>
      </div>

      <label className="rv-field">
        Anything you want to add? (optional)
        <textarea
          className="rv-textarea"
          rows={4}
          maxLength={2000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="The room was spotless and breakfast was quick. Only thing: the shower ran cold at 6am."
        />
      </label>

      {needsIdentity && (
        <div className="rv-identity">
          <span className="rv-identity-head">
            <AlertCircle size={14} /> Which stay was this?
          </span>
          <p>
            The reference from your confirmation or check-out email, and the phone number you booked with. We match the
            last six digits and nothing more.
          </p>
          <label className="rv-field">
            Booking reference
            <input
              className="rv-input is-code"
              value={reference}
              onChange={(event) => setReference(event.target.value.toUpperCase())}
              placeholder="SR-XXXXXX"
            />
          </label>
          <label className="rv-field">
            Phone number you booked with
            <input
              className="rv-input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+265 …"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="rv-error">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      <button className="rv-submit" type="button" disabled={busy} onClick={() => void send(rating)}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} />}
        {rating > 0 ? `Submit ${rating} star${rating === 1 ? "" : "s"}` : "Submit my rating"}
      </button>
      <p className="rv-note">
        You can change it later with the same link — one rating per stay, never two.
      </p>

      {published && published.summary.count > 0 && (
        <div className="rv-published">
          <div className="rv-published-top">
            <strong>{published.summary.averageDisplay ?? published.summary.average.toFixed(1)}</strong>
            <div>
              <span className="rv-glyphs" aria-hidden="true">
                {"★".repeat(Math.round(published.summary.average))}
                {"☆".repeat(5 - Math.round(published.summary.average))}
              </span>
              <small>
                {published.summary.count} published review{published.summary.count === 1 ? "" : "s"} · the plain average,
                nothing edited
              </small>
            </div>
          </div>
          <ul className="rv-published-list">
            {published.reviews.map((review) => (
              <li key={review.id}>
                <span className="rv-glyphs" aria-label={`${review.rating} out of 5`}>
                  {"★".repeat(review.rating)}
                  {"☆".repeat(5 - review.rating)}
                </span>{" "}
                {review.comment ? `“${review.comment}” — ` : ""}
                <strong>{review.guestName}</strong>
                {review.stayMonth ? `, ${review.stayMonth}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

