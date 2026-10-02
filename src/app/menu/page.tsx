import type { Metadata } from "next";
import LiveMenu from "@/components/live-menu";
import SiteNav from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Live Restaurant Menu | Sunrise Motel",
  description: "Browse the current Sunrise Motel menu and place an order for pickup.",
};

export const dynamic = "force-dynamic";

export default function MenuPage() {
  return <><SiteNav active="Dine" showStickyBar={false} /><LiveMenu /></>;
}
