"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Scroll reveal (addendum "navigation & image standards", Part 5.10).
 *
 * Content is only ever animated in, never hidden for long: if the browser has no
 * IntersectionObserver, or the guest has asked for reduced motion, the content is
 * shown immediately. Nothing here downloads anything — motion must never cost a
 * guest on a prepaid bundle more data.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  variant,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds. */
  delay?: number;
  variant?: "up" | "left" | "right" | "zoom";
  as?: "div" | "section" | "article" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      // Not a synchronous setState in the effect body: this is the same
      // "an external signal told us the content is ready" path as the observer,
      // just for guests who asked their device for reduced motion.
      const timer = window.setTimeout(() => setInView(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const variantClass = variant && variant !== "up" ? `reveal-${variant}` : "";

  return (
    <Tag
      // @ts-expect-error — the ref type narrows per tag, and the class list is the same for all of them.
      ref={ref}
      className={`reveal ${variantClass} ${inView ? "in-view" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
