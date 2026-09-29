import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get the Android App | Sunrise Motel Lilongwe",
  description:
    "Download the Sunrise Motel Android apps: the guest app for booking and your stay, and the Sunrise Manager app for staff. Both open our website directly — any website update shows in the app automatically.",
};

const GUEST_APK = "https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk";
const MANAGER_APK = "https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseManager.apk";

export default function DownloadPage() {
  return (
    <div className="sunrise-app-root">
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> ANDROID APPS</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>Two apps, one website.</h1>
        <p className="hero-description">
          Both apps open our website directly, so anything we change there appears in the app automatically — no
          separate update needed. The guest app is for guests; the manager app is for the desk and the office.
        </p>

        <div className="extras-calculator-box" style={{ marginTop: 24 }}>
          <div className="extras-header"><strong>Sunrise Motel — guest app</strong></div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Rooms, live availability, booking, tracking and your account. Free, and nothing on the website needs it.
          </p>
          <a href={GUEST_APK} className="btn-submit-booking-request" style={{ marginTop: 14, textDecoration: "none" }}>
            Download SunriseMotel.apk (v1.3)
          </a>
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Package com.sunrisemotel.app · version 1.3 · Internet access only.
          </p>
        </div>

        <div className="extras-calculator-box" style={{ marginTop: 16 }}>
          <div className="extras-header"><strong>Sunrise Manager — manager app</strong></div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            The portal on the home screen: arrivals, room map, orders, guest issues, payments and folios. It asks for
            the same sign-in as the portal, and it installs beside the guest app — its own icon, its own updates.
          </p>
          <a href={MANAGER_APK} className="btn-submit-booking-request" style={{ marginTop: 14, textDecoration: "none" }}>
            Download SunriseManager.apk (v1.0)
          </a>
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Package com.sunrisemotel.admin · version 1.0 · for staff. Only install it if you have a staff login.
          </p>
        </div>

        <p className="no-account-guarantee" style={{ marginTop: 14 }}>
          If a button shows a 404, that APK is still building — check the Releases page in a few minutes.
        </p>

        <ol style={{ marginTop: 28, display: "grid", gap: 14, fontSize: 14, lineHeight: 1.6 }}>
          <li><strong>1. Download the APK</strong> — tap the button above on your Android phone.</li>
          <li><strong>2. Allow unknown sources</strong> — when Android asks, tap Settings → allow your browser to install apps, then go back.</li>
          <li><strong>3. Install & open</strong> — tap Install, then Open. The app loads https://sunrise-motel.vercel.app and keeps you signed in.</li>
        </ol>

        <div className="extras-calculator-box" style={{ marginTop: 24 }}>
          <div className="extras-header"><strong>Prefer no download?</strong></div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            On Android Chrome tap ⋮ → “Install app”. On iPhone Safari tap Share → “Add to Home Screen”.
            Same site, same bookings — just an icon on your home screen. The manager portal installs the same way, with
            its own name and icon.
          </p>
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: "var(--muted)" }}>
          Both APKs are built from the open source repo and attached to each release. The apps ask for Internet access
          only: no location, no camera, no contacts. Photos are picked through the system file chooser.
        </p>
      </main>
    </div>
  );
}
