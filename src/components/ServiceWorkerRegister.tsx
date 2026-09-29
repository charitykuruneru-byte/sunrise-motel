'use client'
import { Check, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const APP_VERSION = '1.4.0';
export const APP_CHANGELOG: string[] = [
  'One-tap Install popup — add Sunrise Motel to your home screen, no app store needed.',
  'Update notices — the app tells you what changed and offers a one-tap refresh.',
  'Smoother pull-to-refresh in the Android wrapper (top-of-page only).',
  'Mobile gallery, room and dish cards rebuilt for clean swipeable shopping.',
];

// Registers /sw.js so Chrome treats the site as installable (PWA direct install).
// Also listens for a newly deployed service worker and offers the update as a
// designed card (`sw-update` in globals.css) listing APP_CHANGELOG with a one-tap
// refresh.
//
// Two rules kept from the first version, because both of them are the point:
//
//   1. Nothing here ever blocks the page. The card is anchored to the bottom and
//      the guest can ignore it; an update is not worth interrupting a booking.
//   2. "Update now" is the only thing that reloads. It hands the new worker
//      SKIP_WAITING and refreshes, which is what actually activates the deploy.
//
// The card is real JSX now instead of an `innerHTML` string with inline styles, so
// it uses the same cream/gold sheet as the install popup and cannot drift from it.
export default function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const shownRef = useRef(false);
  const workerRef = useRef<ServiceWorker | null>(null);

  const apply = useCallback(() => {
    try {
      workerRef.current?.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* ignore — the reload below still picks up the new worker */
    }
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const showUpdate = (worker: ServiceWorker | null) => {
      if (shownRef.current || document.getElementById('sw-update-banner')) return;
      shownRef.current = true;
      workerRef.current = worker;
      setWaiting(worker);
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
      if (shownRef.current) window.location.reload();
    });
  }, []);

  if (!waiting) return null;

  return (
    <div className="sw-update" id="sw-update-banner" role="status" aria-live="polite">
      <span className="sw-update-rule" aria-hidden="true" />
      <div className="sw-update-body">
        <div className="sw-update-head">
          <span className="sw-update-badge">v{APP_VERSION}</span>
          <div>
            <strong>A newer version is ready</strong>
            <span className="sw-update-sub">
              Nothing you are doing is lost — refresh whenever it suits you.
            </span>
          </div>
        </div>
        <ul className="sw-update-list">
          {APP_CHANGELOG.map((change) => (
            <li key={change}>
              <Check size={13} aria-hidden="true" />
              {change}
            </li>
          ))}
        </ul>
        <div className="sw-update-actions">
          <button type="button" className="sw-update-now" onClick={apply}>
            <RefreshCw size={14} aria-hidden="true" /> Update now
          </button>
          <button type="button" className="sw-update-later" onClick={() => setWaiting(null)}>
            Later
          </button>
        </div>
      </div>
      <button
        type="button"
        className="sw-update-close"
        aria-label="Close the update notice"
        onClick={() => setWaiting(null)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
