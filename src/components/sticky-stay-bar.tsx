"use client";

import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";

/**
 * THE MOBILE STICKY STAY BAR (landing-page redesign §2.13).
 *
 * On a phone the busiest thing on the page is the dates the guest already chose,
 * so they ride along in a bar pinned to the bottom of the screen: the nights, the
 * party size, and one gold button that takes them to the rooms.
 *
 * Two rules it obeys, because a sticky bar that fights the guest is worse than
 * no sticky bar at all:
 *   · it only appears once the hero is behind them (nothing covers the hero copy
 *     that is doing the selling), and
 *   · it hides itself the moment a field has focus, so it never sits on top of a
 *     date picker or the on-screen keyboard.
 *
 * It renders nothing on desktop — `home-premium.css` only displays it at
 * ≤900px, and the markup itself is inert above that.
 */
export default function StickyStayBar({
  checkIn,
  checkOut,
  nights,
  guests,
  href = "#rooms-section",
}: {
  /** ISO date the guest picked, e.g. 2026-09-29. */
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  /** Where the button goes — the live room grid. */
  href?: string;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // While a field inside the page (or the booking sheet) has focus the bar
    // steps out of the way: on a phone that field is under the keyboard.
    const isField = (node: EventTarget | null) =>
      node instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName);
    const onFocusIn = (event: FocusEvent) => setTyping(isField(event.target));
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const format = (iso: string) => {
    if (!iso) return "";
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };

  const visible = pastHero && !typing;

  return (
    <div className={`hp-sticky-stay ${visible ? "is-visible" : ""} ${typing ? "is-typing" : ""}`}>
      <div className="hp-sticky-dates">
        {format(checkIn)} → {format(checkOut)}
        <small>
          {nights} night{nights === 1 ? "" : "s"} · {guests} guest{guests === 1 ? "" : "s"}
        </small>
      </div>
      <a className="hp-sticky-go" href={href}>
        <CalendarCheck size={15} /> Check availability
      </a>
    </div>
  );
}