import type { Metadata } from "next";
import RoomSessionApp from "@/components/guest/room-session-app";

export const metadata: Metadata = {
  title: "Your room | Sunrise Motel",
  description:
    "Scan the QR card in your room, or use your room number and the PIN from your key sleeve, to order food to your room, follow your bill and message the front desk — no account needed.",
  robots: { index: false, follow: false },
};

/**
 * THE THIRD GUEST PATH (§2 addendum) — the room itself.
 *
 * This route is what the QR card on the nightstand points at (`/room?qr=…`), and it
 * is also the address printed on the key sleeve for guests who would rather type
 * their room number and PIN. There is no account here, no password and no install:
 * one of the three documented proofs opens the same menu, the same room bill and the
 * same private line to the desk that an account guest gets.
 *
 * `room-session-app.tsx` holds all of it; this file only mounts it.
 */
export default function RoomPage() {
  return <RoomSessionApp />;
}
