'use client'
import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    deferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

// PWA direct install popup — appears ~3s after load when the browser allows
// a real install. Install Now calls promptEvent.prompt() only (never an APK
// download). Falls back to /download for browsers with no install event.
export default function InstallAppPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    try {
      if (ua.includes('SunriseMotelApp')) return;
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      if ((navigator as Navigator & { standalone?: boolean }).standalone) return;
    } catch { /* ignore */ }

    let force = false;
    try { force = new URLSearchParams(window.location.search).get('install') === '1'; } catch { /* ignore */ }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.deferredPrompt = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => {
      try { localStorage.setItem('pwaInstalled', '1'); } catch { /* ignore */ }
      window.deferredPrompt = null;
      setVisible(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    const t = window.setTimeout(() => {
      try {
        const done = localStorage.getItem('pwaInstalled');
        if (done && !force) return;
        if (!force) {
          const at = Number(localStorage.getItem('pwaDismissed') || 0);
          if (at && Date.now() - at < 7 * 24 * 3600 * 1000) return;
          if (!window.deferredPrompt) return;
        }
        setVisible(true);
      } catch { /* ignore */ }
    }, 3000);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  const later = () => {
    try { localStorage.setItem('pwaDismissed', String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  const installNow = async () => {
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) {
      window.location.href = '/download';
      return;
    }
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        try { localStorage.setItem('pwaInstalled', '1'); } catch { /* ignore */ }
        window.deferredPrompt = null;
        setVisible(false);
        return;
      }
    } catch { /* user dismissed the native prompt */ }
    later();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} role="dialog" aria-modal="true" aria-label="Install the Sunrise Motel app">
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 360, width: '100%', padding: 24, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <img src="/icon-192.png" alt="Sunrise Motel" width={72} height={72} style={{ margin: '0 auto', borderRadius: 16 }} />
        <h2 style={{ margin: '12px 0 6px', fontSize: 20, color: '#171513' }}>Install Sunrise Motel App</h2>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: '#756c64', lineHeight: 1.5 }}>Faster booking, works offline.</p>
        <button onClick={installNow} style={{ display: 'block', width: '100%', background: '#1B7A3D', color: '#fff', fontWeight: 800, padding: '12px 16px', borderRadius: 8, fontSize: 16, cursor: 'pointer', border: 0 }}>Install</button>
        <button onClick={later} style={{ marginTop: 10, background: 'none', border: 0, color: '#756c64', fontSize: 13, cursor: 'pointer' }}>Not now</button>
      </div>
    </div>
  );
}
