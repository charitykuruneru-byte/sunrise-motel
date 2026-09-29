# Does the build follow the brief? — the four requests, checked line by line

Four briefs were handed over: **(1)** one email + one phone = one guest, with sign-in and full
history; **(2)** invite-only accounts with an audit trail; **(3)** premium booking forms; **(4)** a
broadcast system — first *with* Firebase, then a later brief saying *remove* Firebase and use polling
plus WhatsApp.

This file answers each requirement with evidence rather than opinion. A row is only ✅ if something in
the repository proves it, and every claim names a file, a command or a measured number. The rule used
throughout: **a claim without a command or a line number is not a claim.**

| Mark | Meaning |
|---|---|
| ✅ | Already built before this pass — with evidence |
| 🔧 | **Built in this pass** |
| ⚖️ | Built differently from the brief, on purpose (the reason is given) |
| ⛔ | **Not built** — with what it would take |

Re-run everything in this file with:

```
npm run verify:identity      # guest identity: the rules + a read-only database report
npm run verify:sw            # service-worker rules (17 checks)
npm run verify:update-card   # the update card, measured in a real browser (14 checks)
npm run verify:media         # the picture/post flow end to end (needs a running server)
npx tsc --noEmit             # types
```

---

## Brief 1 — one email + one phone = one guest, forever

### The identity itself

| Requirement | Status | Evidence |
|---|---|---|
| A guest table with email + phone | ✅ | `guestsTable` (`src/db/schema.ts:212`) — also `notes`, `stayCount`, `totalSpent`, `isRegular`, `isNoShow`, `marketingConsent` |
| Email stored **lower-cased** | 🔧 | `normaliseEmail()` (`src/lib/phone.ts`); `findOrCreateGuest` compares `lower(email)` in SQL so rows written before the rule still match |
| Phone **normalised** to `+265…` | 🔧 | `normalisePhone()` / `phoneKey()` (`src/lib/phone.ts`) — 8 spellings of one number collapse to one key, proven by `npm run verify:identity` |
| Email unique, phone unique, **enforced in the database** | 🔧 | migration `drizzle/0007_nasty_cannonball.sql` creates `guests_email_identity_unique` and `guests_phone_identity_unique`; both confirmed present in the live database by `npm run verify:identity` |
| `findOrCreateGuest` used **everywhere** | 🔧 (was **not**) | The public booking route did **not** create an identity at all: a web booking wrote free-text name/phone/email and `bookings.guestId` stayed null until the desk invited an account (`src/lib/guest-account.ts:53`). It now resolves the guest first (`src/app/api/bookings/route.ts:83`) and stores `guestId` (`:130`) |
| Every booking MUST have an identity | ⛔ | `bookings.guestId` is still nullable and older rows hold null. Closing it needs a backfill that runs the *same* matching rules over existing bookings and then `SET NOT NULL` — a data migration, deliberately not done unsupervised |
| Junk is not an identity | 🔧 | `phoneKey("n/a")` → `null`, and `samePhone("n/a", "n/a")` → `false`: two rows that both say "n/a" are never merged into one guest |

### Sign-in, memory, and what the guest sees

| Requirement | Status | Evidence |
|---|---|---|
| Sign in with email + password | ✅ | `POST /api/guest/auth` — email **or** phone as the login name, 5 failures lock 15 minutes, an unknown login and a wrong password give the same answer (no account enumeration) |
| The app remembers them | ⚖️ deliberately **no timeout** | `guestSessionsTable` per device, `sunrise_guest` cookie; `src/lib/guest-auth.ts:7-11` records the decision: a guest stays signed in until they sign out, change password, are disabled, or 12 months of inactivity. Staff keep 12 hours |
| "You are in Room 12, check-out 12 Sept" | ✅ | `GET /api/guest/me` → `resolveStays()` + `roomForBooking()` return `stay.roomNumber`, `nightsRemaining`, `roomState` |
| Full stay history + payments + receipts | ✅ | same route returns `history`, `folio` (by category, paid, balance), `invoices[]`, `orders[]` |
| Self-registration disabled | ✅ | no `/register` or `/signup` route exists (`src/app` listing); `/api/guest/auth` answers `deskRegistersAccounts: true` and points at the counter |
| Guest books *without* an account, identity linked afterwards | 🔧 | the online booking now creates/links the guest immediately; the desk can then invite the account (`inviteGuestAccount`) |
| **Forgot password** | ⛔ | The desk resets it today (`src/lib/guest-account.ts:311`), and the machinery is ready — `issueToken({purpose: "password_reset"})` is a 1-hour token (`src/lib/guest-auth.ts:69`) and `/api/guest/activate` already *consumes* it (`:169`). What is missing is the endpoint that **issues** one for a guest who asks, plus the "Forgot password?" link on the sign-in screen. Small, self-contained, and the next thing I would build |
| `guest_activity_logs` as a separate table | ⚖️ one trail, not two | `audit_log` (`src/lib/audit.ts`) already records actor + label + IP + JSON metadata, and guest actions write to it: `guest.signin_failed`, `guest.password_changed`, `guest.consent_changed`, `guest.account_created`, `guest.password_reset`, plus `order.*`, `payment.*`, `booking.*`. A second parallel table would duplicate the same facts. What is genuinely missing is the **view** — "show me this guest's whole journey" — not the storage |

