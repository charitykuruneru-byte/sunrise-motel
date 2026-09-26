import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get the Android App | Sunrise Motel Lilongwe",
  description: "Download the Sunrise Motel Android app for faster booking. The app opens our website directly — any website update shows in the app automatically.",
};

const APK_URL = "https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk";

export default function DownloadPage() {
  return (
    <div className="sunrise-app-root">
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> ANDROID APP</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>Get the Sunrise Motel app.</h1>
        <p className="hero-description">
          The app opens our website directly — rooms, booking, tracking and the manager portal.
          Anything we change on the website appears in the app automatically. No separate update needed.
        </p>

        <a href={APK_URL} className="btn-submit-booking-request" style={{ marginTop: 20, textDecoration: "none" }}>
          Download SunriseMotel.apk (v1.0)
        </a>
        <p className="no-account-guarantee" style={{ marginTop: 10 }}>
          If the button shows a 404, the first APK is still building — check the Releases page in a few minutes.
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
            Same site, same bookings — just an icon on your home screen.
          </p>
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: "var(--muted)" }}>
          Package com.sunrisemotel.app · version 1.0 · needs Internet access only. Built from the open source repo — see Releases for the exact APK attached to each version.
        </p>
      </main>
    </div>
  );
}
