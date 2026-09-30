import { ageLabel, isNew } from "@/lib/freshness";

/**
 * THE "NEW" CHIP — shown for NEW_WINDOW_HOURS after something is published.
 *
 * Guests should never have to hunt for what changed since their last visit, so
 * every feed marks it: the landing page's promo cards, the /unwind feed and the
 * guest app's What's on tab all render this component, which means the three of
 * them cannot disagree about what is new.
 *
 * Renders nothing when the item is not new — no wrapper, no empty span.
 */
export function NewBadge({ publishedAt, className = "new-chip" }: { publishedAt?: string | null; className?: string }) {
  if (!isNew(publishedAt)) return null;
  const age = ageLabel(publishedAt);
  return (
    <span className={className} title={age ? `Published ${age}` : "Just published"}>
      New
    </span>
  );
}
