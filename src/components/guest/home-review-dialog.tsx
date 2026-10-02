"use client";

import { AlertCircle, CheckCircle2, Loader2, Star, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

export default function HomeReviewDialog({
  onClose,
  onPublished,
}: {
  onClose: () => void;
  onPublished: () => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [guestName, setGuestName] = useState("");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onClose();
      if (event.key === "Tab") {
        const focusable = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating < 1 || rating > 5) {
      setError("Choose a star rating before submitting.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, guestName, reference, phone }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "We could not save your review.");
      await onPublished();
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not save your review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="hp-review-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialog}
        className="hp-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hp-review-dialog-title"
        aria-describedby="hp-review-dialog-description"
      >
        <button
          ref={closeButton}
          className="hp-review-close"
          type="button"
          aria-label="Close review form"
          onClick={onClose}
          disabled={busy}
        >
          <X size={19} />
        </button>

        {done ? (
          <div className="hp-review-success" role="status">
            <span className="hp-review-success-icon"><CheckCircle2 size={26} /></span>
            <p className="hp-eyebrow">Thank you for sharing</p>
            <h2 id="hp-review-dialog-title">Your review is live.</h2>
            <p id="hp-review-dialog-description">
              It has been added to the guest feed, so visitors can read it now.
            </p>
            <button className="admin-btn admin-btn-primary" type="button" onClick={onClose}>
              Back to the page
            </button>
          </div>
        ) : (
          <>
            <p className="hp-eyebrow">A real guest review</p>
            <h2 id="hp-review-dialog-title">How was your stay?</h2>
            <p className="hp-review-dialog-description" id="hp-review-dialog-description">
              Your rating and comment will appear in the public guest feed. We verify each review against a completed
              stay.
            </p>

            <form className="hp-review-form" onSubmit={submit}>
              <fieldset className="hp-review-rating">
                <legend>Your rating</legend>
                <div className="hp-review-stars" role="radiogroup" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className={`hp-review-star ${(hover || rating) >= star ? "is-on" : ""}`}
                      type="button"
                      role="radio"
                      aria-checked={rating === star}
                      aria-label={`${star} star${star === 1 ? "" : "s"}`}
                      disabled={busy}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                    >
                      <Star size={30} fill={(hover || rating) >= star ? "currentColor" : "none"} />
                    </button>
                  ))}
                  <span aria-live="polite">{rating ? `${rating} out of 5` : "Choose a rating"}</span>
                </div>
              </fieldset>

              <label className="hp-review-field">
                Your name <span>Optional</span>
                <input
                  autoComplete="name"
                  maxLength={160}
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Name shown with your review"
                  disabled={busy}
                />
              </label>

              <label className="hp-review-field">
                Your comment <span>Optional</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Tell visitors what your stay was like"
                  disabled={busy}
                />
                <small>{comment.length}/2000</small>
              </label>

              <div className="hp-review-identity">
                <p>
                  To verify your stay, enter the booking reference and phone number from your booking. Guests already
                  signed in to the guest app can leave these blank.
                </p>
                <div>
                  <label className="hp-review-field">
                    Booking reference
                    <input
                      autoComplete="off"
                      value={reference}
                      onChange={(event) => setReference(event.target.value.toUpperCase())}
                      placeholder="SR-XXXXXX"
                      disabled={busy}
                    />
                  </label>
                  <label className="hp-review-field">
                    Phone number on the booking
                    <input
                      autoComplete="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+265 …"
                      disabled={busy}
                    />
                  </label>
                </div>
              </div>

              {error && (
                <p className="hp-review-error" role="alert">
                  <AlertCircle size={16} /> {error}
                </p>
              )}

              <button className="admin-btn admin-btn-primary hp-review-submit" type="submit" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
                {busy ? "Publishing…" : "Post my review"}
              </button>
              <p className="hp-review-privacy">
                Your phone and booking details are only used to verify the stay and are never shown publicly.
              </p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
