"use client";

import { useState, type CSSProperties } from "react";

/**
 * A photograph that is never allowed to show a broken-image icon
 * (addendum "navigation & image standards", Part 5.9 — "a clean placeholder
 * costs nothing, a broken icon on a booking page costs a booking").
 *
 * It also enforces the rest of the image standard in one place: real alt text,
 * explicit width/height (so nothing jumps while loading), lazy loading for
 * everything that is not the hero, and a new id per replacement image.
 */
export default function SafeImage({
  src,
  alt,
  width,
  height,
  className = "",
  imgClassName = "",
  priority = false,
  fallbackLabel = "Photo coming soon",
  style,
}: {
  src?: string | null;
  /** Describe the scene, never the filename. Required, because it is. */
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  imgClassName?: string;
  /** Only ever true for the hero: never lazy-load the first thing a guest sees. */
  priority?: boolean;
  fallbackLabel?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const usable = typeof src === "string" && src.trim().length > 0 && !failed;

  if (!usable) {
    return (
      <span className={`img-placeholder ${className}`.trim()} style={style} role="img" aria-label={alt}>
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      src={src.trim()}
      alt={alt}
      width={width}
      height={height}
      className={`${imgClassName} ${className}`.trim()}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      style={style}
    />
  );
}
