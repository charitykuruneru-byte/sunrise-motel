import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./inner-pages.css";
import "./enhancements.css";

export const metadata: Metadata = {
  title: "Sunrise Motel | Your warm welcome in Lilongwe",
  description:
    "Comfortable rooms, generous meals and relaxed evenings in Area 5, Lilongwe. Check live availability and request your stay without an account. When you are here, you are family.",
  icons: { icon: "/images/sunrise-logo.svg", apple: "/images/sunrise-logo.svg" },
  openGraph: {
    title: "Sunrise Motel — Area 5, Lilongwe",
    description: "Stay, dine, unwind and connect. Live room availability and account-free direct booking.",
    images: ["/images/hero-standard.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F28C18",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
