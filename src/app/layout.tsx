import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";
import "./inner-pages.css";
import "./enhancements.css";
import "./site-nav.css";
import "./animations.css";

/**
 * The absolute origin every relative URL in `metadata` is resolved against — the
 * OpenGraph picture in particular. Without it Next falls back to
 * `http://localhost:3000` at build time (it warns about exactly that), so a link
 * shared to WhatsApp or Facebook spent its whole life pointing at a picture that
 * only exists on the developer's laptop: no thumbnail, no preview.
 *
 * Order: the app's own public URL first, then Vercel's per-deployment host, then
 * localhost so `next dev` still builds. A malformed value is discarded rather
 * than thrown, because a bad env var must not be able to fail the build.
 */
const siteUrl = (() => {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    "http://localhost:3000",
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    } catch {
      /* try the next candidate */
    }
  }
  return new URL("http://localhost:3000");
})();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Sunrise Motel | A warm room, a full plate, and a quiet evening",
  description:
    "Ten rooms in Area 5, Lilongwe — comfortable rooms, generous local meals, braai evenings and dependable Starlink Wi-Fi. Check live availability and book directly. No account, no password. When you are here, you are family.",
  icons: { icon: "/images/sunrise-logo.svg", apple: "/images/sunrise-logo.svg" },
  manifest: "/manifest.json",
  openGraph: {
    title: "Sunrise Motel — Area 5, Lilongwe",
    description:
      "A warm room, a full plate and a quiet evening. Live room availability, published promotions and direct booking — Mzimba Road, Area 5.",
    images: ["/images/hero-standard.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#D4A017",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The manifest and theme colour come from metadata/viewport above, so
            /admin can point at its own manifest without fighting this one. */}
      </head>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
