# Sunrise Motel — Complete System Guide

**Sunrise Motel, Area 5, Lilongwe (Mzimba Road, behind Bwasila Secondary School) · Front desk +265 998 688 332**
*"When you are here, you are family."*

This is the **single source-of-truth document for the whole system**: what it is, how every part
fits together, what guests can do, what staff and admins can do, the full request/response flow,
the database, the APIs, the mobile apps, deployment, and known gaps.

## Document map — read this first

The document has **four parts, and they are not the same thing**:

| Part | What it is | Status |
|---|---|---|
| **Part A — sections 1–21** | The system **as it exists in this repository today**. Every table, route, screen and number in Part A corresponds to real code. | ✅ **Live / built** |
| **Part B — sections 22–39** | The **v2 specification**: guest accounts, in-app ordering against a room bill (folio), private guest↔desk messaging, housekeeping tasks, per-device push, and the full advanced admin dashboard. | 🧭 **Specified — partly built.** §51 says which parts are live |
| **Part C — sections 40–46** | The **three addenda, now built**: how guest accounts are created, the two guest paths (an account… or nothing but the room you are standing in), and the landing page as a booking engine that never says a bare "no" — reviews, the sold-out waitlist, and the desk screens that run both. | ✅ **Live / built** |
| **Part D — sections 47–52** | **The six later addenda, and the fix that made them real.** The session cookie is now signed, so *every* admin-only block is enforced on the server rather than by hiding a button; the desk gained the one menu control it needed; and the guest menu finally comes from the database. Includes the **honest build status** of all six documents. | ✅ **Enforcement built** · ⚠️ **with the gaps listed** |
| **Part E — sections 53–58** | **The navigation & image addenda.** Three navigation tiers in one component, images with a standard the code enforces (`SafeImage`, alt text, lazy loading, placeholders), motion that never hides content, the app's five tabs with a What's-on feed, and the manager's picture/post tools with an end-to-end check (`npm run verify:media`). Includes what is still **not** built. | ✅ **Built** · ⚠️ **§58 lists the gaps** |

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | Live in the running system (Part A, Part C, Part D's enforcement) |
| 🧭 | Specified (Part B). Judge it one **feature** at a time — §51 says which are already live |
| ⚠️ | Known gap or deliberate limitation (§20 in Part A, §38 in Part B, §46 in Part C, §52 in Part D) |

> **The one rule that governs everything:** *the app is an advantage, never a requirement.* A guest
> with no email, no smartphone, no data bundle and no account must still be able to book, stay, eat,
> complain and pay. Every v2 app feature has a non-app equivalent at the desk or on WhatsApp. If the
> app breaks, the motel still works.

---

## 1. What this system is (at a glance)

One **Next.js 16 website + booking system + staff back-office**, deployed on Vercel with a
PostgreSQL database. It replaces both a paper booking book and the old PHP/MySQL prototype.

| | |
|---|---|
| **Guests** | Browse rooms, check **live availability**, book **with no account and no password**, get a reference + PDF pro-forma invoice, pay, and **track the booking** with reference + phone. Optional: an account (§41) or a **room session** from the QR card / PIN (§42) that opens the same app with no password at all. |
| **Staff (front desk)** | Sign in and work **`/desk`**: the Today board, check-in and check-out, validated room assignment, cash at the counter, the order board, the message queue, housekeeping tasks, room access, and closing a dish as *sold out*. Approve / confirm / cancel / follow-up too. |
| **Admins (manager)** | Everything staff can do **plus** everything staff cannot: verifying claimed payments, folio charges and voids, extending a stay, deleting bookings, managing staff / rooms / rates, posts and gallery pictures, guest account status and consent, moderate reviews, revenue dashboards, reports, and broadcast app push. §8.3 is the exact matrix. |
| **Auditors** | A third read-only role: everything above is *visible*, every write returns **403** (§8.2). |
| **Mobile** | Installable PWA (Android/iOS home-screen install, with a **separate "Sunrise Manager" manifest** for the portal) that automatically offers installation on page visits, **and two native Android WebView apps** — `SunriseMotelApp` for guests, `SunriseAdminApp` ("Sunrise Manager") for staff — each with its own icon and in-app updates. Push is on the guest app only (§12). |
| **Auditing** | Every guest and staff action is written to an **append-only audit log** with actor, actor label, IP and Malawi time — so any booking can be reconstructed later. |

Two audiences, one codebase, two very different interfaces:

```
                     ┌──────────────────── the one Next.js app ───────────────────┐
   Guests  ────────▶ │  /  /stay  /dine  /unwind  /connect  /gallery  /track       │
   (no login)        │  /download  /app  /room  /review  /activate                │
                     │   │      ^ signed-in guest app   ^ room session (QR / PIN) │
                     │   └──▶ /api/availability, /api/bookings, /api/track,       │
                     │        /api/invoices/[ref], /api/images/[id], /api/upload, │
                     │        /api/guest/*, /api/reviews, /api/waitlist           │
                     │                                                            │
   Front desk ─────▶ │  /desk    (cookie session, 12h)                            │
   (staff)           │   └──▶ /api/desk/{stay,rooms,room-sessions,orders,issues,  │
                     │        tasks,menu,payments,folios,guests,reviews,overview} │
                     │        role-gated: staff work the shift, admin owns money  │
                     │                                                            │
   Manager  ───────▶ │  /admin  /admin/notifications                              │
   (admin)           │   └──▶ /api/admin/*   (role-gated: admin vs staff)         │
                     └───────────────────────────┬────────────────────────────────┘
                                                 │
                                 Drizzle ORM ────▶ PostgreSQL (local 127.0.0.1 or Neon)
                                                 │
                 side channels ────▶ SMTP email (nodemailer), WhatsApp deep links,
                                     Firebase Cloud Messaging (app push), Vercel Blob (images)
```

### 1.1 Runtime and request paths

This is a **single Next.js application**, not a separately deployed frontend and API. Pages under
`src/app/` render the guest, desk and manager experiences; browser actions call Route Handlers under
`src/app/api/`. Those handlers validate inputs, resolve the relevant staff or guest identity, apply
role and ownership checks, perform database work through Drizzle, and return JSON, files or status
codes. The browser never connects directly to Postgres.

Typical paths through the system:

1. **Booking:** the guest page requests availability and a price quote; `POST /api/bookings`
   rechecks inventory on the server, creates the booking and invoice data, writes timeline/audit
   records, and attempts configured notifications. The guest can then track with booking reference
   plus phone and download the invoice PDF.
2. **In-house guest:** the guest enters through a signed-in account or a stay-scoped room session
   (QR, PIN, or reference + phone). Guest APIs resolve that identity server-side before allowing
   orders, requests or messages. Check-in opens a room session; check-out closes it.
3. **Staff operation:** `/desk` and `/admin` call their respective API families. Staff sessions use
   the signed `sunrise_session` cookie; API handlers enforce roles. The `auditor` role is read-only.
   `src/middleware.ts` only sets API cache headers; it is **not** the authentication boundary.
4. **External effects:** email uses SMTP, Android app notifications use Firebase Cloud Messaging,
   browser notifications use Web Push, and image uploads use Vercel Blob with a Postgres fallback.
   These integrations are server-side and are optional when their credentials are absent.

`src/db/schema.ts` is the Drizzle model; `drizzle/*.sql` is the versioned migration history.
`src/db/index.ts` owns the PostgreSQL pool and Drizzle client. `src/lib/` contains shared domain
rules (pricing, time, authentication, guest context, audit, invoices, notifications) used by the
Route Handlers. `public/` serves static assets, PWA manifests and service workers. The Android apps
are WebView clients of the deployed website, not separate business-logic backends.

## 2. Repository map

```
sunraisehotles/
├─ src/
│  ├─ app/                          # Next.js App Router
│  │  ├─ layout.tsx                 # <html>, metadata, PWA manifest, service-worker registrar
│  │  ├─ page.tsx                   # HOME: hero, live availability, room cards, booking modal, posts
│  │  ├─ stay/page.tsx              # /stay    → StayPage    (rooms + availability + booking)
│  │  ├─ dine/page.tsx              # /dine    → DinePage    (menu + order basket)
│  │  ├─ unwind/page.tsx            # /unwind  → UnwindPage  (events + table reservation)
│  │  ├─ connect/page.tsx           # /connect → ConnectPage (Starlink Wi-Fi + workspace enquiry)
│  │  ├─ gallery/page.tsx           # /gallery → GalleryPage (filterable photo grid)
│  │  ├─ track/page.tsx             # /track   → TrackBooking (reference + phone → status timeline)
│  │  ├─ download/page.tsx          # /download → Android APK instructions
│  │  ├─ app/page.tsx                # /app     → GuestApp        signed-in guest app (§24, §40)
│  │  ├─ room/page.tsx               # /room    → RoomSessionApp  no account: QR card / PIN (§42)
│  │  ├─ review/page.tsx             # /review  → ReviewForm      rate a finished stay (§43)
│  │  ├─ activate/page.tsx           # /activate                 set a password + enter the code (§41)
│  │  ├─ desk/page.tsx               # /desk    → DeskConsole     the front-desk console (§48)
│  │  ├─ admin/page.tsx             # MANAGER PORTAL (~1 100 lines: login, tabs, booking modal)
│  │  ├─ admin/notifications/page.tsx # App push broadcast composer (admin only)
│  │  ├─ globals.css, inner-pages.css, enhancements.css, animations.css, site-nav.css
│  │  ├─ home-premium.css, review/review.css     # route sheets — `hp-` on `/`, `rv-` on `/review`
│  │  └─ api/…                      # Route Handlers; full family map in §9
│  ├─ components/
│  │  ├─ guest/                     # the guest-side screens
│  │  │  ├─ guest-app.tsx           → /app       signed-in app: room, folio, orders, messages
│  │  │  ├─ room-session-app.tsx    → /room      no account: QR card, PIN, reference + phone
│  │  │  └─ review-form.tsx         → /review    rate a finished stay
│  │  ├─ desk/                      # the front-desk console, one file per tab
│  │  │  ├─ desk-console.tsx        → /desk      the 10 tabs + role threading (isAdmin)
│  │  │  ├─ desk-rooms.tsx          → Room map · validated assignment, housekeeping state
│  │  │  ├─ desk-roomaccess.tsx     → Room access: open a session, new PIN, close, print
│  │  │  ├─ desk-orders.tsx         → Orders
│  │  │  ├─ desk-issues.tsx         → Messages & issues (grouped by room)
│  │  │  ├─ desk-tasks.tsx          → Housekeeping & service tasks
│  │  │  ├─ desk-menu.tsx           → Menu · sold out (§48)
│  │  │  ├─ desk-money.tsx          → Payments & folios (admin-gated controls)
│  │  │  ├─ desk-guests.tsx         → Guest CRM, accounts, consent (admin-gated)
│  │  │  ├─ desk-reviews.tsx        → Reviews & waitlist
│  │  │  ├─ room-card.tsx           # the printed check-in card (room PIN + QR)
│  │  │  ├─ guest-credentials-card.tsx # the printed guest app sign-in card (email + system-set password)
│  │  │  └─ shared.ts               # shared desk types + helpers
│  │  ├─ experience-pages.tsx       # PageFrame, GalleryGrid, StayPage, DinePage, UnwindPage, ConnectPage
│  │  ├─ admin/                     # Manager shared panels (audit log, user management)
│  │  ├─ track-booking.tsx          # Guest tracking UI
│  │  ├─ sunrise-logo.tsx           # Logo + PageLoadingSplash
│  │  ├─ ImageUploader.tsx          # Drag & drop file picker → /api/upload
│  │  ├─ InstallAppPopup.tsx        # PWA "Install" popup (beforeinstallprompt)
│  │  ├─ AppDownloadBanner.tsx      # Android banner → /download
│  │  └─ ServiceWorkerRegister.tsx  # SW registration + "A newer version is ready" card
│  ├─ db/
│  │  ├─ index.ts                   # pg Pool + Drizzle client (auto SSL for Neon/Supabase/Render)
│  │  ├─ schema.ts                  # Drizzle model (34 tables currently declared; see §4)
│  │  └─ seed.ts                    # First-run seed: rooms, posts, menu, gallery
│  └─ lib/
│     ├─ staff-auth.ts              # Session cookie sign/verify/label, staff lookup, roles (§14.2, §47)
│     ├─ desk-auth.ts               # deskActor(request) + requireAdmin(user) — the one 403 helper (§47)
│     ├─ password.ts                # scrypt hash/verify + readable generated passwords
│     ├─ pricing.ts                 # bookingMath(), extensionFeeFor(), nextBookingNumber()
│     ├─ time.ts                    # Africa/Blantyre date & time formatting helpers
│     ├─ booking-events.ts          # Per-booking timeline writer
│     ├─ audit.ts                   # System-wide append-only audit writer + client IP
│     ├─ invoice-pdf.ts             # buildInvoicePdf() + parseExtras() (pdf-lib)
│     ├─ folio-invoice.ts           # Builds an invoice from folio_items (§25.1)
│     ├─ mail.ts                    # SMTP transport + all HTML email templates
│     ├─ fcm.ts / web-push.ts       # Android FCM and browser Web Push
│     ├─ settings.ts                # Runtime settings (environment values take precedence)
│     ├─ guest-context.ts           # resolveGuestContext(): account OR room session → one context (§40)
│     ├─ room-session.ts            # Open / validate / rotate / close a room session (§42)
│     ├─ guest-otp.ts               # 6-digit codes: hashed, 10 min, 3 attempts, resend throttle (§41)
│     ├─ guest-auth.ts              # Guest sign-in, per-device sessions, sign-out-everywhere
│     ├─ guest-account.ts           # Guest account CRUD, status and consent
│     ├─ reviews.ts                 # Reviews, the real average, the waitlist and its mail-out (§43)
│     ├─ hotel.ts                   # The motel's own details, used by cards, emails and PDFs
│     └─ notify.ts                  # One place that decides channel + audience for a message
├─ drizzle/                         # SQL migration history + snapshots (15: 0000 → 0014)
├─ public/                          # images/, icon-192.png, icon-512.png, manifest.json, sw.js, version.json, version-admin.json, manifest-admin.json
├─ scripts/staff-login.mjs          # CLI: create/reset a portal login in local, Neon or both DBs
├─ scripts/                         # Verification, preview-account, media and maintenance scripts
├─ docs/ADDENDA-BUILD-STATUS.md     # Per-part build status of the six addenda (honest, incl. gaps)
├─ docs/addenda/                    # The six source addenda (31-the-staff-dashboard.md → 36-…)
├─ SunriseMotelApp/                 # Native Android WebView wrapper (Kotlin + Gradle) — the guest app
├─ SunriseAdminApp/                 # Native Android WebView wrapper for the portal — "Sunrise Manager"
├─ .github/workflows/build-apk.yml  # CI: build BOTH signed APKs and attach them to a GitHub Release
├─ drizzle.config.ts                # Schema path + DATABASE_URL (never hardcodes 127.0.0.1)
├─ next.config.ts                   # turbopack.root pin (silences multi-lockfile warning)
├─ vercel.json                      # framework nextjs, region iad1
├─ share-tunnel.ps1                 # Local sharing via a cloudflared quick tunnel
├─ RUN_LOCALLY.md                   # Windows local development run sheet
└─ README.md                        # System architecture, operations and feature documentation
```

The live system is the Next.js app in `src/` plus its static assets in `public/`. No separate
PHP/MySQL application is present in this checkout.

---

## 3. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.6** (App Router, Turbopack) | Server routes + client pages in one app |
| UI | **React 19.2.6**, TypeScript 5.9, **TailwindCSS 4** (PostCSS) + hand-written CSS (`globals.css`, `inner-pages.css`, `enhancements.css`) | Mobile-first; hand-rolled components, no UI kit |
| Icons | `lucide-react` | |
| Database | **PostgreSQL 17** locally or **Neon** serverless | |
| ORM / migrations | **Drizzle ORM 0.45** + **drizzle-kit 0.31** | `src/db/schema.ts` → `drizzle/*.sql` |
| PDF | `pdf-lib` | Pro-forma invoices / receipts drawn from scratch |
| Email | `nodemailer` (SMTP) | Guest pro-forma, staff alerts, staff credentials, reminders |
| Push | **Firebase Cloud Messaging HTTP v1** via raw `fetch` + RS256 JWT (no `firebase-admin`) | Topic `all_users` |
| Images | `@vercel/blob` with a **PostgreSQL fallback store** | Uploads never dead-end |
| Android apps | Kotlin WebView wrappers, Gradle, GitHub Actions | `SunriseMotelApp/` (guest) · `SunriseAdminApp/` (manager) |
| Hosting | Vercel (`vercel.json`, region `iad1`) + Neon | `vercel-build` runs migrations before build |

---

## 4. Database schema

Defined once in **`src/db/schema.ts`**, which currently declares **34 tables**. The model spans:

| Domain | Tables |
|---|---|
| Inventory and reservations | `room_types`, `rooms`, `room_type_rates`, `room_blocks`, `bookings` |
| Guest identity and access | `guests`, `guest_accounts`, `guest_sessions`, `activation_tokens`, `room_sessions`, `staff`, `invitations`, `push_subscriptions` |
| Content and media | `posts`, `menu_items`, `gallery_images`, `uploaded_images`, `faqs`, `reviews`, `waitlist_entries` |
| Service and room billing | `orders`, `order_items`, `folio_items`, `message_threads`, `messages`, `service_tasks`, `payments`, `invoices` |
| Audit, delivery and reporting | `booking_events`, `audit_log`, `notification_log`, `night_audit`, `expenses`, `app_settings` |

The schema file is authoritative; read it before making schema-level assumptions. The `drizzle/`
directory currently contains **15 SQL migrations**, `0000_gorgeous_scream.sql` through
`0014_lame_firelord.sql`, with matching snapshots and a journal under `drizzle/meta/`. Migrations
are applied with Drizzle Kit. All timestamps are `timestamptz` (stored as UTC instants and displayed
in Malawi time); money is stored as integer MWK amounts (no fractional currency units).

### 4.1 `room_types` — the sellable catalogue
| Column | Purpose |
|---|---|
| `id` (PK) | Slug used by the booking form: `standard`, `deluxe`, `twin` |
| `name`, `slug`, `description` | Public copy |
| `rate` | **MWK per night** (85 000 / 125 000 / 115 000 when seeded) |
| `total_inventory` | How many sellable rooms of this type exist (4 / 3 / 3 seeded = **10 rooms**) |
| `bed`, `sleeps`, `size`, `badge` | Card facts |
| `features` | text — JSON array of strings |
| `images` | text — JSON array of image URLs (drives the slideshow) |
| `is_active` | Hidden rooms disappear from availability |

### 4.2 `bookings` — the heart of the system
| Column | Purpose |
|---|---|
| `id` (PK) | UUID |
| `reference` (unique) | **Guest reference** `SM-YYMMDD-XXXX` (Malawi date, no ambiguous characters) |
| `booking_number` | **Human sequence** `BK-YYYY-NNNN`, sequential per Malawi year |
| `room_type_id`, `room_type` | Id + name snapshot (name frozen at booking time) |
| `check_in`, `check_out` | `YYYY-MM-DD` strings — calendar days, immune to timezone drift |
| `adults`, `children`, `nights` | Occupancy + nights (nights computed server-side) |
| `nightly_rate` | Rate snapshot (later rate changes never alter existing bookings) |
| `service_fee`, `extension_fee`, `discount` | Pricing components (0 at booking; extension fees added by *Extend stay*) |
| `total_amount` | Frozen total |
| `guest_name`, `phone`, `email`, `arrival`, `requests` | Guest details (only name + phone are required) |
| `extras` | text — JSON array of `{ label, amount }` (breakfast / transfer / late check-out) |
| `status` | `pending` `awaiting_payment` `confirmed` `checked_in` `checked_out` `cancelled` |
| `assigned_room` | Free text, e.g. `Room 104` (admin only) |
| `assigned_staff_id` | Which staff member owns this booking |
| `follow_up_at`, `follow_up_note` | Follow-up scheduling |
| `last_reminder_at`, `reminder_count` | Reminder throttle (max one per 2 hours) |
| `escalated_at` | Set once when a booking has been idle 12 h+ |
| `invoice_number`, `invoice_sent_at` | `INV-YYYY-NNNN` + last email time |
| `amount_paid` | Running total received (MWK) |
| `policy_version` | Defaults to `2026-07` (cancellation-policy snapshot) |
| `created_at`, `updated_at` | Audit-friendly instants |

### 4.3 `booking_events` — per-booking timeline (append-only)
`id`, `booking_id`, `reference`, `action`, `note`, `actor` (`guest` | `manager` | `system`), `created_at`.

Actions written by the app: `created`, `status_changed`, `approved`, `confirmed`, `cancelled`,
`room_assigned`, `staff_assigned`, `payment_recorded`, `invoice_emailed`, `invoice_email_failed`,
`follow_up_requested`, `reminder_sent`, `escalated`, `extended`, `whatsapp_queued`, `note`, `deleted`.

This is what the guest sees on `/track` (internal `note` entries are filtered out for guests).

### 4.4 `invoices`
`invoice_number` (unique, `INV-YYYY-NNNN`), `booking_id`, `booking_ref`, guest snapshot
(name/email/phone), room + dates + nights, `subtotal`, `extras_total`, `tax_amount`,
`total_amount`, `amount_paid`, `balance_due`, `status` (`proforma` | `sent` | `paid` | `cancelled`),
`line_items_json`, `payment_instructions`, `sent_to_email`, `sent_at`, `created_at`.
One invoice row is created automatically with every booking.

### 4.5 `posts` — "What's on" / events / offers
`title`, `category` (Event/Special/Offer/News), `day`, `date`, `time`, `detail`, `price_tag`,
`image_url`, `is_active`. Rendered on the home page and `/unwind`.

### 4.6 `menu_items` — dine menu
`name`, `category` (`From the grill`, `Mains`, `Light & fresh`, `Breakfast`, `Coffee & snacks`,
`Drinks`), `description`, `price` (MWK), `image_url`, `is_available`, `is_special`.

### 4.7 `gallery_images`
`title`, `category` (Rooms/Property/Dining/Events/Work), `image_url`, `alt_text`, `caption`,
`display_order`. Powers `/gallery`, the home gallery strip, and the "choose from gallery" picker
inside the admin post form.

### 4.8 `staff`
`staff_code` (unique — `STF001`, `STF002`, … or `ADM000` for the legacy manager), `name`,
`email` (unique, this is the login), `phone`, `role` (`admin` | `staff`), `password_hash` +
`password_salt` (**scrypt**, 64-byte derived key, salt = 64 hex chars), `is_active`, `last_login_at`.

### 4.9 `audit_log` — system-wide append-only record
`action` (e.g. `booking.created`, `booking.status_changed`, `gallery.image_added`, `auth.login`,
`auth.login_failed`, `notification.broadcast`), `entity`, `entity_id`, `reference`, `summary`,
`actor` (`guest` | `manager` | `system`), `actor_label`, `ip`, `metadata_json`, `created_at`.

**Never updated, never deleted by the app** — the portal's audit view is read-only by design, and
even a deleted booking keeps a full snapshot here.

### 4.10 `uploaded_images` — Postgres image fallback store
`filename`, `content_type`, `size`, `data` (base64), `uploaded_by`, `created_at`. Used when Vercel
Blob is not configured (local dev, tunnel) or a Blob call fails; served back by
`GET /api/images/[id]` with `Cache-Control: public, max-age=31536000, immutable`.

### 4.11 First-run seed data (`src/db/seed.ts`)
Triggered lazily by `GET /api/availability`, `GET /api/admin/gallery` and `GET /api/admin/posts`
**only when `room_types` is empty**:

* **Rooms** — The Standard (MWK 85 000, 4 rooms), The Deluxe (MWK 125 000, 3), The Twin (MWK 115 000, 3)
* **5 posts** — Sunset Happy Hour, Lawn Braai & Sizzling Cuts, Match Day on the Big Screen, Work & Relax Day Pass, Garden Dinner Evenings
* **9 menu items** — grill platter, nsima & beef stew, grilled chambo, beef curry, garden salad, 2 breakfasts, filter coffee, chilled drinks
* **24 gallery images** across the Rooms / Property / Dining / Events / Work categories

---

## 5. Status lifecycle and numbering conventions

```
                 ┌────────── guest pays & staff confirm ─────────┐
                 ▼                                                │
 (new request) pending ──(pro-forma emailed)──▶ awaiting_payment  │
                 │                                    │           │
                 │ approve / confirm                  │ payment   │
                 ▼                                    ▼           │
              confirmed ─────────────────────────▶ checked_in ──▶ checked_out
                 │                                     │
                 └────────────── cancelled ◀───────────┘   (admin only: deleted)
```

| Transition | Who can trigger it |
|---|---|
| → `pending` | System, on booking creation (a guest can never choose a status) |
| → `awaiting_payment` | System, automatically when the pro-forma invoice is emailed |
| → `confirmed` | Staff/Admin via **Approve** / **Confirm**, or automatically when `amount_paid >= total_amount` |
| → `checked_in` / `checked_out` | **The front desk** — staff or admin — via `/desk` → *Today board* → **Check in** / **Check out** (`POST /api/desk/stay`, §42.1). Note the **legacy** `/admin` booking modal still restricts the old status buttons to admins; the desk route is the supported path, and it is the one that opens/closes the room session |
| → `cancelled` | Staff/Admin (**Cancel** or the status buttons) |
| deleted | **Admin only** — the row is removed, a full snapshot stays in `audit_log` |

**Reference / number formats**

| Thing | Format | Example | Generated in |
|---|---|---|---|
| Guest reference | `SM-YYMMDD-XXXX` (no 0/O/1/I) | `SM-260926-K7P4` | `src/app/api/bookings/route.ts` |
| Booking number | `BK-YYYY-NNNN`, sequential per Malawi year | `BK-2026-0011` | `nextBookingNumber()` in `src/lib/pricing.ts` |
| Invoice number | `INV-YYYY-NNNN` | `INV-2026-4821` | `src/app/api/bookings/route.ts` |
| Staff code | `STFnnn` | `STF002` | `nextStaffCode()` in `src/lib/staff-auth.ts` |
| Month policy tag | `policy_version` | `2026-07` | Schema default |

---

## 6. Guest experience (the public site — no account, ever)

Guests never sign up, never pick a password, and never see the manager portal. The whole public
journey runs on two identifiers: the **booking reference** and the **phone number** used to book.

### 6.1 What each public page does

| Route | Purpose | Reads / writes |
|---|---|---|
| `/` **Home** | **Rebuilt as a premium landing page** (`home-premium.css` — every class `hp-`-prefixed / scoped to `.hp-root`, and the sheet is imported by **this route alone** so no other page downloads it): hero photograph with the live availability bar floating over it, a three-fact strip, the four ways (Stay / Dine / Unwind / Connect as one image card each), the published "what's on" feed, live room cards with photo slideshow, guest reviews with the real average, a scrolling gallery strip, find-us & how-to-pay, a dismissible app banner, a four-column footer and a **mobile sticky stay bar** carrying the chosen dates. Sections with nothing honest to show render an explicit empty state instead of pretending — and if **availability itself** fails, the rooms section says so and offers a retry instead of showing "Rooms are loading…" for ever. | `GET /api/availability`, `GET /api/posts`, `GET /api/reviews`, `GET /api/admin/gallery` (public read), `POST /api/bookings`, `POST /api/waitlist` |
| `/stay` **Stay** | Dedicated rooms page: live availability, room comparison and the full booking form | `GET /api/availability`, `POST /api/bookings` |
| `/dine` **Dine** | Menu **read from `menu_items`** by a server component, with category filters and per-dish **Order for Table** / **Takeaway** that open the order sheet with the tapped dish already in it (§49.1); a dish marked sold out shows **"Sold out today"** and no ordering controls (§49) | `db.select().from(menuItemsTable)` (falls back to the built-in list if the DB is unreachable); the order basket is still client-side only (§20 gap 1) |
| `/unwind` **Unwind** | This week's events (happy hour, braai, match day) plus a *Reserve a Table / Braai Spot* form | Event cards are built-in; the reservation form is **UI-only** |
| `/connect` **Connect** | Starlink Wi-Fi, coffee, power and meeting-table pitch + a *Day Workspace Enquiry* form | Enquiry form is **UI-only** |
| `/gallery` **Gallery** | Filterable photo grid (All / Rooms / Property / Dining / Events / Work) | `GET /api/admin/gallery` (public read) |
| `/track` **Track** | The guest's window into their own booking: status, money, invoice download, event timeline; the reference-and-phone lookup opens in a sheet, and a `?ref=` link opens it for you (§49.1) | `POST /api/track` |
| `/download` **Get the app** | **Both** Android APKs — the guest app (v1.3) and the *Sunrise Manager* staff app (v1.0) — with install steps and "install as a web app" instructions | Static (§12.3) |
| `/app` **Guest app** | The signed-in guest screen: room number, Wi-Fi, check-out time, folio balance, ordering, the message thread, housekeeping buttons and quick requests | `/api/guest/*` (§40, §45) |
| `/room` **Room screen** | The **no-account** path — the QR card, room number + PIN, or reference + phone. Same screens as the app, no password (§42) | `/api/guest/room-session` (§42) |
| `/review` **Rate a stay** | Leave a rating and a comment; only offered once the stay has ended, and **one tap submits, so this form stays inline by design** (§49.1). Styled by its own route sheet `src/app/review/review.css` — every class `rv-`-prefixed / scoped to `.rv-root`, and the sheet is imported by **this route alone**, the same arrangement `home-premium.css` has with `/` | `POST /api/reviews` (§43.1) |
| `/activate` **Activate** | The first-run screen from the invitation email: set a password, then enter the 6-digit code | `POST /api/guest/activate` (§41) |

### 6.2 The availability rule (anti-overbooking)

Availability is always computed by the server — never trusted from the browser:

```
available(room type) = total_inventory − COUNT(bookings of that type that overlap your nights)

overlap  ⇔  booking.check_in  <  your check_out
        AND booking.check_out >  your check_in
        AND booking.status   != 'cancelled'
```

A room that checks **out** on your check-in day is free that night (half-open interval) — exactly
how a hotel front desk counts. `GET /api/availability` returns, per room type: `totalInventory`,
`bookedCount`, `availableCount`, `isSoldOut` and a ready-made `statusText` ("All 4 rooms
available" / "Only 1 of 4 rooms left" / "Fully booked for these dates").

### 6.3 End-to-end booking flow (guest → paid → confirmed)

1. **Search.** The guest lands on `/` (or `/stay`). Dates default to tomorrow → +3 days. Every date
   change re-calls `GET /api/availability?checkIn=…&checkOut=…`.
2. **Choose a room.** Cards show real photos (slideshow), bed / sleeps / size, features, the nightly
   rate in MWK and the live "rooms free" badge. Sold-out rooms are visibly disabled.
3. **Add extras** inside the booking modal — totals recalculate live:
   * Daily breakfast — **MWK 8 500 per guest, per night**
   * Kamuzu Airport transfer (one-way) — **MWK 25 000**
   * Late check-out until 15:00 — **MWK 15 000**
4. **Submit the request** — `POST /api/bookings` with `roomTypeId`, `checkIn`, `checkOut`, `adults`,
   `children`, `extras`, `guestName`, `phone` and optionally `email`, `arrival`, `requests`.
5. **Server validation & pricing** (`src/app/api/bookings/route.ts`):
   * Requires a name, a phone number and valid `YYYY-MM-DD` dates with at least 1 night.
   * **The database is the source of truth** for the room name and the nightly rate — figures typed
     or tampered with on the client are ignored.
   * Opens a transaction, runs `SELECT id FROM room_types WHERE id = … FOR UPDATE` (a row lock) and
     **re-counts overlapping bookings inside the lock**, so two guests can never take the last room
     at the same instant. If nothing is left → **HTTP 409 `SOLD_OUT`** with a friendly message.
   * Inserts the booking with `status = 'pending'`, an `SM-…` reference, a `BK-YYYY-NNNN` booking
     number, the frozen `nightly_rate`, the computed `total_amount`, and the extras JSON.
   * Inserts the matching **pro-forma invoice** (`INV-YYYY-NNNN`) with bank / Airtel Money /
     TNM Mpamba payment instructions already filled in.
6. **Two audit records.** A `booking_events` "created" entry (visible to the guest) **and** an
   `audit_log` `booking.created` entry with guest label, IP and metadata.
7. **Emails & WhatsApp (best-effort — never blocks the booking):**
   * **Guest** (if an email was given and SMTP is configured): pro-forma **PDF attached**, track
     link, totals, balance.
   * **Staff alert** to `STAFF_NOTIFY_EMAILS` + `ADMIN_EMAIL`: guest name/phone, room, dates,
     invoice number, total, extras, arrival time and requests, with a link to `/admin`.
   * If `STAFF_WHATSAPP_GROUP` is set, a `whatsapp_queued` event is added to the timeline.
   * Failures are recorded as `invoice_email_failed` events — the booking is always kept.
8. **Success screen.** The guest sees the **reference**, the total, a **Download pro-forma PDF**
   button (`/api/invoices/SM-…`), a **Chat with the front desk** WhatsApp button (reference
   prefilled) and a **Track this booking** link.
9. **Payment.** Guests pay by National Bank of Malawi transfer (Acc 1009876543), Airtel Money or
   TNM Mpamba using **their reference** as the payment reference, then send proof on WhatsApp.
10. **Staff action → guest notified.** The front desk approves/confirms (or cancels / follows up)
    from the portal. Status changes email the guest (when an email exists) and the admin, and every
    change lands in the guest's timeline.

### 6.4 Guest-facing money model

| Item | Amount |
|---|---|
| Nightly rates (seeded) | Standard MWK 85 000 · Deluxe MWK 125 000 · Twin MWK 115 000 |
| Daily breakfast | MWK 8 500 × guests × nights |
| Airport transfer (one-way) | MWK 25 000 |
| Late check-out until 15:00 | MWK 15 000 |
| Service fee / discount | 0 at booking time (fields exist for future use) |
| **Total** | `nightly_rate × nights + service_fee + extension_fee + extras − discount` |

Check-in from 14:00, check-out by 10:00. Payment channels: **National Bank of Malawi, Acc
1009876543**, **Airtel Money +265 998 688 332**, **TNM Mpamba +265 888 123 456**.

---

## 7. Tracking a booking (`/track`)

No login. The guest enters **the reference** (`SM-260926-K7P4`) **and the phone number used at
booking**; `POST /api/track` then:

1. Looks the booking up by uppercased reference (404 with a helpful message if missing).
2. Compares **only the last 6 digits** of the stored phone with the digits supplied, so
   `+265 998 688 332`, `0998 688 332` and `265998688332` all match. Mismatch → **403**.
3. Returns the booking (status, room, assigned room, dates, nights, occupancy, total, paid, invoice
   number, invoice URL, creation time) plus the **event timeline**, with internal manager `note`
   entries filtered out.

The page prints a plain-language sentence for each status, the totals, a pro-forma/receipt PDF
download, a WhatsApp button and the same `booking_events` timeline the front desk sees.

---

## 8. The manager portal — staff & admin

**Entry point:** `/admin` (linked from the site header as "Manager portal"). The page is a single
client component (`src/app/admin/page.tsx`) that starts blurred/locked until a session exists.

### 8.1 Signing in and out

| Action | Endpoint | Result |
|---|---|---|
| Check session | `GET /api/admin/login` | `{ authed, user }` |
| Sign in (staff) | `POST /api/admin/login` `{ email, password }` | scrypt verify → `sunrise_session` cookie (httpOnly, `SameSite=Lax`, **12 hours**), `last_login_at` updated |
| Sign in (legacy) | `POST /api/admin/login` `{ password }` with no email | Compares against `ADMIN_PASSWORD`, sets BOTH `sunrise_session` and legacy `sunrise_admin=1`; treated as **Admin / ADM000 "Manager"** |
| Sign out | `DELETE /api/admin/login` | Both cookies cleared (the header **Lock** button) |

Every successful and failed login is written to `audit_log` (`auth.login`, `auth.login_failed`,
`auth.logout`) with the attempted email, actor label and client IP.

### 8.2 Roles

There are **three** roles, defined once and enforced by `deskActor()` + `requireAdmin()` in
`src/lib/desk-auth.ts` (§47).

* **`admin`** — full control incl. money, deletions, staff and room CRUD, reports, app push, content
  (posts and gallery), and the physical-room/status workflow.
* **`staff`** — the front desk. **The shift is theirs:** check-in and check-out, no-shows, assigning
  and changing a room (validated — see §8.3), recording cash taken at the counter, working orders,
  answering messages, housekeeping and service tasks, opening and closing room sessions, and closing
  a dish as *sold out*. **Not theirs:** verifying or rejecting a claimed payment, posting or voiding
  a folio line, regenerating an invoice, deleting a booking, managing staff, rooms or rates, changing
  a guest's account status or consent, moderating a review, publishing a post or touching the
  gallery, and any broadcast push. Each of those returns **403** server-side **and** is absent from
  the UI (not greyed out — absent, §8.4a). The legacy `ADMIN_PASSWORD` session is always an admin.
* **`auditor`** — the external reviewer or the owner's accountant. **Reads everything**: bookings,
  folios, invoices, orders, threads, tasks, the audit trail and reports. **Every write returns 403**,
  and no action control is rendered anywhere. The role is new and thin (§52) — it is enforced in the
  same helper as the other two, not bolted on per screen.

### 8.3 Permission matrix

> **Read this as two consoles, not one.** The front desk works in **`/desk`** (§8.4a); the manager
> works in **`/admin`**. The capabilities below were read off the code (`deskActor()` /
> `requireAdmin()` in `src/lib/desk-auth.ts`), not off intent, and Part D §47 is the change that made
> them true. Where the two consoles differ, the difference is called out.

**1 — Everyone with a session, including `auditor`**

| Capability | Admin | Staff | Auditor |
|---|---|---|---|
| View bookings, guest details, folios, balances, invoices, timeline | ✅ | ✅ | ✅ |
| View orders, message threads, service tasks, room map, Today board | ✅ | ✅ | ✅ |
| Read the audit trail / export it as CSV | ✅ | ✅ | ✅ |
| Dashboard, revenue totals, reports (print/PDF/CSV) | ✅ | ✅ | ✅ (read-only) |
| Add a manager note to a booking | ✅ | ✅ | ❌ |

**2 — The front desk's own work (`/desk`)**

| Capability | Admin | Staff | Auditor |
|---|---|---|---|
| Approve / Confirm / Cancel / Follow-up a booking | ✅ | ✅ | ❌ |
| **Check in · check out · mark a no-show** (`/api/desk/stay`, opens/closes the room session) | ✅ | ✅ | ❌ |
| **Assign or change a room** — validated: the room must exist, must not be `out_of_order`, must not be `dirty`, must not already hold an overlapping stay; every assignment is audited | ✅ | ✅ | ❌ |
| Move a room between housekeeping states (*clean* / *dirty* / *occupied* / *out of order*) | ✅ | ✅ | ❌ |
| **Record cash taken at the counter** (`payments` → `record_cash`) | ✅ | ✅ | ❌ |
| Open a room session, rotate its PIN, close one device or the whole room | ✅ | ✅ | ❌ |
| Work orders, answer messages and issues, complete housekeeping/service tasks | ✅ | ✅ | ❌ |
| **Close a dish as *sold out*, and reopen it** (§48) | ✅ | ✅ | ❌ |
| Create a guest account and send the invitation · resend it · activate it at the counter | ✅ | ✅ | ❌ |
| Record a walk-in or Google review from the desk (§43.1) | ✅ | ✅ | ❌ |
| Notify the sold-out waitlist that dates have opened (§43.2) | ✅ | ✅ | ❌ |

**3 — Admin only (`403` for staff, nothing rendered for either)**

| Capability | Admin | Staff | Auditor |
|---|---|---|---|
| **Verify or reject a claimed payment** | ✅ | ❌ | ❌ |
| Post a manual charge · void a folio line · regenerate an invoice | ✅ | ❌ | ❌ |
| Set a guest account status (`active` / `messaging_muted` / `disabled` / `locked`) or marketing consent | ✅ | ❌ | ❌ |
| Moderate a review — publish, hide, feature | ✅ | ❌ | ❌ |
| Set `awaiting_payment`, delete a booking (full snapshot kept in `audit_log`) | ✅ | ❌ | ❌ |
| Email the invoice PDF to a guest · **extend a stay** (§47 — staff once could; now 403 and the control is absent) | ✅ | ❌ | ❌ |
| **Publish / pause / delete a post** and **add / delete a gallery picture** | ✅ | ❌ | ❌ |
| Send a broadcast app push | ✅ | ❌ | ❌ |
| Manage staff accounts (create, roles, reset password, deactivate, remove) | ✅ | ❌ | ❌ |
| Manage rooms / rates / services (add, edit, hide, remove) | ✅ | ❌ | ❌ |

**4 — What nobody can do yet**

| Capability | Who |
|---|---|
| Change a dish's price, description or photo · add or delete a dish | **nobody** — the code path does not exist. Staff may close a dish for the day (row 2), but there is no Menu screen behind it (§51 item 4) |
| Anything not listed above | Assume admin, and confirm in `src/lib/desk-auth.ts` before relying on it |

> **The one place the legacy `/admin` modal is stricter:** a `staff` session in the *old* booking modal
> may only pass `status` of `confirmed`/`cancelled` and nothing else — no `assignedRoom`, no
> `amountPaid`, no `assignedStaffId` (`src/app/api/admin/bookings/route.ts`). That is correct: the modal
> is the manager's tool. The desk's equivalents live in the `/desk` routes in row 2, and those *do*
> allow staff. §5 states the same thing for the status lifecycle.

✅ **Row 3 is enforced now, not just promised.** `POST`/`DELETE /api/admin/gallery` and
`POST`/`PATCH`/`DELETE /api/admin/posts` all call `requireAdmin`, so a `staff` or `auditor` session
gets **403** and an anonymous caller gets **401** — while `GET` stays public, because the guest pages
read through it. `scripts/addenda-verify.mjs` asserts all fourteen of those statuses live, plus that
both reads still return their arrays.

### 8.4 The `/admin` portal — what each tab does

**Header:** *Refresh* (reloads everything), *Lock* (sign out), and the signed-in identity
(`Admin — Willard Kulemeka` / `Staff STF002 — …`).

**Stat strips**

* Operationally: total requests, pending review (with a live count), awaiting payment,
  confirmed/in-house, collected, outstanding.
* Revenue dashboard: **today / week / month** bookings and revenue, paid bookings + collected,
  **cancelled loss**, and the current session identity.

**Reminder banner.** If any `pending` booking has been waiting ≥ 2 h, a banner lists the oldest
ones (`BK-2026-0007 (Kondwani Phiri, 5h)`) with a **Send reminders** button.

| Tab | What it does |
|---|---|
| **Bookings** | Search by reference / guest name / phone / email, filter by status chip, then act on each card: *Manage & timeline*, **Approve**, **Confirm**, **Follow-up**, **Cancel**, *Invoice PDF*, *WhatsApp the guest*. Cards show guest + clickable phone, room, stay, balance and money state. |
| **Booking modal** | Full guest snapshot, stay facts, arrival + requests, quick decisions, status buttons (role-gated), admin-only room assignment & payment recording, invoice email / download / print / WhatsApp-link, the **timeline** (from `booking_events`), a **manager note** box, and the admin-only **Delete booking & release room** button. |
| **Invoices** | Every pro-forma/receipt with number, booking ref, guest, room, dates, total, balance and status; download the PDF or jump to the booking to email it. |
| **Pictures** | Upload (drag & drop from phone/laptop) or paste a URL, pick a category + caption; remove outdated photos. Changes are live immediately. |
| **Posts** | Publish events/offers (title, category, day, date, time, price tag, picture), pause/resume (`Live` / `Paused`) and delete. Optionally **also send a push notification** to all app users at publish time. |
| **Audit trail** | Read-only, searchable (action / reference / summary / actor), filterable by entity (bookings, invoices, pictures, posts, uploads, logins) and **exportable as CSV**. |
| **Staff** (admin) | Create accounts (name, email, phone, role, typed password **or** auto-generate + email), *Email login* (resets the password and mails the new details), *Deactivate/Activate*, *Remove*. You cannot deactivate or delete your own account. |
| **Rooms** (admin) | Add a room/service (ID slug, name, MWK/night, how many rooms of that type), **Hide/Show**, **Remove**. A room with live bookings is **deactivated instead of deleted**. |
| **Reports** | *Daily bookings (print / PDF)* — an HTML sheet to print or save as PDF; *Revenue CSV (Excel)* — export with booking number, guest, contact, room, dates, nights, total, paid, balance, status, staff and Malawi creation time. |
### 8.4a Two consoles, not one

Since Part C/D there are **two** signed-in surfaces. They share one session cookie, one audit trail
and one role gate — but they are different tools for different jobs.

| | `/admin` — the manager | `/desk` — the front desk |
|---|---|---|
| **Who** | The manager / owner | Whoever is on shift |
| **Landing screen** | Stat strips + the pending-reminder banner | **Today board** — arrivals (unassigned highlighted), departures, in-house, deposits at risk |
| **Tabs** | Bookings · Booking modal · Invoices · Pictures · Posts · Audit trail · Staff · Rooms · Reports · App push | **Ten**, in this order: *Today · Room map · Room access · Orders · Messages & issues · Housekeeping · Menu · sold out · Payments & folios · Guests · Reviews & waitlist* |
| **Controls you may not use** | — | **Absent, not greyed out** — so nobody has to wonder whether they are allowed (§8.3) |

`/admin` keeps everything it had. `/desk` is where the shift actually happens.

> The ten desk tabs above are copied from the `TABS` array in `src/components/desk/desk-console.tsx`,
> which is the only place they are defined. If you change a tab, change it there and re-copy it here —
> do not describe the console from memory.

### 8.5 Approve / Confirm / Cancel / Follow-up semantics

| Action | Effect on the booking | Guest email |
|---|---|---|
| **Approve** | `status = confirmed`, timeline `approved` | "booking approved" |
| **Confirm** | `status = confirmed`, timeline `confirmed` | "booking confirmed" |
| **Cancel** | `status = cancelled`, linked invoice → `cancelled` | "booking cancelled" + invite to WhatsApp |
| **Follow-up** | `follow_up_requested` event with the note you typed, plus `follow_up_at` / `follow_up_note` | "please confirm if you are continuing with booking …" + track link |
| **Extend stay** | New check-out (must be later), `nights` increased, `extension_fee += extra nights × nightly_rate`, `total_amount` recomputed, invoice updated | — (message the guest yourself) |
| **Record payment** | `amount_paid` set; if it covers the total the booking **auto-confirms** and the invoice flips to `paid` (receipt) | — |
| **Delete** | Invoice + events + booking rows removed, full snapshot kept in `audit_log` | — |

### 8.6 Reminders and escalation (front-desk safety net)

`GET` / `POST /api/admin/reminders` implement an SLA on pending bookings:

* **Reminder:** a `pending` booking older than **2 hours** that has not been reminded in the last
  2 hours emails the **assigned staff member** plus `ADMIN_EMAIL`, increments `reminder_count`,
  stamps `last_reminder_at`, and writes a `reminder_sent` timeline event + audit entry.
* **Escalation:** at **12 hours** with no action, `escalated_at` is stamped, an **ESCALATED** email
  goes to `ADMIN_EMAIL`, and the booking modal shows an `ESCALATED` badge.

---

## 9. API reference

All endpoints live under `src/app/api/`. API responses are non-cacheable by default through
`src/middleware.ts`; image and upload byte routes keep their own cache policy. `§9.1` lists public
booking/content routes; `§9.2` lists staff/admin routes; and `§9.3` lists desk routes. The
`/api/admin/*` namespace includes a small number of deliberately public read handlers, so access
is determined per handler, not from the URL prefix. Protected staff/admin/desk handlers verify the
`sunrise_session` cookie and enforce roles server-side through the auth helpers (§14, §47).

### 9.1 Public endpoints (no login)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` | Live per-room availability + `statusText`; also triggers the first-run seed |
| `POST` | `/api/rooms/calculate-price` | Server-side quote for room dates, guests and selected extras |
| `POST` | `/api/bookings` | Create a booking + pro-forma invoice (transactional, row-locked). `400` validation, `404` unknown room, **`409 SOLD_OUT`** |
| `POST` | `/api/track` `{ reference, phone }` | Guest tracking (`403` on phone mismatch, `404` unknown reference) |
| `GET` | `/api/invoices/[reference]` | Streams the pro-forma / receipt **PDF** |
| `GET` | `/api/posts` | Public published posts feed |
| `GET` | `/api/admin/posts` | **Public read** — posts for the public site |
| `GET` | `/api/admin/gallery` | **Public read** — gallery images ordered by `display_order` |
| `GET` | `/api/reviews` | **Public read** — published reviews, and the real average computed from them or nothing at all (§43.1) |
| `POST` | `/api/reviews` | Submit an eligible stay review; publication and eligibility are checked server-side |
| `POST` | `/api/waitlist` | Join the sold-out waitlist: name + one contact + the exact nights that failed (§43.2) |
| `GET`/`POST`/`DELETE` | `/api/guest/room-session` | Validate/open or close a **room session** with no account — the `/room` screen (§42) |
| `GET`/`POST`/`DELETE`/`PATCH` | `/api/guest/auth` | Guest sign-in, sign-out, account recovery and security actions (per-device `guest_sessions`) |
| `GET`/`POST` | `/api/guest/activate` | Validate activation and set a password using the invitation code (§41) |
| `GET` | `/api/guest/me` | Who the current guest context resolves to — an account *or* a room session (§40) |
| `GET`/`DELETE` | `/api/guest/sessions` | List or revoke the signed-in guest's device sessions |
| `GET`/`POST` | `/api/guest/orders` | Read or place an order in the current guest context |
| `POST` | `/api/guest/messages` | Send a message in the current guest's private desk thread |
| `POST` | `/api/guest/requests` | Create a service request in the current guest context |
| `POST` | `/api/invitations/request` | Request guest account access/invitation |
| `GET`/`POST` | `/api/invitations/setup` | Validate and complete an invitation setup token |
| `GET`/`POST` | `/api/admin/setup` | Compatibility alias for invitation setup; token-protected, not an admin session endpoint |
| `GET` | `/api/push/config` | Public Web Push configuration (public key only) |
| `POST` | `/api/push/subscribe` and `/api/push/unsubscribe` | Register or remove the current browser's Web Push subscription |
| `GET` | `/api/images/[id]` | Serves a Postgres-stored upload (immutable cache; trailing `.png` etc. tolerated) |
| `GET` | `/api/uploads/[file]` | Serves a legacy `./uploads` file (basename-sanitised, image extensions only) |
| `GET` | `/api/health` | `{ ok, serverTime, timezone: "Africa/Blantyre", localTime }` — DB connectivity probe |
| `GET` | `/api/version` | Serves `public/version.json` for the Android update check. **`?app=admin`** serves `public/version-admin.json` instead (the manager app's own release line); `?app=guest` and any unknown value fall back to the guest file |
| `GET` | `/api/download-zip` | **410 Gone** — the source-code download is deliberately disabled |

### 9.2 Staff / admin endpoints (cookie required)

| Method | Path | Min role | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/login` | — | Session probe (`authed`, `user`) |
| `POST` | `/api/admin/login` | — | Sign in (staff email+password, or legacy `ADMIN_PASSWORD`) |
| `DELETE` | `/api/admin/login` | any session | Sign out / clear cookies |
| `GET` | `/api/admin/bookings` | any session | List all bookings, or `?reference=SM-…` for one booking + events + invoice, or `?q=` free-text search |
| `PATCH` | `/api/admin/bookings` | any session (role-gated fields) | Status change, `assignedRoom`, `assignedStaffId`, `amountPaid`, `add_note`, `email_invoice`, `approve`, `confirm`, `cancel`, `follow_up` |
| `DELETE` | `/api/admin/bookings?id=` | **admin** | Delete a booking (audit snapshot retained) |
| `POST` | `/api/admin/bookings/extend` `{ id, newCheckOut }` | **admin** | Extend a stay and re-price it (§47 — staff gets 403) |
| `GET` | `/api/admin/dashboard` | any session | Revenue + losses: today/week/month, collected, outstanding, cancelled loss, per-staff split |
| `GET` | `/api/admin/reports` | any session | Daily-bookings print/PDF sheet (`text/html`) |
| `GET` | `/api/admin/reports?format=csv` | any session | Revenue CSV download |
| `GET` | `/api/admin/reminders` | any session | Pending / reminder-due / escalation-due lists |
| `POST` | `/api/admin/reminders` | any session | Send the reminder + escalation emails now |
| `GET` | `/api/admin/audit` | any session (read-only) | Read-only audit trail (`?q=`, `?entity=`, `?limit=` ≤ 500). Auditors read it; nobody writes it |
| `GET` | `/api/admin/invoices` | any session | List invoices |
| `POST` | `/api/admin/invoices` | **admin** | Create a manual invoice |
| `POST` | `/api/admin/gallery` | **admin** | Add a gallery image |
| `DELETE` | `/api/admin/gallery?id=` | **admin** | Remove a gallery image |
| `POST` | `/api/admin/posts` | **admin** | Publish a post |
| `PATCH` | `/api/admin/posts` | **admin** | Activate / deactivate a post |
| `DELETE` | `/api/admin/posts?id=` | **admin** | Delete a post |
| `POST` | `/api/upload` | any session | **Preferred** image upload → Vercel Blob, else Postgres (`storage: "blob" \| "database"`), images ≤ 5 MB |
| `POST` | `/api/admin/upload` | **admin** | Legacy upload → `./uploads` (ephemeral on Vercel), images ≤ 8 MB |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/admin/rooms` | **admin** | List / add / edit / hide-or-remove rooms and services |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/admin/staff` | **admin** | List / create / update (role, active, reset+email password) / remove staff |
| `POST` | `/api/admin/send-notification` | **admin** | FCM broadcast to topic `all_users` (`dryRun: true` validates only) |

### 9.3 Desk endpoints (cookie required — staff and admin, or auditor for reads)

Every one of these goes through `deskActor()`; a write as an `auditor` returns **403**. Where
`requireAdmin()` is noted, a `staff` session also gets **403** (§8.3, §47).

| Method | Path | Min role | Purpose |
|---|---|---|---|
| `GET` | `/api/desk/overview` | any session | The Today board: arrivals, departures, in-house, deposits at risk |
| `GET` | `/api/desk/rooms` | any session | Room map with housekeeping states and today's movement |
| `PATCH` | `/api/desk/rooms` | staff | Change a room's state, or assign/reassign a booking — **validated** against out-of-order, **dirty** and overlapping stays, and audited |
| `GET`/`POST` | `/api/desk/room-sessions` | staff | List sessions · open one, rotate its PIN, or close a device / the whole room |
| `POST` | `/api/desk/stay` `action=check_in \| check_out \| no_show` | staff | The stay lifecycle — opens and closes the room session (§42.1) |
| `GET`/`POST` | `/api/desk/orders` | staff | The order board; advance or cancel an order |
| `GET`/`POST` | `/api/desk/issues` | staff | The message queue grouped by room; reply, set status, escalate |
| `GET`/`POST` | `/api/desk/tasks` | staff | Housekeeping and service tasks; assign and complete |
| `GET`/`POST` | `/api/desk/menu` | staff | Read dishes; **close one as sold out** or reopen it (§48) |
| `GET`/`POST` | `/api/desk/payments` | `record_cash` — staff · `verify`/`reject` — **admin** | Cash taken at the counter is staff work; verifying a *claimed* payment is not |
| `GET`/`POST` | `/api/desk/folios` | read — any session · `add_charge`/`void_item`/`regenerate_invoice` — **admin** | The room bill and the invoice built from it |
| `GET`/`POST` | `/api/desk/guests` | `invite`/`resend`/`activate_at_desk` — staff · `set_status`/`set_consent` — **admin** | The guest CRM and accounts |
| `GET`/`POST` | `/api/desk/reviews` | `add`/`notify_waitlist` — staff · `moderate` — **admin** | Reviews and the sold-out waitlist (§43) |

### 9.4 Additional route families and operational endpoints

The tables above describe the main guest and desk workflows. These additional route files are also
part of the deployed system; their `route.ts` files define the exact methods, validation and access
rules. Do not infer authorization solely from an `/api/admin/` prefix: each handler owns its gate.

| Family | Paths | Purpose / access notes |
|---|---|---|
| Admin booking operations | `/api/admin/calendar`, `/api/admin/bookings/extend`, `/api/admin/guests/[id]` | Calendar data/updates, stay extension, and a guest record; protected by staff/admin checks in each handler |
| Admin finance and close | `/api/admin/expenses`, `/api/admin/night-audit` | Expense records and the daily close/report; manager actions require admin authorization |
| Admin room operations | `/api/admin/housekeeping`, `/api/admin/room-blocks` | Housekeeping management and dated inventory blocks; protected operational handlers |
| Admin identity | `/api/admin/invitations`, `/api/admin/invite`, `/api/admin/invite/bulk` | Staff invitations; creation and changes are admin-gated |
| Admin diagnostics | `/api/admin/audit-logs`, `/api/admin/email-test`, `/api/admin/push-test` | Audit viewing and integration checks; authenticated, with role requirements defined in each handler |
| Scheduled job | `GET /api/cron/availability-digest` | Scheduled availability notification; schedule is configured in `vercel.json` |
| Health and deployment checks | `GET /api/health`, `/api/version`, `/api/debug/cache-check`, `/api/debug/live-check` | Runtime health, app update metadata and deployment/cache probes; debug routes are diagnostic, not business APIs |
| Stored media | `GET /api/images/[id]`, `/api/uploads/[file]` | Serve database-backed or legacy local uploads; local filesystem uploads are not durable on Vercel |
| Retired download | `GET /api/download-zip` | Returns `410 Gone`; source download is intentionally disabled |

---

## 10. Notifications: email, WhatsApp and app push

### 10.1 Email (SMTP via nodemailer, `src/lib/mail.ts`)

`sendMail()` returns `{ sent: false, reason }` instead of throwing when SMTP is unconfigured, so a
missing mailbox **never** breaks a booking. Templates in the same file:

| Template | Sent to | Carries |
|---|---|---|
| `guestEmailHtml` | Guest | Booking summary, totals/balance, extras, the **track link**, payment channels |
| `adminAlertHtml` | Staff alerts | "New booking to review" — guest contact, room, dates, invoice, total, extras, arrival, requests, `/admin` link |
| `staffCredentialsHtml` | New/updated staff | Login email, password, staff ID, role and the portal URL |
| Inline status emails | Guest | Approved / confirmed / cancelled / follow-up ("track it here…") |
| Reminder + escalation emails | Assignee + `ADMIN_EMAIL` | "Action required" and "ESCALATED" |

`publicBaseUrl()` decides which domain goes into links: `PUBLIC_APP_URL` → `NEXT_PUBLIC_APP_URL` →
the request host — and it never emits `localhost` on Vercel, so guests never receive dead links.

#### Which mailbox it sends from

`.env` ships the Gmail recipe — the one setup that needs no domain of your own:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=gracekuruneru@gmail.com
SMTP_PASS=<16-character Google App Password, display spaces REMOVED>
SMTP_FROM="Sunrise Motel <gracekuruneru@gmail.com>"
ADMIN_EMAIL=gracekuruneru@gmail.com
```

An App Password requires 2-Step Verification on that Google account, and SMTP AUTH **rejects** the
`abcd efgh ijkl mnop` form Google shows you — paste the 16 characters with no spaces. `SMTP_FROM`
must be the same address as `SMTP_USER` (or a verified alias in Gmail), otherwise Gmail rewrites
the sender.

Check it any time with `node scripts/verify-email-smtp.mjs`: it reads `.env`, prints the settings
with the password masked, then sends four real emails through the app's own `src/lib/mail.ts` —
plain `sendMail`, the guest template, an invoice **with a PDF attachment**, and the
staff-credentials template — plus a raw SMTP transcript, so Gmail's own `250 … accepted` line is
visible. `--to you@example.com` sends the batch to another address, `--dry` checks the
configuration without sending anything. In the portal the equivalent is **Admin → Send test
email** (`POST /api/admin/email-test`), which mails the signed-in account's own address.

Production needs the same values in Vercel → Project → Settings → Environment Variables; without
them `sendMail()` honestly reports "Email is not configured" and no mail leaves the site.

### 10.2 WhatsApp

There is **no WhatsApp API integration**. The system uses `wa.me` deep links with pre-written
messages: guest chat from the home page, the booking confirmation screen, the tracking page, and
the portal's "WhatsApp the guest" / "Send link on WhatsApp" buttons. `STAFF_WHATSAPP_GROUP` records
a `whatsapp_queued` timeline event so the staff know a message was prompted.

### 10.3 App push (Firebase Cloud Messaging HTTP v1)

* `src/lib/fcm.ts` mints a Google OAuth2 access token from the service-account JSON with a
  hand-rolled **RS256 JWT** (no `firebase-admin` dependency) and POSTs the message to
  `https://fcm.googleapis.com/v1/projects/<projectId>/messages:send`.
* Topic: **`all_users`** — the Android app subscribes every install, so one call reaches everyone,
  including app-closed devices.
* `POST /api/admin/send-notification` accepts `{ title, body, url, imageUrl, dryRun }`.
  * `dryRun: true` sends `validate_only` — proves the key/project/API work **without notifying
    anyone** (the "Test configuration" button).
  * Without `FIREBASE_SERVICE_ACCOUNT_JSON` the route answers `{ queued: true, delivered: false,
    reason: "Firebase not configured…" }` so the UI never lies about a send.
  * Every attempt (send, test, failure) is written to `audit_log` as
    `notification.broadcast` / `notification.test` / `notification.failed`.

---

## 11. Images and uploads

Two upload paths exist; the app uses the first, the second is legacy:

1. **`POST /api/upload`** (requires a session, ≤ 5 MB, images only) — used by the shared
   `ImageUploader` component (drag & drop or file picker, live preview, progress bar).
   * If `BLOB_READ_WRITE_TOKEN` is set → the file goes to **Vercel Blob** and the response contains
     a public CDN URL (`storage: "blob"`).
   * Otherwise — or if the Blob call fails — the bytes are stored **base64 in
     `uploaded_images`** and served by `GET /api/images/[id]` with
     `Cache-Control: public, max-age=31536000, immutable` (`storage: "database"`).
   * Either way the admin always gets a URL back, on Vercel, on the tunnel and locally.
2. **`POST /api/admin/upload`** (legacy) — writes into `./uploads` and serves via
   `/api/uploads/[file]`. On Vercel that directory is **wiped on every deploy**, so prefer path 1.

Seed/hero photography lives in `public/images/` and is always available. The gallery, room cards,
posts and push notifications all accept either a `public/…` path, a Blob URL, a `/api/images/<id>`
URL, or any external URL.

### 11.1 The image standard, now enforced in code (addendum "Navigation Structure & Image Usage Standards", Part 5)

`src/components/safe-image.tsx` is the only way a photograph is rendered on the public site and in
the guest app. It enforces, in one place, everything the image standard asks for:

| Rule | How it is enforced |
|---|---|
| Real alt text, describing the scene | `alt` is a **required** prop; the admin portal asks for it when a picture is added |
| Explicit width and height | `width`/`height` are passed, so nothing shifts while a page loads |
| Lazy below the fold, eager for the hero | `loading="lazy"` by default, `priority` (eager + `fetchPriority="high"`) for the one hero image |
| Never a broken-image icon | A failed or missing source renders the `.img-placeholder` tile instead (Part 5.9) |
| One strong hero, not a carousel | The home page hero is a single `<img class="hero-photo-img">` |

`GET /api/posts` is the public feed ("what's on"). It returns **only** `is_active` rows, so pausing a
post in the manager portal removes it from the website **and** from the guest app at the same moment.
Writing stays admin-only at `/api/admin/posts`.

**Proving the media flow works.** `npm run verify:media` (→ `scripts/verify-media-flow.mjs`) signs in,
uploads a real file to `/api/upload`, adds it to the gallery **with alt text**, publishes a post that
uses it, reads the public feed back to confirm the image survived, then deletes both again. It needs a
running server (`http://127.0.0.1:3112` by default, pass a URL to override) and prints one
PASS/FAIL line per step:

```
PASS  Manager sign-in — HTTP 200
PASS  Image upload (/api/upload) — HTTP 201 · database · /api/images/<uuid>
PASS  Gallery add (/api/admin/gallery) — HTTP 201
PASS  Alt text stored with the picture — "Sunrise Motel courtyard with garden seating…"
PASS  Post publish (/api/admin/posts) — HTTP 201
PASS  Post appears in the public feed (/api/posts) — image: /api/images/<uuid>
PASS  Feed image is the uploaded file, not a placeholder
PASS  Post delete — HTTP 200
PASS  Gallery image delete — HTTP 200
PASS  Feed is clean again
10/10 checks passed.
```

> The uploaded bytes themselves stay in `uploaded_images` after the gallery row is deleted: there is
> no garbage collection for orphaned uploads yet (§52).

---

## 12. Mobile: the PWA and the two Android apps

### 12.1 Progressive Web App (all phones)

* `public/manifest.json` — name, short name, `start_url: /`, `display: standalone`, portrait,
  theme colour `#D4A017`, 192/512 px icons (one maskable).
* `public/manifest-admin.json` — the **manager** manifest: name `Sunrise Manager`,
  `start_url: /admin`, `scope: /admin`, charcoal `#171513` theme. It is attached by
  `src/app/admin/layout.tsx`, so installing the portal from a phone puts *Sunrise Manager* on the
  home screen opening straight at the portal — not the guest app's name and the public landing page.
* `public/sw.js` + `ServiceWorkerRegister` — registers the worker, listens for a new deploy and
  offers the update as a designed card (`sw-update` in `globals.css`): the version as a badge, the
  changelog as a checked list under a Georgia headline, **Update now / Later** and a close X. It is
  anchored to the bottom and **never blocks the page** — an update is not worth interrupting a
  booking — and **Update now** is the only thing that reloads (posts `SKIP_WAITING`, then refreshes).
  It is real JSX rather than an inline-styled `innerHTML` string, so it uses the same cream/gold
  sheet as the install popup and cannot drift from it.
* **`public/sw.js` never caches live data.** `/api/` is handed straight back to the browser
  (`respondWith` is deliberately *not* called), because a cached availability answer is a wrong
  answer — it shows a room as taken after it is free again, and, the query string being the cache
  key, it outlives every deploy. Navigations stay network-first with the cached shell as the offline
  fallback, and **only** a `res.ok` basic response is ever stored, so one failed fetch can no longer
  become a permanent broken asset, an error page served as the site, or a sticky "Rooms are
  loading…". The cache version was bumped (`sunrise-motel-v3`) so bad entries are dropped on
  activate; availability and the other live reads also pass `cache: "no-store"`.
* **`npm run verify:sw`** (→ `scripts/verify-service-worker.mjs`) proves the rules above without a
  browser: it loads the shipped `sw.js` with stubbed `self` / `caches` / `fetch` and prints one
  PASS/FAIL line per case — `/api/` is *not* claimed, the shell and immutable assets *are*, and a
  500 or an opaque response is never stored. Re-run it after any change to `public/sw.js`.
* **`npm run verify:update-card`** (→ `scripts/verify-update-card.mjs`) is the browser half of the same
  check, because the update card only exists *after* a worker is deployed — it is never in the server
  HTML, so no static check can see it. It drives the installed Chrome/Edge over the DevTools Protocol
  (no Playwright, no new dependency), appends one comment to `public/sw.js` to simulate a deploy, and
  measures what a guest sees: the card appears, stays ≥ 4 s, is hit-tested where it says it is, offers
  four changelog lines plus **Update now / Later**, defers without reloading, comes back on the next
  visit, and applies on tap. Screenshots land in `docs/evidence/`. It found and now guards a real bug:
  `install` must **not** call `skipWaiting()`, or the new worker claims the page and the page reloads
  itself mid-booking before the card can paint (measured at 1,544 ms).
* **One email + one phone = one guest.** `src/lib/phone.ts` holds the only rule for what a phone number
  is: **nine significant digits** (so `0888 123 456`, `+265 888 123 456` and `888123456` are one person),
  canonicalised to `+265…`, and `null` for something that is not a number at all — two bookings that both
  say `n/a` are *not* the same guest. `findOrCreateGuest` (`src/lib/hotel.ts`) matches on
  `right(regexp_replace(phone,'[^0-9]','','g'),9)` **in SQL**, so rows saved before the rule still match,
  and rewrites a legacy spelling in place. The rule is enforced by the database too (migration
  `0007_nasty_cannonball.sql`): `guests_email_identity_unique` on `lower(email)` and
  `guests_phone_identity_unique` on the same nine digits, both partial so an empty email or an
  unusable phone never collides with itself. `POST /api/bookings` resolves the guest **before** it
  writes the booking and stores `guestId`, and `/review` and `/invite` use the same helper instead of
  their own copies.
* **`npm run verify:identity`** (→ `scripts/verify-guest-identity.mjs`) is the proof for the paragraph
  above: it imports the **real** `src/lib/phone.ts` (Node 24 runs TypeScript directly, no build step),
  asserts 38 cases — eight spellings of one Malawian number collapsing to one key, distinct numbers
  staying distinct, `n/a` and blank having no key, the desk's last-6 habit, email casing — then reads the
  live database **read-only** to report any guest identities that are already split and proves the SQL
  key equals the code's key. It only writes when you pass `--apply`, and it refuses to add the unique
  indexes while duplicates exist. That is how migration 0007 was applied safely.

* `InstallAppPopup` — appears ~3 s after load only when the browser fires `beforeinstallprompt`
  (and never inside either Android wrapper or when already installed). *Install Now* calls the
  native prompt; "Not now" suppresses it for 7 days; `?install=1` forces it for testing.
* `AppDownloadBanner` — a slim Android-only banner linking to `/download`.
* `src/lib/app-user-agent.ts` — one place that answers *"are we already inside one of our apps?"*.
  Both wrappers stamp their name onto the WebView user agent (`SunriseMotelApp/1.3`,
  `SunriseManagerApp/1.0`) and `inSunriseApp(ua)` reads that marker, so no install prompt is ever
  shown from inside an app.
* `layout.tsx` wires the manifest, theme colour, icons, OpenGraph and the service worker.

### 12.2 Android app (`SunriseMotelApp/`) — the guest app

A **WebView-only wrapper** — there is *no* booking logic inside the app, so any website change
appears in the app immediately.

* The site URL lives in exactly one place: `app/build.gradle.kts` → `buildConfigField BASE_URL`
  (currently `https://sunrise-motel.vercel.app`). **Never point it at a `trycloudflare.com` URL** —
  those expire on restart.
* `MainActivity.kt` provides: progress bar, pull-to-refresh, back-button navigation, offline view,
  file chooser (for admin photo upload), geolocation permission, downloads, and the FCM topic
  subscription to `all_users`.
* **In-app updates:** the app polls `GET /api/version` (backed by `public/version.json`) and, when
  `latestVersionCode` is higher than the installed code, offers **Update Now**. It downloads the
  APK with `DownloadManager` and fires the system installer from a `FileProvider` — no browser, no
  file-manager hunting. `forceUpdate` and `whatsNew[]` control blocking vs. informational prompts.
* **Signing:** one keystore forever (the `.jks` is gitignored and restored in CI from the
  `KEYSTORE_BASE64` secret). Same `applicationId com.sunrisemotel.app` + same signature means
  Android shows **"Updating…"** instead of installing a duplicate icon. `versionCode` increments
  every release (currently **4 / "1.3"**).

### 12.3 Android app (`SunriseAdminApp/`) — "Sunrise Manager"

The same wrapper aimed at the desk: the signed-in portal on the home screen, one tap away.

| | Guest app | Manager app |
|---|---|---|
| Folder | `SunriseMotelApp/` | `SunriseAdminApp/` |
| `applicationId` | `com.sunrisemotel.app` | `com.sunrisemotel.admin` |
| Launcher label | Sunrise Motel | Sunrise Manager |
| Opens | `BASE_URL` (`/`) | `BASE_URL` + `START_PATH` (`/admin`) |
| User-agent marker | `SunriseMotelApp/1.3` | `SunriseManagerApp/1.0` |
| Version truth | `/api/version` → `public/version.json` | `/api/version?app=admin` → `public/version-admin.json` |
| Version now | **4 / "1.3"** | **1 / "1.0"** |
| Push (FCM) | yes — topic `all_users` | **no** (deliberately) |
| Keystore | `SunriseMotelApp/sunrise-motel-release.jks` | the *same* file, by relative path |

* Two different `applicationId`s mean two icons that install side by side and update independently;
  they can safely share one signing key, because Android treats them as unrelated apps.
* The keystore is referenced, not copied — `app/build.gradle.kts` → `file("../../SunriseMotelApp/
  sunrise-motel-release.jks")` (Gradle's `file()` is module-relative) — so CI restores one secret
  and both projects are signed from it.
* **No Firebase in the manager app on purpose.** The portal has its own notification page, and a
  manager build would need its own Firebase Android app plus a `google-services.json` containing
  `com.sunrisemotel.admin` — the plugin fails hard when the config has no matching package. See
  `SunriseAdminApp/README.md` for exactly what to add if staff push is ever wanted.
* Permissions are `INTERNET` and `ACCESS_NETWORK_STATE` only — no location, no camera, no contacts.
  Photo uploads go through the system file chooser, which hands back one file at a time.

### 12.4 CI — both APKs from one job

`.github/workflows/build-apk.yml` runs on any change under `SunriseMotelApp/`, `SunriseAdminApp/` or
the workflow itself; it restores `google-services.json` (secret `GOOGLE_SERVICES_JSON`, guest app
only) and the keystore, builds `assembleRelease` **in both projects**, renames the outputs to
`SunriseMotel.apk` and `SunriseManager.apk`, uploads both as artifacts and attaches both to the
GitHub Release — which is exactly the URLs `/download` uses. If you ever move the Android build off
CI: nothing needs Gradle or the SDK installed locally, and in fact neither is installed on this PC.

---

## 13. Money, time and pricing rules

### 13.1 Money

* Every monetary value is an **integer number of MWK** (no decimals, no floats) — in the DB, the
  API payloads and the PDF.
* `calculateStayQuote()` in `src/lib/pricing.ts` is the shared stay-pricing path for room
  availability, the booking form and booking submission. It applies the selected nightly rates,
  date/guest rules, discounts, extras and the room's configured VAT rate. `calculateVat()` handles
  VAT-inclusive prices (extracting VAT without changing the gross) and VAT-exclusive prices
  (adding VAT to the net). Booking submission recalculates the quote server-side.
* The **nightly rate is snapshotted** onto the booking, so raising a room's rate in *Rooms* never
  rewrites history — only *new* bookings get the new price.
* The default VAT rate for new rooms is **17.5%** (1,750 basis points); room-specific rates remain
  configurable and are snapshotted onto invoices with the VAT-inclusive/exclusive mode.
* Recording a full payment automatically flips the booking to `confirmed` and the invoice from
  `proforma`/`sent` to `paid`. The generated PDF is a **payment confirmation**, not an MRA tax
  invoice or fiscal receipt; the tracking page uses the same distinction. The app must not claim
  MRA EIS integration unless that integration is configured and verified.

### 13.2 Time (Africa/Blantyre)

Malawi is **UTC+2 with no daylight saving**. `src/lib/time.ts` is the single source of truth:

| Helper | Returns |
|---|---|
| `nowDate()` | Current `Date` (UTC underneath) — what gets stored |
| `malawiDatePart()` / `malawiShortDate()` / `malawiYear()` | `2026-09-26`, `260926`, `2026` — used in references and invoice numbers |
| `formatMalawi(iso, { withYear, withSeconds })` | `26 Sep 10:04` / `26 Sep 2026 10:04` (portal shows it with a `CAT` suffix) |
| `formatMalawiDate()` | `26 Sep 2026` — invoice / PDF dates |
| `malawiStamp()` | `26 Sep 2026, 10:04 CAT` — PDF footer |
| `toISO()` | ISO instant for DB/API payloads |

Bookings store `check_in` / `check_out` as plain `YYYY-MM-DD` calendar strings and count nights at
noon UTC — immune to timezone/DST drift. All DB timestamps are `timestamptz` (true instants) and
are formatted in Malawi time for display.

---

## 14. Security, sessions and audit

### 14.1 Passwords

* `src/lib/password.ts` uses **scrypt** (`node:crypto`, 64-byte derived key) with a 64-hex-character
  random salt per user, compared with `timingSafeEqual`.
* `generatePassword()` produces readable-but-strong starter passwords (`Sunrise-Kp7q-4821`) with
  ambiguous characters (0/O, 1/l/I) deliberately excluded, so an admin can also dictate one over the
  phone. Passwords are never stored or logged in plain text.

### 14.2 Sessions

* On sign-in the server base64url-encodes `{ id, staffCode, name, email, role }` into the
  **`sunrise_session`** cookie: `httpOnly`, `SameSite=Lax`, `path=/`, **12-hour** lifetime.
* **The cookie is signed** (Part D, §47): the value is `<payload>.<hmac-sha256(payload, secret)>`.
  A cookie that is unsigned, truncated or signed with the wrong key is **refused outright** — the
  session is treated as absent. `readSession` compares the signature with a **constant-time**
  comparison, and the reader for the legacy `sunrise_admin` marker verifies a signature too, instead
  of trusting a bare `=1`.
* The signing key is `SESSION_SECRET`, falling back to `ADMIN_PASSWORD`, then to a local
  development default — see §15 and Part D §47.
* Roles are `admin` · `staff` · `auditor`. `sessionLabel` renders the human label used in the audit
  trail and on the desk identity strip: `Staff STF002 — Kondwani Phiri`, `Admin — …`,
  `Auditor STF002 — …`.
* Role checks happen **server-side in every mutating route** — hiding a button in the UI is only
  cosmetic. Staff attempts to touch money / room / delete fields get `403`, and `requireAdmin` is the
  one helper every admin-only action calls.
* ⚠️ **Signing the cookie changed its format.** Every staff member, admin and auditor must sign in
  once more after this change is deployed; there is no migration for an old unsigned cookie. Guest
  sessions are unaffected — guest auth (`guest_sessions`, activation tokens, the no-account room
  session) does not use `src/lib/staff-auth.ts`.

### 14.3 Audit trail

Every meaningful action lands in `audit_log` (append-only) with a human summary, actor, actor label
(e.g. `STF002 — Kondwani Phiri`), client IP (from `x-forwarded-for` / `x-real-ip`) and metadata:
bookings created / updated / cancelled / deleted / extended / reminded / escalated, payments
recorded, invoices created and emailed, gallery and post changes, uploads, logins / logouts /
failures, and every push attempt. The portal can search it, filter it by entity and export it to
CSV — but **cannot edit or delete it**. Guest-visible history lives separately in
`booking_events`, so internal manager notes never leak to the tracking page.

---

## 15. Environment variables

Copy `.env.vercel.example` for a deploy checklist. `.env` is gitignored — never commit secrets.

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | **Required** | `postgresql://…` — local `127.0.0.1:5432/sunrise_db`, or a Neon string with `sslmode=require`. `src/db/index.ts` turns SSL on automatically for Neon / Supabase / Render |
| `PUBLIC_APP_URL` | Emails / links | Public domain used in guest track links and portal links. **Not** `NEXT_PUBLIC_`, so it stays server-side |
| `NEXT_PUBLIC_APP_URL` | Fallback | Set it to the same value |
| `ADMIN_PASSWORD` | Legacy login | The password-only manager sign-in; treated as an admin |
| `SESSION_SECRET` | **Recommended** | The HMAC key that signs the `sunrise_session` cookie (Part D §47). Falls back to `ADMIN_PASSWORD`, then to a local dev default. Set it to a long random string so that changing `ADMIN_PASSWORD` does not silently invalidate every session |
| `ADMIN_EMAIL` | Alerts | Receives new-booking alerts, reminders and escalations |
| `STAFF_NOTIFY_EMAILS` | Alerts | Comma-separated extra recipients for new-booking alerts |
| `STAFF_WHATSAPP_GROUP` | Timeline note | Records a `whatsapp_queued` event when a booking arrives |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Email | Without these, `sendMail()` politely reports "SMTP is not configured" — PDFs remain downloadable and shareable |
| `SMTP_FROM` / `FROM_NAME` + `FROM_EMAIL` | Email | Sender identity |
| `BLOB_READ_WRITE_TOKEN` | Uploads | Optional — uploads fall back to Postgres without it |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | App push | The **whole** service-account JSON pasted as-is |
| `FIREBASE_PROJECT_ID` | App push | e.g. `sunrise-motel`; recommended so a bad paste reports the real FCM error |
| `PG_POOL_MAX` | Optional | Postgres pool size (default 10) |
| `NEON_DATABASE_URL`, `NEON_DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, `NEON_PROJECT_ID` | CLI tooling | Staff login utility can target Neon with `--db neon` |

---

## 16. Running it locally (Windows)

### 16.1 Package scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `next dev` | Development server |
| `npm run build` | `next build` | Production build |
| `npm start` | `next start` | Serve the production build |
| `npm run lint` | `eslint .` | Lint |
| `npm run typecheck` | `tsc --noEmit` | Type check |
| `npm run vercel-build` | `npx drizzle-kit migrate --config=drizzle.config.ts && next build` | What Vercel runs |

The staff login utility is a direct Node command, not an npm script: `node --no-warnings
scripts/staff-login.mjs`. See §18.2 for flags and safe use.

### 16.2 First-time setup

```powershell
cd c:\Users\datcom3\Documents\sunraisehotles
npm install

# 1) Local PostgreSQL (once) — already installed on this PC as service postgresql-x64-17
$env:PGPASSWORD='postgres'; $env:PAGER='cat'
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -U postgres -P pager=off -c 'CREATE DATABASE sunrise_db;'

# 2) .env must contain:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sunrise_db

# 3) Create the tables
npx drizzle-kit generate   # writes ./drizzle/*.sql from src/db/schema.ts (only after schema changes)
npx drizzle-kit migrate    # applies them to sunrise_db
```

### 16.3 Every-day run

```powershell
npm run dev                      # package.json pins --port 3112 — the ONE dev port
# open http://localhost:3112        health: http://localhost:3112/api/health  →  { "ok": true }
```

Clean seed data appears on the first `/api/availability` hit (§4.11). Port 3112 must be free — if a
previous server lingers:

```powershell
Get-NetTCPConnection -LocalPort 3112 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

### 16.4 End-to-end smoke test (PowerShell)

```powershell
# Availability for a window
Invoke-RestMethod 'http://localhost:3112/api/availability?checkIn=2026-10-01&checkOut=2026-10-03'

# Create a booking (see RUN_LOCALLY.md for the full payload)
$b = @{ roomTypeId='standard'; checkIn='2026-10-10'; checkOut='2026-10-12'; guestName='Test Guest'; phone='+265991000000'; adults=2 } | ConvertTo-Json
$r = Invoke-RestMethod -Uri http://localhost:3112/api/bookings -Method POST -Body $b -ContentType 'application/json'
$r.booking.reference          # SM-…

# Track it (reference + phone)
$t = @{ reference=$r.booking.reference; phone='+265991000000' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3112/api/track -Method POST -Body $t -ContentType 'application/json'

# Download the pro-forma PDF
Invoke-WebRequest -Uri ("http://localhost:3112/api/invoices/" + $r.booking.reference) -OutFile invoice.pdf
```

### 16.5 Sharing a local server temporarily

`powershell -ExecutionPolicy Bypass -File ./share-tunnel.ps1` starts a Cloudflare quick tunnel
(downloading `bin/cloudflared.exe` on first use) in front of `127.0.0.1:3112`. To keep email links
correct while sharing, set `PUBLIC_APP_URL` to the tunnel URL in `.env` and restart. **Tunnel URLs
expire** — never bake one into the Android app.

---

## 17. Deploying (Vercel + Neon)

1. **Push** the repo to GitHub (**already set up**: `origin → charitykuruneru-byte/sunrise-motel`, branch `main`).
2. **Create the database** on [Neon](https://neon.tech) and copy the connection string
   (`…?sslmode=require`).
3. **Migrate** it once from your PC:
   ```powershell
   $env:DATABASE_URL='<neon-string>'; npx drizzle-kit migrate
   ```
   (On every later deploy the `vercel-build` script re-runs `drizzle-kit migrate` automatically, so
   new tables such as `uploaded_images` are applied before `next build`.)
4. **Import the repo** at [vercel.com/new](https://vercel.com/new) and add the environment
   variables from §15 (`DATABASE_URL`, `PUBLIC_APP_URL` + `NEXT_PUBLIC_APP_URL`,
   `ADMIN_PASSWORD`, SMTP block, `ADMIN_EMAIL`, `BLOB_READ_WRITE_TOKEN`, Firebase JSON, `PG_POOL_MAX`).
5. **Deploy**, then verify `https://<app>.vercel.app/api/health` → `{"ok":true}` and that signing in
   at `/admin` works.
6. **Android updates:** bump `versionCode`/`versionName` in the app you are releasing and its version
   file, push, and let the *Build APK* workflow publish the release the app then auto-detects.
   * Guest app → `SunriseMotelApp/app/build.gradle.kts` **and** `public/version.json`
   * Manager app → `SunriseAdminApp/app/build.gradle.kts` **and** `public/version-admin.json`
   The two are independent: bumping one never prompts the other, because each app polls its own
   `GET /api/version` (`?app=admin` for the manager).

`vercel.json` pins the framework to `nextjs` and the region to `iad1`.

---

## 18. Staff onboarding

**Chicken-and-egg first login:** if nobody can sign in yet, use `ADMIN_PASSWORD` (no email needed)
or create the first account with the CLI.

### 18.1 From the portal (admin only) — preferred

`/admin` → **Staff** tab → fill name, email, phone, role, then either type a password or tick
*"Email these login details to the new user"* (a strong password is generated and emailed). Later
use **Email login** to reset and re-send, **Deactivate/Activate** to suspend access, or **Remove**
to delete the account. You cannot deactivate or delete **your own** account, and every one of these
actions is audited.

### 18.2 Direct login utility (`scripts/staff-login.mjs`)

Use this only for initial setup or recovery; normal staff onboarding belongs in the admin portal.
The utility creates or resets a staff login in the configured local database, Neon, or both. It
reads connection strings from `.env` and uses the application's password hashing and audit log.

```powershell
# Preview first; --db defaults to both configured databases
node --no-warnings scripts/staff-login.mjs --email you@example.com --password 'replace-with-a-strong-password' --role admin --dry-run

# Apply to the intended target after reviewing the preview
node --no-warnings scripts/staff-login.mjs --email you@example.com --password 'replace-with-a-strong-password' --role admin --db local
```

Supported role values are `super_admin`, `admin`, `motel_manager`, `restaurant_manager`, `staff`
and `auditor`; `--db` accepts `local`, `neon` or `both`. The password is a command-line argument,
so avoid running the command in a shared terminal or a shell whose history is exposed. The utility
does not send an invitation email; use the portal's invitation workflow for routine onboarding.

---

## 19. Troubleshooting / FAQ

| Symptom | Cause & fix |
|---|---|
| `/api/health` returns `{"ok":false}` or the site errors on load | `DATABASE_URL` missing/wrong, or Postgres not running. Check the connection string and start `postgresql-x64-17` |
| `DATABASE_URL is required` thrown at startup | `.env` is missing or not being read (run commands from the project root) |
| Availability shows every room sold out | Real overlap — check the Bookings tab/filters, or cancel/delete the overlapping bookings |
| "That room type is not available" when booking | The room type is `is_active = false` (hidden in *Rooms*) |
| Booking returns **409 SOLD_OUT** | Genuine race — the last overlapping room was taken inside the lock. Pick other dates |
| Guest never receives the pro-forma email | SMTP not configured or `SMTP_*` wrong; the response's `emailNote` says exactly what happened. The PDF still downloads from the confirmation screen |
| Staff credentials email not received | Same — the API returns `{ emailed: false, reason }`; share the printed password manually over WhatsApp |
| Columns/tables missing after a deploy (`column … does not exist`) | Migrations did not run — `vercel-build` should run `drizzle-kit migrate`; run it manually against the same `DATABASE_URL` |
| Emails contain `localhost` links | Set `PUBLIC_APP_URL` **and** `NEXT_PUBLIC_APP_URL` to the real domain |
| An invitation link opens nothing (a `…trycloudflare.com` address, or any host that does not resolve) | `PUBLIC_APP_URL` still holds an **expired Cloudflare quick tunnel**. Quick tunnels get a new hostname on every restart, so the value must be set back to the live domain as soon as you stop sharing — or replaced with the new tunnel while you share (README §16.5). `src/lib/mail.ts` cannot detect a well-formed host that no longer resolves, so it will faithfully stamp the dead one into every link |
| Uploaded photos vanish after a deploy | They went to `./uploads` via the legacy `/api/admin/upload`. Use the *Pictures* tab (which calls `/api/upload`) so images land in Blob or Postgres |
| "Firebase not configured" in App push | Add `FIREBASE_SERVICE_ACCOUNT_JSON` (+ `FIREBASE_PROJECT_ID`) and redeploy. Use **Test configuration** first — it validates without notifying anyone |
| Push works but no phone buzzes | The installed app must be a build that includes the `firebase-messaging` dependency and `google-services.json` and has subscribed to `all_users` |
| "Update Now" downloads the APK but no install prompt ever appears | The app was missing `REQUEST_INSTALL_PACKAGES`, so Android 8+ refused the installer intent outright (and the failure landed in a log line). Fixed in v1.5 / v1.2 (code 6 / 3). An installed app that predates that update cannot fix itself — uninstall it once and install the new APK. Also confirm Settings → Apps → _Sunrise Motel_ → Install unknown apps is allowed, which the app now asks for itself |
| Android says "App not installed" when installing an update | Signature conflict: the installed copy was built with a different key (e.g. the old debug-signed era). These releases keep the same release keystore; uninstall the old copy once, then install the new APK |
| Android app shows two icons | An APK signed with a different keystore was installed. Same keystore + `applicationId` = "Updating…". Keep the newest, uninstall the old |
| Router cache / page errors during local dev | Stop the server, delete `.next/`, restart |
| "Multiple lockfiles" workspace warning | Already silenced by `turbopack.root` in `next.config.ts` |
| `drizzle-kit generate` produced no changes | The schema did not actually change, or you are pointing at another config — use `--config=drizzle.config.ts` |

---

## 20. Known gaps & recommended hardening

These are honest observations from reading the code — nothing here breaks the guest flow, but each
is worth a decision:

| # | Gap | Impact | Suggested fix |
|---|---|---|---|
| 1 | **Public Dine / Unwind / Connect forms are UI-only** (`/dine` order + table, `/unwind` reservation, `/connect` enquiry simply show a success state) | A guest can believe an order/reservation was recorded when it was not | Either persist them (a small `requests` table + staff alert email) **or** change the copy so it clearly says "we'll continue on WhatsApp" |
| 2 | ~~**Session cookie is base64url-encoded JSON, not signed/HMAC'd** (`src/lib/staff-auth.ts`)~~ | ~~A crafted `sunrise_session` cookie claiming `role: "admin"` would be accepted~~ | ✅ **CLOSED (Part D §47).** The cookie is now HMAC-SHA256 signed and verified with a constant-time comparison; an unsigned or mis-signed cookie is refused. Verified: a forged cookie returns **401** |
| 3 | ~~**Some admin-ish routes have no session check**: `GET`/`POST /api/admin/invoices`, `GET /api/admin/audit`, `POST /api/admin/upload`~~ | ~~Anyone who knows the URL can read the audit trail, list/create invoices, or write files to `./uploads`~~ | ✅ **CLOSED (Part D §47).** All four now require a session: **401** without one. The audit trail stays readable by staff and auditors (read-only roles); invoices and upload require an admin |
| 4 | **The guest's extras amounts are trusted** — the server recomputes `extrasTotal` from the array the client sends (only the nightly rate comes from the DB) | A tampered request could reduce its own total (e.g. claim breakfast at MWK 0). It cannot *raise* the room price or change the room | Price extras server-side from a rate table (breakfast 8 500, transfer 25 000, late check-out 15 000) keyed by an extras ID |
| 5 | **`/api/invoices/[reference]` is public** | Anyone who learns/guesses a reference can download that guest's invoice (guest name, phone, total) | Require the phone (as `/api/track` does), or issue short-lived signed links in emails |
| 6 | ~~**Extend-stay accepts any signed-in session** (no admin gate — the portal shows the button to everyone)~~ | ~~A staff account can change money via extensions~~ | ✅ **CLOSED (Part D §47).** Extend-stay is admin-only: **403** for staff, and the button is no longer rendered for them |
| 7 | **No rate limiting on public endpoints** (`/api/bookings`, `/api/track`) | Booking spam / reference brute force (tracking needs the phone, which limits exposure) | Add a simple IP rate limiter or Vercel WAF rule |
| 8 | **Payments are recorded manually** — there is no gateway or automatic reconciliation | Balances depend on staff diligence (mitigated by the audit trail) | Integrate Airtel Money / bank webhooks and auto-match by `reference` |
| 9 | ~~**The public Dine menu is a hard-coded array on the page**, while the seeded `menu_items` table exists~~ | ~~Editing the DB does not change the visible menu~~ | ✅ **CLOSED (Part D §49–§50).** `/dine` is now a server component that reads `menu_items`, so the desk's **sold out** toggle reaches the guest in the same second. The remaining gap is that there is still no *admin* Menu tab to add a dish or change a price — see Part D §52 |
| 10 | `service_fee`, `discount` and `policy_version` are stored but no UI sets them (discount/service fee are always 0) | Features exist but are unused | Expose them in the admin booking modal if discounts/fees are ever needed |
| 11 | Booking references use 4 random characters from a 32-character alphabet | A rare collision would hit the unique constraint and return a 500 | Retry generation on conflict, or widen the random part |
| 12 | The Android `BASE_URL` is hard-coded to `https://sunrise-motel.vercel.app` (in **both** apps) | Changing the public domain requires rebuilding both apps | Keep the domain stable, or make it configurable/remote |

**How the v2 specification (Part B) and the six addenda (Part D) relate to this list.** Most of these
are now closed:

| Gap | Closed by |
|---|---|
| 2 — unsigned session cookie | ✅ **CLOSED** — Part D §47 (signed sessions), which was Part B §34 **Phase 0** |
| 3 — unguarded admin routes | ✅ **CLOSED** — Part D §47 (the four routes now require a session) |
| 6 — extend-stay open to staff | ✅ **CLOSED** — Part D §47 (admin-only, with the button hidden too) |
| 9 — hard-coded menu | ✅ **CLOSED for the guest, open for the admin** — Part D §49–§50 (`/dine` reads `menu_items`); there is still no admin Menu tab |
| 5 — public invoice PDF | Part B §34 (phone check on the invoice PDF) — **Phase 0** |
| 7 — no rate limiting | Part B §34 (rate limiting on login, booking, tracking, ordering, messaging) — **Phase 0** |
| 8 — manual payment verification | Partly: the `payments` table, the verification queue and auto-confirm are **built** (Part D §51, Part 36). An actual gateway is still open |
| 4 — trusted extras | Part B §25, §31 (every folio line priced from `menu_items` at order time) — **Phase 6** |
| 10 — unused pricing fields | Part B §29.4–§29.5 (dashboard **Settings** tab: deposit %, tax rate, policy version) |
| 1 — Dine / Unwind / Connect forms are UI-only | Superseded by real in-app ordering (Part B §25). `/dine` now shows the live menu and its sold-out state (Part D §49) |
| 11 — reference collision risk | **Not addressed** by v2 or the addenda — remains open |
| 12 — hard-coded Android `BASE_URL` | **Not addressed** — mitigated by keeping the domain stable |

---

## 21. Glossary and contacts

| Term | Meaning |
|---|---|
| **Reference** (`SM-260926-K7P4`) | The guest-facing booking identifier, used for tracking, WhatsApp and payment narration |
| **Booking number** (`BK-2026-0011`) | The sequential human number staff use at the desk |
| **Invoice number** (`INV-2026-4821`) | Pro-forma / receipt number on the PDF |
| **Pro-forma** | The quotation issued at booking — explicitly *not* a payment receipt |
| **Receipt** | The same PDF once `amount_paid ≥ total_amount` ("PAID IN FULL") |
| **Timeline** | The `booking_events` history — shown to guests on `/track` and to staff in the booking modal |
| **Audit log** | The append-only system-wide record in the portal's *Audit trail* tab |
| **Extras** | Optional guest add-ons: breakfast, airport transfer, late check-out |
| **Inventory** | How many sellable rooms exist for a room type (`total_inventory`) |
| **Sold out** | `available = 0` for the requested nights |

**Sunrise Motel** — Area 5, Lilongwe (Mzimba Road, behind Bwasila Secondary School)
Front desk / WhatsApp: **+265 998 688 332**
Payment channels: National Bank of Malawi (Acc 1009876543) · Airtel Money +265 998 688 332 ·
TNM Mpamba +265 888 123 456

**Repository:** `github.com/charitykuruneru-byte/sunrise-motel` (branch `main`)

---

# PART B — v2 specification (planned expansion)

> 🧭 **Status: specified, and partly built.** Part B is the v2 target design. Read it with Part D
> §51, which says section by section what is already live: the guest accounts and the room session
> (Part C), the order board, the message queue, housekeeping tasks, the CRM, folios and the stay
> lifecycle were all built **before** the six addenda were written. What Part B still uniquely owns is
> the **guest app specification itself**, the folio/order/message design, the advanced dashboard tabs,
> the automatic rules in §33 and the build order in §36.
>
> **A part-level badge can no longer describe this system.** The honest unit of status is the
> *feature*, not the part: one column per row, saying live / partial / planned. Part D §51 is written
> that way; this banner is a warning to go and read it.
>
> The v2 shift in one sentence: the system stops being *a booking website with a staff back-office*
> and becomes *a guest platform with a front-desk system behind it* — and that shift has begun.

**What v2 adds**

| Area | Live today (Part A) | Specified for v2 (Part B) |
|---|---|---|
| Guest identity | No accounts — reference + phone only | Optional guest accounts created by the front desk, with reference+phone retained as a first-class mode (§23) |
| Guest app | Public website + PWA + Android wrapper | Signed-in guest app: room number, folio, ordering, messaging, quick requests (§24) |
| Money | One invoice per booking, typed once | A running room bill (`folio_items`); the invoice is generated from the folio (§25) |
| Contact with the desk | WhatsApp deep links | Private one-to-one message threads with SLA, escalation and room context (§26) |
| Housekeeping | None | `service_tasks` per room, driving room state and out-of-order (§27) |
| Push | One broadcast topic `all_users` | Per-device guest push + consented broadcast (§28) |
| Admin dashboard | A stat strip and tabs | Action centre, KPIs (occupancy / ADR / RevPAR), room map, charts, scheduled reports, CRM, settings (§29) |
| Roles | `admin`, `staff` | Adds **`auditor`** — read everything, change nothing (§22) |

---

## 22. Who uses the system in v2 🧭

| Who | How they get in | What they can do |
|---|---|---|
| **Guest with an account** | Email + password in the app, created from a link the front desk sends | See their room, folio and invoice; order food and room service; message the desk privately; request housekeeping or maintenance; get push notifications; express check-out; rebook |
| **Guest without an account** | Nothing — reference + phone on `/track`, or a phone call | Everything Part A allows: book, track, pay, download the pro-forma |
| **Front desk (staff)** | Email + password at `/admin` | Arrivals board, room assignment, payment verification, order board, issue queue, guest account creation |
| **Admin (manager)** | Email + password, or the break-glass `ADMIN_PASSWORD` | Everything staff can do, plus money, rates, staff accounts, deletion, reports, the full dashboard and push broadcasts |
| **Auditor (new role)** | Email + password | Read everything, change nothing |

**Why the guest account is optional:** not every walk-in at Area 5 has an email address, and not every
guest will install anything. Making the account mandatory would lock out paying customers. Making it
*attractive* is how adoption happens.

**Effect on Part A's permission matrix (§8.3):** 🧭 `auditor` reads bookings, folios, invoices, orders,
threads, tasks, the audit trail and reports, but every write returns 403 and no action button is
rendered. `staff` gains the order board, the issue queue and guest-account creation, and loses nothing.

---

## 23. The guest account lifecycle — the new flow 🧭

This is the intended flow, completed so that the cases which break it are handled.

### 23.1 The main path

```
 1  Guest arrives / books and gives an email
 2  Front desk taps "Register + show password" and types the email
 3  System finds or creates the guest record
 4  System CHOOSES the password and switches the account on
 5  The credentials card appears once — print it, send it on WhatsApp, or read it out
 6  Account active — linked to the guest record, with the email address on file
 7  Guest installs the app and signs in with that email + password
 8  System finds their active stay and shows room number, folio, orders, messages
```

### 23.2 Step by step, with the follow-up at each step

| Step | Who | Action | What the system does next |
|---|---|---|---|
| 1 | Guest | Gives an email at booking or at the desk | Stored on the booking. No account yet. `guest.email_pending` is set |
| 2 | Front desk | Opens the booking → **Register + show password** → types the email | The system checks whether that email already belongs to an account |
| 3a | System | **Email is new** | A guest record is found or created (matched on phone first, then email), an account row is created, and it is switched on with a **system-set password** (`generateGuestPassword`) — returned once to the desk, shown nowhere afterwards |
| 3b | System | **Email already has an account** (returning guest) | No new password is issued — replacing a password a regular already knows is how "the app will not let me in" happens. The stay is simply linked to the existing account, and the guest gets an email: "Your stay at Sunrise Motel is active — open the app to see your room." This is the common case for regulars |
| 4 | System | Emails the **sign-in address only** | Never the password: that is handed over at the counter on the printed card. Also logged in `notification_log` |
| 5 | Optional | If the desk used **Email a link instead**: the guest opens the link | Sees a page: set a password, confirm it, then type the **6-digit code**. That code goes to the **email the invitation went to** — SMS only for the documented no-email case, and if there is neither email nor phone the desk reads it out (`deskDelivery`). The code lives 10 minutes, allows 3 attempts, and a new one cannot be requested inside 60 seconds. On success the account becomes `active`, the token is consumed, and any device that later signs in gets its own session (§41) |
| 6 | System | — | `guest.account_registered` (new account) or `guest.stay_linked` (returning guest) is written to the audit log with the staff member's label and the IP — the password itself never is |
| 7 | Guest | Installs the app — PWA "Add to home screen" or the Android APK from `/download` | Signs in with email + password. Five wrong passwords locks the account for 15 minutes and emails a warning |
| 8 | System | Resolves "which room am I in?" | Finds the booking where `guest_id` = this account **and** status is `confirmed` or `checked_in` **and** today falls between check-in and check-out. If more than one matches, the app shows a stay picker. If none matches, the app shows "No active stay" plus the option to book |
| 9 | Guest | Sees the app home screen | Room number, Wi-Fi details, check-out time, folio balance, order history, message thread, housekeeping buttons, and the motel's information |

### 23.3 The cases that break naive designs, and how this one handles them

| Situation | What happens 🧭 |
|---|---|
| **Guest has no email** | No account is created. The desk records a phone number instead, and the guest can still use the app in **reference + phone mode** — the same two identifiers `/track` already uses. They can order and message, but must re-enter the reference each session. Alternatively the desk creates an account from a phone number and the activation goes by SMS OTP instead of email |
| **Two adults share one email** | The second person cannot get an account on the same email. The desk creates their account on their own phone number with an SMS OTP. **The email is not the identity key — the account is.** The email is only the login name. Two accounts can point at the same booking |
| **Two adults, both with accounts, one room** | Both are linked to the same booking and the same room. Both can order and message. Orders are attributed to the person who placed them, so the folio shows who ordered what, and each person sees only their own messages and their own order history |
| **Guest changes their email** | They change it in the app after verifying the new address. The old email is kept on the booking as a historical snapshot; the account moves |
| **Guest checks out, then books again next month** | The account persists. On the next booking the desk links the stay and the app updates automatically. `stay_count` and `total_spent` accumulate. This is repeat-guest recognition, now visible to the guest |
| **Guest checks out and never returns** | Access to the room, the folio and the message thread ends at check-out. Booking history and invoices remain visible in the app for 24 months, then the account can be anonymised on request |
| **Guest forgets their password** | "Forgot password" on the sign-in screen sends a single-use reset link by email, valid 1 hour. Five failed attempts locks the account for 15 minutes |
| **Guest loses their phone** | "Sign out of all devices" in the app settings kills every session for that account |
| **Guest is a nuisance in the message thread** | The desk can set the account to `messaging_muted`; they can still order and see their folio. The action is audited |
| **Guest never opens the activation email** | Only the *Email a link instead* path has an email to miss. The desk sees "invited, not activated" on the booking and can register the account instead: the system sets a password, the card is printed, and the guest signs in on the spot |
| **Front desk member leaves / account deleted** | Invitations they sent remain valid; the audit log records who invited whom |
| **Guest wants their data deleted** | A documented erasure path anonymises the account and detaches personal details while keeping the financial records the motel is required to hold |

### 23.4 What the guest app can do that the website cannot

| Advantage | Why it drives installs |
|---|---|
| **See their room number instantly** | No need to ask at the desk on arrival |
| **Order from the Dine menu and room service to the room** | No phone call, no waiting |
| **Message the desk privately and get a reply** | No queue at the counter |
| **Request towels, cleaning, maintenance, a taxi, late check-out** | One tap, tracked, with a reply |
| **Push notifications for every update** | Order accepted, message replied, payment confirmed, check-out reminder |
| **See the running room bill before check-out** | No surprises at the desk |
| **Express check-out** | Settle in the app and walk out |
| **Digital invoice and receipt** | Always available, never lost |
| **Rebook in two taps** | And the app already knows who they are |
| **Offers and event notifications** | Only if they opt in |

The strongest of these for a motel is **ordering and messaging** — it removes the two things that
actually generate phone calls and counter queues.

### 23.5 Getting guests to install it (the honest part)

* The **PWA install** ("Add to home screen") is the primary path. It needs no APK, no
  unknown-sources permission and no storage. It should be offered at check-in, on the confirmation
  screen and on `/track`.
* The **Android APK** is the secondary path for guests who want the status-bar push and in-app
  updates.
* The desk should offer it as a *service*, not a sales pitch: "I can send you a link — then you can
  order food to your room and message us without coming down."
* **Never make ordering or messaging app-only.** If the guest declines, the same actions are
  available by WhatsApp and at the counter.

---

## 24. The guest app: screens 🧭

| Screen | What it shows | What the guest can do |
|---|---|---|
| **Home** | Room number, nights remaining, check-out time, folio balance, Wi-Fi, unread messages, active orders | Jump to any section; quick actions |
| **Order** | The Dine menu by category, with `is_available` respected and service hours shown | Add to basket, choose "to my room" or "takeaway", add a note, place the order, watch its status change live |
| **My orders** | Every order with its status and price | Reorder; see what is still pending |
| **Room bill (folio)** | Every charge: room, extras, orders, late check-out, with a running total and anything already paid | Download the current invoice; see the balance due |
| **Messages** | The private thread with the front desk | Send a request, a question or a complaint; see the reply and the time |
| **Quick requests** | Towels, extra pillows, cleaning, maintenance, taxi, wake-up call, late check-out | One tap; each becomes a tracked task on the room |
| **Stay** | Dates, room, occupants, policies, check-out time | Request a date change; request late check-out (auto-priced) |
| **Invoices** | Pro-forma and receipts, past and present | Download any PDF |
| **Book again** | Live availability and the booking form, pre-filled from their account | Book without typing their details again |
| **Settings** | Name, phone, email, password, notification preferences, sign out of all devices | Change details; opt in or out of offers |

**Relationship to Part A.** The Order, Room bill, Messages, Quick requests and Stay screens have no
equivalent today. *Book again* is today's `/` + `/stay` booking flow with the form pre-filled.
*Invoices* is today's `/api/invoices/[reference]` PDF. *Settings* replaces nothing — staff reset
passwords manually today (§8.4, §18).

---

## 25. Orders and the room bill (folio) 🧭

Orders introduce a concept the system has never had: **a running tab on the room.**

### 25.1 New table: `folio_items`

| Field | Meaning |
|---|---|
| `booking_id`, `room_number` | Which stay and room it belongs to |
| `category` | `room`, `extras`, `order`, `late_checkout`, `damage`, `adjustment` |
| `description` | "Grilled chambo ×2", "Airport transfer", "Broken lamp" |
| `qty`, `unit_price`, `amount` | Integer MWK |
| `posted_by` | The guest account, or the staff member who entered it |
| `status` | `open`, `voided`, `settled` |
| `void_reason` | Required if a staff member voids an item |
| `created_at` | Malawi time |

The folio is the sum of open items. **The invoice is generated from the folio**, not typed by hand.
This is what makes the room bill, the orders and the receipt all agree with each other, and it is the
structural fix for Part A gap #4 (§20) — no priced line originates in the browser any more.

### 25.2 The order lifecycle

```
 placed ──▶ accepted ──▶ preparing ──▶ ready ──▶ delivered ──▶ billed to room
    │           │
    └──▶ rejected (kitchen closed / item unavailable)
```

| Step | Who | Action | What the system does next |
|---|---|---|---|
| 1 | Guest | Adds items to the basket in the app | Totals recalculate. Items marked unavailable are disabled; if the kitchen is closed the app says so and offers the next service window |
| 2 | Guest | Places the order for their room | An `orders` row and its `order_items` are created, status `placed`. Each item posts to the folio as `open`. The order board at the desk gets a new card and a sound/badge. The guest gets a push: "Order received" |
| 3 | Front desk | Sees the card: room number, items, total, time ordered, any note | Taps **Accept**, **Reject** or **Prepare** |
| 4 | Front desk | Advances the status | Each change pushes to the guest: "Preparing your order", "Ready — coming to Room 104" |
| 5 | Front desk | Taps **Delivered** | The order closes. The folio item is confirmed. `delivered_at` is stamped |
| 6 | Front desk | Taps **Void** with a reason (guest changed mind, wrong item) | The folio item becomes `voided` and leaves the total. The void is audited with the reason — voids are the classic place money quietly disappears |
| 7 | Guest | Sees the bill grow in the app in real time | No phone call needed to ask "how much do I owe?" |
| 8 | At check-out | — | The folio total becomes the invoice total; payments already recorded are subtracted; the balance is what the guest settles |

### 25.3 Order rules worth stating

* Orders can only be placed by an account linked to an **active stay** — never for a room that is not
  occupied.
* Orders are attributed to the person who placed them, so two occupants of one room do not see each
  other's orders.
* Service hours are configurable (e.g. kitchen 07:00–22:00). Outside them, ordering is disabled with a
  clear message rather than silently failing.
* Every status change is pushed and logged. The desk can see how long each order has been waiting, and
  orders waiting over 20 minutes are highlighted.

---

## 26. Guest ↔ front desk messaging 🧭

### 26.1 What "private and end-to-end" honestly means here

There is a real tension to be honest about:

* **True end-to-end encryption** means only the two endpoints can read the message — which would make
  it **impossible for the front desk to read it**, and impossible for an admin to audit it. That
  defeats the purpose.
* What the system *can* deliver, and what is specified here, is **private one-to-one communication**:
  * Encrypted in transit (TLS) and at rest in the database.
  * Visible only to **that guest** and **the front desk**. No other guest can see it, ever — enforced
    on the server, not by hiding it in the app.
  * Staff can read messages for guests currently in-house; **admins can read everything including
    history**; auditors can read but not send.
  * Every message and every reply is recorded with sender, room number, timestamp and IP, in the
    append-only audit log.
  * After check-out the thread is closed to new messages but retained for 24 months for dispute
    resolution.

If cryptographic end-to-end encryption between a guest and a *specific named staff member* is ever
required, that is possible — but it means the motel cannot read or audit those messages, which is
almost certainly not what is wanted for complaint handling. The recommended model is the private,
audited one-to-one thread described above.

### 26.2 The message thread

| Field | Meaning |
|---|---|
| `booking_id`, `room_number` | Which stay and room the thread belongs to |
| `guest_id` | Which account is talking |
| `direction` | `guest_to_desk` or `desk_to_guest` |
| `body` | The text |
| `kind` | `message`, `request`, `complaint`, `emergency`, `system` |
| `status` | `sent`, `delivered`, `read`, `archived` |
| `read_by_staff_at` | When the desk opened it |
| `created_at` | Malawi time |

### 26.3 How it flows

| Step | Who | Action | What the system does next |
|---|---|---|---|
| 1 | Guest | Opens **Messages** in the app and types | The message is saved with the room number attached automatically — the guest never has to type it |
| 2 | System | — | The message appears in the desk's **issue queue** with the room number, the guest's name, their stay dates and whether they are a first-time or returning guest. The desk gets a push/badge and a sound for `emergency` |
| 3 | Front desk | Opens the thread | Sees the guest's context on the same screen: room, nights, folio balance, open orders, previous stays, previous complaints |
| 4 | Front desk | Replies, or taps a **canned reply** ("On our way with towels") | The guest gets a push. `read_by_staff_at` is stamped |
| 5 | Front desk | Taps **Resolve** with a resolution note | The thread is marked resolved; the guest is told it is closed and can reopen it |
| 6 | Front desk | Escalates to admin for anything they cannot fix | The admin is notified and the thread appears in the admin's queue |
| 7 | Guest | Reads the reply | Push clears; `delivered`/`read` stamps update |
| 8 | At check-out | — | The thread closes. If it was a complaint, the guest is asked for a rating |

### 26.4 How the desk sees problems by room number

The issue queue is **grouped by room**, because that is how a front desk thinks:

```
IN-HOUSE ROOMS                      OPEN ISSUES
──────────────────────────────      ─────────────────────────────────
101  Chileshe Banda   [clean]       — none
104  Thoko Mwale      [occupied]    ⚠ 2 open · "No hot water" (40 min)
201  Kondwani Phiri   [occupied]    ⚠ 1 open · "TV remote not working" (3 h)
207  Grace Banda      [dirty]       🔴 EMERGENCY · "Locked out" (2 min)
305  — (out of order)               ⚠ 1 open · maintenance logged
```

Tapping a room shows its occupant, its folio, its open orders and its full message thread — one
screen, everything about that room. This is the answer to "the system will show the desk which room
number is having any problem".

### 26.5 Issue lifecycle and SLA

```
open ──▶ acknowledged ──▶ in_progress ──▶ resolved ──▶ closed
                                     └──▶ escalated (to admin)
```

| Rule | Trigger | What the system does |
|---|---|---|
| **Acknowledge** | A complaint has been open 15 minutes with no reply | The desk is nudged; the guest is told "we have seen your message" |
| **Escalate** | Open 1 hour, or anything marked `emergency` | The admin is alerted immediately, with the room number and the guest's name |
| **Emergency** | Guest tags a message as emergency (locked out, medical, security) | Loud alert on the desk board, push to admin, never batched with normal messages |
| **Resolve** | Staff marks resolved with a note | The guest is notified and asked to confirm |
| **Reopen** | Guest replies after resolution | The thread reopens and the SLA clock restarts |

Every one of these transitions is written to the audit log with actor, room number and timestamp, so
"who knew about the broken geyser in 201 and when" is always answerable.

---

## 27. Housekeeping and maintenance tasks 🧭

Guest quick-requests become **tasks tied to a room**, which is what makes the `rooms` table useful to
housekeeping rather than just to the desk.

| Field | Meaning |
|---|---|
| `room_number` | Which room |
| `kind` | `cleaning`, `towels`, `linen`, `maintenance`, `amenity`, `taxi`, `wake_up`, `other` |
| `requested_by` | The guest account, or a staff member |
| `note` | "Extra pillows", "Geyser cold" |
| `assigned_to` | A staff member, if the motel assigns work |
| `priority` | `normal`, `urgent`, `emergency` |
| `status` | `open`, `assigned`, `in_progress`, `done`, `cancelled` |
| `due_by` | Calculated from priority (urgent 15 min, normal 2 h) |
| `completed_at`, `completed_by` | Who actually did it |

**Why this matters commercially:** a maintenance task that cannot be completed immediately is what
sets a room to `out_of_order` — which is exactly how a room should stop being sold. The chain is:

```
guest complains → task created → cannot be fixed now → room out of order
                → availability drops → the room is never sold to anyone else
```

Today (Part A) a room can only be hidden manually by an admin with no reason recorded (§8.4 *Rooms*,
*gap 10* territory); v2 makes the state follow the real world and records why.

---

## 28. Notifications, improved 🧭

Part A has one broadcast topic (`all_users`, §10.3). With guest accounts, notifications become
**per person**.

| Event | Guest | Desk | Admin | Channel |
|---|---|---|---|---|
| Account activation link | ✅ | — | — | Email (or SMS OTP) |
| Room assigned | ✅ push | — | — | Push + WhatsApp/SMS |
| Order received | — | ✅ badge | — | Portal + push |
| Order accepted / preparing / ready | ✅ push | — | — | Push |
| Order rejected | ✅ push with reason | — | — | Push + WhatsApp/SMS |
| Message received | — | ✅ badge + sound | ✅ if escalated | Portal + push |
| Message reply | ✅ push | — | — | Push + WhatsApp/SMS |
| Issue acknowledged / resolved | ✅ push | — | — | Push |
| Emergency issue | — | ✅ loud | ✅ push | Portal + push |
| Housekeeping task assigned | — | ✅ | — | Portal + push |
| Payment claimed / verified / rejected | ✅ | ✅ queue | ✅ | Push + WhatsApp/SMS + email |
| Invoice or receipt issued | ✅ | — | — | Push + email + WhatsApp |
| Check-out reminder (09:00) | ✅ | — | — | Push |
| Deposit deadline warning / release | ✅ | — | ✅ | Push + WhatsApp/SMS |
| Booking confirmed / cancelled / follow-up | ✅ | — | ✅ | Push + WhatsApp/SMS + email |
| Offers, events, news | ✅ **only if opted in** | — | — | Push broadcast |
| Daily 07:00 summary | — | — | ✅ | Email |

**Notification rules that matter**

* Push goes to **that guest's registered devices**, not to everyone. The broadcast topic `all_users`
  is kept only for genuine property-wide announcements, and only to guests who have not opted out.
* **Marketing consent is separate from service messages.** Service messages (order, message, invoice)
  are always allowed. Offers require an explicit opt-in, stored on the account.
* Every attempt is written to `notification_log` with its outcome and the provider's reference.
* Guests can mute non-urgent notifications in the app without losing urgent ones.

---

## 29. The complete advanced admin dashboard 🧭

This is the full specification — everything the manager needs, in one place, with nothing missing. It
replaces Part A's stat strip (§8.4) with a proper operations console.

### 29.1 The shell

* **Header:** property name, current Malawi date and time, global search, date-range filter,
  **Refresh**, **Lock** (sign out), and the signed-in identity with role.
* **Global search** — one box that searches guests (name, phone, email), bookings (reference, booking
  number), rooms (number), invoices (number), orders and message threads. Results grouped by type,
  each clickable.
* **Live refresh** — the board, the payment queue and the issue queue update without a page reload.
* **Role-aware:** staff see a reduced dashboard; admins see everything; auditors see everything
  read-only with no action buttons (§22).

### 29.2 The action centre (the first thing an admin sees)

A single strip of things needing a human, each with a count and a jump link:

```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ 3 payments   │ 2 unassigned │ 1 EMERGENCY  │ 4 open       │ 2 escalated  │
│ to verify    │ arrivals     │ issue        │ complaints   │ bookings     │
│ MWK 260 000  │ before 15:00 │ Room 207     │ oldest 3 h   │ 12 h+ idle   │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

Nothing in the system can sit unattended without appearing here. In Part A the only equivalent is the
reminder banner for stale `pending` bookings (§8.4).

### 29.3 KPI row

| Metric | Definition |
|---|---|
| **Occupancy %** | Rooms sold ÷ rooms available (out-of-order rooms excluded from both) |
| **ADR** | Average daily rate — room revenue ÷ rooms sold |
| **RevPAR** | Revenue per available room — the single best small-property metric |
| **Rooms sold today** | And how many are still unsellable tonight |
| **Arrivals / departures** | Today, with unassigned arrivals called out |
| **In-house** | Guests and rooms occupied right now |
| **Revenue today / week / month** | Room + extras + orders |
| **Collected** | Cash, bank, Airtel, TNM — split by channel |
| **Outstanding** | Sum of open folio balances across in-house guests |
| **Unverified payments** | Claimed but not confirmed, with the MWK at risk |
| **Cancelled loss** | Revenue lost to cancellations |
| **Open issues** | By priority, with the oldest |
| **Pending bookings / escalated** | With ages |

Part A already computes a subset of these (bookings per period, collected, outstanding, cancelled
loss — §8.4); occupancy, ADR, RevPAR, unverified payments and open issues need the v2 tables.

### 29.4 The tabs (1 of 2)

| Tab | What it does |
|---|---|
| **Overview** | KPIs, the action centre, today's arrivals and departures, revenue and occupancy trend, room-type performance, recent activity feed |
| **Room map** | A grid of every physical room showing number, type, occupant, housekeeping state, open issue count and folio balance. Colour-coded. Tap for the full room record. This is the desk's and the manager's single most useful screen |
| **Arrivals & departures** | Today's board plus any date range; assign rooms inline; mark no-shows; print the sheet |
| **Bookings** | Full list with search and status filters; the booking modal with guest snapshot, timeline, notes, status buttons, room assignment, payment recording, invoice actions, deletion |
| **Payments** | The verification queue, plus a ledger of every payment (claimed, verified, rejected, cash) with channel, reference, who verified it and when. Reconciliation by date range and channel |
| **Orders** | Live order board grouped by status (new / preparing / ready / delivered), with a waiting-time clock, plus order history and voids with reasons |
| **Messages & issues** | The queue grouped by room, filterable by kind and status; full threads with guest context; reply, resolve, escalate; emergency items pinned and loud |
| **Housekeeping** | Tasks by room and assignee, due times, overdue highlighted; room states; out-of-order rooms with reasons |

### 29.5 The tabs (2 of 2)

| Tab | What it does |
|---|---|
| **Folios & invoices** | Every open room bill with its line items, plus every invoice with status and the ability to regenerate, email or download |
| **Guests (CRM)** | Every guest record: stay count, total spent, last stay, regular flag, no-show flag, notes, their accounts and devices, their message history. Searchable |
| **Staff** | Accounts, roles, activation, password resets, deactivation, last login, and per-staff activity (bookings handled, payments verified, issues resolved) |
| **Rooms & rates** | Room types, physical rooms, housekeeping states, seasonal and length-of-stay rates, out-of-order management |
| **Reports** | Daily bookings (print/PDF), arrivals sheet, payments reconciliation, occupancy report, revenue CSV, folio/AR ageing, guest CRM export, audit export — each with a date range and format |
| **Audit trail** | Read-only, searchable, filterable by entity and actor, CSV export, plus a **scheduled off-database export** |
| **Notifications** | The push composer (title, message, target page, poster, live phone preview, **Test configuration** with `validate_only`, **Send to All App Users**), the `notification_log` with delivery outcomes, and the opt-in audience count |
| **Settings** | Deposit percentage and deadline, cancellation window, check-in/check-out times, service hours, tax rate, canned replies, notification templates, policy version, and the break-glass admin password |

**Which of these exist today.** *Bookings*, *Staff*, *Rooms*, *Audit trail*, *Notifications* and
*Reports* are live in `/admin` (§8.4) — **and so are** *the Today board*, *Room map*, *Arrivals &
departures*, *Payments*, *Orders*, *Messages & issues*, *Housekeeping*, *Folios & invoices* and
*Guests (CRM)*, which Part D §51 confirms were built **before** the six addenda were written. Part C
added *Room access* and *Reviews & waitlist* (§44), and the *Menu · sold out* control sits inside the
desk console (§48).

**Still missing:** the *Settings* tab (deposit %, tax rate, policy version, canned replies), the
charts in §29.6, the scheduled reports in §29.7, and an **admin Menu screen** — the desk can close a
dish for the day, but nobody can yet add one or change a price (§51 item 4).

### 29.6 Charts and analysis

| Chart | What it answers |
|---|---|
| **Revenue trend** | Daily, week and month, room vs extras vs orders, with the previous period overlaid |
| **Occupancy trend** | With out-of-order rooms shown separately, so the manager can see capacity lost to maintenance |
| **Booking lead time** | How far ahead guests book — which tells you when to push offers |
| **Room-type performance** | ADR and occupancy per type, so you know which rate to move |
| **Channel mix** | Website, phone, WhatsApp, walk-in, app |
| **Cancellation and no-show rate** | By month, to calibrate the deposit policy |
| **Issue volume by kind and room** | The rooms that keep generating complaints are the rooms to fix |
| **Guest retention** | New vs returning guests, and the repeat rate |

### 29.7 Scheduled and automatic reporting

* **07:00 daily summary email** to the admin: yesterday's revenue, occupancy, arrivals today,
  unverified payments, open issues, out-of-order rooms.
* **Month-end pack** — revenue, occupancy, ADR, RevPAR, cancellations, no-shows, top guests, staff
  activity — generated as a PDF and a CSV.

### 29.8 Mobile

The dashboard is responsive. The **room map**, the **payment queue** and the **issue queue** are the
three screens the manager should be able to use from a phone, because those are the three that happen
throughout the day.

---

## 30. Front desk portal, updated 🧭

The staff portal keeps everything from Part A (§8) and adds:

| Addition | What it does |
|---|---|
| **Today board as the landing screen** | Arrivals, departures, in-house, unassigned, deposits at risk |
| **Register + show password** button on every booking | The §23/§41 flow, in one tap: the system sets the password, the desk prints or sends the card, and the account is live before the guest reaches the room |
| **Room map** | Assign, reassign, and set housekeeping states |
| **Order board** | Accept, prepare, ready, deliver, void |
| **Issue queue** | Grouped by room, with emergency pinning, canned replies, resolve and escalate |
| **Payments to verify** | The verification queue with the reconciliation total |
| **Guest context panel** | On any room or booking: occupant, stay, folio, orders, message history, previous stays, regular or no-show flag |

**What does not change:** staff still cannot touch money fields beyond what Part A allowed, cannot
delete bookings, cannot manage staff or rates, and cannot broadcast push (§8.3). Everything they do is
audited.

---

## 31. Data model, complete list 🧭

Ten tables existed when Part A was written (Part A §4). **`src/db/schema.ts` now defines 28**
(§4 breaks the arithmetic down). This section is the **target** list: it says what each table is for,
not what has shipped. Read it together with Part D §51, which says which of them are already live.

**Carried over unchanged in purpose**

`room_types`, `booking_events`, `posts`, `menu_items`, `gallery_images`, `staff`, `audit_log`,
`uploaded_images` — and `bookings` / `invoices`, which also change in the ways below.

**Changed from Part A**

| Table | Change |
|---|---|
| `bookings` | adds `guest_id`, `assigned_room_id`, `deposit_required`, `deposit_due_at`, `self_modified_count`; adds statuses `no_show` and `released_unpaid` |
| `invoices` | adds a `tax_rate` snapshot and computed `tax_amount`; generated from the folio; **never physically deleted** |
| `staff` | new role value `auditor` |

**Changed again by Part C** (the two guest paths — both are v2 tables, but Part C gave each a channel)

| Table | Change |
|---|---|
| `message_threads` | adds `channel` (`app` \| `qr` \| `pin` \| `reference` \| `desk`) and `room_session_id`, so a thread that started from a QR card knows it, and the desk knows whether the guest is reachable by push or only by SMS (§45) |
| `service_tasks` | adds `channel` and `room_session_id` for the same reason — a no-account guest's request still knows which room it came from (§45) |

**New in v2**

| Table | Purpose |
|---|---|
| `rooms` | Physical rooms with housekeeping state — the missing link that turns Part A's free-text `assigned_room` into a validated `assigned_room_id` |
| `guests` | One record per person, with stay history and flags |
| `guest_accounts` | Login credentials, status (`invited` / `active` / `locked` / `muted` / `disabled`), password hash, phone-verified flag, marketing consent, last login |
| `guest_sessions` | Active app sessions per device, for "sign out everywhere" |
| `activation_tokens` | Single-use, expiring, hashed invitation and password-reset tokens |
| `payments` | Claims, verification, cash, rejections |
| `notification_log` | Every message attempted on every channel |
| `orders` | Guest orders with status and service window |
| `order_items` | Line items, priced from `menu_items` at order time |
| `folio_items` | The room bill |
| `message_threads` | One thread per guest per stay |
| `messages` | Individual messages with kind, status and read stamps |
| `service_tasks` | Housekeeping, maintenance and amenity requests tied to a room |
| `room_type_rates` | Seasonal and length-of-stay pricing |

**Added by Part C** (§45)

| Table | Purpose |
|---|---|
| `room_sessions` | One open session per stay — the QR card, the PIN, the reference path. Validated on every read, not just at the door |
| `reviews` | Guest ratings with `is_published` / `is_featured`; the public average is computed from these or shown as nothing |
| `waitlist_entries` | The sold-out waitlist: name, one contact, and the exact nights that failed |

> **28, not 24.** The count keeps moving — 10 at Part A, 24 at Part B, 28 now (Part C added three,
> and `faqs` is the last one). Whenever you write a number, grep `src/db/schema.ts` for `pgTable(`
> first.

> **`room_types` vs `rooms`:** Part A sells *types* (The Standard ×4) but has no concept of *Room 104*.
> v2 keeps `room_types` as the sellable catalogue and adds `rooms` as the physical inventory, which is
> what makes a room map, housekeeping states, out-of-order and validated assignment possible.

---

## 32. Status lifecycles, all of them 🧭

Part A's booking lifecycle (§5) is one of nine in v2:

| Entity | States |
|---|---|
| **Booking** | `pending` → `awaiting_payment` → `confirmed` → `checked_in` → `checked_out`; side exits `cancelled`, `released_unpaid`, `no_show` |
| **Payment** | `pending_verification` → `verified` / `rejected`; `cash` enters already verified |
| **Order** | `placed` → `accepted` → `preparing` → `ready` → `delivered`; side exit `rejected`; items can be `voided` |
| **Folio item** | `open` → `settled`; or `voided` |
| **Message / issue** | `open` → `acknowledged` → `in_progress` → `resolved` → `closed`; or `escalated`; can reopen |
| **Service task** | `open` → `assigned` → `in_progress` → `done`; or `cancelled` |
| **Room** | `available` → `occupied` → `dirty` → `clean` → `inspected`; side exit `out_of_order` |
| **Guest account** | `invited` → `active`; side states `locked`, `messaging_muted`, `disabled` |
| **Invoice** | `proforma` → `sent` → `paid`; or `cancelled` (kept, never deleted) |

The two new booking exits are worth calling out because they protect revenue in opposite directions:

* **`released_unpaid`** — the deposit was never paid by the 48-hour deadline, so the room goes back on
  sale instead of being held for a guest who may never arrive.
* **`no_show`** — arrival date ended with the booking still `confirmed` and nobody checked in; the
  guest is flagged and the room is released.

---

## 33. The automatic rules 🧭

| Rule | Trigger | Action |
|---|---|---|
| Reminder | Booking `pending` 2 h | Notify assignee + admin |
| Escalation | Booking `pending` 12 h | Stamp `escalated_at`, ESCALATED alert, badge |
| Deposit warning | 72 h before arrival, deposit unpaid | Notify guest |
| Deposit release | 48 h before arrival, deposit unpaid | `released_unpaid`, room back on sale, notify guest and admin |
| Auto-confirm | Verified payments ≥ total | Booking `confirmed`, invoice `paid`, receipt issued |
| No-show | 23:59 on arrival date, `confirmed` and not checked in | `no_show`, guest flagged, room released |
| Room auto-dirty | Check-out | Room `dirty`, back in inventory |
| Order ageing | Order waiting 20 min | Highlight on the board |
| Issue nudge | Complaint open 15 min unanswered | Nudge desk, tell guest it was seen |
| Issue escalation | Open 1 h, or `emergency` | Alert admin |
| Emergency | Guest tags emergency | Loud desk alert + admin push, never batched |
| Guest stats | Stay completes | `stay_count`, `total_spent`, `is_regular` |
| Tax | Invoice generated | `tax_amount` computed from the snapshot rate |
| Token expiry | Activation token 7 days, reset token 1 h | Invalidated |
| Account lock | 5 failed sign-ins | Locked 15 min, guest emailed |
| Daily summary | 07:00 | Email admin |
| Audit export | Monthly | Off-database copy |

**Live today:** only the two booking rules — the 2-hour reminder and the 12-hour escalation (§8.6).
Every other row depends on v2 tables.

---

## 34. Security, privacy and honest limits 🧭

| Area | Position |
|---|---|
| Staff sessions | Signed with a server secret, 12 hours, httpOnly — this is the fix for Part A gap #2 (§20) |
| Guest sessions | Signed token per device, revocable individually or all at once |
| Guest passwords | Hashed with the same scrypt scheme as staff; never logged |
| Activation and reset tokens | Random, single-use, hashed at rest, short expiry |
| Message privacy | Server-enforced: a guest can only ever read their own thread. Staff read in-house guests; admins read all; auditors read only |
| Cross-guest leakage | Two accounts on one booking can see the shared room and folio, but **not** each other's messages or individual order history |
| Encryption | TLS in transit, encrypted at rest in the database |
| Audit | Every message, order, void, task, account action, login and notification recorded with actor, room and Malawi timestamp |
| Rate limiting | On login, account creation, booking, tracking, ordering and messaging — this is the fix for Part A gap #7 (§20) |
| True E2E encryption | **Not provided, deliberately** — it would prevent the desk and the audit trail from reading complaints (§26.1) |
| Data retention | Messages and threads 24 months after check-out; financial records as long as the motel is required to keep them; documented erasure path on request |
| Marketing consent | Opt-in, stored per account, separate from service messages |

**The four Phase-0 security items** (from §20 and §36) are the only ones that do not depend on a v2
table: sign the sessions, guard the unauthenticated admin routes, add the phone check to the invoice
PDF, and add rate limiting. They can and should ship before any of the guest-app work.

---

## 35. Operating routines 🧭

What the desk and the manager actually do, once the system is in place.

### Every morning (10 minutes)

1. Read the **07:00 summary email**.
2. Clear the **Payments to verify** queue against the bank and Airtel/TNM statements.
3. Check **unassigned arrivals** for today and assign rooms.
4. Read the **issue queue** — anything open overnight, especially emergencies.
5. Print the **arrivals sheet** (the paper fallback).
6. Tell housekeeping which rooms are `dirty`.

### Throughout the day

1. Every arrival gets a room number before 15:00.
2. Watch the **order board**; nothing waits over 20 minutes.
3. Answer message threads; acknowledge within 15 minutes.
4. On arrival, offer the app: *"I'll email you a link so you can order to your room and message us."*

### Every evening (5 minutes)

1. `checked_out` for departures — this is what makes rooms `dirty` and sellable again.
2. Clear remaining orders and open issues.
3. Check the **unverified payments** total is zero.
4. Confirm no-show marking ran.

### Weekly (20 minutes)

1. Read the **audit trail** — deletions, voids, logins, rate changes.
2. Review **issues by room** — the rooms that keep complaining need fixing, not more apologies.
3. Check rooms stuck `out_of_order`.
4. Confirm uptime and error monitoring are clean.

### Monthly (45 minutes)

1. **Restore drill** from backup.
2. Export the audit log off-database.
3. Reconcile payments against statements.
4. Review ADR, RevPAR and occupancy; set next month's rates.
5. Review cancellation and no-show rates; recalibrate the deposit rule.
6. Review guest retention and the app opt-in rate.

### When the internet or power drops

1. Paper arrivals sheet and the paper book.
2. The offline standby front desk on the office LAN.
3. Re-enter on paper when the link returns; the audit trail records who re-entered it.

---

## 36. Build order 🧭

| Phase | What | Effort |
|---|---|---|
| **0** | ~~Sign sessions, guard the open routes~~ ✅ **done — Part D §47**. (Four routes, not three: §20 gap 3 counts `GET` and `POST /api/admin/invoices` separately.) **Also now done:** `posts` and `gallery` writes gated behind `requireAdmin` (§8.3, §9.2, §51). **Still remaining:** the phone check on the invoice PDF (§20 gap 5), rate limiting (§20 gap 7), and rotating `ADMIN_PASSWORD` | 1 day |
| **0** | Point-in-time backups, uptime monitoring, error tracking, restore drill | 1 day |
| **1** | Tests for pricing, overlap counting, the one-room race — **still not written** (the addenda suite in `scripts/addenda-verify.mjs` tests auth and roles, not the booking maths) | 1–2 days |
| **2** | `payments`, payment claims, verification queue, auto-confirm, `notification_log` | 5–8 days |
| **3** | `rooms`, housekeeping states, validated assignment, the Today board and room map | 6–10 days |
| **4** | **Guest accounts**: `guests`, `guest_accounts`, activation tokens, sign-in, password reset, app home screen, room resolution | 8–12 days |
| **5** | **Messaging**: threads, the issue queue, room context, canned replies, SLA rules, escalation | 6–9 days |
| **6** | **Orders and folio**: menu, basket, order board, folio items, invoice from folio, voids | 7–10 days |
| **7** | **Service tasks** and housekeeping assignment | 3–4 days |
| **8** | **Push per device**, opt-in consent, notification preferences | 2–3 days |
| **9** | `guests` CRM, no-show and `released_unpaid`, deposit and cancellation rules | 4–6 days |
| **10** | WhatsApp Business API and SMS; email demoted to secondary | 3–5 days |
| **11** | Tax, invoices never deleted, reconciliation and occupancy reports | 2–3 days |
| **12** | Seasonal and length-of-stay rates | 3–5 days |
| **13** | The advanced dashboard: action centre, KPIs, charts, scheduled reports | 8–12 days |
| **14** | SEO, structured data, image weight, funnel analytics | 1–2 days |
| **15** | Offline standby front desk on the office LAN | 2–3 days |

> **Phases 0 and 1 are about two days' work and should happen before anything else.** They close the
> four security items and give the pricing/availability logic a test net, so the guest-app work in
> Phases 4–6 is not built on an unverified booking engine.
>
> Recommended reading order for an implementer: **Phase 0 → §34 → §31** (data model) → **§32/§33**
> (lifecycles and rules) → then the feature sections in phase order.

---

## 37. Where Part A did not hold together, and how v2 fixes it 🧭

These are the places where the live system's flow is incomplete or inconsistent, and the v2 design that
closes each one.

| Gap in Part A (live) | Fix in v2 |
|---|---|
| The public site is "no accounts, ever" (§6) while guests still need a way to change their own booking | Guests **may** have an account; it is optional, and the reference + phone path stays a first-class mode (§22, §23.3) |
| There is no way for a guest to reach the desk *inside* the system — only WhatsApp deep links (§10.2) | §26: private one-to-one messaging with room number, SLA and escalation |
| `assigned_room` is free text with no link to anything real (§4.2) | `assigned_room_id` → `rooms.id`, validated against overlaps and housekeeping state (§31), surfaced on the room map (§29.4) |
| The invoice is assembled from numbers typed into the page (§13.1) | The invoice is **generated from `folio_items`**, so the room bill, the orders and the receipt always agree (§25.1) |
| There is no running room bill at all | `folio_items` with void-and-reason — the basis of check-out (§25.1) |
| Reminders and escalation cover bookings only (§8.6) | Escalation also covers issues, orders and payments (§33) |
| Push is a single broadcast topic `all_users` (§10.3) | Per-device guest push, plus a consented broadcast topic (§28) |
| Payment still depends on a human noticing a WhatsApp message (§6.3, §20 gap 8) | The claim is inside the system: queued, verified, audited, auto-confirming (§25.2, Phase 2) |
| There is no housekeeping work assignment | `service_tasks` tied to rooms, with due times and completion stamps (§27) |
| The admin "dashboard" is a stat strip and a set of tabs (§8.4) | §29: action centre, KPIs, room map, charts, scheduled reports, CRM, settings |
| What happens to a guest's access at check-out is undefined | Access to the room, folio and thread ends; booking history retained 24 months (§23.3) |
| Two occupants in one room is unaddressed | Two accounts can share a booking and a room; messages and order history stay private per person (§23.3) |
| Guests with no email is unaddressed | Phone-number accounts with SMS OTP, or reference + phone mode with no account at all (§23.3) |

---

## 38. What is still manual, even in v2 🧭

* Payments are captured and verified by a human; **no money moves automatically**.
* Housekeeping and maintenance completion is tapped by a person.
* Guest identity is matched on phone and email, and the match is now *canonical*: the last nine digits
  of the number and a lower-cased address, enforced by two partial unique indexes on `guests`
  (`guests_email_identity_unique`, `guests_phone_identity_unique`). Shared contact details still merge
  two people on purpose — one phone number is one guest — while `n/a`, `0000` and blanks match nobody.
  Run `npm run verify:identity` before and after any change to that rule.
* `policy_version` still needs a human decision when the policy changes.
* The Dine, Unwind and Connect public forms remain **display-only** unless built out — the immediate
  fix is copy that says *"we'll continue on WhatsApp"* (§20 gap 1).
* The **Dine menu is read from `menu_items`** now (§49), but nobody can yet **edit** it from the
  console: a dish can be closed as *sold out* from the desk, while adding a dish or changing a price
  is still a developer task (§51 item 4). The Dine ordering basket also remains client-side (§20 gap 1).
* True cryptographic end-to-end encryption between a guest and a named staff member is **deliberately
  excluded**, because it would make complaints unreadable and unauditable (§26.1).

---

## 39. In short 🧭

v2 turns the system from **a booking website with a staff back-office** into **a guest platform with a
front-desk system behind it**.

The **front desk** gains three things it cannot do today: it creates a guest account from an email
address in one tap, which sends the guest a link to set a password and install the app; it sees
**which room number has a problem** on a room map, with the guest's message, folio and history beside
it; and it **verifies payments in a queue** instead of hunting through WhatsApp.

The **guest** gets a reason to install the app — their room number, their running bill, food ordering
to the room, and a private line to the front desk — with push notifications for every update, and the
option to never install it at all and still get all of it by phone.

The **admin** gets a dashboard that answers the questions a manager actually asks: how full are we,
what did we earn, what do we still owe, which rooms are broken, which guests are unhappy, which staff
member did what — and which never lets anything sit unattended without surfacing it in the action
centre.

And throughout, every action by a guest, a staff member, an admin or the system itself is recorded
with the actor, the room number and the Malawi timestamp, in a log that cannot be edited and is
periodically copied somewhere the database cannot lose it.

---

*Keep this file updated whenever a route, table, status or flow changes. When a phase ships, move its
content from Part B into the matching Part A section and delete it from the build order.*

---

# PART C — the three addenda (built)

> ✅ **Status: built, migrated and running in this repository.** Part A (§1–§21) documents the
> original system, Part B (§22–§39) is the v2 target design, and Part C documents the three
> addenda specified on top of v2 and now implemented: **how guest accounts are created**, **the two
> guest paths** (with an account, and with no account at all but standing in the room), and **the
> landing page as a booking engine that never says a bare "no"**.
>
> The one sentence Part C exists to defend: *a guest who has installed nothing, owns nothing and has
> typed no password is still a first-class guest.* They get the same menu, the same room bill and the
> same private line to the front desk — the app is an upgrade, never a gate.

| Area | Before Part C | After Part C |
|---|---|---|
| Guest identity | Account (v2) or reference+phone tracking only | **Three** equal paths: account · live room session (QR card / key-sleeve PIN / reference+phone) · the desk doing it for them (§40) |
| Account creation | Desk invitation only | **Desk registration only, everywhere**: the desk types the email, the system sets the password, and the desk hands it over on a card (§41). Self-serve sign-up was removed — the counter is the way in |
| Room access | Nothing tied to a physical room | A session opened at check-in, dying at check-out: one QR card, one 4-digit PIN, one page (`/room`) (§42) |
| Trust content | None | Guest reviews with the **real** average, an unedited record, and a sold-out waitlist that turns a lost week into a lead (§43) |
| New desk screens | — | **Room access** and **Reviews & waitlist** tabs in `/desk` (§44) |

---

## 40. Three ways into the same room ✅

Every order, message and request is stored with the **channel** it arrived by (`app`, `qr`, `pin`,
`reference`, `desk`) and, for the no-account paths, the **room session** it belongs to. Nothing
downstream cares which one it was.

| | **Account guest** | **Room guest (no account)** | **Desk** |
|---|---|---|---|
| How they get in | Email/phone + password | QR card in the room, **or** room number + 4-digit PIN from the key sleeve, **or** booking reference + phone | Nothing — the desk does it |
| Screen | `/app` | `/room` | `/desk` |
| Sees room number | ✅ | ✅ | ✅ |
| Orders to the room | ✅ | ✅ | ✅ (typed at the counter) |
| Running room bill (folio) | ✅ | ✅ | ✅ |
| Private thread with the desk | ✅ | ✅ | ✅ |
| Requests (towels, cleaning, taxi …) | ✅ | ✅ | ✅ |
| Reviews | ✅ after checkout | ✅ from the check-out email link | ✅ recorded by hand |
| Waits for a password? | No — stays signed in | **Never asked for one** | Never asked for one |
| Push notifications | ✅ | ⚠️ none — the desk rings or WhatsApps the number on the booking | — |
| Ends when | They sign out | **Check-out** (the session dies; a photograph of the card stops working) | — |

**Why the room path matters commercially:** a walk-in paying cash has no email, may share a phone,
and will not install anything. The old design left them outside every v2 feature. Now the room
itself is the credential: the desk prints one card at check-in and that guest can order, complain
and see their bill for the whole stay.

**Where the two paths meet in code:** `src/lib/guest-context.ts` → `resolveGuestContext()` resolves
*either* a signed-in account *or* a live room session into one `GuestContext`, and every guest route
(`/api/guest/orders`, `/api/guest/messages`, `/api/guest/requests`, `/api/reviews`) calls it. That is
the single place the "app is optional" promise is enforced.

---


## 41. How the system creates a guest account ✅

**The front desk is the only doorway.** There is no self-serve sign-up anywhere in the product any
more: the desk types the guest's email, the *system* chooses the password, and the desk hands that
password over on a printed card (or sends it from the desk's own WhatsApp).

| # | Route | Where | `signup_source` |
|---|---|---|---|
| 1 | Front desk at check-in, or a walk-in | *Room map* → **Register + show password**, or the *Guests* tab | `desk` |
| 2 | Desk types an email that already has an account | Same button — the stay is linked and **their password is left untouched** | `desk` |
| 3 | A guest asks from the app | `/app` → *Ask the front desk* (WhatsApp) — the desk then does route 1 | `desk` |

**What the desk sees:** type the email → the credentials card appears **once** — the sign-in email and
the system-set password (`KQP-482-XT`: 24 letters and 8 digits to draw from, with no `I`/`O`/`0`/`1`,
so it survives being read out loud) → **Print the sign-in card**, **Send on WhatsApp**, or read it out.
The password is hashed by `setGuestPassword` with the same scrypt scheme as staff passwords (§13), is
never emailed by us, and is never written to `notification_log`, the audit trail or any other readable
column. Losing it means setting a new one — the desk can do that with the guest at the counter
(*Set password*, `activate_at_desk`), or issue a reset link.

**A returning guest keeps their password.** Silently replacing a password a regular already knows is
how you get "the app will not let me in" at 23:00, so registration links the stay and changes nothing
else.

**What the guest never sees, on purpose:** nothing in the product says whether an address already has
an account. Sign-in answers a login it does not recognise and a wrong password with the *same*
sentence (`deskRegistersAccounts: true`, `noEnumeration: true`), so the sign-in box cannot be used to
test who our guests are. `/api/guest/auth` records `reason: "no_account"` in the audit log for staff —
that is where it belongs.

**Old links still work:** `/app?signup=1` (booking confirmation screens, `/track`, printed QR cards) is
still out in the world, so it opens the sign-in sheet with the explanation showing instead of a form
that no longer exists. The confirmation screen and `/track` now link to WhatsApp for an account.

**The email is only the login name.** `findAccountByLogin` accepts the login email *or* the login
phone, so a phone-only guest the desk registered on their number can sign in too.

**Still available, no longer the way in:** *Email a link instead* (`invite` / `resend` + `/activate`),
for a guest who would rather choose their own password from an inbox.

**The documented exception:** a guest with a phone number but no email has nowhere to receive a
code. The code goes by SMS where SMS exists, and where it does not the **desk reads it out** — the
response says `deskDelivery: true` and the screen tells the guest to ask at the counter.

**Codes and links, honestly** (`src/lib/guest-otp.ts`): 6 digits, 10 minutes, 3 attempts, a new code
at most once a minute, and a 15-minute lock after the attempts run out. Codes are stored only as
`sha256(code : row_id)`, compared in constant time, and never written to the audit log. The
activation page shows where the code went, how long it lives, and a *Send a new code* button with a
live countdown — the old page asked for a field the endpoint never read, so this is also a bug fix.

---

## 42. The room session — the QR card and the key-sleeve PIN ✅

**One row per stay** in `room_sessions`, opened at check-in and closed at check-out (or by the
desk). It carries the PIN *hash*, the QR token *hash*, when it was last used, and the wrong-PIN
counter. The plaintext PIN and QR token exist exactly once: in the check-in response, on the screen,
and on the paper the desk prints.

### 42.1 Lifecycle

| Moment | What happens |
|---|---|
| **Check-in** (`POST /api/desk/stay` `action=check_in`) | A session opens, the QR token is minted, the PIN is generated, both come back **once**; the room goes `occupied` |
| Guest scans the card (`/room?qr=…`) | The token is hashed, looked up, checked against the stay, and the device is given an httpOnly `sunrise_room` cookie |
| Guest types room + PIN | The same session, counted against 3 attempts, then a 15-minute lock (the desk can rotate it) |
| Guest types reference + phone | The same session; only the last 6 digits of the booking phone are compared |
| **Check-out** / **no-show** | Every session for that room closes **immediately**. The card, the PIN, any photograph of the card and every phone holding the cookie stop working in the same second |
| Lost phone / shared phone | *Forget this device* (guest) closes it here only; *Room access* → **Close** or **Room N** (desk) cuts one device or the whole room |

**The cookie grants nothing on its own.** Every read re-validates that the session is still `open`
*and* the stay still live. That is why a copied cookie is useless after check-out, and why the desk
cannot "re-open" a dead session — it issues a new card instead.

### 42.2 Printing the card

*Room map* → **Check in & print the card** (or *Room access* → **Open access & issue PIN**) shows the
card on screen: the PIN in large type, the QR link, print and copy buttons. **Print the card** opens
the print dialog on a cut-out card carrying the room number, the guest name, the departure date, the
PIN, the link, and three plain-language steps for the guest.

> ⚠️ **QR images need one setting.** No QR encoder is bundled with this repository. If
> `NEXT_PUBLIC_QR_IMAGE_BASE` is set (an on-site label printer, or an internal QR service that takes
> the data as its path/query), the card and the screen draw a real scannable QR. If it is **not**
> set, the card prints the PIN in large type and the link as text for the office's own QR tool. We
> deliberately do **not** fall back to a public QR website: the token *is* the credential, and
> sending it to a third party would be handing out the key. Either way the **PIN path always works**
> — room number plus four digits, no QR, no camera, no data bundle.

### 42.3 What the desk can do (tab: **Room access**)

| Action | When | What it does |
|---|---|---|
| **Open access & issue PIN** | Checked in, but no card was ever printed (the tab lists them) | Opens the session, mints the PIN and QR link, sets the room `occupied` |
| **New PIN** | Guest forgot it, or the lock fired | Rotates the PIN, clears the lockout, shows the new PIN once |
| **Close** | Lost phone, phone left behind, a device to be cut off | Closes that one device, with the reason typed in and audited |
| **Room N** | The whole room must be unreachable | Closes every session on that room at once |
| **Print again** | Card lost, or the guest wants a second one | Re-prints the current card — the PIN is *not* stored, so if it is gone, rotate instead |

---


## 43. The landing page: reviews and the sold-out waitlist ✅

### 43.1 Reviews — the real average, or nothing

`GET /api/reviews` returns the **published** rows and the average computed from them. The landing
page prints that average, or says plainly that there are no reviews yet; `/review` shows the same
three most recent reviews beside the star picker.

| Who can rate | How |
|---|---|
| A signed-in account guest | One tap in the app |
| A room guest | The link in the check-out email: `/review?reference=…` plus the phone they booked with |
| A guest with neither | The same link — reference + phone is the proof, and the stay must have **finished** |

One rating per stay: submitting again **edits** the first review rather than stacking a second. The
manager can hide a review (it leaves the website and the average, and stays on record with who
changed it) or feature it (it sorts first). Auditors can read the screen and change nothing.

**Third-party reviews stay attributed.** A review recorded by the desk with `source=google` must
carry the link it came from (`sourceUrl`), and the page shows *via Google* — borrowing a Google
rating without saying where it came from would be dishonest.

### 43.2 The waitlist — a lost week becomes a lead

When every room is gone for the chosen nights, the landing page does not stop at "fully booked": it
asks for a name and **one** way to reach them, and stores the exact window in `waitlist_entries`.
The desk sees the list in *Reviews & waitlist*, and when those nights open (a cancellation, a
released hold) **Tell everyone waiting** mails them all at once and marks them `notified`. The link
in that email comes back to `/` with the dates pre-filled. The in-portal notice goes out at the same
moment, because a sold-out weekend often has a room that opens after a housekeeping check.

---

## 44. Operating routines for the new screens ✅

**At check-in (front desk, ~30 seconds).** *Room map* → tap the room → **Check in & print the card** →
print → **write the PIN on the key sleeve** → *Done — I have written the PIN down*. If the printer is
out of paper, the PIN is on the screen and can simply be read out.

**When a guest says "the code on the card does not work".**
1. *Room access* → find the room. Is there a session at all? If not, **Open access & issue PIN**.
2. Is the chip red (`PIN locked`)? Tap **New PIN** and read it out.
3. Is the guest on a phone that is not theirs? **Close** that device, then **New PIN**.
4. Are they checked out? Then nothing should work — that is the design. Take the order at the desk
   or start a new booking.

**When a phone is lost or left behind.** *Room access* → **Close** (one device) or **Room N** (the
whole room). The reason you type appears in the audit trail; a second phone gets a new card.

**Weekly (manager, ~10 minutes).** *Reviews & waitlist*: publish or hide anything new (hiding
changes the website's average and keeps the record), feature the best honest review, work the
waitlist for the coming month, and check *Guests* for accounts that were created but never
activated.

---


## 45. Where the code lives ✅

| Concern | File |
|---|---|
| Which guest is this, and may they charge the room? | `src/lib/guest-context.ts` |
| Room sessions: open, validate, rotate, close, kitchen window | `src/lib/room-session.ts` |
| Account creation, activation links, OTP issue/verify/resend, masking | `src/lib/guest-otp.ts`, `src/lib/guest-auth.ts` |
| Reviews, the average, the waitlist and its notifications | `src/lib/reviews.ts` |
| Guest routes (all three paths) | `src/app/api/guest/{room-session,sessions,orders,messages,requests,auth,activate,me}/route.ts` |
| Public reviews and the waitlist | `src/app/api/reviews/route.ts`, `src/app/api/waitlist/route.ts` |
| Desk: stay actions, room sessions, reviews | `src/app/api/desk/{stay,room-sessions,reviews}/route.ts` |
| The no-account screen | `src/components/guest/room-session-app.tsx` → mounted at `src/app/room/page.tsx` |
| The account screen (sign-in only — the desk registers every account) | `src/components/guest/guest-app.tsx` → `src/app/app/page.tsx` |
| Rating a stay (public) | `src/components/guest/review-form.tsx` → `src/app/review/page.tsx` |
| Activating an account (public) | `src/app/activate/page.tsx` |
| The printed room card | `src/components/desk/room-card.tsx` |
| The printed guest app sign-in card (email + system-set password), the WhatsApp handover, `generateGuestPassword`, `registerGuestAccount` | `src/components/desk/guest-credentials-card.tsx`, `src/lib/guest-account.ts` |
| New desk tabs | `src/components/desk/desk-roomaccess.tsx`, `src/components/desk/desk-reviews.tsx`, wired in `src/components/desk/desk-console.tsx` |
| Schema | `room_sessions`, `reviews`, `waitlist_entries`, `channel` + `room_session_id` on `message_threads` and `service_tasks` (`src/db/schema.ts`, migration `drizzle/0006_guest_path_channels.sql`) |

**Environment variables introduced:** `NEXT_PUBLIC_QR_IMAGE_BASE` (optional — see §42.2). Everything
else reuses what Part A and Part B already document: `PUBLIC_BASE_URL`, `KITCHEN_OPEN_HOUR`,
`KITCHEN_CLOSE_HOUR`, SMTP and the database URL.

---

## 46. Honest limits of this build ✅ (⚠️ where stated)

| Limit | Effect | The honest workaround |
|---|---|---|
| No QR encoder is bundled | Without `NEXT_PUBLIC_QR_IMAGE_BASE` the printed card carries the PIN and the link, not a scannable picture | The PIN path needs no camera: room number + four digits |
| No push notifications on the room path | A no-account guest is not told when food leaves the kitchen | The desk rings or WhatsApps the number on the booking; the order status is on `/room` when they look |
| One session per stay | Two guests sharing a room share that room's card (intended) | A guest who wants their own history creates an account |
| The landing page loads reviews client-side | Crawlers see the page without review cards; there is no schema.org `aggregateRating` markup yet | Server-render the reviews section if rich results matter more than the current page weight |
| Waitlist pick-up is manual | "Tell everyone waiting" is a button, not an automatic trigger on cancellation | Press it when a cancellation is processed — the routine is in §44 |

---

# PART D — the six addenda, and the fix that made them real

> ✅ **Status: the enforcement is built, migrated and verified.** Six further addenda arrived after
> Part C: **the staff dashboard (31)**, **the admin dashboard (32)**, **complete admin actions (33)**,
> **content and broadcast operations (34)**, **the travelling guest (35)** and **payments and what's
> new (36)**. They live in `docs/addenda/`.
>
> **Most of what they describe was already built.** The Today board, the room map, the order board,
> the message queue, tasks, the CRM, folios and invoices, the stay lifecycle, room access, the audit
> trail, reports, content, staff accounts, broadcasts and the whole guest app were all in the
> repository before those documents were read. **What was missing was the line between staff and
> admin** — and, in one place, the line did not exist at all.
>
> **The honest build status of all six documents — what is built, what is not, and what should be
> built next — is `docs/ADDENDA-BUILD-STATUS.md`.** This part documents the *mechanism* of the fix
> and the two capabilities that were genuinely new.

---

## 47. The fix that makes the rest of it true ✅

Every one of the six addenda repeats the same rule, and Part 32 §5 states it as a table:

> *"Every admin-only block is enforced on the server. Hiding a button in the UI is cosmetic."*

**That rule was not true.** The `sunrise_session` cookie was base64url-encoded JSON with no
signature. Anyone who opened DevTools, wrote `{"role":"admin"}` into a cookie of that shape and
reloaded was an admin as far as the server was concerned — so **every** server-side role check in the
system, including the ones that had already been written correctly, was passing a value the caller
had typed. The authority matrix was only as strong as the browser's willingness to lie.

### The change

| File | What changed |
|---|---|
| `src/lib/staff-auth.ts` | The cookie value is now `<base64url(payload)>.<hmacSHA256(payload, secret)>`, verified with **`timingSafeEqual`**. `signSession` / `readSession` / `sessionLabel` and the `SessionRole` type (`admin` \| `staff` \| `auditor`) live here. The legacy `sunrise_admin` marker is **signed too** — it used to be a bare `=1`, which was forgery in one line |
| `src/lib/desk-auth.ts` | The same shape as before, but now trustworthy: `deskActor(request)` returns the verified session, and **`requireAdmin(user)`** returns a `403` response for any non-admin. That one helper is what every admin-only write path calls |
| `src/app/api/admin/login/route.ts` | Issues the signed values |

Because the format changed, **every staff member, admin and auditor must sign in once more** after
this is deployed (§14.2). Guest auth is a separate system and is untouched.

### What is now enforced, and how it was proven

Eleven write actions that any signed-in staff session could previously perform now return **403**:

| Route | Action | Before | Now |
|---|---|---|---|
| `/api/desk/payments` | `verify` · `reject` a claimed payment | any session | **admin only** |
| `/api/desk/folios` | `add_charge` · `void_item` · `regenerate_invoice` | any session | **admin only** |
| `/api/desk/guests` | `set_status` · `set_consent` | any session | **admin only** (gate placed **before** the account lookup, so a staff request never reveals whether the account exists) |
| `/api/desk/reviews` | `moderate` | any session | **admin only** |
| `/api/admin/bookings/extend` | extend a stay | any session | **admin only** |

Four routes that had **no authentication at all** now require a session:

| Route | Was | Now |
|---|---|---|
| `GET /api/admin/audit` | public | **401** without a session; readable by staff and auditors (reading is what those roles are for) |
| `POST /api/admin/invoices` | public | **401** without a session, **403** for staff |
| `GET /api/admin/invoices` | public | **401** without a session |
| `POST /api/admin/upload` | public — anyone could write a file that the public site then served | **401** without a session |

And the mutation that a staff session may legitimately make was checked just as carefully: **cash
recorded at the desk still works for staff**. Its branch runs *before* the admin gate in
`/api/desk/payments`, so the gate closes the verify/reject door without closing the till.

**Five more write actions joined them in a later pass.** `posts` and `gallery` were the last handlers
that checked only *that somebody* was signed in, so a `staff` session could publish a news post or
delete a gallery picture — content the public site then served. Both now call `requireAdmin` as well:

| Route | Action | Before | Now |
|---|---|---|---|
| `POST /api/admin/posts` | publish a post | any session | **admin only** |
| `PATCH /api/admin/posts` | activate / pause a post | any session | **admin only** |
| `DELETE /api/admin/posts?id=` | delete a post | any session | **admin only** |
| `POST /api/admin/gallery` | add a picture | any session | **admin only** |
| `DELETE /api/admin/gallery?id=` | remove a picture | any session | **admin only** |

`GET` on both routes stays open **on purpose** — the public home page and `/gallery` read through it,
and so does the Pictures / Posts tab for a staff session, which may now look but not touch.

**In the UI**, `isAdmin` is threaded from `desk-console` into `desk-money`, `desk-guests` and
`desk-reviews`, and the admin-only controls are **not rendered at all** for staff — with a short line
saying who does it instead. The legacy `/admin` portal does the same for Pictures and Posts, which is
why a staff member who has been given no new buttons also has none that can only fail. That is the
cosmetic half; §47 is the half that matters.

### The verification

`scripts/addenda-verify.mjs` makes **real HTTP calls with real cookies** and asserts the status code —
it does not read the source and assume:

```
node scripts/addenda-verify.mjs
→ RESULT: 58 passed, 0 failed
```

It asserts that a **forged unsigned** cookie and a **forged bad-signature** cookie both return
**401**, that an auditor can *read* the menu but is *refused* the toggle, that a staff session is
refused every post and gallery write while still being allowed to read both, and that a sold-out dish
both persists in the database and reaches the guest's screen. It also flips one free room to `dirty`,
proves the assignment of a real booking to it is **refused with 409**, confirms nothing was written,
and puts the room's state back. Two things it deliberately never does: verify a real payment, or
extend a real booking. The extend test asserts against a non-existent id, and every post/gallery
probe is a rejection, so running the suite cannot leave live data changed.


---

## 48. The staff "sold out" exception ✅

Part 31 §14 lists the things the desk must be able to do mid-service, and #12 is the one that was
missing entirely:

> *"Mark a dish sold out when the kitchen runs out."*

This is the **one** menu power the desk is given, and the addenda are precise about its shape: the
desk closes a dish and reopens it — **nothing else**. No price, no description, no photo, no add, no
delete. A sold-out dish is **off sale today, back tomorrow**; it is not deleted.

| | Staff | Admin | Auditor |
|---|---|---|---|
| See the menu board | ✅ | ✅ | ✅ |
| **Toggle sold out** | ✅ | ✅ | ❌ **403** |
| Change a price, a description or a photo | ❌ | ❌ *(no screen exists)* | ❌ |
| Add or delete a dish | ❌ | ❌ *(no screen exists)* | ❌ |

The auditor column is the point of the role: it reads everything and changes nothing, which is
exactly what an external reviewer or an owner's accountant needs. `POST /api/desk/menu` allows staff
and admin and refuses an auditor; every toggle writes an **audit entry** with the actor label, the
dish, the new state and the time.

The screen is `src/components/desk/desk-menu.tsx`, reachable as the **Menu · sold out** tab in
`/desk`. It shows each dish with its price and its current state and exactly one control per row.

---

## 49. The guest side: the menu finally comes from the database ✅

Marking a dish sold out is worthless if the guest's screen is a constant. It was:

> `/dine` rendered a **hard-coded array of dishes written into the page**.

No price could change, no dish could be added, and no dish could ever be sold out. The desk toggle
would have changed a database row that **nothing read**.

`/dine` is now a **server component** that reads `menu_items`. `DinePage` in
`src/components/experience-pages.tsx` gained an `items?: DineItem[]` prop with a fallback list, so the
page still renders if the query ever fails — it never shows a blank menu.

| When a dish is… | The guest sees |
|---|---|
| Available | The dish, its price, and the ordering controls |
| **Sold out** | The dish, its price, a clear **"Sold out today"** marker — and **no ordering controls at all** |

The dish **stays on the menu**. That is deliberate: Part 35's rule is that the app is an advantage,
never a requirement, and a guest standing at the counter with a phone needs to see that the thing they
wanted exists and is simply gone today — not be left wondering whether it was ever on the menu.

**In-app ordering reads the same flag.** `/api/guest/orders` is gated by `menu_items.is_available`, so
a stale screen cannot order a dish the kitchen has run out of. The database is the single source of
truth for all three surfaces: the desk, the public page and the app.

**How this was verified.** The verification suite asserts the whole round trip: staff toggles the dish
off → the row **stays off in the database** → `/dine` renders **"Sold out today"** for that dish → the
dish is toggled back on → the guest can order it again. And one further check proves the page is
really reading the table rather than a list: it renders **"Area 5 Garden Crunch Salad"**, a seeded
dish that **was not in the old hard-coded array** and therefore could not have appeared before.

### 49.1 The dish card, and the sheet that every guest form opens in

Two things the database work above could not fix, because they were layout and interaction rather
than data.

**The card, measured before it was changed.** A dish renders as
`<article class="menu-page-card sell-card sell-dish">` with **two** `div` children: the picture box
(`.sell-photo.sell-dish-photo`) and the text column. `inner-pages.css` styled "the card's div" with a
child selector — `.menu-page-card > div { display:flex; flex-direction:column; padding:20px }` —
which is right for the text column and wrong for the picture, which it inset by 20px inside a frame.
One rule fixes it, with no `!important`:

```css
.menu-page-card > .sell-photo { display: block; padding: 0; }   /* inner-pages.css:127 */
```

It is a two-class selector (**0,2,0**) against a class-plus-type one (**0,1,1**), so it wins at every
width — including against the phone rule `.menu-page-card > div { padding:15px }`. And because
`enhancements.css` lands **after** `inner-pages.css` in the built bundle, `.sell-dish { display:flex;
flex-direction:column }` also beats the card's default `display:grid`: a dish stacks picture over
copy at every width, while the grid stays for the cards that keep an image beside the text.

**A dish is ordered in the sheet, not in a form at the foot of the page.** Each card carries **Order
for Table** and **Takeaway**; both call `openOrder(id, type)`, which adds the dish, pre-chooses
dine-in or takeaway and opens the popup — so the dish the guest tapped is already in it, priced, on a
line with a stepper, and the order is corrected there instead of restarted. A sold-out dish
(`is-sold-out`: dimmed and struck through) carries no ordering controls at all.

That sheet is the **site-wide modal pattern**: `.booking-modal-backdrop` + `.booking-modal-sheet` +
`.sheet-close-btn` from `globals.css`; the X or a click on the backdrop closes it, and nothing is lost
by leaving. `/unwind` (table or braai spot), `/connect` (day workspace) and `/track` (booking lookup)
use the same one, so a guest meets one modal behaviour everywhere. `/track` also opens itself when
the URL carries `?ref=`, which is exactly what the booking email's **Track this booking** button
links to (`src/lib/mail.ts:115`). `/stay`'s booking form and the home page's availability sheet
already worked this way, which is why `/track` and `/review` were the only two forms left to check.

**`/review` is the one guest form deliberately left inline.** One tap on a star submits it, and the
check-out email already deep-links the page (`/review?reference=…`, `src/lib/reviews.ts:99`). A sheet
there would add a tap to the interaction that page exists to make instant. The staff consoles, the
admin portal and the guest-app sign-in are operational screens, not pages where a form interrupts
reading — the popup pattern is for the marketing pages, where a form must never stand between the
guest and what they came to read. The home page's **sold-out waitlist form** is the one other inline
guest form, and for the opposite reason: it *is* the empty state, rendered only when every room is
taken, so there is nothing for a popup to interrupt. `/review` keeps that decision **and** now has its
own route sheet to go with it — `src/app/review/review.css`, every class `rv-`-prefixed and scoped to
`.rv-root`, imported by that one route the way `home-premium.css` is by `/`, so restyling the form
costs no other page a byte.

---

## 50. Where the code lives ✅

| Concern | File |
|---|---|
| **Signed sessions** — sign, verify, label, roles | `src/lib/staff-auth.ts` |
| The desk/portal session reader and `requireAdmin` | `src/lib/desk-auth.ts` |
| Login issues the signed values | `src/app/api/admin/login/route.ts` |
| **The sold-out endpoint** | `src/app/api/desk/menu/route.ts` |
| **The sold-out screen** | `src/components/desk/desk-menu.tsx` |
| The desk shell, role threading, tab list | `src/components/desk/desk-console.tsx` |
| The guest menu (now server-rendered) | `src/app/dine/page.tsx`, `src/components/experience-pages.tsx` |
| **The dish card's picture box** | `.menu-page-card > .sell-photo` in `src/app/inner-pages.css`; the `.sell-*` card classes it works with are in `src/app/enhancements.css` |
| **The popup sheet, shared by every guest form** | `.booking-modal-backdrop` / `.booking-modal-sheet` / `.sheet-close-btn` / `.form-fields-group` in `src/app/globals.css`; the sheets themselves in `src/components/experience-pages.tsx` (order, table, enquiry) and `src/components/track-booking.tsx` (booking lookup) |
| Admin-only gates in the desk APIs | `src/app/api/desk/{payments,folios,guests,reviews}/route.ts`, `src/app/api/admin/bookings/extend/route.ts` |
| The four previously open admin routes | `src/app/api/admin/{audit,invoices,upload}/route.ts` |
| **The verification suite** | `scripts/addenda-verify.mjs` → `node scripts/addenda-verify.mjs` |
| Schema touched | `menu_items.is_available` (`src/db/schema.ts`) — no new tables, no migration needed |

**Environment variables introduced:** `SESSION_SECRET` (§15) — recommended, not required.

---
## 51. The build status of all six addenda ✅ (⚠️ where stated)

The full per-section status — every claim verified against the code, the schema and live HTTP calls —
is in **`docs/ADDENDA-BUILD-STATUS.md`**. This is the summary.

| Part | Document | Built in this change | Still open |
|---|---|---|---|
| **31** | The Staff (Front Desk) Dashboard | The authority line (§47), the **sold-out** control (§48), and the signed cookie that makes the desk's identity real | **Guest ID / passport capture and the guest register** (a legal requirement — no column, no table, no PDF) · taking a booking, a walk-in or a quick availability check at the desk (there is **no `POST`** on bookings) · shift handover notes · the deposits-at-risk panel (`deposit_required` exists and nothing reads it) · most of the §14 list — luggage, walkouts, phone-call logs, early departure, pre-check-out balance confirmation, day-end reconciliation |
| **32** | The Admin Dashboard | Three previously **unauthenticated** admin routes are now session-guarded, and the authority matrix is real | **No Menu screen at all** in the admin portal (zero occurrences of "menu" in `src/app/admin/page.tsx`) · no day-close screen · no occupancy / ADR / RevPAR analysis · no per-staff activity report · no scheduled or targeted broadcasts |
| **33** | Complete Admin Actions | The gates, plus the audit trail being closed to the public | No booking **create** and no date/room/amount **edit** from the portal · no refunds · no folio merge or split · no bulk actions · no export except revenue and the audit CSV |
| **34** | Content and Broadcast Operations | `POST /api/admin/upload` — which anyone could use to write a file the public site then served — now requires a session | Broadcasts go to `all_users` only; the send is not targeted or scheduled: no segments, no templates, no delivery-history screen, no rich push (image, deep link, buttons) |
| **35** | The Travelling Guest | `/dine` reads `menu_items`, and ordering honours `is_available` | No online payment · no split bill · no loyalty · English only · no offline behaviour · no pre-arrival check-in · no guest-side booking management · travel companions have no record of their own |
| **36** | Payments and What's New | `verify` and `reject` are now the admin's alone, while staff still record cash | No gateway at all (there is no Airtel Money, TNM Mpamba or card checkout) · no automatic reconciliation · no refunds · no provider webhooks · single currency |

**Already built before any of this, and worth not rebuilding:** the Today board, the room map, the
order board with channels and waiting clocks, the message queue grouped by room, housekeeping and
service tasks, the guest CRM with stay history and flags, folios and invoice PDFs, the full stay
lifecycle, room access (QR card and PIN), the searchable append-only audit trail, revenue CSV and
bookings PDF, gallery / posts / events, staff accounts, the broadcast composer with its test send,
the guest app, and the no-account room session.

### Two server-side rules tightened in this pass

Both were found by checking the claims in the table above against the code instead of trusting them:

| What was wrong | The fix | How it is proven |
|---|---|---|
| `POST` / `PATCH` / `DELETE` on `/api/admin/posts` and `POST` / `DELETE` on `/api/admin/gallery` checked only *that* a session existed — so a `staff` session could publish a news post or delete a picture that the public site then served | All five handlers now call `requireAdmin` (§8.3, §9.2, §47). `GET` on both stays public **on purpose**, because the home page, `/gallery` and the admin tab read through it | Sixteen new live assertions in `scripts/addenda-verify.mjs` — fourteen status codes (**401** anonymous, **403** for both `staff` and `auditor`, **200** for the two reads) and two checks that the reads still return arrays |
| Room assignment checked `out_of_order` and overlapping stays but **not** `dirty`, so a guest could be put into an uncleaned room — and the write then silently overwrote the room's housekeeping state to `occupied`/`available`, losing the "needs cleaning" signal | `PATCH /api/desk/rooms` refuses a `dirty` room with **409** and a message naming the room, *before* any write. The desk marks the room clean first | Live: a free room is flipped to `dirty`, a real booking is refused, the room is confirmed still dirty and unassigned, and the original state is restored |

### What to build next, in order

| # | Gap | Why it comes first |
|---|---|---|
| 1 | **Guest ID / passport capture and the guest register** (Part 31 §14 #4–#5) | A **legal requirement** in Malawi. Everything else on this list can wait; this cannot |
| 2 | **Create and edit a booking from the portal** (Part 33 §A–§B) | There is no `POST` on `/api/admin/bookings`, so a phone booking or a walk-in cannot be entered anywhere. Every booking must first arrive from the public website |
| 3 | **Deposits at risk** (Part 31 §4, §17) | The columns exist and nothing reads them, so a deposit deadline passes with no chase and no release |
| 4 | **Menu management in the admin portal** (Part 32 §4.9) | The desk can close a dish; nobody can add one or change a price. Prices are seed-only |
| 5 | **Shift handover notes** (Part 31 §13) | The cheapest item here, and the one a real front desk misses within a week |
| 6 | **An online payment gateway** (Part 36) | The biggest, and the one that changes the guest experience most — but everything around it (the queue, the ledger, verification, auto-confirm, the receipt) is already in place and waiting for it |

---
## 52. Honest limits added by this change ✅ (⚠️ where stated)

| Limit | Effect | The honest workaround |
|---|---|---|
| **Everyone signs in again** | Signing the cookie changes its format, so an old unsigned cookie is refused. Staff, admins and auditors must log in once more after deploy | Tell them before you deploy. Nothing else is affected; guest sessions are untouched |
| **`SESSION_SECRET` falls back to `ADMIN_PASSWORD`** | If `SESSION_SECRET` is unset, the signing key is the admin password. Changing that password then invalidates every session | Set `SESSION_SECRET` to a long random string in the deployment environment (§15). The code needs no change to pick it up |
| **No key rotation** | There is one signing key and no key id in the cookie, so rotating it signs everyone out | Accept the re-login, or add a key id to the payload and verify against a key set — a small change, not made here |
| **The desk cannot edit the menu** | Sold out is a toggle. A wrong price or a missing dish still needs a developer **or** a database change, because no admin Menu screen exists | The dish is closed off sale rather than left wrong; the real fix is Part 32 §4.9 (build the Menu tab) |
| **The audit trail is readable by staff** | A staff session *can* read the audit trail, because Part 32 asks for it to be visible to the desk. It cannot change or delete a row — nothing in the codebase does | If the trail should be admin-only, that is a one-line change in `src/app/api/admin/audit/route.ts` |
| **The auditor role is new and thin** | `auditor` can read and cannot write, but there is no auditor-specific screen — the role simply satisfies the existing reads | It is enough for the stated purpose (external review, the owner's accountant) |
| **The verification suite runs against a live server** | `scripts/addenda-verify.mjs` needs a server on `localhost:3112` and a signed-in session to mint its cookies | Run `npm run build` then `npm start`, then `node scripts/addenda-verify.mjs` in a second terminal. Its only writes are `menu_items.is_available` and one room's housekeeping state — both toggled and put back |
| **A stale `.next` can 404 every nested route** | If `.next` is left behind by two concurrent `next` processes, the generated `.next/dev/types/routes.d.ts` can be written half-finished. `next build` then dies on `Unterminated regular expression literal`, and in dev every `/api/a/b` route answers **404** while `next start` from a good build is unaffected | `rm -rf .next` and rebuild. Never run `next dev` and `next build` at the same time. Nothing in `src/` is wrong when this happens |

---

*Keep this file updated whenever a route, table, status or flow changes. Part A describes what the
code does today, Part B describes what it must do next, Part C describes the three addenda already
built on top of it, and Part D describes the six later addenda: the enforcement that makes the
authority matrix true, the staff sold-out exception, the guest menu that now comes from the database,
and the honest list of what is still missing. When a phase ships, move its content from Part B into
the matching Part A section; when a gap in §20, §38, §46 or §52 is closed, move that row out rather
than leaving a sentence that is no longer true. The per-section status of every addendum claim lives
in `docs/ADDENDA-BUILD-STATUS.md`.*

---

# PART E — the navigation and image addenda (built)

Two further addenda — *Navigation Structure & Image Usage Standards* and *The Landing Page — Improved
Approach & Additional Improvements* — are now built into the code. Both are quoted below by their own
part numbers (Part 2, Part 5.4, …) so a reader holding either document can follow the mapping exactly.
This part says what landed, where it lives, and what is still outstanding.

## 53. Three navigation tiers, one component

`src/components/site-nav.tsx` (+ `src/app/site-nav.css`) is the only navigation on the public site: the
home page and every inner page (`PageFrame` in `experience-pages.tsx`) render it.

| Tier | What it holds | Where |
|---|---|---|
| Utility bar | front-desk phone · Get the app · **Manager portal (a text link, never a button)** | `.utility-container` |
| Primary row | Home · Stay · Dine · Unwind · Connect · Gallery — six items, with a descriptor under Stay / Dine / Unwind / Connect | the `PRIMARY` array |
| Action cluster | **Check availability** (the one primary button) · Track booking (text link) · WhatsApp | `.header-right-actions` |
| Mobile drawer | the six items, then a divider, then Track booking / Get the app / Order to your room / Manager portal, then call + WhatsApp | `.site-primary-nav` under 900 px |
| Mobile sticky bar | Check availability + WhatsApp, on every page | `.site-sticky-bar` |

Rules the component enforces: **relative links only** (nothing points at `localhost:3112`), the current
page is marked with `aria-current="page"` and `.is-active`, the logo links Home *and* the Home label
still exists, exactly one primary button per view, the manager portal never competes with it, and every
tap target is at least 44 px. The old flat row and the four-item mobile bottom bar are gone.

## 54. The landing page: images used well

* The hero is **one** photograph (`/images/hero-standard.jpg`) rendered as a real `<img>` with alt text,
  width/height and `fetchPriority="high"` — never a carousel, never lazy-loaded.
* Under the headline: **"Rooms from MWK …"** (the cheapest real rate for the dates being searched) and
  the front-desk number as a tap-to-call. Nothing invented, nothing hidden in a modal.
* Room cards, event cards and the gallery all render through `SafeImage`, so every photograph carries
  alt text that describes the scene, a reserved box, lazy loading and a clean placeholder.
* Posts on the home page come from the public feed `GET /api/posts`.
* The footer is grouped as the standard asks — Stay · Food & events · Practical · Contact · Find us —
  and every link in it resolves.

## 55. Motion

`src/app/animations.css` + `src/components/reveal.tsx`: a hero entrance (CSS only, so the first paint
does not wait for JavaScript), scroll-reveal for sections, staggered card arrival, a slow ken-burns on
the hero, and photo zoom on hover. Everything animates transform/opacity only, everything is switched
off under `prefers-reduced-motion: reduce`, and a 2.4 s CSS safety net reveals the content even if
JavaScript never arrives — motion is never allowed to hide a price or a room.


## 56. The app shows the same content

The guest app (`src/components/guest/guest-app.tsx`) now has the five bottom tabs the standard
specifies — **Home · Order · What's on · Messages · My stay** — with the room number pinned in the
header and unread badges on exactly two tabs (What's on and Messages). Orders, requests and settings
moved one tap inside My stay, and every sub-view carries a working "Back to My stay". **What's on**
renders the same posts the website shows, images included, from `/api/posts`; the no-account room
session (`room-session-app.tsx`) shows the same feed, because the app is an advantage and never a
requirement.

## 57. What the manager can do with images and posts

In the manager portal, **Pictures**: upload from phone or laptop (`ImageUploader` → `POST /api/upload`
→ Vercel Blob, or Postgres + `/api/images/<id>` when Blob is not configured), give it a title,
**alt text**, a category and a caption, and remove it. **Posts**: publish with an uploaded picture, one
from the gallery, or a URL — and optionally push it to every installed app. The legacy
`POST /api/admin/upload` path (which wrote to `./uploads`, wiped on every Vercel deploy) is no longer
called by the UI.

`npm run verify:media` proves the whole chain (§11.1) and passed 10/10 against a live server when this
was written.

## 58. What is still outstanding from these two addenda

| Not built | Why it is honest to say so | Where it would go |
|---|---|---|
| Admin-editable home page (page-builder-lite) | The hero copy, trust strip, how-it-works steps and FAQ are still in `page.tsx` | A `home_page_sections` table + a Content tab |
| FAQ block | `faqs` exists in the schema with no API, screen or seeding, so `/` has no FAQ section | `GET /api/faqs` + a Content tab + `FAQPage` JSON-LD |
| Chichewa / English toggle | English only | A `?lang=` switch and a copy dictionary |
| `schema.org` JSON-LD, `sitemap.xml`, `robots.txt`, canonical URLs | Not present | `app/sitemap.ts`, `app/robots.ts`, JSON-LD tags |
| Structured location & directions block | The address, the maps link and the footer exist; the landmark and drive-time section does not | A Location section fed from an admin field |
| Corporate / NGO accounts, groups & functions enquiries, loyalty, legal pages | All still absent (Parts 10.2–10.9 of the landing-page addendum) | Their own tables and tabs |
| Analytics funnel | No page-view / dates-searched / modal-opened events are recorded | A small `analytics_events` table + a daily summary |
| Upload garbage collection | Deleting a gallery row leaves the bytes in `uploaded_images` | A cleanup job |
| The hero photograph is fixed | `/images/hero-standard.jpg` ships in the repo; a manager cannot choose another yet | A `hero_image_url` setting |

---

*Part E is the seventh addendum to reach the repository: navigation gained its three tiers, images
gained a standard that the code enforces rather than describes, motion arrived without ever hiding
content, and the guest app finally shows the same what's-on feed as the website. Keep this part
truthful: when a row in §58 is closed, move it out of that table rather than leaving a sentence that is
no longer true.*

---

## 59. The two alerts the site sends by itself ✅

Everything else in this repository waits to be asked. These two do not — they are the only messages
the site originates, and both are deliberately narrow, because a channel that shouts stops being read.

**1. Publishing an activity post alerts subscribers — automatically.** `POST /api/admin/posts` now
calls `sendWebPush()` itself, so there is no second step to remember and no way for the two to drift
apart. Two brakes are built in and named in the reply, not hidden:

| Brake | Why | What the portal shows you |
| --- | --- | --- |
| At most one publish alert per 10 minutes (`PUBLISH_PUSH_LAST_AT`) | Editing three posts in a row must not machine-gun everyone | *Post published — alert: Held back: a post was announced minutes ago…* |
| A push failure never blocks the publish | The post is the product; the alert is a bonus | *Post published — alert could not be sent… the post is live regardless* |

The toast in `src/app/admin/page.tsx` repeats the exact count the server reported
(*“— alert sent to 1 device”*, or *“— no device has alerts on yet”*), so “did anything go out?” is
answered by the portal rather than guessed. The Firebase checkbox next to it is untouched and still
independent: Firebase reaches the **installed Android app**, Web Push reaches **browsers and the
installed web app**. Neither channel can double-send into the other.

**2. A once-a-day “rooms free tonight” digest** — `GET /api/cron/availability-digest`, scheduled at
**16:00 Malawi time** by `crons` in `vercel.json` (`0 14 * * *`). It counts free rooms for tonight with
the same arithmetic as the site's own availability bar, then refuses to send unless all three hold:

* at least one room is genuinely free tonight (`free > 0`),
* the number **changed** since the previous digest (`DIGEST_LAST_COUNT`),
* nothing has been sent yet **today** (`DIGEST_LAST_SENT_ON`).

So a quiet Tuesday produces silence, not a notification saying nothing happened. The manager can send
it by hand from **Admin → Notifications** (*Send “rooms free tonight” alert now* → `?force=1`), which
skips the day/changed guards but still will not announce a fully booked night — that path requires a
manager session, while the scheduled path is guarded by the three conditions themselves (the endpoint
is harmless to call: it cannot send twice in a day).

**Honest limits of this section.** None of it reaches anybody until a person opts in — footer →
**Get alerts** (or the same block on `/download`); until then the portals honestly say
`devices: 0`. Vercel runs crons on the project's own schedule, so if the schedule is edited in the
dashboard rather than in `vercel.json` the two will disagree. And the trigger for the digest is a
cron, not an event: it fires at 16:00 local, not the instant a cancellation arrives.

**To turn either off, no code change is needed:** delete the `PUBLISH_PUSH_LAST_AT` /
`DIGEST_LAST_SENT_ON` / `DIGEST_LAST_COUNT` rows to reset their memory, or remove the `crons` entry
from `vercel.json` to stop the daily digest entirely.


---

## 60. Inviting administrators ✅

Three addresses had to become administrators and receive an invitation with a link to set up their own
account. The invitation machinery already existed, so this section maps the brief onto it **instead of
building a second one** — two parallel tables would have meant two answers to "is this person invited?".

| The brief asked for | Where it already lives | Why not a new one |
| --- | --- | --- |
| `admin_invites` table | **`invitations`** (+ `staff`) | Already carries `tokenHash`, `status`, `expiresAt`, `deliveryError` — and hashed tokens, so a database dump cannot be used to take over an account |
| `users` columns (`passwordHash`, `role`, `isActive`) | **`staff`** | Same three columns, plus `staffCode`, soft deletes and the audit links |
| `POST /api/admin/invite` | `/api/admin/invite` (added) + `/api/admin/invitations` (existing) | Thin shells over `src/lib/staff-invite.ts` — one implementation, two names |
| `POST /api/admin/invite/bulk` | `/api/admin/invite/bulk` (added) | A short loop plus a per-address report |
| `GET/POST /api/admin/setup` | `/api/admin/setup` → re-exports `/api/invitations/setup` | One token check, one account-creation path |
| `/admin/setup?token=…` page | `/admin/setup` → redirects to `/setup-account` | The real form is shared with guest invitations and is the URL in the email |
| `notification_log(to, subject, status, messageId)` | Now written for **every** invitation email | It was the one gap: invitations emailed through `sendMail` and logged nothing, so a failed invite was invisible in the database |

**Roles.** `INVITABLE_ROLES` now includes **`admin`**. `src/lib/staff-auth.ts` has always treated
`admin` as a Super Admin and the staff table already held such rows, yet the portal could neither
invite nor promote anybody to it — so the one role the motel asked for was the one the form refused.
The portal's role dropdown offers it as *Administrator*, and the "role" select no longer rewrites a
stored `admin` into `super_admin` while displaying it.

**The three addresses** live in one place (`DEFAULT_ADMIN_INVITES` in `src/lib/staff-invite.ts`):
`sunrisemotelllw@gmail.com` as **Super Admin**, `evone.azraa@yahoo.com` and `cchiwale25@gmail.com` as
**Admin**. The portal button *Invite all 3 default emails* asks the server for that list rather than
repeating it in the component, and reports each address's own outcome.

**One of them already had an account** — which is why the endpoint does not simply refuse. For an
address that already has an active staff account the role is set and a *role granted* email is sent
that says what is true: your existing password still works; if you have forgotten it, ask a Super Admin
to set a new one. Sending a "set up your account" link to somebody who already has a password is how a
person ends up with two of them and no idea which works.

**Expiry is one constant.** `INVITEE_TTL_DAYS = 7` in `src/lib/invitation-email.ts` feeds both the row
and the sentence in the email; before this they were two hard-coded literals that happened to agree.

**Honest limits.** An address that already has a *guest* account is still skipped (its owner is told
why); "Copy link" re-issues the token, so the previously emailed link stops working — the portal says
so at the moment you press it; and nothing here proves an email reached an inbox, only that the mail
server accepted it with a provider reference recorded in `notification_log`.
---

## 61. The audit that came before this change ✅

`AUDIT_REPORT.md` is the audit: what already existed, how each existing flow works, and a
KEEP / EXTEND / MISSING / SKIP verdict for every item of the brief that prompted it. The
finding, in one line: this system is not a blank page — 30 tables, ~70 API routes and 23
pages already existed, so most of the brief was **already built** and the instruction to
extend rather than replace was the right one.

### Kept exactly as it was

Invite-only accounts (`/register` and `/signup` already redirect to
`/login?message=invite-only` — there is no self-registration anywhere, and guests never
create accounts); one email + one phone = one guest, enforced by two expression unique
indexes in the database; the desks' check-in/check-out, folio, invoice PDF and verify/reject
payment queue; POS orders and bill-to-room; `service_tasks` housekeeping and
`/api/desk/issues` maintenance; `audit_log` and `/admin/audit-logs`; `notification_log` with
email, web push and FCM; `revalidateLiveContent()` plus `force-dynamic` public pages.

### Added (all additive — the migration has no DROP, RENAME or ALTER COLUMN)

| Added | Where |
| --- | --- |
| Eight pricing columns with defaults (weekend, extra bed, cleaning, VAT basis points, min nights, weekly/monthly discounts, amenity charges) | `room_types`, `drizzle/0013_melted_wraith.sql` |
| `calculateStayQuote()` — the one price engine, pure and checkable by hand | `src/lib/pricing.ts` (appended below the untouched `bookingMath`) |
| `POST /api/rooms/calculate-price` — night-by-night breakdown, read-only | `src/app/api/rooms/calculate-price/route.ts` |
| The eight price inputs in the existing room form | `src/app/admin/page.tsx` |
| Weekend rate shown on `/stay` | `src/components/experience-pages.tsx` |
| `night_audit` and `expenses` tables, `computeNightAudit()`, `/api/admin/night-audit`, `/api/admin/expenses` | `src/lib/night-audit.ts` + routes |
| **Finance & night audit** page: occupancy, ADR, RevPAR, net today, run-the-audit, expense book | `/admin/finance` |
| Automatic cleaning task on check-out | `src/app/api/desk/stay/route.ts` |
| `merge-duplicate-guests.mjs` — dry run by default, `--apply` merges in one transaction | `scripts/` |

### Honest limits of this pass

The 30-day room calendar, the guest 360 page, the housekeeping Kanban board, `m_pesa`/`card`
in the desk payment picker, and a premium restyle of the older screens are **Phase 2/3** and
are named as such in `AUDIT_REPORT.md` — not quietly implied to be finished. The pricing
engine is wired into the new quote endpoint, but the public booking widget still uses the
original `bookingMath` path: switching live bookings over to VAT-inclusive quotes changes
what guests are charged, so that is a deliberate decision for the owner, not a side effect of
an audit.

---

## 62. VAT, and the decision that had to be made before wiring it ✅

The audit found the quote endpoint charging 16.5% VAT while the **public booking widget was
not** — because `bookingMath` predates the pricing engine. Wiring it up meant choosing whose
price changes, and there was only one answer that could not surprise a guest:

**VAT is INCLUSIVE.** `MWK 85,000 per night` on the website is what the guest pays, and the
VAT is the slice *inside* that figure:

```
gross 170,000 (2 nights × 85,000)
  VAT portion = 170,000 − round(170,000 × 10000 ÷ 11650) = 24,077
  net of VAT  = 145,923
  total charged = 170,000   ← unchanged
```

Bookings and their invoices now carry `taxAmount` (24,077 in that example) and an explanatory
line item — *“VAT 16.50% (included in the total)”* — so the books can file the tax while the
guest's total is exactly what it was before this change. In the current data the arithmetic
proves it: with no weekend price, no seasonal rate and no discount set, the engine's gross is
`rate × nights`, the same number `bookingMath` produced.

**To switch to adding VAT on top instead**, write one settings row — no code change, no deploy
of logic, no dashboard:

```sql
insert into app_settings (key, value) values ('PRICE_TAX_MODE', 'exclusive')
  on conflict (key) do update set value = 'exclusive';
```

Then `/stay` prices would no longer be the final price, so the website copy would need to say
“+ 16.5% VAT” — which is why inclusive is the default.

**What was verified, and how.** Two bookings were made through the real route with the *same
email in different capitalisation and the same phone number typed two ways*: the database came
back with `guest_rows = 1`, `bookings = 2`, `distinct_guest_ids = 1`, each invoice
`total 170,000 · tax 24,077`. The test ran against a local server with the mailbox deliberately
disabled (settings backed up, blanked, restored) so no real message left the building, and the
test bookings, invoices, events and guest row were then deleted.

---

## 63. Phase 2: calendar, blocks, housekeeping board, guest 360, exports ✅

Everything here is additive. Prices did not move, the VAT stays inclusive, no existing
screen changed behaviour, and with `room_blocks` empty the availability arithmetic is
byte-identical to before.

### The room calendar, and blocks that really block

`/admin/calendar` draws 30 nights × every physical room. A cell is green (free), blue (a
stay is assigned to that room), red (blocked) or yellow (needs attention today) — and the
blue cells come from `bookings.assigned_room_id`, the room the desk actually assigned, so
the grid never invents an assignment. Bookings with no room chosen yet are listed
separately instead of being painted onto a row nobody picked.

**Blocking is not decoration.** New table `room_blocks` (migration
`0014_lame_firelord.sql`, one `CREATE TABLE`, no drops) records "this room is not sellable
between these nights". `blockedCountByRoomType()` is subtracted in **both** places that
decide what is for sale — `/api/bookings` (inside its transaction, next to the overbooking
check) and `/api/availability` — using the same overlap rule as stays: a block that ends on
your check-in day leaves that night sellable. Click a night to start a block; the release
button puts the room back on sale.

### The housekeeping board

`/admin/housekeeping` sorts every room into Dirty · Cleaning · Clean · Inspecting ·
Maintenance from two real sources: `rooms.state` and the open `service_tasks` rows. Moving
a room writes through the same tables the desk reads, and marking a room clean closes the
cleaning task that put it there — so the board cannot tell a different story from the desk.
Every move is a button (not drag-and-drop), because the person using it is holding a phone.

### Guest 360

`/admin/guests/[id]` (reachable by guest id) shows one person: stays and lifetime figures,
then tabs for Bookings, Invoices, Payments, POS orders, Audit trail and Notes. Bookings are
matched by guest id **and** by email, so stays made before the one-profile rule are shown
with a marker rather than hidden, and `balanceDue` is summed from unsettled invoices instead
of booking totals — a part payment shows as a part payment.

### Exports

`/api/admin/reports?report=night-audit|expenses&format=csv` for Excel, and the same without
`format` for a printable page (Save as PDF in the browser). Buttons sit on `/admin/finance`.

### Honestly not done

Drag-and-drop on the board (buttons instead); a guest-360 link from the desk's guest list —
the page works by URL, the entry point is still to come; PDF *generation* for the finance
reports (the print view covers it); and the Phase 3 premium restyle of the older screens,
which is visual only and therefore deliberately separate from anything that moves money.
