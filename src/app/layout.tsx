import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";
import "./inner-pages.css";
import "./enhancements.css";
import "./site-nav.css";
import "./animations.css";

export const metadata: Metadata = {
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
