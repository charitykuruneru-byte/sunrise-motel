'use client'
import { Check, Download, RefreshCw, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const APP_VERSION = '1.4.2';
export const APP_CHANGELOG: string[] = [
  'Install Sunrise Motel or Sunrise Manager from a prompt shown when you open any page.',
  'Use the browser install prompt or follow device-specific home-screen instructions.',
];

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

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
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const shownRef = useRef(false);
  const workerRef = useRef<ServiceWorker | null>(null);
  /** True only while the guest's own "Update now" tap is being applied. */
  const applyingRef = useRef(false);

  // "Update now" is the only thing that reloads. `sw.js` deliberately leaves the
  // new worker WAITING, so this hands it SKIP_WAITING and lets the reload happen
  // on `controllerchange` — after the new worker has actually taken control.
  // The timer is the backstop for the case where it had already gone.
  const apply = useCallback(() => {
    applyingRef.current = true;
    try {
      workerRef.current?.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* ignore — the reload below still picks up the new worker */
    }
    window.setTimeout(() => window.location.reload(), 800);
  }, []);

  useEffect(() => {
    const installDismissKey = `sunrise-install-dismissed:${pathname.startsWith('/admin') ? 'manager' : 'guest'}`;
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isWrappedApp = /SunriseMotelApp|SunriseManagerApp/.test(navigator.userAgent);
    let installTimer: number | undefined;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setShowInstall(false);
      setInstallPrompt(null);
      sessionStorage.setItem(installDismissKey, 'installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // The guest-facing pages own the one auto install offer (InstallAppPopup on
    // the landing page). This dialog exists for the manager portal only, so a
    // guest on the landing page never gets two install popups stacked on top of
    // each other — which is exactly what "too many popups" meant.
    if (pathname.startsWith('/admin') && !isInstalled &&
      !isWrappedApp && !sessionStorage.getItem(installDismissKey)) {
      installTimer = window.setTimeout(() => setShowInstall(true), 1200);
    }

    return () => {
      if (installTimer !== undefined) window.clearTimeout(installTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [pathname]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const showUpdate = (worker: ServiceWorker | null) => {
      if (shownRef.current || document.getElementById('sw-update-banner')) return;
      // Every deploy creates a waiting worker, so without a throttle the card
      // reappears on the next visit after each release — another slice of the
      // "too many popups" complaint. One offer per rolling six hours is plenty.
      const lastOffer = Number(sessionStorage.getItem('sw-update-offered') || 0);
      if (Date.now() - lastOffer < 6 * 60 * 60 * 1000) return;
      sessionStorage.setItem('sw-update-offered', String(Date.now()));
      shownRef.current = true;
      workerRef.current = worker;
      setWaiting(worker);
    };
    const handleControllerChange = () => {
      if (applyingRef.current) window.location.reload();
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
    // Only the guest's own tap reloads. If the browser promotes a waiting worker
    // while they are mid-booking, the page keeps running the code it started with
    // until they refresh — which is the promise printed on the card.
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  const dismissInstall = () => {
    const app = window.location.pathname.startsWith('/admin') ? 'manager' : 'guest';
    sessionStorage.setItem(`sunrise-install-dismissed:${app}`, 'dismissed');
    setShowInstall(false);
  };

  const installApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') {
        const app = window.location.pathname.startsWith('/admin') ? 'manager' : 'guest';
        sessionStorage.setItem(`sunrise-install-dismissed:${app}`, 'installed');
        setShowInstall(false);
      } else {
        setShowInstallHelp(true);
      }
    } catch (error) {
      console.error('The browser install prompt could not be opened.', error);
      setInstallPrompt(null);
      setShowInstallHelp(true);
    }
  };

  const isManagerPage = pathname.startsWith('/admin');

  return (
    <>
      {showInstall && (
        <div
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissInstall();
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center',
            padding: 20, background: 'rgba(15, 23, 42, 0.62)', backdropFilter: 'blur(4px)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-app-title"
            style={{
              position: 'relative', width: 'min(100%, 440px)', borderRadius: 24, padding: 28,
              background: '#fffdf8', color: '#211d17', boxShadow: '0 24px 80px rgba(0,0,0,.28)',
            }}
          >
            <button
              type="button"
              aria-label="Not now"
              onClick={dismissInstall}
              style={{
                position: 'absolute', top: 14, right: 14, width: 38, height: 38, display: 'grid',
                placeItems: 'center', border: 0, borderRadius: 999, background: '#f1eee8', color: '#4b453b',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
            <span
              aria-hidden="true"
              style={{
                width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 16,
                background: '#f6edcf', color: '#9b7510', marginBottom: 18,
              }}
            >
              <Download size={24} />
            </span>
            <h2 id="install-app-title" style={{ margin: '0 44px 8px 0', fontSize: 24, lineHeight: 1.2 }}>
              Install {isManagerPage ? 'Sunrise Manager' : 'Sunrise Motel'}
            </h2>
            <p style={{ margin: '0 0 22px', color: '#655e53', fontSize: 15, lineHeight: 1.55 }}>
              Add the {isManagerPage ? 'manager portal' : 'guest app'} to your home screen for quick access.
              It is free and keeps working like a regular app.
            </p>
            {showInstallHelp && (
              <p role="status" style={{ margin: '0 0 18px', padding: 14, borderRadius: 12, background: '#f3f0e8', fontSize: 14, lineHeight: 1.55 }}>
                {/iPad|iPhone|iPod/.test(navigator.userAgent)
                  ? 'In Safari, tap Share, then choose “Add to Home Screen”.'
                  : /Android/i.test(navigator.userAgent)
                    ? 'In Chrome, tap ⋮, then choose “Install app” or “Add to Home screen”.'
                    : 'Use your browser’s install icon or menu and choose “Install app” or “Add to Home Screen”.'}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={installApp}
                style={{
                  flex: 1, minHeight: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, border: 0, borderRadius: 13, background: '#d4a017', color: '#211d17',
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Download size={17} /> {installPrompt ? 'Install app' : 'How to install'}
              </button>
              <button
                type="button"
                onClick={dismissInstall}
                style={{
                  minHeight: 48, padding: '0 18px', border: '1px solid #e5dfd4', borderRadius: 13,
                  background: 'transparent', color: '#4b453b', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Not now
              </button>
            </div>
          </section>
        </div>
      )}

      {waiting && (
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
      )}
    </>
  );
}