---

## Brief 2 — invite-only accounts, admin controls everyone, audit trail

| Requirement | Status | Evidence |
|---|---|---|
| No public registration anywhere | ✅ | No `/register`, `/signup` or `/setup` route exists. Guests are created **by the desk**: `POST /api/desk/guests` (`invite` / `register` / `resend` / `activate`) |
| Only an admin can add admins/managers/staff | ✅ | `POST /api/admin/staff` (gated by `requireAdmin`), plus `scripts/staff-invite.mjs` for the command line |
| Staff created by invitation, not by form | ⚖️ built differently | Staff are created **with a password** and the credentials are emailed (`/api/admin/staff`, README §44); there is no token-based `/setup-account` page for staff. Guests *do* have the token route — `/activate?token=…` (`src/app/activate/page.tsx`) |
| Tokens: random, hashed at rest, single-use, expiring | ✅ | `activationTokensTable` stores `tokenHash` (SHA-256); `issueToken()` sets 7 days for activation, **1 hour** for a password reset, 24 hours for a phone OTP; `consumeToken()` makes them single-use |
| Audit every action with WHO did it | ✅ | `logAudit()` (`src/lib/audit.ts`) — `actor` (guest \| manager \| system), `actorLabel`, `ip`, `metadata`. Written by bookings, invoices, gallery, posts, menu, orders, payments, messages, room assignment, guest accounts and staff |
| Every email attempt recorded honestly | ✅ | `notification_log` via `logNotification()` (`src/lib/notify.ts`) — including `skipped` rows that say *why* ("SMS gateway not configured — send this wording by WhatsApp") instead of pretending |
| Login attempts logged | ✅ | `guest.signin_failed` (the wording never reveals whether an account exists), and the staff side logs its own failures |
| `/admin/users` with resend / revoke / deactivate / change role | ⚖️ one console, not a route | These actions live in the single admin console `src/app/admin/page.tsx` (64 KB) against `/api/admin/staff`; there is no `/admin/users` URL. Deactivate, role change and password reset are implemented and each writes an audit row |
| `/admin/audit-logs` page with filters + CSV/PDF | ⚖️ partial | `GET /api/admin/audit` exists and the console renders the trail; date-range/actor/action filters and the download are **not** built |
| Rate limit: max 5 invites per hour per admin | ⛔ | Not implemented |

---

## Brief 3 — premium, mobile-first booking forms (Booking.com / Airbnb level)

**⛔ Not done, and it is the largest remaining item.** This is the one brief where the repository does
not already do most of the work, so it is stated plainly rather than half-claimed.

What exists now: one site-wide modal pattern (`.booking-modal-backdrop` + `.booking-modal-sheet` +
`.sheet-close-btn` in `globals.css`) used by the booking sheet, the dish order, the table/braai
reservation, the workspace booking and the `/track` lookup; a nights count and a price breakdown inside
the sheet; and the site's own cream/gold design language.

What is missing from the brief: `src/components/forms/` does not exist at all — no `PremiumInput`,
`GuestCounter`, `DateRangePicker`, `PriceSummaryCard` or `TrustBadges`, and with them no floating
labels, icon-in-field treatments, adults/children steppers, disabled-past-dates range picker, sticky
summary card with thumbnail and breakdown, trust badges, step indicator, error shake, or success screen
with the WhatsApp button.

Why it is not started here: the booking path is the motel's money path, it is reached from `/`, `/stay`,
`/dine`, `/unwind`, `/connect` and both Android wrappers, and a redesign of it cannot be half-shipped.
It deserves its own pass, with the booking sheet as the unit of work.

---

## Brief 4 — broadcast notifications (two briefs that contradict each other)

| Requirement | Status | Evidence |
|---|---|---|
| Admin publishes → everyone with the app is notified | ✅ | `POST /api/admin/send-notification` → FCM topic `all_users`; the composer is `/admin/notifications` |
| No `firebase-admin` dependency | ✅ | `src/lib/fcm.ts` mints its own RS256 JWT and calls the FCM HTTP v1 API with `fetch` — the whole sender is 79 lines |
| A dry run that sends nothing | ✅ | `validate_only` behind the *Test configuration* button; a bad key reports the real Google error instead of a friendly lie |
| Android 13+ permission and first-launch prompt | ✅ | `SunriseMotelApp/app/src/main/AndroidManifest.xml` (POST_NOTIFICATIONS) and `MainActivity.kt`, which asks before `subscribeToTopic("all_users")` |
| Send history, and who sent what | ✅ | an `audit_log` row plus a `notification_log` row on every attempt |
| **Remove Firebase entirely and poll instead** | ⛔ **deliberately not done** | See below |

