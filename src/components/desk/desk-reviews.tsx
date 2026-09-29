"use client";

// REVIEWS & WAITLIST AT THE DESK (addendum "landing page", Parts 2.4 and 3.4).
//
// The landing page promises two things this screen has to keep true:
//
//   * the star rating on the website is the average of the PUBLISHED reviews below,
//     and nothing else — so hiding a review changes the number, and the review is
//     kept, never deleted;
//   * a sold-out week is a lead. Everybody waiting on the dates that just opened gets
//     told at once, in the order they joined.
//
// The desk can also record a review a guest gave over the counter, or import a Google
// review — with the link it came from, so the page can be honest about the source.

import { BellRing, Loader2, RefreshCw, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, BTN, BTN_PRIMARY, CARD, INPUT } from "./shared";

type ReviewRow = {
  id: string;
  guestName: string;
  stayMonth: string | null;
  rating: number;
  comment: string | null;
  source: string;
  sourceUrl: string | null;
  collectedVia: string;
  isPublished: boolean;
  isFeatured: boolean;
  publishedByLabel: string | null;
  createdAt: string;
};

type WaitRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  checkIn: string;
  checkOut: string;
  roomType: string | null;
  adults: number;
  children: number;
  note: string | null;
  status: string;
  notifiedAt: string | null;
  createdAt: string;
};

type Payload = { reviews: ReviewRow[]; summary: { count: number; averageDisplay: string | null }; waitlist: WaitRow[]; note: string };

const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

