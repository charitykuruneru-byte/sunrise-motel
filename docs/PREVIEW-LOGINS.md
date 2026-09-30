# Preview logins — see the guest, the desk and the manager side before committing

Created by `scripts/create-preview-accounts.mjs` on 29 Sep 2026. Two accounts, written to
**both** databases (see "Two databases" below), each one clearly labelled a preview so nobody
mistakes it for a real person.

## The two logins

| Who | Sign in at | Email | Password | What it is |
|---|---|---|---|---|
| Front desk | `/admin` (one form for staff and managers) → lands on `/desk` | `preview.desk@sunrisemotel.local` | `Sunrise-z9c3-4995` | `staff` — staff code **STF900**, "Preview Front Desk" |
| Guest | `/app` | `preview.guest@sunrisemotel.local` | `Sunrise-ukF8-1063` | guest account "Preview Guest", phone `+265999000900` |

Your own admin logins and `ADMIN_PASSWORD` were **not touched** — sign in as yourself for the
manager side.

Passwords are stored as scrypt hashes (`src/lib/password.ts`), so they can be read here and
nowhere else: the database cannot give them back. Re-running `npm run preview:accounts`
**rotates both** and prints a new pair.

## Proof they work — 13 checks against the running site

```
npm run verify:preview -- --staff-pass Sunrise-z9c3-4995 --guest-pass Sunrise-ukF8-1063
```

Measured on 29 Sep 2026 against `http://127.0.0.1:3000`:

| Check | Observed |
|---|---|
| staff password signs in at `/api/admin/login` | 200 |
| the session is `role=staff` (not admin) | `role=staff code=STF900` |
| a staff cookie was issued | `sunrise_session` set |
| **staff is BLOCKED from admin-only `/api/admin/staff`** | **403 "Admins only."** |
| staff opens the desk view at `/desk` | 200 |
| staff reads the desk API `/api/desk/guests` | 200 |
| guest password signs in at `/api/guest/auth` | 200 "Preview Guest" |
| a guest cookie was issued (`Secure`) | `sunrise_guest` set |
| guest session reads its own data at `/api/guest/me` | 200 `signedIn=true stays=0` |
| guest is blocked from the staff/admin APIs | 401 |
| guest signs in with the phone number `+265999000900` | 200 |
| rows exist in **local** (`127.0.0.1`) | staff=1, guest_accounts=1 |
| rows exist in **neon** (`ep-hidden-tree-zad1wuc1…`) | staff=1, guest_accounts=1 |

**13/13 passed.** The point of the middle row: a row in the `staff` table is not proof that the
desk view is restricted — that 403 is. The script is read-only apart from signing in, and those
sign-ins appear in `audit_log` like any real sign-in.

## What the guest view shows today

`stays=0` — the preview guest has no booking, so `/app` opens on its empty state. To see the
"You are in Room X, check-out …" view, book any room for `preview.guest@sunrisemotel.local`
from the desk; the booking attaches to that guest (that is the `bookings.guest_id` link) and the
stay appears in `/app` on reload. Populating it any other way (a fake row) would put a booking
in the owner's reports that nothing removes again.

## Why new accounts were needed to compare the three views

Measured before creating anything:

* `staff` held only `role=admin` rows — the **restricted front-desk view had no account that
  could sign in to it at all**.
* `guest_accounts` held one desk-created demo account (`demo.guest@…`, password unknown), so
  there was **no guest login** to compare against.

## Two databases — and which one the site you are looking at uses

| Table | local `sunrise_db` | Neon `production` |
|---|---|---|
| staff | 6 (5 real + STF900) | 3 (2 real + STF900) |
| guests | 2 | 1 (preview only) |
| guest_accounts | 2 | 1 (preview only) |
| rooms | **10** | **0** |
| room_types | 3 | 3 |
| bookings | 4 | 4 |
| reviews | 0 | 0 |
| gallery_images | 24 | 26 |
| audit_log | 91 | 43 |

* The site on this laptop is `next start` on port 3000. It reads `.env`, so it talks to
  `DATABASE_URL` — the **local** Postgres `127.0.0.1/sunrise_db`. Dev and this build see the
  same data.