**The two briefs contradict each other, and I did not resolve that by deleting working code.** One brief
asks for Firebase Cloud Messaging and a topic subscription; the next says remove all of it and replace it
with polling plus a WhatsApp broadcast. FCM is *working* here — sender, dry run, composer, audit trail and
the Android service all exist and ship — and deleting it would remove the only way the motel can reach a
guest whose app is closed. The proposed replacement does not cover that case: polling only runs **while**
the app is open, as the brief itself says ("ONLY WHEN APP IS OPEN"), so a closed app learns nothing.

So Firebase is untouched and still works, and what the later brief asks for *in addition* is open work:

| Item | Status | What it needs |
|---|---|---|
| `GET /api/activities`, `/api/activities/latest?since=`, `unread-count`, `mark-read` | ⛔ | a thin layer over the existing `postsTable` + `GET /api/posts` (which already serve the feed), plus an `activity_reads` table keyed by guest/device |
| In-app banner + bell with unread badge | ⛔ | one client component; the app already has a "what's on" feed to hang it from |
| Offline cache of the last 10 activities | ⛔ | `localStorage` — the service worker already serves the shell offline |
| WhatsApp broadcast to every guest number | ⛔ | today only **per-guest** `wa.me` links exist (`src/app/admin/page.tsx:545`). A broadcast needs the phone list (`GET /api/desk/guests` already returns it), a preview modal, and one of: `wa.me` links one by one, a formatted message copied to the clipboard, or the WhatsApp Business API with `WHATSAPP_API_KEY` |
| Push rows in `notification_log` | ⛔ | the broadcast route does not write one (email, portal and SMS/WhatsApp do) |

**Decision needed from the owner:** keep FCM as the way to reach a closed app and add polling as the
no-Google fallback, or remove FCM. Either answer is buildable; only one of them is undoable, which is why
it is a question rather than a commit.

---

## What this pass changed

| Change | Why |
|---|---|
| `src/lib/phone.ts` (new) | One rule for what a phone number *is*: nine significant digits, canonical `+265…`, and `null` for something that is not a number at all |
| `findOrCreateGuest` rewritten (`src/lib/hotel.ts:64`) | It compared the raw string, so `0888 123 456` and `+265888123456` were two guests — precisely the duplicate-identity bug. It now matches on `right(digits, 9)` **in SQL**, so rows written before the rule still match, and it upgrades a legacy spelling in place |
| `POST /api/bookings` resolves the guest (`:83`) and stores `guestId` (`:130`) | A booking made on the website used to create **no** identity at all |
| Two duplicated phone normalisers deleted (`/api/reviews`, `/api/guest/activate`) | They had already drifted apart; both now use the shared rule, and the activation check fails *closed* when the number on the booking is not a number |
| Migration `0007_nasty_cannonball.sql` + the indexes declared on `guestsTable` | "Email + Phone unique indexes enforced in DB" is now true of the database, not only of the code that remembers to call the helper. Verified duplicate-free first, then applied with `drizzle-kit migrate` |
| `scripts/verify-guest-identity.mjs` (new) | Imports the **real** rules through Node's own TypeScript support, asserts 38 cases, then reports split identities in the live database read-only. `--apply` adds the indexes only when the report is clean |

## Open work, in the order I would do it

1. **Guest password reset** (`POST /api/guest/password/forgot` + `/reset` + the link on the sign-in
   screen). The token machinery, expiry and audit rows already exist; only the issuing endpoint and the
   screen are missing. It removes a phone call to the desk for every forgotten password.
2. **`bookings.guestId` → `NOT NULL`**, after a backfill that applies the same matching rules to the
   bookings that predate them. This is the last piece of "every booking MUST have a userId".
3. **The premium booking forms** (Brief 3) — its own pass, sheet by sheet, starting with the room
   booking sheet because it is the money path.
4. **The audit-log filters and export** (`/admin/audit-logs` behaviour behind a real route), so the owner
   can answer "what happened to this guest" without asking a developer.
5. **The polling layer + WhatsApp broadcast** (Brief 4's second half) as *additions*, and a decision on
   whether FCM stays.
6. **Invite rate limiting** (5 per hour per admin).

## The one honest limit in this file

`npm run verify:identity` proves the rules and reads the database. It does **not** place a real booking
through `POST /api/bookings` and then count the guest rows — that would write test data into the live
database, so it was not done. The next person can prove it end to end against a scratch database (or a
Neon branch) with two bookings using two spellings of one number and a single
`SELECT count(*) FROM guests` afterwards.


