"use client";
import { useEffect, useState } from "react";
import InstallAppButton, { useInstallPrompt } from "@/components/install-app";
import { inSunriseApp } from "@/lib/app-user-agent";

export default function AppDownloadBanner() {
  const [show, setShow] = useState(false);
  // Already installed (or inside one of our wrappers)? Then there is nothing to
  // offer and the strip stays away rather than opening an empty yellow bar.
  const { hidden } = useInstallPrompt();
  useEffect(() => {
    // Clear the old "X dismissed" flag from the previous banner version —
    // otherwise anyone who once tapped X would never see Install again.
    try { localStorage.removeItem("appBannerDismissed"); } catch { /* ignore */ }
    const decide = () => {
      // ?install=1 forces the banner for testing on any device.
      try {
        if (new URLSearchParams(window.location.search).get("install") === "1") return true;
      } catch { /* ignore */ }
      const ua = navigator.userAgent;
      // Android, but not already inside one of our two apps.
      return /Android/i.test(ua) && !inSunriseApp(ua);
    };
    const timer = window.setTimeout(() => setShow(decide()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!show || hidden) return null
  return (
    <div
      className="bg-yellow-500 text-black p-3 text-center text-sm flex justify-center items-center"
      style={{ background: '#EAB308', color: '#000', padding: 12, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', zIndex: 60 }}
    >
      {/* Opens the one shared install popup (Install now / Not now) instead of
          sending the guest to /download. The popup explains the two taps when the
          browser cannot install for us, so nothing is a dead end. */}
      <InstallAppButton
        label="Install"
        className="bg-black text-white px-4 py-1.5 rounded font-bold"
      />
    </div>
  )
}
