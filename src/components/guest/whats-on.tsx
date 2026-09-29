"use client";

import { CalendarDays, Loader2, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import SafeImage from "@/components/safe-image";
import { whatsappLink } from "@/components/site-nav";

/**
 * WHAT'S ON — the feed the guest app shows, fed by the manager portal.
 *
 * (addendum "navigation & image standards", Part 3.1: the app has five bottom tabs,
 * and What's on is one of them, holding events, offers, specials and news with an
 * unread badge. Part 5.5: one image per post, showing the actual thing.)
 *
 * The same `posts` rows the website shows are returned by /api/posts, so a post
 * the manager publishes appears on the landing page AND in the app at the same
 * moment — nothing is entered twice, and no surface can drift out of date.
 */

export type FeedPost = {
  id: string;
  title: string;
  category: string;
  day: string | null;
  date: string | null;
  time: string | null;
  detail: string;
  priceTag: string | null;
  imageUrl: string | null;
  createdAt?: string;
};

/** Guest-local "I have read the feed" marker. Never leaves the device. */
const SEEN_KEY = "sunrise.whatson.seen";

export function useWhatsOnFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/posts", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { posts?: FeedPost[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load what's on.");
      const list = data.posts ?? [];
      setPosts(list);
      const seenAt = Number(window.localStorage.getItem(SEEN_KEY) ?? 0);
      setUnread(list.filter((post) => post.createdAt && new Date(post.createdAt).getTime() > seenAt).length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load what's on.");
    } finally {
      setLoading(false);
    }
  }, []);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* private mode — the badge simply stays until the next visit */
    }
    setUnread(0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { posts, loading, error, unread, reload: load, markSeen };
}

export function WhatsOnFeed({
  posts,
  loading,
  error,
  onRetry,
  heading = "What's on at Sunrise",
  intro = "Events, specials and offers published by the team — the same list the website shows, updated the moment the desk changes it.",
}: {
  posts: FeedPost[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  heading?: string;
  intro?: string;
}) {
  return (
    <section>
      <span className="eyebrow">
        <span className="eyebrow-line" /> THIS WEEK AT SUNRISE
      </span>
      <h2 className="mt-1 text-lg font-bold">{heading}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{intro}</p>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading what&apos;s on…
        </p>
      )}

      {!loading && error && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4 text-sm">
          <p className="font-semibold">We could not load the feed.</p>
          <p className="mt-1 text-[var(--muted)]">{error}</p>
          {onRetry && (
            <button className="admin-btn mt-3" type="button" onClick={onRetry}>
              <RefreshCw size={14} /> Try again
            </button>
          )}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
          Nothing is scheduled right now. The desk publishes braai days, happy hours and offers here — ask at the counter
          what is on tonight.
        </p>
      )}

      <div className="feed-cards mt-4">
        {posts.map((post) => (
          <article key={post.id} className="feed-card">
            <div className="feed-card-img">
              <SafeImage
                src={post.imageUrl}
                alt={`${post.title} at Sunrise Motel, Area 5, Lilongwe`}
                width={1200}
                height={630}
                fallbackLabel={post.category || "Sunrise Motel"}
              />
              <span className="feed-card-tag">{post.category}</span>
            </div>
            <div className="feed-card-body">
              <div className="feed-date-block">
                <small>{post.day || "ON NOW"}</small>
                <strong>{post.date || "—"}</strong>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold leading-snug">{post.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <CalendarDays size={12} /> {post.time || "All day"}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{post.detail}</p>
                {post.priceTag && <span className="feed-price-pill">{post.priceTag}</span>}
                <div className="mt-3">
                  <a
                    className="admin-btn"
                    href={whatsappLink(`Hello Sunrise Motel, tell me more about "${post.title}".`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={14} /> Ask the desk
                  </a>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {posts.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <Sparkles size={12} /> New offers appear here as the desk publishes them — no app update needed.
        </p>
      )}
    </section>
  );
}

