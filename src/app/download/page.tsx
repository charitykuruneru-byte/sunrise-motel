import type { Metadata } from "next";
import PushOptIn from "@/components/push-opt-in";
import guestAppVersion from "../../../public/version.json";
import managerAppVersion from "../../../public/version-admin.json";

// Live data: never prerendered — see src/lib/revalidate.ts
export const dynamic = "force-dynamic";

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
          Both Android apps open the live website, so website changes appear after a refresh. New Android wrapper
          releases are signed for in-place updates; installed web apps refresh through the browser when an update is ready.
          The guest app is for guests; Sunrise Manager is for the desk and office.
        </p>

        <div id="guest-app" className="extras-calculator-box" style={{ marginTop: 24 }}>
          <div className="extras-header"><strong>Sunrise Motel — guest app</strong></div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Rooms, live availability, booking, tracking and your account. Free, and nothing on the website needs it.
          </p>
          <a href={GUEST_APK} className="btn-submit-booking-request" style={{ marginTop: 14, textDecoration: "none" }}>
            Download SunriseMotel.apk (v{guestAppVersion.latestVersionName})
          </a>
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Package com.sunrisemotel.app · version {guestAppVersion.latestVersionName} · Internet access only.
          </p>
        </div>

        <div id="manager-app" className="extras-calculator-box" style={{ marginTop: 16 }}>
          <div className="extras-header"><strong>Sunrise Manager — manager app</strong></div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            The desk and the office: arrivals, room map, orders, issues, money and the guest register. Same staff
            sign-in as the portal.
          </p>
          <a href={MANAGER_APK} className="btn-submit-booking-request" style={{ marginTop: 14, textDecoration: "none" }}>
            Download SunriseManager.apk (v{managerAppVersion.latestVersionName})
          </a>
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Package com.sunrisemotel.admin · version {managerAppVersion.latestVersionName} · or install the portal from your browser: Android Chrome → ⋮ → Install app;
            iPhone Safari → Share → Add to Home Screen.
          </p>
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            <strong>Already installed an older copy?</strong> These releases keep the app package IDs and release
            signing identity. Android can install a newer signed version over the existing app; if Android reports a
            signature conflict, keep the installed app and contact the front desk before uninstalling it.
          </p>
        </div>

        <div className="extras-calculator-box" style={{ marginTop: 16, paddingBottom: 6 }}>
          <PushOptIn
            className="push-opt-in--light"
            heading="Alerts: offers and rooms free tonight"
            intro="Turn these on and we tell you the moment the desk publishes something new, or a room frees up for tonight. One tap on, one tap off — no account needed, and nothing is ever sent that is not actually on this site."
          />
        </div>

        <p className="no-account-guarantee" style={{ marginTop: 14 }}>
          If a button shows a 404, that APK is still building — check the Releases page in a few minutes.
        </p>

        <ol style={{ marginTop: 28, display: "grid", gap: 14, fontSize: 14, lineHeight: 1.6 }}>
          <li><strong>1. Guest Android app</strong> — download the APK above, allow your browser to install apps if prompted, then tap Install. Future signed releases can update it in place.</li>
          <li><strong>2. Sunrise Manager</strong> — download the manager APK above, or open the portal in Android Chrome and choose Install app from the browser menu.</li>
          <li><strong>3. iPhone or iPad</strong> — open either app option in Safari, tap Share, then Add to Home Screen.</li>
        </ol>

        <div className="extras-calculator-box" style={{ marginTop: 24 }}>
          <div className="extras-header"><strong>Prefer no download?</strong></div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            On Android Chrome tap ⋮ → “Install app”. On iPhone Safari tap Share → “Add to Home Screen”.
            Same site, same bookings — just an icon on your home screen. The manager portal installs the same way, with
            its own name and icon. Browser-installed apps receive website updates through the browser; accept the Sunrise
            update notice or reload when prompted.
          </p>
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: "var(--muted)" }}>
          Both APKs are attached to the latest Android release. Sunrise Manager asks staff to sign in. Photos are picked
          through the system file chooser. APK releases are built and published by the Android release workflow in this
          repository.
        </p>
      </main>
    </div>
  );
}
