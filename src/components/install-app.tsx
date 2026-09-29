"use client";

// THE APP INSTALL POPUP — one popup for every screen that offers the app.
//
// /app, /room and the landing page all use this file, so "install the app" means
// exactly one thing everywhere:
//
//   1. It answers IMMEDIATELY. Tapping *Get the app* opens the popup on the spot:
//      no page in between, nothing to wait for, one question.
//   2. It NEVER navigates anywhere else. "Install now" runs the browser's own
//      install sheet. A browser that has no install event at all (iPhone Safari,
//      Firefox, a desktop) gets the two taps explained INSIDE this same popup —
//      nobody is thrown at /download or at an APK they did not ask for.
//   3. "Not now" simply closes it. The website does everything the app does, so
//      nothing is being withheld and nothing comes back nagging in a loop.
//
// The browser only ever installs a PWA from its own `beforeinstallprompt` event,
// so that event is captured once per page by `useInstallPrompt()` below.

import { CheckCircle2, Loader2, MoreVertical, Share, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { inSunriseApp } from "@/lib/app-user-agent";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    deferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

/**
 * True when this phone already has us on the home screen, or when we are running
 * inside one of the two Android wrappers — in both cases there is nothing to
 * offer and the button stays out of the way.
 */
function alreadyHasApp() {
  try {
    if (inSunriseApp(navigator.userAgent)) return true;
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
  } catch {
    /* Older browsers simply have no way to tell — treat that as "not installed". */
  }
  return false;
}

/** iPhone/iPad: the only install route there is Safari's Share sheet. */
function isApple() {
  try {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

/**
 * Captures the browser's install event for the whole page. `hidden` starts true
 * so the first paint never flashes an install button at somebody who already
 * installed the app; it turns false only once we know there is something to offer.
 */
export function useInstallPrompt() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const decide = () => setHidden(alreadyHasApp());
    decide();
    // Chrome fires this once and never keeps it for us — it must be caught here.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.deferredPrompt = event as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      try {
        localStorage.setItem("pwaInstalled", "1");
      } catch {
        /* private mode — nothing to remember, and nothing breaks */
      }
      window.deferredPrompt = null;
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return { hidden };
}

/**
 * The popup itself. Four honest states and no fifth:
 *   ask        → Install now / Not now
 *   installing → the browser's own sheet is up
 *   installed  → it worked, and here is what to do next
 *   how        → this browser cannot install for us, so here are the two taps
 */
export function InstallAppDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Nothing here needs an effect to reset it: the sheet below is MOUNTED by `open`,
  // so every opening starts on the question with fresh state and closing throws it
  // away. (Resetting state from an effect is the cascading render React warns
  // about, and it also painted the previous stage for one frame.)
  if (!open) return null;
  return <InstallAppSheet onClose={onClose} />;
}

/** The sheet itself — mounted when the popup opens, unmounted when it closes. */
function InstallAppSheet({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<"ask" | "installing" | "installed" | "how">("ask");
  // Which two taps to explain is a client-only question, and this sheet only ever
  // exists on the client: it is opened by a tap or by a timer, never on first paint.
  const [apple] = useState(() => isApple());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const installNow = useCallback(async () => {
    const promptEvent = window.deferredPrompt;
    // No install event: say so right here and show the two taps. Never a redirect.
    if (!promptEvent) {
      setStage("how");
      return;
    }
    setStage("installing");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      window.deferredPrompt = null;
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem("pwaInstalled", "1");
        } catch {
          /* ignore */
        }
        setStage("installed");
        return;
      }
      // They said no in the browser's own sheet, so the popup goes away with it.
      onClose();
    } catch {
      // A prompt that is refused or already spent: show the manual route instead.
      setStage("how");
    }
  }, [onClose]);

  return (
    <div
      className="booking-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Install the Sunrise Motel app"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="booking-modal-sheet install-sheet">
        <button className="sheet-close-btn" onClick={onClose} aria-label="Close the install window" type="button">
          <X size={20} />
        </button>

        <div className="install-head">
          {/* The icon is the whole point of an install: this is what lands on the
              home screen, so it is shown at size rather than described. */}
          <img className="install-icon" src="/icon-192.png" alt="The Sunrise Motel app icon" width={64} height={64} />
          <span className="eyebrow">
            <span className="eyebrow-line" /> SUNRISE MOTEL APP
          </span>
          <h2>Add the app to your phone</h2>
          <p>
            Your room, your bill and food to your door, one tap from your home screen. It is this same site — no app
            store, no update to chase, no account needed.
          </p>
        </div>

        {stage === "ask" && (
          <>
            <div className="install-actions">
              <button type="button" className="btn-submit-booking-request" onClick={installNow}>
                <Smartphone size={16} /> Install now
              </button>
              <button type="button" className="btn-open-slideshow-secondary install-not-now" onClick={onClose}>
                Not now
              </button>
            </div>
            <p className="install-note">
              Nothing waits on this. Booking, the room menu, the bill and the front desk all work in your browser
              exactly as they do in the app.
            </p>
          </>
        )}

        {stage === "installing" && (
          <p className="install-stage">
            <Loader2 size={18} className="spin" /> Waiting for your phone to confirm…
          </p>
        )}

        {stage === "installed" && (
          <div className="install-stage install-stage-done">
            <CheckCircle2 size={30} className="accent-sage" />
            <strong>Added to your home screen</strong>
            <span>Open it from your apps like any other app. You stay signed in on this phone.</span>
            <button type="button" className="btn-open-slideshow-secondary install-not-now" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {stage === "how" && (
          <>
            <ul className="install-steps">
              {apple ? (
                <>
                  <li>
                    <Share size={14} /> Tap <strong>Share</strong> at the bottom of Safari.
                  </li>
                  <li>
                    <Smartphone size={14} /> Scroll to <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <MoreVertical size={14} /> Tap the <strong>⋮</strong> menu at the top of your browser.
                  </li>
                  <li>
                    <Smartphone size={14} /> Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                  </li>
                </>
              )}
            </ul>
            <p className="install-note">
              Your browser will not let a page install itself, so those two taps are the whole job. The site keeps
              working while you decide.
            </p>
            <div className="install-actions">
              <button type="button" className="btn-open-slideshow-secondary install-not-now" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
/**
 * A ready-made *Get the app* button. Drop it anywhere and it does the whole thing:
 * it hides itself when the app is already on the phone, and opens the popup —
 * turned on the spot, one question — when it is not.
 */
export default function InstallAppButton({
  label = "Get the app",
  className = "admin-btn",
}: {
  label?: string;
  className?: string;
}) {
  const { hidden } = useInstallPrompt();
  const [open, setOpen] = useState(false);

  if (hidden) return null;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Smartphone size={13} /> {label}
      </button>
      <InstallAppDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}