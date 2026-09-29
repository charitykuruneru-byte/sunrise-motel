import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/**
 * The manager portal gets its OWN web app manifest, so installing it from Chrome
 * puts "Sunrise Manager" on the home screen opening straight at /admin — not the
 * guest app's name and the public landing page. The Android wrapper
 * (SunriseAdminApp) is the richer option; this is the one-tap one.
 *
 * `robots: noindex` is here as well as on the page itself: a portal page should
 * never be able to end up in a search result even if the page metadata changes.
 */
export const metadata: Metadata = {
  title: "Manager portal | Sunrise Motel",
  description:
    "Arrivals, room map, orders, guest issues, payments and folios for Sunrise Motel — Area 5, Lilongwe.",
  manifest: "/manifest-admin.json",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171513",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}