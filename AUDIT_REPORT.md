/**
 * AUDIT REPORT — Sunrise Motel management system
 * ==============================================
 *
 * Written before a single line was changed, per the instruction to audit first and then
 * extend only what is missing. Every claim below is checkable in this repository.
 *
 * THE ONE-SENTENCE FINDING: this is not an empty project. It is a working system with
 * **30 tables, ~70 API routes and 23 pages**, already deployed, already enforcing the
 * motel's own rules (invite-only accounts, one-email-one-profile guests, live website
 * sync). The brief's Phase 1 is therefore roughly two-thirds *already built*, and the
 * parts that were genuinely missing were: room-level pricing (weekend / extra bed /
 * cleaning / VAT / discounts), a price-quote endpoint, the night audit with ADR and
 * RevPAR, expenses, and the duplicate-guest *merge*. Those are what this change adds —
 * and nothing else was touched.
 */

# 1. What already exists

## 1.1 Tables (30 before this change, 32 after)

| Table | What it holds | Verdict |
| --- | --- | --- |
| `room_types` | The sellable product: name, slug, description, **`rate`** (MWK/night), `total_inventory`, bed, sleeps, size, badge, features, images | **EXTEND** (pricing columns added) |
| `rooms` | Physical rooms: `room_number`, `floor`, `state` (available / occupied / dirty / clean / inspected / out_of_order), `ooo_reason`, `ooo_until` | KEEP AS-IS |
| `room_type_rates` | **Seasonal and length-of-stay rates** (`kind`, dates, `min_nights`, `nightly_rate`) | KEEP AS-IS (now read by the quote engine) |
| `bookings` | reference, `booking_number` (BK-YYYY-XXXX), roomTypeId, dates, adults/children/nights, nightlyRate, serviceFee, extensionFee, discount, totalAmount, guest details, status, source | KEEP AS-IS |
| `guests` | The CRM identity: fullName, phone, email, country, `stay_count`, `total_spent`, `is_regular`, `is_no_show`, `marketing_consent` — with **two expression unique indexes** (`lower(email)`, `right(digits,9)`) | KEEP AS-IS |
| `guest_accounts`, `guest_sessions`, `activation_tokens`, `room_sessions` | Guest sign-in by email/phone + OTP, and the QR/PIN room session | KEEP AS-IS |
| `invoices` | `invoice_number`, line items (JSON), subtotal, taxAmount, total, paid, balance, status | KEEP AS-IS |
| `payments` | amount, `channel` (cash / bank / airtel_money / tnm_mpamba / other), `txn_ref`, payer, `status` (pending_verification / verified / rejected) | KEEP AS-IS |
| `folio_items` | Everything posted to a stay: room, extras, order, late_checkout, damage, adjustment — with void/voidReason | KEEP AS-IS |
| `orders`, `order_items`, `menu_items` | POS: bar / restaurant / laundry / mini-bar, order status and totals | KEEP AS-IS |
| `service_tasks` | Housekeeping & maintenance: `kind` (cleaning, towels, linen, maintenance…), priority, status, assignee | KEEP AS-IS (+ now created on check-out) |
| `staff` | Accounts and roles: super_admin, admin, motel_manager, restaurant_manager, staff, auditor; passwordHash/Salt; isActive; soft delete | KEEP AS-IS |
| `invitations` | Invite tokens (**hashed**), role, status, expiry, `delivery_error` | KEEP AS-IS |
| `audit_log` | Every action: actor, IP, summary, metadata | KEEP AS-IS |
| `notification_log` | Every message attempted on every channel, with status and provider reference | KEEP AS-IS |
| `booking_events` | Guest-visible booking timeline | KEEP AS-IS |
| `app_settings` | Key/value settings (mail, VAPID, VAT-style config) | KEEP AS-IS |
| `posts`, `gallery_images`, `uploaded_images`, `reviews`, `waitlist_entries`, `faqs`, `messages`, `message_threads`, `push_subscriptions` | Content, media, reviews, waitlist, guest↔desk messaging, push devices | KEEP AS-IS |
| **`night_audit`** | NEW: one row per business date — rooms sold, occupancy, ADR, RevPAR, room/POS revenue, expenses, net profit | **ADDED** |
| **`expenses`** | NEW: category, description, amount, paidTo, method, date, approvedBy | **ADDED** |

# 2. How the existing flows work today (and what I did to each)

