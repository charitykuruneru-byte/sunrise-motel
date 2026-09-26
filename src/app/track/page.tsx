import { Suspense } from "react";
import { TrackBooking } from "@/components/track-booking";

export const metadata = {
  title: "Track your booking | Sunrise Motel Lilongwe",
  description: "Follow the status of your Sunrise Motel booking using your reference and phone number — no account needed.",
};

export default function TrackPage() {
  return (
    <Suspense fallback={null}>
      <TrackBooking />
    </Suspense>
  );
}
