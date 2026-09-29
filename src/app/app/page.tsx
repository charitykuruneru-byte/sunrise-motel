import type { Metadata } from "next";
import GuestApp from "@/components/guest/guest-app";

export const metadata: Metadata = {
  title: "Your stay | Sunrise Motel guest app",
  description:
    "See your room number, follow your room bill, order food to your room and message the front desk — the guest app is optional, the desk can do everything for you.",
  robots: { index: false, follow: false },
};

/**
 * The guest app shell (§3). Sign-in, the home tab with the room number and the
 * running bill, ordering, orders, messages, requests and settings live inside
 * `guest-app.tsx`; this route only mounts it.
 */
export default function GuestAppPage() {
  return <GuestApp />;
}