**Booking** — `POST /api/bookings` → `findOrCreateGuest()` (`src/lib/hotel.ts`) matches the
guest on `lower(email)` **and** the last nine digits of the phone, in SQL, so rows written
before the rule still match → `bookingMath()` (`src/lib/pricing.ts`) computes
`nightly rate × nights + fees − discount` → booking + invoice written → `revalidateLiveContent()`.
Availability is **computed** by counting non-cancelled bookings that overlap the window
against `total_inventory`; there is no `room_availability` table. **KEPT** (the new quote
engine is a separate, read-only path; existing bookings are never recalculated).

**Guest identity** — one email + one phone = one guest, **enforced by the database** through
two expression unique indexes, not merely by code that remembers to check.
`scripts/verify-guest-identity.mjs` proves the matching rules. **KEPT.** The missing half was
a *merge* tool for data written before the indexes; added as
`scripts/merge-duplicate-guests.mjs` (dry-run by default).

**Room price** — `room_types.rate` (MWK/night) plus `room_type_rates` for seasonal and
length-of-stay pricing, both already live on `/stay`. **EXTENDED** with weekend price, extra
bed, cleaning fee, VAT rate, minimum nights, weekly/monthly discounts and paid amenities —
all new columns with defaults, so every existing row and code path behaves exactly as before.

**Check-in / check-out** — `/desk` console → `POST /api/desk/stay`: check-in opens the room
session (QR + PIN) and marks the room occupied; check-out sets the booking `checked_out`,
the room **dirty**, builds and settles the folio invoice, and updates the guest's
`stay_count` / `total_spent` / `is_regular`. **EXTENDED** with one addition: check-out now
also opens a `cleaning` service task, because a room *state* has to be looked at while a task
is a thing somebody is handed.

**Invoicing & payments** — invoices with JSON line items, a folio that accepts extra charges,
payments with channel + transaction reference and a verify/reject queue, and a folio invoice
PDF (`src/lib/folio-invoice.ts`). **KEPT.** M-Pesa and Card are already *storable* (the column
is free text) but the desk's own picker lists the older channel names; adding `m_pesa` and
`card` there is Phase 2 because it touches the desk UI.

**POS** — menu items, orders, order items; bill-to-room posts to `folio_items` under category
`order`. **KEPT.**

**Housekeeping & maintenance** — `service_tasks` (cleaning, towels, linen, maintenance…) with
priority/status/assignee, plus `/api/desk/issues` for repairs. **KEPT.** There is no Kanban
board page; the desk reads the task list. A board is Phase 2.

**Auth, roles & invitations** — `sunrise_session` is an HMAC-signed cookie; roles are
super_admin / admin / motel_manager / restaurant_manager / staff / auditor. **Nobody
self-registers**: `/register` and `/signup` both redirect to `/login?message=invite-only`, and
only a Super Admin can create an account — by invitation, with a hashed, single-use, expiring
token. `/api/admin/invite`, `/api/admin/invite/bulk`, `GET/POST /api/admin/setup` and the
public `/setup-account` (with `/admin/setup` forwarding to it) all exist and were verified
sending real mail. **KEPT AS-IS — this is the unique flow, untouched.**

**Guest portal** — `/app` (and the `/room` QR/PIN session): the guest signs in with
email/phone + one-time code and sees bookings, invoices and orders. **No guest password
registration.** **KEPT AS-IS.**

**Notifications** — `notification_log` records every attempt on every channel; email goes
through SMTP/Resend, web push through self-generated VAPID keys, the Android app through FCM.
**KEPT AS-IS.**

**Website live sync** — `revalidateLiveContent()` on every write, `force-dynamic` public
pages, `no-store` on `/api/*` in middleware. **KEPT AS-IS** (new pages follow it).

**Reports** — `/api/admin/reports` exported a daily bookings PDF and a revenue CSV only; there
were **no occupancy / ADR / RevPAR figures anywhere**. **EXTENDED** — they now exist, computed
by the night audit.


# 3. Verdict per brief item

