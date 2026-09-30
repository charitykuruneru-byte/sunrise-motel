import { Suspense } from "react";
import { TrackBooking } from "@/components/track-booking";

// Live data: never prerendered — see src/lib/revalidate.ts
export const dynamic = "force-dynamic";

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
