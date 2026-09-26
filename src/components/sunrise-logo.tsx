"use client";

import React from "react";

/**
 * Sunrise Motel brand emblem — faithful vector recreation of the official logo:
 * orange ring, rising sun with rays behind an orange mountain range.
 */
export function SunriseEmblem({
  className = "",
  animated = false,
  size = 44,
}: {
  className?: string;
  animated?: boolean;
  size?: number;
}) {
  return (
    <svg
      className={`sunrise-emblem ${animated ? "is-animated" : ""} ${className}`}
      viewBox="0 0 400 400"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle className="emblem-ring" cx="200" cy="200" r="172" fill="#ffffff" stroke="#F28C18" strokeWidth="10" />
      <g className="emblem-rays" stroke="#F28C18" strokeWidth="11" strokeLinecap="round">
        <line x1="200" y1="122" x2="200" y2="72" />
        <line x1="171" y1="128" x2="152" y2="81" />
        <line x1="229" y1="128" x2="248" y2="81" />
        <line x1="145" y1="145" x2="110" y2="110" />
        <line x1="255" y1="145" x2="290" y2="110" />
        <line x1="127" y1="173" x2="80" y2="156" />
        <line x1="273" y1="173" x2="320" y2="156" />
      </g>
      <circle className="emblem-sun" cx="200" cy="200" r="60" fill="#ffffff" stroke="#F28C18" strokeWidth="9" />
      <path
        className="emblem-mountains"
        d="M50 266 C64 258 82 246 96 236 L132 186 L168 230 L216 158 L254 214 L296 188 L350 262 C330 258 310 268 284 270 C250 272 224 260 194 266 C160 272 132 282 104 276 C86 272 66 272 50 266 Z"
        fill="#F28C18"
      />
      <path
        className="emblem-snow"
        d="M186 214 L200 198 L212 210 L224 194 L236 210"
        fill="none"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Emblem + wordmark, used in headers/footers. */
export function SunriseLogo({
  size = "default",
  animated = true,
  theme = "light",
  showTagline = true,
}: {
  size?: "small" | "default" | "large";
  animated?: boolean;
  theme?: "light" | "dark";
  showTagline?: boolean;
}) {
  const px = size === "small" ? 40 : size === "large" ? 84 : 58;
  return (
    <div className={`brand-lockup brand-${size} ${theme === "dark" ? "brand-dark" : "brand-light"}`}>
      <SunriseEmblem size={px} animated={animated} />
      <div className="brand-words">
        <span className="brand-name">Sunrise Motel</span>
        {showTagline && <span className="brand-tagline">When you are here, you are family.</span>}
      </div>
    </div>
  );
}

/** The complete official logo including text inside/below the ring. */
export function SunriseFullLogo({ className = "", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg className={`sunrise-full-logo ${animated ? "is-animated" : ""} ${className}`} viewBox="0 0 400 480" aria-label="Sunrise Motel logo">
      <circle className="emblem-ring" cx="200" cy="200" r="172" fill="#ffffff" stroke="#F28C18" strokeWidth="10" />
      <g className="emblem-rays" stroke="#F28C18" strokeWidth="11" strokeLinecap="round">
        <line x1="200" y1="122" x2="200" y2="72" />
        <line x1="171" y1="128" x2="152" y2="81" />
        <line x1="229" y1="128" x2="248" y2="81" />
        <line x1="145" y1="145" x2="110" y2="110" />
        <line x1="255" y1="145" x2="290" y2="110" />
        <line x1="127" y1="173" x2="80" y2="156" />
        <line x1="273" y1="173" x2="320" y2="156" />
      </g>
      <circle className="emblem-sun" cx="200" cy="200" r="60" fill="#ffffff" stroke="#F28C18" strokeWidth="9" />
      <path
        className="emblem-mountains"
        d="M50 266 C64 258 82 246 96 236 L132 186 L168 230 L216 158 L254 214 L296 188 L350 262 C330 258 310 268 284 270 C250 272 224 260 194 266 C160 272 132 282 104 276 C86 272 66 272 50 266 Z"
        fill="#F28C18"
      />
      <path className="emblem-snow" d="M186 214 L200 198 L212 210 L224 194 L236 210" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <text className="logo-text-name" x="200" y="328" textAnchor="middle" fontFamily="Roboto, 'Segoe UI', Arial, Helvetica, sans-serif" fontSize="40" fill="#111111">
        Sunrise Motel
      </text>
      <text className="logo-text-tag" x="200" y="428" textAnchor="middle" fontFamily="Roboto, 'Segoe UI', Arial, Helvetica, sans-serif" fontSize="23" fontWeight="700" fill="#111111">
        When you are here
      </text>
      <text className="logo-text-tag" x="200" y="458" textAnchor="middle" fontFamily="Roboto, 'Segoe UI', Arial, Helvetica, sans-serif" fontSize="23" fontWeight="700" fill="#111111">
        you are family.
      </text>
    </svg>
  );
}

/** Animated page-load splash: the ring draws itself, the sun rises behind the mountains, rays fade in.
 *  Safety: force-hides after 2.5s even if timers/JS stall, so visitors never get stuck on the logo. */
export function PageLoadingSplash({ onFinished }: { onFinished?: () => void }) {
  const [fading, setFading] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const t1 = window.setTimeout(() => setFading(true), 1200);
    const t2 = window.setTimeout(() => {
      setHidden(true);
      onFinished?.();
    }, 1700);
    // Absolute fallback: never trap the visitor behind the splash.
    const t3 = window.setTimeout(() => {
      setHidden(true);
      onFinished?.();
    }, 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onFinished]);

  if (hidden) return null;

  return (
    <div className={`page-loading-splash ${fading ? "splash-fading" : ""}`} aria-hidden="true">
      <div className="splash-logo-card">
        <SunriseFullLogo className="splash-logo" animated />
        <div className="splash-progress">
          <div className="splash-progress-bar" />
        </div>
        <span className="splash-location">Area 5 · Lilongwe · Malawi</span>
      </div>
    </div>
  );
}