| Brief item | Status | Note |
| --- | --- | --- |
| Rooms with number, floor, type, status, housekeeping state | **KEEP** | `rooms` already models all of it, including out-of-order with a reason and a date |
| Room pricing: base + weekend + extra bed + cleaning + tax + minNights | **EXTEND** | New columns; `rate` stays the base price, so nothing reading it changes |
| Seasonal pricing | **KEEP** | `room_type_rates` already held it |
| Amenities with charges | **EXTEND** | `amenities_charges` column + engine |
| Weekly / monthly discounts | **EXTEND** | Basis-point columns + engine |
| `POST /api/rooms/calculate-price` | **MISSING → BUILT** | Night-by-night breakdown, read-only |
| 30-day calendar / click-to-block a date | **MISSING** | Phase 2 (needs a dated block table; changes no existing flow) |
| Booking lifecycle + overbooking protection | **KEEP** | Overlap counting already refuses a room with live bookings |
| 1 email = 1 guest | **KEEP (DB-enforced)** | Verified live: two bookings, one guest row |
| `merge-duplicate-guests.mjs` | **MISSING → BUILT** | Dry-run by default; `--apply` merges in one transaction |
| Guest 360 profile page | **MISSING** | Phase 2 (`/api/desk/guests` already returns the data) |
| Invoices, items, payments, receipt | **KEEP** | Folio, invoice PDF, verify/reject queue all exist |
| M-Pesa / Airtel / Bank / Cash / Card | **KEEP** | All storable today; the desk picker gains `m_pesa`/`card` in Phase 2 |
| POS bar/restaurant with bill-to-room | **KEEP** | Orders post to folio items |
| Housekeeping board + auto task on check-out | **EXTEND** | Auto task added; the Kanban board is Phase 2 |
| Three-role auth + invitations, no self-registration | **KEEP AS-IS** | Exactly the unique flow described |
| Night audit: occupancy, ADR, RevPAR | **MISSING → BUILT** | Table + engine + API + `/admin/finance` |
| Expenses feeding net profit | **MISSING → BUILT** | Table + API + form |
| VAT (16.5%) | **MISSING → BUILT (inclusive)** | The advertised price stays the price paid; VAT is recorded *inside* the total. `PRICE_TAX_MODE=exclusive` adds it on top instead |
| Audit logs with diffs | **KEEP** | `audit_log` + `/admin/audit-logs` |
| Premium UI everywhere | **PARTLY** | New pages use the existing premium classes; restyling every old page is Phase 3 (visual only) |

# 4. What this change actually added (Phase 1)

1. **Room pricing, additively.** `room_types` gained `weekend_price`, `extra_bed_price`,
   `cleaning_fee`, `tax_rate_bp` (default **1650 = 16.50%**), `min_nights`,
   `weekly_discount_bp`, `monthly_discount_bp`, `amenities_charges` — every one with a
   default, and the migration contains **zero** `DROP`, `RENAME` or `ALTER COLUMN`
   (`drizzle/0013_melted_wraith.sql`).
2. **The quote engine** — `calculateStayQuote()` in `src/lib/pricing.ts`. Pure: no database,
   no clock, no environment. Precedence per night: length-of-stay rate → seasonal rate →
   weekend price → base rate; then extras, then the discount, then VAT **last**, so tax is
   charged on what is actually being charged. Exposed as
   `POST /api/rooms/calculate-price`.
3. **Night audit** — `night_audit` table + `computeNightAudit()`: rooms sold, occupancy, ADR,
   RevPAR, room revenue, POS revenue, expenses, net profit, per Malawi business date. Stored,
   not recomputed, so a month-old report cannot be rewritten by a later edit.
4. **Expenses** — `expenses` table + API, because net profit without them is revenue wearing
   a suit.
5. **`/admin/finance`** — stat cards (occupancy, ADR, RevPAR, net today), *Run night audit*,
   audit history and the expense book, using the same design classes as the rest of the portal.
6. **Automatic housekeeping on check-out** — a `cleaning` task opens by itself.
7. **The merge tool** — `scripts/merge-duplicate-guests.mjs` (discovered, not hard-coded:
   it finds every table with a `guest_id` column).
8. **Visible pricing on `/stay`** — the weekend rate shows next to the nightly rate when set.
9. **Admin room form** — the eight new price inputs, converting human percentages to basis
   points so 16.5% cannot be stored as 16%.

# 5. Recommended order from here

**Phase 2 (the day-to-day gaps that remain):** the 30-day room calendar with date blocking
(**done**, §63), a guest 360 page (**done**, §63), the housekeeping Kanban board (**done**,
§63), `m_pesa` and `card` in the desk payment picker (**done**), CSV/print export of the
night audit and expense book (**done**). Still outstanding from this phase: drag-and-drop on
the board, and a guest-360 link from the desk's guest list.

**Phase 3 (polish, visual only):** apply the premium card/table treatment across the older
admin and desk screens — CSS and markup only, no data-fetching or state changes.

**Not built, deliberately:** channel manager (Booking.com) sync, self-registration of any
kind, guest-created accounts, complex shift rota, and anything that would rename an existing
column or drop a table.

# 6. Tech stack (as found — not as proposed)

Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM over **PostgreSQL** (`pg`) ·
Tailwind-free hand-written premium CSS classes · nodemailer/Resend for email · `web-push`
(VAPID) for browser alerts · FCM for the Android app · `pdf-lib` for invoice PDFs · deployed
on Vercel with Neon Postgres, with `drizzle-kit migrate` running as part of `vercel-build`.

