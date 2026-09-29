'use client'
import { useEffect, useState } from 'react'
import { InstallAppDialog, useInstallPrompt } from '@/components/install-app'

// THE LANDING PAGE'S AUTO OFFER — appears ~3s after load, and only when the
// browser has actually offered us an install (`beforeinstallprompt`, which is the
// only thing that can install a PWA at all).
//
// It renders the one shared popup (`install-app.tsx`), so the question is the same
// one everywhere: Install now or Not now. There is no fallback redirect any more —
// a browser that cannot install gets the two taps explained inside the popup
// instead of being sent off to /download, which is what used to happen.
//
// `?install=1` forces it for testing on any device. "Not now" is remembered for a
// week, and once the app is installed the popup never comes back.
export default function InstallAppPopup() {
  const { hidden } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hidden) return;
    let force = false;
    try { force = new URLSearchParams(window.location.search).get('install') === '1' } catch { /* ignore */ }

    const t = window.setTimeout(() => {
      try {
        const done = localStorage.getItem('pwaInstalled');
        if (done && !force) return;
        if (!force) {
          const at = Number(localStorage.getItem('pwaDismissed') || 0);
          if (at && Date.now() - at < 7 * 24 * 3600 * 1000) return;
          if (!window.deferredPrompt) return; // nothing to install for this browser: stay quiet
        }
        setVisible(true);
      } catch { /* ignore */ }
    }, 3000);
    return () => window.clearTimeout(t);
  }, [hidden]);

  const later = () => {
    try { localStorage.setItem('pwaDismissed', String(Date.now())) } catch { /* ignore */ }
    setVisible(false);
  };

  return <InstallAppDialog open={visible} onClose={later} />;
}