* There is **no `.vercel` directory**, so nothing in this folder is deployed from here.
* `PUBLIC_APP_URL` in `.env` is `https://header-finger-simpson-shipped.trycloudflare.com` — a
  Cloudflare **quick tunnel**. That hostname no longer resolves ("no such host"): quick tunnels
  are handed a new name on every restart, so treat the value as stale. The working address is
  `http://127.0.0.1:3000`.
* Neon is one project, `summer-firefly-28238061` ("sunrise-db"), with exactly one branch,
  `production`.

## Testing on a phone

* The guest cookie is set `Secure` (`src/lib/guest-auth.ts`), which is right for production and
  fine in a browser on `localhost` or `https`. Over a plain `http://192.168.x.x:3000` LAN address
  a browser will not keep it, so **guest sign-in looks broken when it is not**. Use the tunnel
  address (https), or test the guest view on the laptop.
* The staff/admin cookies carry **no** `Secure` flag, so those do work over a plain LAN http
  address.
* To check a public address once the tunnel is back up:
  `npm run verify:preview -- --base https://<tunnel-host> --staff-pass <p> --guest-pass <p>`
* The Android install test still needs a machine with `adb`/`gradle`/`java` — none of those
  exist on this one, so that step is yours.

## Rotate or remove

| Command | What it does |
|---|---|
| `npm run preview:accounts` | Creates/resets both logins in both databases and prints the new pair |
| `npm run preview:accounts -- --dry-run` | Shows what it would do, writes nothing |
| `npm run preview:accounts -- --db local` | Only the local database (`--db neon` for only Neon) |
| `npm run preview:accounts:delete` | Removes the STF900 row, the preview's device sessions, its `guest_accounts` row and its `guests` row — in both databases. `audit_log` rows are kept on purpose: a sign-in really happened |

## Claims checked while doing this

Everything below was run in this pass, not remembered. Marker: ✅ verified true, ⛔ not true as
stated, ⚠️ true but fragile.

| Claim | Measured |
|---|---|
| "The admin API can create a booking" | ⛔ `src/app/api/admin/bookings/route.ts` exports **GET** (:14), **PATCH** (:43), **DELETE** (:255) — no POST. A booking therefore cannot be created through `/api/admin/*`; the desk path is what creates one |
| `app_versions` / `app_installs` tables back the update card | ⛔ 0 hits for `app_versions\|app_installs\|appVersions\|appInstalls` in `src/db/schema.ts` |
| Pages are refreshed with `revalidatePath` after a write | ⛔ 0 hits for `revalidatePath` anywhere under `src/` |
| Email goes out through a mail API (Resend) | ⛔ `src/lib/mail.ts:44-49` imports **nodemailer** and builds an SMTP transport from `SMTP_*` |
| A posted review is moderated first | ✅ but published immediately: `src/lib/reviews.ts:70` sets `isPublished: true` on submit, so it is live on the landing page straight away; the desk can hide it afterwards (`POST /api/desk/reviews`, Hide/Publish in `src/components/desk/desk-reviews.tsx:192`). Both databases currently hold **0 reviews**, so the landing page reports 0 |
| "Login with email **or** phone" | ⚠️ the email is matched lower-cased, but `login_phone` is compared as an **exact trimmed string** (`src/lib/guest-auth.ts:315`) — no `normalisePhone()`, unlike `guests.phone` (`src/lib/hotel.ts:72`). A guest who types `0999 000 900` instead of `+265999000900` is told there is no account. The preview row is stored in the canonical form so this check passes |
| Guest session survives a restart of the phone browser | ⚠️ yes, 12-month backstop — but only where the `Secure` cookie is kept (localhost/https, see above) |

The four-brief claim-by-claim table (guest identity, invite-only accounts, premium forms, the
broadcast brief) is in `docs/BUILD-REQUEST-AUDIT.md`; `npm run verify:identity`, `verify:sw`,
`verify:update-card` and `verify:media` are what back it.

## Housekeeping before the commit

`git status` still shows media that was never added: `public/media/` plus 20 loose files in the
project root (`520576061.jpg`, `caption.jpg`, `WhatsApp Image 2026-07-23 …`, the `.mp4`). They
are untracked, so the commit does not depend on them — but until one of them is wired to a
section, the "wrong photo" complaint is about which file a section points at, not about a
missing file. `scripts/create-preview-accounts.mjs` and `scripts/verify-preview-logins.mjs` are
new untracked files as well, and belong in the commit.
