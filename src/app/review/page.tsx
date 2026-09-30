import type { Metadata } from "next";
import Link from "next/link";
import ReviewForm from "@/components/guest/review-form";
import "./review.css";

// Live data: never prerendered — see src/lib/revalidate.ts
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rate your stay | Sunrise Motel",
  description:
    "One tap, five stars, a sentence if you have one. Your rating goes straight to the manager and is never edited.",
  robots: { index: false, follow: false },
};

/**
 * The review page the check-out email links to. It is deliberately reachable without
 * an account: the guest who never installed anything still gets asked, and the
 * reference in the link is what ties the rating to a real stay.
 *
 * The route owns its own sheet (`review.css`, `rv-` classes) for the same reason the
 * landing page owns `home-premium.css`: this is one page with one job, and the guest
 * arrives on it from a phone email with a thumb already moving. The form is not
 * wrapped in a popup — on this page the form *is* the page, and the star that rates
 * the stay is also the button that submits it.
 */
export default function ReviewPage() {
  return (
    <main className="rv-root">
      <div className="rv-shell">
        <header className="rv-top">
          <p className="rv-brand">
            {/* The motel is in Lilongwe — Area 5, Mzimba Road — and the ellipsis is a
                middle dot, not a comma, so it survives the uppercase transform. */}
            <strong>Sunrise Motel · Lilongwe</strong>
            <span>Area 5, Mzimba Road · rate the stay you just finished</span>
          </p>
          <Link className="rv-home" href="/">
            The motel
          </Link>
        </header>

        <p className="rv-intro">
          Reviews on our booking page are the ones guests leave here — published as written, including the ones that say
          what we should fix.
        </p>

        <ReviewForm />
      </div>
    </main>
  );
}