export default function DeskReviews({
  onChanged,
  setToast,
  readOnly,
  isAdmin,
}: {
  onChanged: () => Promise<void>;
  setToast: (message: string) => void;
  readOnly: boolean;
  /**
   * ADDENDUM (authority matrix): moderating a review — publish, hide, feature — is admin only.
   * Staff can read the screen and add a hand-recorded review; they do not change the public record.
   */
  isAdmin: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    guestName: "",
    rating: 5,
    stayMonth: "",
    comment: "",
    source: "direct",
    sourceUrl: "",
  });
  const [openDates, setOpenDates] = useState({ checkIn: "", checkOut: "" });

  const load = useCallback(async () => {
    setData(await api<Payload>("/api/desk/reviews"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    if (readOnly) return;
    setBusy(true);
    try {
      await work();
      await load();
      await onChanged();
      setToast(label);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That review action failed.");
    } finally {
      setBusy(false);
    }
  };

  const moderate = (review: ReviewRow, patch: { isPublished?: boolean; isFeatured?: boolean }) =>
    run(
      patch.isPublished === false
        ? `Hidden: ${review.guestName}'s review stays on record but is off the website.`
        : patch.isPublished === true
          ? `Published: ${review.guestName}'s rating is on the website again.`
          : `${review.guestName}'s review is ${patch.isFeatured ? "now featured" : "no longer featured"}.`,
      () =>
        api("/api/desk/reviews", {
          method: "POST",
          body: JSON.stringify({ action: "moderate", reviewId: review.id, ...patch }),
        }),
    );

  const addReview = (event: React.FormEvent) => {
    event.preventDefault();
    void run("Review recorded — it is on the website now.", async () => {
      await api("/api/desk/reviews", {
        method: "POST",
        body: JSON.stringify({ action: "add", ...draft, sourceUrl: draft.sourceUrl || undefined }),
      });
      setDraft({ guestName: "", rating: 5, stayMonth: "", comment: "", source: "direct", sourceUrl: "" });
    });
  };

  const notifyWaitlist = () =>
    void run("Everybody waiting on those dates was told a room came free.", () =>
      api("/api/desk/reviews", {
        method: "POST",
        body: JSON.stringify({ action: "notify_waitlist", ...openDates }),
      }),
    );

  const reviews = data?.reviews ?? [];
  const waitlist = data?.waitlist ?? [];
  const waiting = waitlist.filter((row) => row.status === "waiting");

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Star size={16} className="text-[#f8c66b]" /> Reviews &amp; waitlist
        </h2>
        <span className="text-[11px] text-white/50">
          {data?.summary.averageDisplay ?? "—"} average · {data?.summary.count ?? 0} published ·{" "}
          {reviews.filter((row) => !row.isPublished).length} hidden · {waiting.length} waiting
        </span>
        <button className={BTN} onClick={() => void load()} disabled={busy}>
          <RefreshCw size={14} /> Reload
        </button>
      </section>

      <section className={CARD}>
        <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">Every review</p>
        <p className="mt-1 text-[11px] text-white/55">
          Hiding a review takes it off the website and out of the average, but nothing is deleted — the record stays
          here.
        </p>
        {reviews.length === 0 ? (
          <p className="mt-3 text-xs text-white/55">
            No reviews yet. The landing page says exactly that instead of showing invented stars.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className={`rounded border border-white/10 p-3 ${review.isPublished ? "" : "bg-white/[0.02] opacity-70"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      <span className="text-[#f8c66b]">{stars(review.rating)}</span> {review.guestName}
                      {review.stayMonth ? ` · stayed ${review.stayMonth}` : ""}
                    </p>
                    <p className="text-[11px] text-white/45">
                      {review.source === "google" ? "Google review" : "Left with us"} · collected via{" "}
                      {review.collectedVia} · {new Date(review.createdAt).toLocaleDateString()}
                      {review.publishedByLabel ? ` · last changed by ${review.publishedByLabel}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin ? (
                      <>
                    <button
                      className={BTN}
                      disabled={busy || readOnly}
                      onClick={() => void moderate(review, { isPublished: !review.isPublished })}
                    >
                      {review.isPublished ? <ThumbsDown size={14} /> : <ThumbsUp size={14} />}
                      {review.isPublished ? "Hide" : "Publish"}
                    </button>
                    <button
                      className={BTN}
                      disabled={busy || readOnly || !review.isPublished}
                      title={
                        review.isPublished
                          ? "Show this review first on the landing page"
                          : "Publish it before featuring it"
                      }
                      onClick={() => void moderate(review, { isFeatured: !review.isFeatured })}
                    >
                      <Star size={14} /> {review.isFeatured ? "Unfeature" : "Feature"}
                    </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-white/45">Admin moderates reviews.</span>
                    )}
                  </div>
                </div>
                {review.comment && <p className="mt-2 text-xs text-white/75">“{review.comment}”</p>}
                {review.sourceUrl && (
                  <a className="mt-1 block break-all text-[11px] text-[#f8c66b] underline" href={review.sourceUrl}>
                    {review.sourceUrl}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>


      <section className={CARD}>
        <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">Record a review by hand</p>
        <p className="mt-1 text-[11px] text-white/55">
          For a guest who told you at the counter, or a Google review being imported. A Google review needs its link —
          the website says where it came from.
        </p>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={addReview}>
          <input
            className={INPUT}
            placeholder="Guest name"
            value={draft.guestName}
            onChange={(event) => setDraft({ ...draft, guestName: event.target.value })}
          />
          <label className="flex items-center gap-2 text-xs text-white/70">
            Rating
            <select
              className={INPUT}
              value={draft.rating}
              onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {stars(value)}
                </option>
              ))}
            </select>
          </label>
          <input
            className={INPUT}
            placeholder="Month of stay (e.g. 2026-04) — optional"
            value={draft.stayMonth}
            onChange={(event) => setDraft({ ...draft, stayMonth: event.target.value })}
          />
          <label className="flex items-center gap-2 text-xs text-white/70">
            Source
            <select
              className={INPUT}
              value={draft.source}
              onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            >
              <option value="direct">Guest told us</option>
              <option value="google">Google review</option>
            </select>
          </label>
          {draft.source === "google" && (
            <input
              className={`${INPUT} sm:col-span-2`}
              placeholder="Link to the Google review"
              value={draft.sourceUrl}
              onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
            />
          )}
          <textarea
            className={`${INPUT} sm:col-span-2`}
            rows={2}
            placeholder="What they said (optional)"
            value={draft.comment}
            onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
          />
          <div className="sm:col-span-2">
            <button className={BTN_PRIMARY} type="submit" disabled={busy || readOnly}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} Record it
            </button>
          </div>
        </form>
      </section>


      <section className={CARD}>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#f8c66b]">
          <BellRing size={14} /> The waitlist ({waiting.length} waiting)
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Everybody who was told &ldquo;sold out&rdquo; and asked to be remembered. When those nights free up — a
          cancellation, a released hold — tell them all at once; they hear before the dates go back on the website.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-white/70">
            Dates that opened up
            <input
              className={INPUT}
              type="date"
              value={openDates.checkIn}
              onChange={(event) => setOpenDates({ ...openDates, checkIn: event.target.value })}
            />
          </label>
          <label className="text-xs text-white/70">
            to
            <input
              className={INPUT}
              type="date"
              value={openDates.checkOut}
              onChange={(event) => setOpenDates({ ...openDates, checkOut: event.target.value })}
            />
          </label>
          <button
            className={BTN_PRIMARY}
            disabled={busy || readOnly || !openDates.checkIn || !openDates.checkOut}
            onClick={notifyWaitlist}
          >
            <BellRing size={14} /> Tell everyone waiting
          </button>
          <button
            className={BTN}
            type="button"
            onClick={() => {
              const first = waiting[0];
              if (first) setOpenDates({ checkIn: first.checkIn, checkOut: first.checkOut });
            }}
            disabled={waiting.length === 0}
          >
            Use the oldest wait
          </button>
        </div>

        {waitlist.length === 0 ? (
          <p className="mt-3 text-xs text-white/55">Nobody is waiting for dates right now.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-xs">
            {waitlist.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2"
              >
                <span>
                  <strong>{row.fullName ?? row.email ?? row.phone}</strong> · {row.checkIn} → {row.checkOut}
                  {row.roomType ? ` · ${row.roomType}` : ""} · {row.adults ?? 1} adult(s)
                  {row.note ? ` · ${row.note}` : ""}
                </span>
                <span className="text-white/55">
                  {row.email ?? row.phone}
                  {row.email && row.phone ? ` · ${row.phone}` : ""} ·{" "}
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      row.status === "waiting"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {row.status}
                  </span>
                  {row.notifiedAt ? ` · told ${new Date(row.notifiedAt).toLocaleDateString()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data?.note && (
        <p className="rounded border border-white/10 bg-white/[0.02] p-3 text-[11px] text-white/55">{data.note}</p>
      )}
    </div>
  );
}

