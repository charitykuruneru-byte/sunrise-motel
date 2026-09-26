'use client'
import { useEffect } from 'react'

const APP_VERSION = '1.4.0';
export const APP_CHANGELOG: string[] = [
  'One-tap Install popup — add Sunrise Motel to your home screen, no app store needed.',
  'Update notices — the app tells you what changed and offers a one-tap refresh.',
  'Smoother pull-to-refresh in the Android wrapper (top-of-page only).',
  'Mobile gallery, room and dish cards rebuilt for clean swipeable shopping.',
];

// Registers /sw.js so Chrome treats the site as installable (PWA direct install).
// Also listens for a newly deployed service worker and shows an "Update
// available" banner listing APP_CHANGELOG with a one-tap refresh button.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let shown = false;
    const showUpdate = (worker: ServiceWorker | null) => {
      if (shown) return;
      shown = true;
      const id = 'sw-update-banner';
      if (document.getElementById(id)) return;
      const bar = document.createElement('div');
      bar.id = id;
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:10000;background:#171513;color:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.35);font-size:13px;line-height:1.5';
      const items = APP_CHANGELOG.map((c) => `<li style="margin:2px 0">${c}</li>`).join('');
      bar.innerHTML = `<strong>Update available — v${APP_VERSION}</strong><ul style="margin:8px 0 12px 18px;padding:0">${items}</ul><div style="display:flex;gap:8px"><button id="sw-update-now" style="flex:1;background:#D4A017;color:#171513;font-weight:800;border:0;border-radius:8px;padding:10px;cursor:pointer">Update now</button><button id="sw-update-later" style="background:none;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:8px;padding:10px 14px;cursor:pointer">Later</button></div>`;
      document.body.appendChild(bar);
      document.getElementById('sw-update-later')?.addEventListener('click', () => bar.remove());
      document.getElementById('sw-update-now')?.addEventListener('click', () => {
        try {
          worker?.postMessage({ type: 'SKIP_WAITING' });
        } catch { /* ignore */ }
        window.location.reload();
      });
    };
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (reg.waiting) {
        showUpdate(reg.waiting);
        return;
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate(worker);
          }
        });
      });
    }).catch(() => {
      // Older browsers simply skip PWA install — site still works.
    });
    // If the new worker already took over, a fresh reload picks it up.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (shown) window.location.reload();
    });
  }, []);
  return null;
}
