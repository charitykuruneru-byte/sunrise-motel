'use client'
import { useEffect, useState } from 'react'

const APK_URL = 'https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk';

export default function InstallAppPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    // Never show inside the app itself.
    if (ua.includes('SunriseMotelApp')) return;
    let force = false;
    try { force = new URLSearchParams(window.location.search).get('install') === '1'; } catch { /* ignore */ }
    if (!force) {
      if (!/Android/i.test(ua)) return;
      try {
        const at = Number(localStorage.getItem('installPopupDismissedAt') || 0);
        if (at && Date.now() - at < 7 * 24 * 3600 * 1000) return;
      } catch { /* ignore */ }
    }
    const t = window.setTimeout(() => setVisible(true), 2000);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem('installPopupDismissedAt', String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  const install = () => {
    setVisible(false);
    window.location.href = APK_URL;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} role="dialog" aria-modal="true" aria-label="Install the Sunrise Motel app">
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 360, width: '100%', padding: 24, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <img src="/icon-192.png" alt="Sunrise Motel" width={72} height={72} style={{ margin: '0 auto', borderRadius: 16 }} />
        <h2 style={{ margin: '12px 0 6px', fontSize: 20, color: '#171513' }}>Get the Sunrise Motel App</h2>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: '#756c64', lineHeight: 1.5 }}>Faster booking and one-tap access, with the full site inside.</p>
        <button onClick={install} style={{ display: 'block', width: '100%', background: '#171513', color: '#fff', fontWeight: 800, padding: '12px 16px', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}>Install</button>
        <button onClick={dismiss} style={{ marginTop: 10, background: 'none', border: 0, color: '#756c64', fontSize: 13, cursor: 'pointer' }}>Not now</button>
      </div>
    </div>
  );
}
