// ONE PLACE THAT DECIDES WHAT MUST BE RE-RENDERED AFTER A WRITE.
//
// Next.js keeps two caches that made a posted image or event look "not saved":
//   1. the server's route/data cache, and
//   2. the App Router's *client* RSC payload, which is reused for prefetched and
//      back/forward navigations (that is the "I posted it, and the page still
//      shows the old list, refresh it a few times" symptom).
//
// `revalidatePath` clears both for the paths it names, so every write API calls
// this one function instead of each route inventing its own list — and a new page
// only has to be added here to be covered everywhere.
import { revalidatePath } from "next/cache";

/** Every page that can show content from the database. */
const LIVE_PATHS = [
  "/", // landing: availability, what's on, gallery strip, reviews
  "/stay", // rooms + rates
  "/gallery", // gallery images
  "/dine", // menu
  "/unwind", // events
  "/connect",
  "/room",
  "/track",
  "/review",
  "/app", // guest app shell
  "/admin", // manager portal
  "/desk", // front desk
] as const;

/**
 * Call this after ANY successful insert/update/delete (and after an upload).
 * It is cheap: it invalidates cache entries, it does not rebuild pages.
 */
export function revalidateLiveContent() {
  for (const path of LIVE_PATHS) revalidatePath(path);
  // The layout segment clears the shared shell/RSC payload for the whole branch,
  // so a prefetched route cannot be handed a stale copy of the page.
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/desk", "layout");
}

/** The public, guest-facing subset — used by writes that cannot touch the portals. */
export function revalidatePublicContent() {
  for (const path of ["/", "/stay", "/gallery", "/dine", "/unwind", "/connect", "/room", "/track"] as const) {
    revalidatePath(path);
  }
}
