# The Addenda — Build Status

**What this file is:** the honest, evidence-based answer to *"which parts of the six addenda are
already in the running system, and which are still only specified?"*

It exists because six specification documents arrived **after** a great deal of the system had
already been built, and re-implementing something that already works is the most expensive way to
waste a week.

| | |
|---|---|
| **How each claim was checked** | By reading the actual code (`src/`), the schema (`src/db/schema.ts`), the routes (`src/app/api/**`), the screens (`src/components/desk/**`), and by running the server and calling the endpoints |
| **Verified on** | 28 Sep 2026, against the local PostgreSQL database with a real staff account, a real booking and a real payment |
| **The verification** | 58 live checks — every admin-only operation returns **401** with no session, **403** for staff, and reaches its handler for an admin; the staff sold-out toggle returns **200** and changes what `/dine` shows; a `dirty` room refuses assignment with **409**. Result: **58 passed, 0 failed** |
| **The six documents** | `docs/addenda/31-the-staff-dashboard.md` · `32-the-admin-dashboard.md` · `33-complete-admin-actions.md` · `34-admin-content-and-broadcast-operations.md` · `35-the-travelling-guest.md` · `36-payments-and-whats-new.md` |

**Status marks**

| Mark | Meaning |
|---|---|
| ✅ | **Built and running** — the code exists, in the place this document says |
| 🆕 | **Built in this change** — it was missing, and it is now implemented and verified |
| ❌ | **Not built** — still only a specification; nothing in the code does this yet |

> **The one rule the whole addenda set turns on:** *every admin-only block is enforced on the
> server; hiding a button is cosmetic.* That rule was **not actually true** before this change,
> because the session cookie was unsigned — see *Part 31 #1*, *Part 32 §5* and *Part 33 §I* below.
> It is true now.

---
## The headline: what was already done

Most of the **staff dashboard (Part 31)** and most of the **admin dashboard (Part 32)** already
existed. Specifically, these were already built, audited and working:

| Area | Where it lives |
|---|---|
| The `/desk` front-desk console, **ten tabs**, identity strip, refresh, lock, live board | `src/components/desk/desk-console.tsx` |
| The Today board — arrivals, unassigned arrivals, departures, in-house, rooms free, KPI strip, action centre | `src/app/api/desk/overview/route.ts` |
| The room map — every physical room, housekeeping state, occupant, folio balance, out-of-order with a reason, assign / reassign / set state | `src/components/desk/desk-rooms.tsx`, `src/app/api/desk/rooms/route.ts` |
| Room assignment **validated** against overlaps and out-of-order state, and written to the timeline | `src/app/api/desk/rooms/route.ts` |
| The order board — placed → accepted → preparing → ready → delivered, waiting clock, void with a reason, **the arrival channel on every card** | `src/components/desk/desk-orders.tsx` |
| The message & issue queue — grouped by room, emergencies pinned, reply, acknowledge, resolve, escalate | `src/components/desk/desk-issues.tsx` |
| Housekeeping and service tasks — cleaning, towels, linen, maintenance, amenity, taxi, wake-up, due times, overdue | `src/components/desk/desk-tasks.tsx` |
| Guest CRM — stay count, total spent, last stay, regular and no-show flags, invite, resend, password-at-desk | `src/components/desk/desk-guests.tsx` |
| Payments — the verify queue, the ledger, cash recorded at the desk, auto-confirm on full payment | `src/app/api/desk/payments/route.ts` |
| Folios and invoices — open room bills with line items, invoice from the folio, invoice PDF | `src/app/api/desk/folios/route.ts`, `src/lib/folio-invoice.ts` |
| The whole stay lifecycle — check-in (posts the room charge, opens the QR/PIN session), check-out (room dirty, folio settled, invoice, review request), no-show | `src/app/api/desk/stay/route.ts` |
| Reviews and the sold-out waitlist | `src/components/desk/desk-reviews.tsx`, `src/lib/reviews.ts` |
| Room access — QR card and key-sleeve PIN | `src/components/desk/desk-roomaccess.tsx`, `src/lib/room-session.ts` |
| Auditors — read everything, change nothing (enforced in `deskActor`) | `src/lib/desk-auth.ts` |
| The audit trail — read, search, filter by entity, export CSV; append-only | `src/app/api/admin/audit/route.ts`, `src/app/admin/page.tsx` |
| Content the addenda call admin-only — gallery, posts and events, notices of push, staff accounts, rooms and rates, revenue CSV | `src/app/admin/page.tsx`, `src/app/api/admin/**` |
| Gallery library — search and filter pictures, sort by website order/title/category, edit title/category/image/alt text/caption/display position, and remove one or several with an audit entry per picture | `src/app/admin/page.tsx`, `src/app/api/admin/gallery/route.ts` |
| Media upload that never dead-ends — Vercel Blob, or Postgres when Blob is not configured | `src/app/api/upload/route.ts`, `src/app/api/images/[id]/route.ts` |
| Push broadcasts — the composer with a live phone preview, `validate_only` test, topic `all_users` | `src/app/admin/notifications/page.tsx`, `src/lib/fcm.ts` |
| The guest side of all of it — accounts, the no-account room session, ordering against the folio, private threads, one-tap requests | `src/components/guest/**`, `src/app/api/guest/**` |

**So the honest summary is:** the operational boards the addenda describe were largely there. What
was **missing** was the *enforcement line* between staff and admin, and a small number of specific
capabilities. Those are listed per part below.

---
## Part 31 — The Staff (Front Desk) Dashboard

### 🆕 Built in this change

| # | What the addendum asked for | What was wrong | What now happens |
|---|---|---|---|
| 1 | **"Every admin-only block is enforced on the server; hiding a button is cosmetic"** (§1) | The session cookie was plain base64url JSON. Writing `role: "admin"` into it by hand made every server-side role check pass — so the whole line between staff and admin was one hand-crafted header away from meaningless | The cookie is now an **HMAC-SHA256 signed** payload (`src/lib/staff-auth.ts`). An unsigned or mis-signed cookie is refused outright; a forged cookie is verified to return **401** |
| 2 | **Payments: verify and reject are admin-only** (§11, §2) | `POST /api/desk/payments` let *any* signed-in staff session verify or reject a claimed payment — the one action the addendum is most emphatic about | `verify` and `reject` now require an admin: **403** for staff. **Recording cash at the desk still works for staff** (verified live) |
| 3 | **No manual charge, no void, no invoice regeneration for staff** (§6.2, §11) | A staff session could post a manual charge to a folio, void a line, or regenerate an invoice | All three are **403** for staff, **200** for an admin. Staff still read every balance and download every invoice PDF |
| 4 | **No disabling, muting or consent changes for staff** (§10.4, §10.5) | `set_status` and `set_consent` were open to staff — i.e. the desk could disable an account or change marketing consent | Both are **403** for staff. The gate sits **before** the account lookup, so a staff session always gets 403 and never learns whether the account exists |
| 5 | **Review moderation is not the desk's job** (§2, Part 32 §4.14) | A staff session could hide or feature a public review | Moderation is **403** for staff; reading the screen still works |
| 6 | **The admin-only controls are absent, not greyed out** (§2) | Every staff session rendered Verify, Reject, Void, Post charge, Regenerate invoice, Hide/Publish/Feature, Mute, Opt out and Disable — all of which then worked | They are **not rendered at all** for a staff session, and a short line explains who does it instead |
| 7 | **Extend a stay is admin-only** (§6.2, Part 33 §D3) | Extending was allowed for any signed-in session | **403** for staff; the admin path still works (verified without mutating a real booking) |
| 8 | **The desk can mark a dish sold out mid-service** (§14 #12, §15.1) | Nothing existed. Worse, `/dine` rendered a hard-coded array, so *no* menu change could ever reach a guest | A **Menu · sold out** tab in `/desk` with exactly one control per dish — **sold out**, and back on sale. No price, no description, no photo, no add, no delete. `/dine` and in-app ordering both read `menu_items`, so closing a dish removes it from ordering in the same second, and it stays on the menu for tomorrow. Verified end to end |
| 9 | **Staff identity reads `Staff STF002 — Kondwani Phiri`** (§3) | The label was built from the raw role, producing `staff STF002 — Name` with a lower-case role | `Staff STF002 — Name` · `Admin — Name` · `Auditor STF002 — Name`, via a single `sessionLabel` helper |

### ✅ Already built

- The Today board as the landing screen: arrivals with arrival time and room type, **unassigned
  arrivals highlighted at the top**, departures, in-house, rooms free tonight, room-state counts,
  out-of-order rooms with reasons, and the recent-activity feed.
- The room map as the most-used screen, colour-coded **and written in words**, with notes, open
  issue count and folio balance per room (§5).
- Working the whole booking pipeline: approve, confirm, cancel, follow-up, timeline, internal notes.
- Orders grouped by status with a waiting-time clock and the **channel** on every card (§7) — app,
  QR, PIN, reference, desk, WhatsApp, counter — so the desk knows whether to push, ring or walk.
- The message queue grouped by room number, emergencies pinned, and the SLA behaviour (§8).
- Housekeeping states and service tasks as the **two things staff add and remove freely** (§9) —
  which is exactly what the authority matrix in Part 32 §5 allows them.
- Guest lookup by name and phone, with stay count, total spent, last stay, regular and no-show
  flags; the desk's own invitation flow (§10.1, §10.5).
- Cash recorded at the desk, the verify queue visible to staff, the unverified total shown (§11).
- Reports: revenue CSV, invoice PDFs, and the audit trail **searchable, filterable by entity and
  entity id, and exportable to CSV** — with no way to edit or delete it (§12).
- The room access tab — the QR card and the 4-digit PIN issued at check-in and dying at check-out.
- Everything on these screens already writes an audit entry with the actor label, the IP and
  Malawi time.

### ❌ Still open

| What the addendum asks for | Status |
|---|---|
| **Deposits at risk** panel (§4, §17) | `deposit_required` and `deposit_due_at` exist in the schema but **nothing surfaces them**. There is no deposit deadline job, no chase list and no release-and-notify rule |
| **Shift handover notes** (§13) — write a note for the next shift, read the day's notes, see who handed over | Not built. No table, no screen |
| **Taking a booking on the phone** (§6.3, §14 #1) | Not built. `/api/admin/bookings` exposes `GET`, `PATCH` and `DELETE` but **no `POST`** — there is no create action at all, and no New booking button on the desk. Every booking still arrives from the public site |
| **Registering a walk-in** and **quick availability for a walk-in** (§14 #2, #3) | Not built as a desk flow. Availability is only checked on the public `/stay` page, and check-in requires a booking to already exist |
| **Capturing guest ID / passport and the guest register** (§14 #4, #5) | **No `id_number` column, no document type, no register table, no register PDF.** This is a legal requirement in Malawi and is the largest single gap in Part 31 |
| **Early arrival, luggage storage and luggage release** (§14 #6, #7) | Not built — no luggage task kind or log beyond the generic service-task list |
| **Noise complaint between two guests** (§14 #8) | Partially: a complaint thread can be opened and a task created, but the two rooms are not linked and there is no repeat-escalation rule |
| **Flagging a walkout** (§14 #9) | Not built |
| **Reporting a fault the desk noticed itself** (§14 #10) | The desk *can* create a maintenance task and take a room out of order, but there is no distinct "I found this, nobody complained" flag |
| **Logging a phone call / taking a message for a guest** (§14 #14, #15) | Not built |
| **Upgrade request, same-day extension, early-departure prep** (§14 #16, #17, #19) | Not built as flows. Extension is now admin-only with no desk *request* path |
| **Attributing housekeeping to a person** (§14 #20) | Partially — a task records who completed it, but there is no per-housekeeper work report |
| **Guest preference note for next time** (§14 #21) | Partially — `guests.notes` exists and is staff-visible, but nothing surfaces "remember this" at the next check-in |
| **Security-concern flag, stock-shortage log, taxi with destination and time** (§14 #18, #22, #13) | A taxi task kind exists, but destination and time are free text in the note. No security escalation path and no inventory view |
| **Confirm what a guest is owed before they leave; reconcile expected vs actual arrivals at day end** (§14 #23, #24) | The folio is readable, but there is no pre-check-out balance confirmation screen and no end-of-day reconciliation |
| **Full room and booking history on the guest record** (§10.2, §10.3) | Partially — the CRM shows the stay count, total spent, last stay and the active stay, not the full list of every room slept in, every order, and whether the guest showed up |
| **Menu management (admin)** | Not built — `src/app/admin/page.tsx` has **no Menu tab at all** (zero matches for "menu"), so a seeded dish cannot be added to, repriced or removed from the portal. The desk's sold-out toggle is the only menu control that exists |
| **The audit trail inside the *staff* shell** | It lives in `/admin`, which staff *can* open, and its API is now session-guarded. It is not a tab in `/desk` |

---
## Part 32 — The Admin Dashboard

### 🆕 Built in this change

| # | What the addendum asked for | What was wrong | What now happens |
|---|---|---|---|
| 1 | **§5, the authority matrix — "enforced on the server"** | See Part 31 #1: the unsigned cookie. Every "admin only" row in that matrix was advisory | The signed session makes the matrix real. The verification proves every row: no session → **401**, staff → **403**, admin → reaches the handler |
| 2 | **§4.5 — verifying a claimed payment is the admin's alone** | Staff could verify, i.e. declare money received | **403** for staff, **200/409** for an admin. Reject is likewise admin-only |
| 3 | **§C3–C5 — money corrections are the admin's alone** | Staff could post a manual charge, void a folio line, or regenerate an invoice | All three **403** for staff |
| 4 | **§I — the previously unauthenticated admin routes** | **Three admin APIs had no session check at all**: `POST /api/admin/invoices`, `GET /api/admin/invoices`, and `POST /api/admin/upload` (plus `GET /api/admin/audit`). They were reachable by anyone who knew the URL | All four now require a session. The audit trail is readable by staff and auditors (they are read-only roles), while invoices and upload require an admin |

### ✅ Already built

- The admin shell with Audit trail, Reports, Gallery, Posts & Events, Rooms & Rates, Staff, and
  Notifications (§2, §3) — `src/app/admin/page.tsx` (2,500+ lines of working screens).
- **The audit trail**: read, search, filter by entity and entity id, export to CSV, **append-only**
  (§4.3, §8). Nothing in the codebase updates or deletes an audit row.
- **Revenue CSV** and the daily bookings PDF for the office (§4.4) — `/api/admin/reports`.
- **Invoices**: list, view, resend, PDF, and the manual invoice path (§C).
- **Staff accounts**: create, list, role, staff code, enable/disable, password reset (§D1) — the
  only way a person becomes `staff`, `admin` or `auditor`.
- **Rooms and rates**: room inventory, room types, night rates, edit and deactivate (§D2).
- **Gallery, posts and events** — create, edit, publish, unpublish, delete, with media upload
  (§4.6–§4.8).
- **Push broadcasts**: composer, live phone preview, `validate_only` test send, topic `all_users`
  (§4.11, §E) — `src/app/admin/notifications/page.tsx`, `src/lib/fcm.ts`.
- **The few things that are rightly admin-only and already were**: staff accounts, rooms and rates,
  gallery, notices of push. Those are visible only in `/admin`, which the staff shell does not link
  to, and every one of their APIs now also checks the session server-side.

### ❌ Still open

| What the addendum asks for | Status |
|---|---|
| **A Menu screen in the admin portal** (§4.9) | Not built. `src/app/admin/page.tsx` contains **zero** occurrences of "menu" or "Menu". Dishes, prices, descriptions and photos are seed-only; there is no add, no edit, no reorder and no delete from the portal, and no availability schedule |
| **A day-close / nightly report screen** (§4.4, §8) | Not built as a "close the day" flow. Revenue CSV and the bookings PDF exist, but there is no period close, no lock, and no daily summary the admin signs off |
| **Editing a booking's dates, room or price from the portal** (§D) | Partially — `PATCH /api/admin/bookings` handles approve, confirm, cancel, follow_up, add_note and email_invoice; `DELETE` exists. **Changing the stay dates, the room assignment or the money is not one of the actions**, and there is no `POST` to create one |
| **Per-room and per-period performance** (§4.1, §4.2) | There is a revenue CSV to open in Excel, but no occupancy %, ADR, RevPAR or room-performance screen in the portal |
| **Team activity report — who did what** (§4.3) | The audit trail can be filtered by entity, and CSV-exported, but there is no per-staff action report screen |
| **Broadcast targeting beyond `all_users`** (§E) | One topic only. No segment by stay status, no room-scoped send, no scheduled send |
| **Notification scheduling and history** (§F) | No scheduled or recurring sends and no delivery history screen |
| **Message templates** (§F) | Not built |

---
## Part 33 — Complete Admin Actions

This document is the **long tail of specific admin actions** — the "click here to do X" list. Most
of the flows it names were already reachable; what the addendum mostly exposed was that some of
them were reachable *by the wrong role*, and a handful were not reachable at all.

### 🆕 Built in this change

| Section | Action | Before | Now |
|---|---|---|---|
| **§B5 / §I** | `POST /api/admin/invoices` (manual invoice) | **No session check** — anyone with the URL could create an invoice | **401** with no session, **403** for staff |
| **§I** | `GET /api/admin/invoices` | No session check | **401** with no session |
| **§I** | `POST /api/admin/upload` | No session check — anyone could write a file into the media store | **401** with no session |
| **§I** | `GET /api/admin/audit` | No session check — the whole audit trail was public to anyone who guessed the URL | **401** with no session; **200** for a signed staff session and for an auditor, because reading is what those roles are for |
| **§D3** | Extend a stay | Any signed-in session could extend | Admin only — **403** for staff |
| **§4.5** | Verify / reject a payment | Any signed-in session could verify money had arrived | Admin only — **403** for staff |
| **§C3–C5** | Manual charge, void a line, regenerate an invoice | Any signed-in session could move money on a folio | Admin only — **403** for staff |

### ✅ Already built

- **Booking decisions** — approve, confirm, cancel, request follow-up, add an internal note, email
  the invoice, and a hard delete. `PATCH`/`DELETE` on `/api/admin/bookings`.
- **Guest records** — the CRM view, the invite, resend, password-at-desk, disable/enable, marketing
  consent. The two destructive ones are the same endpoints the desk uses, and they are now
  **admin-only**, so there is no second, unguarded back door from the portal.
- **Reviews** — hide, publish, feature, and the sold-out waitlist.
- **Rooms and rates** — create, edit, deactivate a room; create and edit room types and night rates.
- **Gallery, posts, events** — the full create/edit/publish/delete cycle.
- **Staff accounts** — create, set role, set staff code, enable/disable, reset the password.
- **Invoices** — create manually, view, resend, download the PDF.
- **Reports** — revenue CSV, daily bookings PDF.
- **Notices of push** — the broadcast composer with the test send.
- **Every one of the above writes an audit entry** naming the actor, the entity, the old and new
  values, the IP and Malawi time.

### ❌ Still open

| What the addendum asks for | Status |
|---|---|
| **Create a booking from the portal** (§A) | No `POST` on `/api/admin/bookings`. The portal cannot create a booking at all |
| **Edit a booking's dates, room or amount** (§B) | Not an action. `PATCH` does status, notes and email only |
| **Take a payment / record a refund from the portal** (§4.5 and friends) | Verify and reject exist (now admin-only); issuing a **refund** and recording a **manual ledger payment** from the portal screen are not built |
| **Move a guest between rooms from the portal** (§C) | Not an action in the portal. Reassignment exists on the desk room map |
| **Merge or split a folio** | Not built |
| **Bulk actions** — select many bookings and approve/cancel them | Not built; every action is one record at a time |
| **Undo** | Not built. Corrections are made by doing the opposite action, which is what the audit trail then records |
| **Export anything except revenue** — bookings, guests, folios | Not built. Only revenue CSV and the audit CSV exist |
| **Menu, availability calendar and blackout dates** (§D1, §D2) | No menu screen (see Part 32) and no calendar showing which dates a room is already sold for |
| **Email or SMS a guest from the portal, outside the invoice** | Not built. Invoice email is the only outbound message |

---
## Part 34 — Admin Content and Broadcast Operations

### ✅ Already built

| What the addendum asked for | What exists |
|---|---|
| **Gallery management** — upload, caption, reorder, publish, delete | `src/app/admin/page.tsx` (Gallery tab) + `/api/admin/gallery`. Upload goes to Vercel Blob when it is configured, and to Postgres otherwise, so it never dead-ends (§4.6). Creating and deleting are **admin-only** (`requireAdmin`) — a staff session reads the tab but is refused the writes | 
| **Posts and events** — write, edit, publish, unpublish, delete | `/api/admin/posts` + the Posts & Events tab (§4.7). Likewise **admin-only** for `POST`/`PATCH`/`DELETE`; the `GET`s stay public because the home page and `/gallery` read through them |
| **Notices of push** — the broadcast composer | `/api/admin/send-notification` and the Notifications tab, with a live phone preview of exactly what the guest will see (§4.11, §E) |
| **Test before you send** | `validate_only` on the send route, so the message can be validated without pushing it to every phone |
| **Send to everyone** | Topic `all_users` — one push to every installed app (§E) |
| **FCM plumbing** | `src/lib/fcm.ts` — service-account JWT, topic messaging, and graceful failure when the key is absent |
| **Media that survives** | `/api/upload` (legacy) and `/api/images/[id]` — the Postgres fallback means the site never shows a broken image because Blob is not configured |
| **Scheduled guest reminders** | `/api/admin/reminders` — the check-in reminder job |

### 🆕 Built in this change

| What | Why it matters |
|---|---|
| **The content APIs are now session-guarded** | `POST /api/admin/upload` had **no session check** — an unauthenticated stranger could write a file into the media store and get it served back on the public site. It now returns **401** without a session (§I) |

### ❌ Still open

| What the addendum asks for | Status |
|---|---|
| **Targeted broadcasts** | Only `all_users`. No segment by stay status (arriving today, in house, checking out), no room-scoped send, no language variants |
| **Scheduled and recurring sends** | No "send this at 06:00 tomorrow" and no repeat rule. Every send is immediate |
| **Delivery history and open rates** | **Partly built.** `notification_log` is a real table, written by `src/lib/notify.ts` for **every email, portal and SMS/WhatsApp attempt** — including honest `skipped` rows with the reason (SMS/WhatsApp have no gateway configured, so the wording is logged so the desk can read it out). What is missing is the **push** side (the broadcast route does not write a log row) and **any screen** that shows this history. Open rates are not tracked at all |
| **Message templates** | Not built — the composer body starts empty every time |
| **Rich push** — the image, the deep link, the action buttons | The push carries title and body. There is no image attachment, no tap-through target and no buttons |
| **Editing a published post's slug / SEO fields** | The post fields that exist are title, body and publish state |
| **A media library** | Uploads are attached to the record that used them. There is no browsable library, no reuse picker and no delete-orphan cleanup |
| **Bulk delete / archive of gallery items** | One item at a time |
| **Content version history** | No draft revisions and no restore. The audit trail records that a change happened, not the previous body in a form you can restore |

---
## Part 35 — The Travelling Guest

### ✅ Already built

| What the addendum asked for | What exists |
|---|---|
| **The guest app** | `src/components/guest/guest-app.tsx` — the signed-in guest shell |
| **A room session with no account** | `src/components/guest/room-session-app.tsx` + `/api/guest/room-session` — the QR card or the 4-digit PIN opens the room's session. This is the addendum's "no passwords at the front desk" requirement, and it was already built (§2, §3) |
| **Accounts** | `/api/desk/guests` (`register` — the front desk is the only doorway; the system sets the password and hands it over), `/api/guest/auth`, `/api/guest/activate`, `/api/guest/me` — registration, sign in, activation token, profile (`guestAccountsTable`, `activationTokensTable`) |
| **One-tap requests** | `/api/guest/requests` → a `service_tasks` row the desk sees immediately (§5) |
| **Private threads with the desk** | `/api/guest/messages` → `message_threads` + `messages`, grouped by room in the desk queue |
| **Ordering against the stay** | `/api/guest/orders` → `orders` + `order_items`, posted to the **folio** rather than paid by card, and now **gated by `menu_items.is_available`** so a sold-out dish cannot be ordered |
| **Reviews** | `src/components/guest/review-form.tsx` + `/api/guest/reviews`, moderated by the admin |
| **Room access** | `roomSessionsTable` — the session that dies at check-out |
| **The guest sees their own bill** | The folio is readable through the guest session |

### 🆕 Built in this change

| What | Detail |
|---|---|
| **`/dine` and in-app ordering now read the real menu** | `src/app/dine/page.tsx` was a **hard-coded array of dishes**. Nothing could change what a guest saw — not a price change, not a new dish, and not a sold-out dish. It now reads `menu_items` on the server, so the desk's sold-out toggle reaches the guest in the same second: the dish stays on the menu, clearly marked **"Sold out today"**, and its ordering controls are gone. Verified: the seeded dish *"Area 5 Garden Crunch Salad"*, which was never in the old hard-coded array, now renders |

### ❌ Still open

| What the addendum asks for | Status |
|---|---|
| **Pay online, in the app** | Not built. `paymentsTable` and the verify queue exist, and a guest can claim a payment, but there is no card or mobile-money checkout for a guest to complete on their phone |
| **Split a bill or pay for one item only** | Not built |
| **A wallet / stored card** | Not built |
| **Loyalty, points, or a returning-guest offer** | Not built. The CRM *flags* a regular, but no offer or points balance is ever shown to the guest |
| **The multilingual guest experience** | English only. There is no language choice and no translated strings |
| **Offline / weak-signal behaviour** | No offline cache or retry queue. A guest in a room with poor signal sees a failed request |
| **Pre-arrival online check-in** | Not built. Check-in happens at the desk; the guest can only look at the booking |
| **The guest's own booking management** — change dates, cancel, request a late check-out | Not built in the app |
| **A per-room TV / casting or in-room landing page** | Not built |
| **Guest-to-guest anything** | Not built, by design — every thread is private to the desk |
| **Travel companions on one booking** | `bookings` records a guest count, not a list of named people, so the second traveller has no record or session of their own |
| **Documents and the register** | See Part 31 — no ID capture anywhere in the system |

---
## Part 36 — Payments and What's New

### ✅ Already built

| What the addendum asked for | What exists |
|---|---|
| **Nothing moves money automatically** | The core principle is honoured: a guest *claims* a payment, it lands in `pending_verification`, and a human checks it against the bank / Airtel / TNM statement (§1) |
| **The verification queue** | `GET /api/desk/payments` returns `queue`, `ledger`, and totals — queue count and amount, verified amount, rejected count, and a **breakdown by channel** |
| **Recording money received** | `record_cash` at the desk, inserted already `verified`, with the actor label and the time |
| **Auto-confirm on full payment** | Verifying updates the booking's paid total and, when verified payments cover the total, confirms the booking and issues the receipt from the folio invoice |
| **Rejection with a reason** | `reject` records who rejected it and why |
| **An honest ledger** | `paymentsTable` keeps the channel, the transaction reference, the payer name and phone, who claimed it, who verified it, the label, the timestamp and the note |
| **Receipts** | The folio invoice PDF (`src/lib/folio-invoice.ts`) |
| **"What's new" in the guest app** | `postsTable` drives the posts the guest reads, and the push composer announces them (`all_users`) |
| **A real notification log** | `notification_log` records every email, portal and SMS/WhatsApp attempt with its outcome — never faked, and `skipped` rows say exactly why |

### 🆕 Built in this change

| What | Detail |
|---|---|
| **Verify and reject are the admin's alone** | Staff can *see* the whole queue and the unverified total, and can *record* cash — but `verify` and `reject` are now behind `requireAdmin`, and reach it only after the cash path, so a staff session that calls `action: "verify"` directly gets **403** rather than a verified payment |

### ❌ Still open

| What the addendum asks for | Status |
|---|---|
| **An online payment gateway** | Not built. There is no Airtel Money, TNM Mpamba, card or PayChangu checkout the guest can complete. A guest claims a payment; a human verifies it against a statement |
| **Automatic reconciliation against a bank feed** | Not built |
| **Refunds from the portal** | Not built. There is no refund action and no negative payment record |
| **A payment-received receipt sent automatically** | The invoice PDF exists and can be emailed; a triggered receipt on each verified payment is not wired |
| **A "what's new" feed with read state** | Posts exist; there is no per-guest seen/unseen marker and no in-app badge |
| **Payment provider webhooks** | Not built — the schema has no webhook or provider-event table |
| **Multi-currency** | Not built. Amounts are Malawi kwacha integers throughout |

---
## How the fix was made — the four files that carry it

| File | What it does |
|---|---|
| `src/lib/staff-auth.ts` | **The root fix.** The session cookie is now `base64url(payload) + "." + hmacSHA256(payload, secret)`. `signSession`, `readSession`, `sessionLabel`, the `SessionRole` type (`admin` \| `staff` \| `auditor`), a **constant-time** signature comparison, and a signed reader for the legacy `sunrise_admin` marker that used to be a forgeable `=1` |
| `src/lib/desk-auth.ts` | Unchanged in shape, but now trustworthy: `deskActor(request)` returns the verified session, and `requireAdmin(user)` returns a **403** response for any non-admin — the one-liner every write path calls |
| `src/app/api/desk/menu/route.ts` | **New.** `GET` for any session, `POST` for staff and admin, **403** for an auditor (read everything, change nothing), audited on every toggle |
| `src/components/desk/desk-menu.tsx` | **New.** One control per dish, no prices and no editing — exactly the "mark sold out" corridor Part 31 §15.1 describes |

Supporting changes: the login route issues the signed values; `isAdmin` is threaded from
`desk-console` into `desk-money`, `desk-guests` and `desk-reviews` so the admin-only controls are
**not rendered** for staff; `src/app/dine/page.tsx` became a server component that reads
`menu_items`; and `DinePage` in `src/components/experience-pages.tsx` gained an `items?: DineItem[]`
prop with a fallback list so it still renders if the query ever fails.

## How it was verified

`scripts/addenda-verify.mjs` runs **58 live checks** against a running server. It does not read the
source code and assume — it makes real HTTP calls with real cookies and asserts the status code.

```
node scripts/addenda-verify.mjs
→ RESULT: 58 passed, 0 failed
```

What the 58 checks prove:

| Group | Checks | Proves |
|---|---|---|
| Sessions | 5 | No session → 401. A **forged unsigned** cookie → 401. A **forged bad-signature** cookie → 401. A signed staff session and a signed auditor session **can** read the audit trail |
| Previously open admin routes | 4 | `POST`/`GET` invoices and the legacy upload now require a session |
| Payments | 5 | Verify and reject are 403 for staff; an admin passes the gate; **`record_cash` still reaches its handler for staff** |
| Folios | 4 | `add_charge`, `void_item`, `regenerate_invoice` are 403 for staff; staff may still **read** every balance |
| Extend stay | 3 | 401 / 403 / admin passes the gate — asserted against a **non-existent booking id**, so the harness cannot mutate real data |
| Guest CRM | 3 | `set_status` and `set_consent` are 403 for staff; staff may still read the CRM |
| Reviews | 2 | Moderation is 403 for staff; reading works |
| Auditor | 2 | May read the menu; is refused the sold-out toggle |
| Sold out | 6 | Staff **may** toggle; a dish goes off sale, **stays off in the database**, `/dine` says **"Sold out today"**, and it comes back when the dish returns |
| The menu is real | 1 | `/dine` renders a seeded dish that was **absent from the old hard-coded array** |
| Posts & gallery | 16 | `POST`/`PATCH`/`DELETE` on posts and `POST`/`DELETE` on gallery are **401** with no session and **403** for *both* staff and auditor — while a staff session may still **read** both (the public pages depend on those `GET`s) |
| Dirty room | 6 | A free room is flipped to `dirty`; assigning a real booking to it is **refused with 409**; the refusal names the room; a session-less attempt is **401**; the room is confirmed **still dirty and unassigned**; and its original state is **restored** |

Two things the harness deliberately does **not** do: it never verifies a real payment, and it never
extends a real booking. An earlier version of the extend test *did* mutate a live booking in the
local database; that booking was repaired and the test was rewritten to use a non-existent id.

---
## ⚠️ One breaking change: everyone has to log in again

Signing the cookie **changes its format**. A browser holding an old unsigned `sunrise_session` will
now fail verification and be treated as signed out.

- **Effect:** every staff member, admin and auditor must sign in once more after this change is
  deployed. Their credentials and accounts are untouched.
- **Not affected:** guests. Guest auth is separate (`guest_sessions`, the activation tokens and the
  no-account room session), and none of it uses `staff-auth.ts`.

### On `SESSION_SECRET`

`getSessionSecret()` reads, in order:

1. `process.env.SESSION_SECRET` — **the intended variable**
2. `process.env.ADMIN_PASSWORD` — accepted so the signing does not fall over on Day 1
3. `"sunrise-motel-local-dev-secret"` — the local development default

**Recommendation:** set `SESSION_SECRET` explicitly in the deployment environment (Vercel → Settings
→ Environment Variables) to a long random string, and treat it as a secret that is never rotated
without accepting that everybody re-logs in. It is **not required** for the system to work — but the
moment `ADMIN_PASSWORD` is changed, every existing session would be invalidated, and relying on the
password as a signing key is a habit worth not keeping. Nothing in the code needs to change for it:
the variable is simply picked up if it is present.

---

## The honest bottom line

**Built:** the whole operational core — the Today board, the room map, the order board, the message
queue, tasks, the guest CRM, folios and invoices, the stay lifecycle, room access, the audit trail,
reports, content, staff accounts, broadcasts, the guest app and the no-account room session. That is
the great majority of Parts 31 and 32 by volume.

**Fixed in this change:** the **enforcement line**. "Enforced on the server, hiding a button is
cosmetic" is now literally true, because the session can no longer be forged. Eleven write actions
that a staff session could perform — including *verifying a payment*, *voiding a folio line* and
*disabling a guest account* — now return **403**. Four admin APIs that had **no authentication at
all** now require a session. The desk gained the one menu control it needed, and `/dine` finally
reads the database.

**The gaps that matter most, in the order they should be built:**

| Priority | Gap | Why it is first |
|---|---|---|
| 1 | **Guest ID / passport capture and the guest register** (Part 31 §14 #4–#5) | A **legal requirement** in Malawi. There is no `id_number` column, no register table and no register PDF. Nothing else on this list is a compliance hole |
| 2 | **Creating and editing a booking from the portal** (Part 33 §A–§B) | There is no `POST` on `/api/admin/bookings` at all, so a phone booking or a walk-in cannot be entered anywhere. Every booking must first arrive from the public website |
| 3 | **Deposits at risk** (Part 31 §4, §17) | The columns exist and nothing reads them, so a deposit deadline can pass with no chase and no release |
| 4 | **Menu management in the admin portal** (Part 32 §4.9) | The desk can mark a dish sold out, but nobody can add a dish, change a price or remove one. Prices are seed-only |
| 5 | **Shift handover notes** (Part 31 §13) | The cheapest to build of everything here and the one a real front desk misses within a week |
| 6 | **An online payment gateway** (Part 36) | The largest piece of work, and the one that changes the guest experience most. Everything around it — the queue, the ledger, verification, auto-confirm — is already in place and waiting for it |

**Open question for you:** set `SESSION_SECRET` in the deployment environment, or leave it falling
back to `ADMIN_PASSWORD`? The code works either way; the recommendation above is to set it.

---

## Part D, continued — the landing page and the second Android app

**Verified on** 28 Sep 2026, by `tsc`, `eslint`, a production `next build`, and live HTTP calls
against that build. This change is **outside the six addenda**: it rebuilt the public landing page
and added a second Android app. It closed none of the gaps above and opened none.

### 🆕 Built in this change

| What | Where | Evidence |
|---|---|---|
| The landing page rebuilt as one scoped design system | `src/app/home-premium.css` (~1 000 lines), `src/app/page.tsx` | every rule is `hp-`-prefixed or scoped to `.hp-root`, so `globals.css`, `inner-pages.css` and the portal screens are untouched — and since the follow-up pass below, the sheet is imported by `page.tsx` **alone**, so no other route downloads it |
| The mobile sticky stay bar | `src/components/sticky-stay-bar.tsx` | displayed only ≤900 px, appears once the hero is behind the guest, hides itself while a field has focus so it never sits under the keyboard |
| Honest empty states | `page.tsx` (`hp-empty`) | against an empty database the home page renders its "nothing on the board right now" branches — not a blank frame and not invented stars |
| The second Android app — **Sunrise Manager** | `SunriseAdminApp/` — `com.sunrisemotel.admin`, label *Sunrise Manager*, opens `BASE_URL` + `/admin` | a complete Gradle project: settings, root build file, `app/build.gradle.kts`, `MainActivity.kt`, manifest, layouts, themes, adaptive icon, README |
| One endpoint, two release lines | `src/app/api/version/route.ts`, `public/version-admin.json` | see the live results below |
| The portal's own PWA manifest | `public/manifest-admin.json`, `src/app/admin/layout.tsx` | installing `/admin` from a phone now puts *Sunrise Manager* on the home screen, not the guest app's name opening the public landing page |
| Both apps recognised in one place | `src/lib/app-user-agent.ts` | `inSunriseApp(ua)` reads `SunriseMotelApp` **or** `SunriseManagerApp`; `InstallAppPopup` and `AppDownloadBanner` call it, so no install prompt can appear from inside either app |
| CI builds and publishes both APKs | `.github/workflows/build-apk.yml` | builds both projects, renames to `SunriseMotel.apk` / `SunriseManager.apk`, uploads both as artifacts and attaches both to the release — the URLs `/download` uses |
| The guest app bumped to 1.3 | `SunriseMotelApp/app/build.gradle.kts` (versionCode 4), `public/version.json` | `?app=` fallbacks keep older installs working: an app that calls `/api/version` with no parameter still gets the guest file |

### How it was verified

```
npx tsc --noEmit      → clean
npx eslint <touched>  → 0 errors
npx next build        → compiled successfully
```

Live HTTP calls against `next start` on that build:

| Call | Result |
|---|---|
| `GET /api/version` | **200** · `X-Sunrise-App: guest` · code **4** · "1.3" · `SunriseMotel.apk` |
| `GET /api/version?app=admin` | **200** · `X-Sunrise-App: admin` · code **1** · "1.0" · `SunriseManager.apk` |
| `GET /api/version?app=guest` | **200** · code 4 · "1.3" |
| `GET /api/version?app=nonsense` | **200** · falls back to the guest file (an old build calling with a stale parameter never breaks) |
| `GET /` | every new section present: `hp-hero`, `hp-avail-float`, `hp-facts`, `hp-ways-grid`, `hp-rooms`, `hp-find`, `hp-app-banner`, `hp-footer`, `hp-sticky-stay`, `id="rooms-section"`. The data-driven sections render `hp-empty`, which is the correct answer against an empty database |
| `GET /admin` | title *Manager portal*, and the `manifest-admin.json` link is present in the HTML |
| `GET /manifest-admin.json` | name **Sunrise Manager**, `start_url` **/admin**, `scope` **/admin**, theme `#D4A017` |

Also checked: no `localhost:3000` is baked into any link in `src/`, and no legacy class name from the
old landing page (`mobile-pillars-section`, `mobile-trust-strip`, `mobile-gallery-section`,
`mobile-events-section`, `footer-links-grid`, …) survives in `page.tsx`.

**What is *not* verified here, and why:** the two APKs themselves were not compiled. Neither Gradle
nor the Android SDK is installed on this PC, and this project has always built its APKs in GitHub
Actions (`SunriseMotelApp/README.md` says so explicitly). The Kotlin and Gradle files were reviewed
for structure and by brace/paren balance, not compiled. The first push that touches either app
folder is what proves them.

### A note on the keystore

`SunriseAdminApp` does **not** copy the keystore — `app/build.gradle.kts` points at
`../../SunriseMotelApp/sunrise-motel-release.jks` (Gradle's `file()` is module-relative, so the path
climbs out of `SunriseAdminApp/app/` first). One secret, one restored `.jks`, two signed apps. Two
different `applicationId`s sharing one key is safe: Android treats them as unrelated apps, which is
exactly the intent — two icons that install side by side and update independently.

### Follow-up pass — the landing sheet now rides only the landing page

While re-checking this work, one thing was **measured instead of assumed**: `home-premium.css` was
imported by `src/app/layout.tsx`, so it sat in the root layout's stylesheet and *every route in the
app downloaded it* — the manager portal included.

| Before | After |
|---|---|
| `GET /admin` linked the landing sheet (`0~gr8f3-qw2f9.css`, **31.3 KB**, contains `.hp-hero`) | `GET /admin` links **2** sheets and neither contains `.hp-hero` |
| one shared chunk carried the landing page to all routes | the sheet is its **own 21.4 KB chunk** (`04-srglce.sux.css`), linked by `/` and by nothing else |

The import moved from `layout.tsx` to `page.tsx`, the only file in `src/` that renders an `hp-`
class. It still lands *after* the sheets the layout loads (globals → inner-pages → enhancements →
site-nav → animations) and is still a `<link>` in `<head>` **before any script**, so both properties
the file was written for — correct layering, and no flash of unstyled content — survive the move.

A second count came out of the same pass: of the 103 `hp-` classes the sheet defined, **four were
referenced nowhere in `src/`** — `.hp-section--dark`, `.hp-center`, `.hp-eyebrow--light`, `.hp-h3`.
A dark section, a centred heading, a light eyebrow and a third heading size that the finished page
never used: dead rules from an earlier draft of the layout. They were deleted. The sheet is now
**99 defined / 99 used**, 251 opening braces against 251 closing ones.

### Verified again on the rebuilt server

```
npx tsc --noEmit      → clean (exit 0)
npx eslint <touched>  → 0 errors
npx next build        → compiled successfully
```

| Call | Result |
|---|---|
| `GET /` | **200** · title *A warm room, a full plate, and a quiet evening* · `hp-hero`, `hp-avail-float`, `hp-facts`, `hp-ways-grid`, `hp-rooms`, `hp-find`, `hp-pay-chip`, `hp-app-banner`, `hp-footer`, `hp-sticky-stay`, `hp-skip`, `id="rooms-section"`, and the honest `hp-empty` branch against an empty database — and **not one legacy name** (`mobile-pillars-section` is gone) |
| `GET /` stylesheets | **3** links, all **200** · `0tl5je…` (111.1 KB shared) · `08l43_…` (9.6 KB) · `04-srglce…` (**21.4 KB**, the landing sheet, last in `<head>`) |
| `GET /admin` | **200** · **2** sheets, neither containing `.hp-hero` · `manifest-admin.json` linked |
| `GET /stay`, `/desk` | **200** · the same 2 sheets, no landing CSS |
| `GET /api/version` | **200** · `X-Sunrise-App: guest` · code **4** · "1.3" |
| `GET /api/version?app=admin` | **200** · `X-Sunrise-App: admin` · code **1** · "1.0" |

Two housekeeping notes from the same pass. The `next start` that was already running on port 3000
was serving an **older build** — its title was still *"Your warm welcome in Lilongwe"* and it still
emitted `mobile-pillars-section` — so it was stopped and restarted against the rebuilt output; the
live results above are from that restarted server. And `.next-*/` is now in `.gitignore`, because
`next.config.ts` exists precisely so a verification build can go to its own directory
(`NEXT_DIST_DIR=".next-verify" npx next build`) without trampling a running dev server.

### Follow-up pass 2 — class names that matched no stylesheet

The question asked was *"why are some pages missing CSS?"* — so it was measured, not guessed. Every
route links its stylesheets and every chunk returns **200**: no page was missing a *stylesheet*. What
was missing was individual **class names that no stylesheet defines**.

| Class | Rendered by | Verdict |
|---|---|---|
| `empty-state` | `experience-pages.tsx:201`, `:471` (the gallery's "Pictures are loading…"), `page.tsx:697` (the rooms list), `admin/page.tsx` | **real gap — fixed.** Those placeholder blocks fell back to unstyled body text. A rule now exists in `globals.css`, matching the treatment `.hp-empty` already got on the landing page: dashed edge, card radius, muted copy, bronze icon |
| `text-sage` | `experience-pages.tsx:440` | **real gap — fixed.** Tailwind *is* wired (`@import "tailwindcss"` in `globals.css`, `@tailwindcss/postcss` in `postcss.config.mjs`) but there is **no `@theme` block**, so `sage` is not a Tailwind colour and the utility silently generated nothing. Now `text-[var(--sage)]` — the same arbitrary-value form the file already uses for `text-[var(--orange-deep)]` and `bg-[var(--ivory)]`, which do generate |
| `brand-default` | `sunrise-logo.tsx:69` — `` `brand-lockup brand-${size} …` `` with `size` defaulting to `default` | **by design.** Only the `brand-small` size needs rules; "default" means no size modifier |
| `site-nav-root` | `site-nav.tsx:72` | **inert hook.** A wrapper carrying no rules anywhere; every child is styled |
| `gallery-block` | `experience-pages.tsx:168` | **inert hook.** Sits inside `.mobile-rooms-section` (styled); its children `section-head`, `gallery-filter-row`, `gallery-grid`, `gallery-more` are all styled |
| `zip-card-track` | `page.tsx:1004` | **inert modifier** alongside `.zip-card`, which is defined in `globals.css` |

**Method note, because it nearly produced a wrong answer.** The first scan reported ~100 "missing"
classes per page. That was the analyser, not the app: minified CSS has no whitespace before a class
(`}.hp-hero{`), and Tailwind escapes `[`, `(`, `)` — `.bg-[var(--ivory)]` is written
`.bg-\[var\(--ivory\)\]`. Both checks were rewritten (compare with the escapes stripped, allow a
compound selector) before any conclusion was drawn. After that, everything else on every route —
Tailwind utilities, `.is-active`, `.is-animated`, `.is-none`, the whole `hp-` sheet — resolved.

Verified after the fix, against `next start` on the rebuilt output:

| Call | Result |
|---|---|
| `GET /stay`, `/gallery`, `/admin` | each **200**, renders `empty-state`, and the built CSS now defines `.empty-state` |
| `GET /` | **200** · 3 stylesheets · `empty-state` present |
| built CSS | contains `.empty-state`, `.empty-state svg`, `text-[var(--sage)]` |
| `npx tsc --noEmit` · `npx eslint` | clean (exit 0) · 0 errors |

`tsconfig.json` was tidied in the same pass: its `include` pinned generated types from scratch build
directories (`.next-final-verify`, `.next-verify2`) that do not exist, which is exactly why a stale
one could make `tsc` fail with an error about the app's own routes. It now lists `.next` and the
documented verification directory `.next-verify` only.

One honest caveat: Next's own `_global-error` page ships **zero** stylesheets, so a render error in a
root layout always shows unstyled HTML. That is Next's design, and it is the only case in this app
where a page genuinely renders with no CSS at all.

### Follow-up pass 3 — the dish card, the dish popup, and the forms that were still on the page

Two things were asked for in one breath: **a dish on the Dine menu should open in a popup**, and
**every form should open in a popup**. The first was a real layout bug as well as a missing
interaction. The second turned out to be mostly done already, with exceptions worth stating plainly
rather than hiding.

**The broken dish card was measured before it was changed.** A dish renders as
`<article class="menu-page-card sell-card sell-dish">` with **two** `div` children — `.sell-photo`
(picture plus its gradient overlay) and an unclassed text column:

| Rule | Where | What it actually did to a dish card |
|---|---|---|
| `.menu-page-card > div { display:flex; flex-direction:column; padding:20px }` | `inner-pages.css:116` | Written for the text column — but it is a `>` child selector, so it hit the **photo box** as well, insetting the picture by 20px inside a frame and re-laying its `<img>` out as a flex item |
| `.menu-page-card > div { padding:15px }` | `inner-pages.css:294` (phone) | The same rule again at phone widths |
| `.sell-dish { display:flex; flex-direction:column }` | `enhancements.css:128` | Correct and untouched: the card stacks the picture over the copy |
| `.sell-photo { position:relative; aspect-ratio:4/3; height:280px }` | `enhancements.css:112` | Correct for the picture box — and it declares **no** `display` of its own, which is exactly why `:116`'s `flex` landed on it |

The fix is one rule — `.menu-page-card > .sell-photo { display:block; padding:0 }`
(`inner-pages.css:127`). It is a two-class selector (**0,2,0**) against the class-plus-type rules
above (**0,1,1**), so it wins at every width, including against the mobile rule at `:294`, with no
`!important` and without disturbing the text column those rules were written for.

**What a guest gets now.** `/dine` renders **9** dish cards, each one
`menu-page-card sell-card sell-dish` carrying `sell-photo sell-dish-photo` and
`sell-cta sell-dish-cta`. A sold-out dish adds `is-sold-out` and is dimmed, struck through, and not
orderable — that class had been in the markup with no rule behind it. The card's two buttons call
`openOrder(item.id, "dine_in" | "pickup")`, which puts the dish in the order, **pre-chooses** table
or takeaway, and opens the popup — so the popup *is* the dish detail: the line the guest just
tapped sits in it with a stepper, priced, and the order can be corrected in place rather than
restarted. The sheet also carries the header (`{n} items · {total} · open 07:00 — 22:00 daily`),
name and number, dine-in / takeaway / room service with a room-or-time field, and an honest empty
state (`dine-order-empty`) if it is opened before anything is in it. Money counts **available**
dishes only.

The filter row offers the seven the board is built from — **All · From the grill · Mains ·
Light & fresh · Breakfast · Coffee & snacks · Drinks** — and they are derived, not hard-coded:
`["All", ...new Set(menuItems.map(i => i.category))]`, so a category appears only once a dish with
it exists.

**The forms.** `/dine` (the order), `/unwind` (table or braai), `/connect` (workspace enquiry) and
`/track` (booking lookup) now share one shape: a one-line invitation and a button on the page
(`.dine-order-hint`), the form itself in `booking-modal-backdrop` + `booking-modal-sheet`, closed by
the X or the backdrop, nothing lost by leaving. `/track` is the one added in this pass. Its
component reads `useSearchParams`, so the page was already client-rendered; the effect that reads
`?ref=` now **opens the popup by itself**, because the confirmation email links straight to
`/track?ref=SM-…` and that guest should not have to ask for a form they were sent to. A failed
lookup keeps the sheet open — the fix is in its two fields — and a successful one closes it so the
guest lands on the tracking card underneath.

`/stay` and the home page were already built this way (`booking-modal-*` at `page.tsx:1137` and
`experience-pages.tsx:618`), which is why `/track` and `/review` were the only two forms still to check.

**`/review` is deliberately left inline, and it is the only guest-facing exception.** That page is
not a content page with a form in the middle of it: the form *is* the page, and its own stated
design rule is one tap to a star — `onClick={() => void send(star)}` submits on the tap, and the
check-out email deep-links it already: `requestReview` (`src/lib/reviews.ts:99`) mails
`/review?reference=<ref>`, and the form accepts `?phone=` and `?rating=1-5` on top
(`review-form.tsx:36-40`). A popup there inserts a tap into the exact
interaction the file exists to protect. The same reasoning covers the staff consoles, the admin
portal and the guest-app sign-in: those are operational screens, not pages where a form interrupts
reading.

The **sold-out waitlist form on the home page** is the one other inline guest form, and for the
opposite reason: it *is* the empty state (it renders only when every room is taken), so there is
nothing for a popup to interrupt. The booking form on that same page already opens in the booking
sheet (`page.tsx:1137`).

**How it was verified** — all against `next start` on the rebuilt output, port 3000:

| Call | Result |
|---|---|
| `GET /`, `/dine`, `/stay`, `/unwind`, `/connect`, `/track`, `/gallery`, `/admin` | each **200**; `/` links **3** stylesheets, every other route **2** |
| `GET /dine` | **200** · 43,927 bytes · **9** dish cards · **9** `sell-dish-photo` · **9** `sell-dish-cta` · filter row exactly `All · From the grill · Mains · Light & fresh · Breakfast · Coffee & snacks · Drinks` |
| `GET /dine` markup | one card reads `div.sell-photo.sell-dish-photo` → `img` + `div.sell-gradient`, then the text column `span / h3 / p / .menu-page-card-bottom / .sell-cta.sell-dish-cta` — the picture is no longer inside a padded text frame |
| `GET /track` | **200** · the invitation renders (`hero-search-card`, `search-card-header`, `dine-order-hint`) and the inline `<form class="hero-search-card">` is **gone** |
| Built CSS — 3 files, 146,794 bytes | defines `.sell-dish`, `.menu-page-card > .sell-photo`, `.menu-page-card.is-sold-out`, `.dine-order-hint`, `.dine-order-lines`, `.dine-order-line`, `.dine-order-empty`, `.booking-modal-sheet` |
| Built JS — the **11** chunks `/track` loads | contain `booking-modal-backdrop`, `booking-modal-sheet`, `Track your stay`, `Find my booking` |
| Built JS — the chunks `/dine`, `/unwind`, `/connect` load | contain `booking-modal-backdrop`, `booking-modal-sheet`, `Your food order`, `Send Order to Kitchen`, `Hold a table for us` |
| `npx tsc --noEmit` · `npx eslint src/components/track-booking.tsx` | exit **0** · **0** errors |

**One honest limit on that table.** A popup is state-gated (`{open && …}`), so it is *never* in the
server-rendered HTML — no amount of `Invoke-WebRequest` proves a sheet renders, only that its
trigger does and that the CSS it needs arrives with the page. That is why the table checks the
shipped **JS** too: the popup branch provably ships to the browser and the sheet styling provably
loads with the page. Confirming the pixels themselves needs a browser, and none was available in
this pass. The same caveat applies to the `/dine` popup in *pass 1* above.

Two smaller things fixed in the same pass:

- **`tsconfig.json` was excluding only `node_modules`.** Its `include` is `**/*.ts` / `**/*.tsx`,
  so the duplicated copy of the whole app under `.kilo/worktrees/abalone-beret/` was being swept
  into the app's own type check — every one of its files checked a second time as a second root.
  `.kilo` is now excluded. `tsc` was already passing, so this is about not type-checking a scratch
  worktree, not about a hidden error. It now sits in that exclusion list beside the `.next` entries added in *follow-up pass 2*.
- **`/track`'s HTML is a ~10 KB shell by design, not a regression.** The page wraps its client
  component in `<Suspense fallback={null}>` and the component reads `useSearchParams`, so the real
  content arrives on hydration. Written down so the next person does not read a "blank" `/track`
  as a broken page.

### Follow-up pass 4 — the review route gets its own sheet, and the update notice gets a design

Two surfaces still looked like they were built by somebody else: `/review`, whose form was Tailwind
utility classes on a bare `bg-[var(--ivory)]` page, and the **"Update available"** notice, which was
an `innerHTML` string with every style inlined onto it. Both are now built from the design the rest
of the site uses — cream ground, ink text, one gold accent, Georgia headlines, 150–250 ms motion, all
of it off under `prefers-reduced-motion`.

**`/review` has a route sheet: `src/app/review/review.css`.** Every class is `rv-`-prefixed and scoped
to `.rv-root`, and the sheet is imported by that one route — the same arrangement `home-premium.css`
has with `/`, so no other page downloads it. The page's own header markup (`rv-top`, `rv-brand`,
`rv-home`, `rv-intro`) moved into the route file with it, and the form (`rv-card`, `rv-stars`,
`rv-star`, `rv-field`, `rv-identity`, `rv-error`, `rv-submit`, `rv-published*`, `rv-done*`) is
unchanged in behaviour: the star is still the submit button, the two identity fields still appear only
when `/api/guest/me` cannot prove the stay, and the published rows still come from `GET /api/reviews`.
**It is still deliberately not a popup** — the pass-3 reasoning above stands: the form *is* the page,
and a sheet would insert a tap into the one interaction the file exists to protect.

**The motel's city was wrong on that page, and is now right.** `/review` announced *"SUNRISE MOTEL ·
MZUZU"*. Mzuzu is a different city about 350 km north; the motel is **Area 5, Lilongwe** (Mzimba Road,
behind Bwasila Secondary School), which is what `README.md:3` and the Android app descriptions already
said. The header now reads **"Sunrise Motel · Lilongwe"** with *"Area 5, Mzimba Road"* underneath, both
upper-cased by CSS rather than typed in caps.

**The update notice is a card now.** `ServiceWorkerRegister` builds real JSX against `sw-update*`
classes in `globals.css` instead of `document.createElement` + `bar.style.cssText` + `innerHTML`: a
gold rule down the left edge, the version as a badge, *"A newer version is ready"* as a Georgia
headline, the `APP_CHANGELOG` entries as a checked list, then **Update now / Later** and a close X.
The layout rules are unchanged on purpose — it stays **pinned to the bottom and non-modal**, because an
update is never worth blocking a page for, and **Update now remains the only thing that reloads** (posts
`SKIP_WAITING`, then `location.reload()`). What changed is that there is no longer a hand-written style
string that can disagree with the rest of the CSS.

**How it was verified** — after `npm run build`, against `next start` on ports 3007/3008:

| Call | Result |
|---|---|
| `GET /review` | **200** · 16,341 bytes · contains `rv-root`, `rv-shell`, `rv-top`, `rv-brand`, `rv-home`, `rv-intro`, `rv-card`, `rv-eyebrow`, `rv-star-readout` and `role="radio"` on the five star buttons |
| `GET /review` HTML | `Lilongwe` present · **`MZUZU` absent** |
| Stylesheets per route | `/review` links **3** · `/dine` links **2** · `/` links **3** — the review sheet rides this route only |
| `0ml~rov_77f6v.css` | **5,226 bytes** — defines `.rv-root`, `.rv-card`, `.rv-stars`, `.rv-star.is-on`, `.rv-submit`, `.rv-published-list`, `.rv-done-actions` and the `prefers-reduced-motion` block |
| `17nu62zv~h-u7.css` (103,396 bytes) | carries `.sw-update` on **every** route, which is correct: `ServiceWorkerRegister` is mounted in `layout.tsx`, not in a page |
| JS chunk `0c-hiyack2f_..js` | carries `sw-update-banner` — the card provably ships to the browser |
| `npm run verify:sw` | **ALL CHECKS PASSED** — 15 cases, cache `sunrise-motel-v3` unchanged |
| `npx tsc --noEmit` · `npx eslint` on the three changed files | exit **0** · **0** errors |
| `npm run build` | succeeds; `/review` prerendered **static** |

**The same honest limit as pass 3.** The update card is state-gated (it renders only once a new worker
reports `installed`), so it is never in the server-rendered HTML — the CSS it needs and the JS that
builds it both provably ship, but the pixels themselves were not seen in a browser in this pass.

> **Retired in *follow-up pass 5*.** A real browser was pointed at this, and it found more than a
> missing screenshot: the card never appeared at all. See the next section.

### Follow-up pass 5 — the update card is measured in a real browser, and the reload it exposed

Pass 4 shipped the card and said plainly what it could not show: the pixels. This pass gets them — and
the browser immediately found the reason nobody had ever seen them. The card was not merely
state-gated. It was **unreachable**.

**The two halves of the update story contradicted each other.** `public/sw.js` called
`self.skipWaiting()` inside `install`, so a newly deployed worker activated the instant it finished
installing, and `activate` handed it `clients.claim()`. `ServiceWorkerRegister.tsx` meanwhile stated
the opposite rule in its own comment (*"Update now is the only thing that reloads"*) and reloaded on
`controllerchange` — which that self-activation fired. Measured at 390×844:

| Moment | What the browser actually did |
|---|---|
| 0 ms | a deploy is noticed (`registration.update()`); the new worker installs |
| **never** | the card reaches the document — **0 of 157 samples** contained `#sw-update-banner` |
| **1,544 ms** | the page reloads **by itself**, mid-booking, and the card is gone for good |

**The fix is one line per side.** `public/sw.js` no longer calls `skipWaiting()` in `install`, so a
deployed worker now **waits** — the only state in which an update can be offered at all. And
`ServiceWorkerRegister.tsx` reloads on `controllerchange` *only* while the guest's own **Update now**
tap is being applied (`applyingRef`), with the reload landing after the new worker takes control and
an 800 ms backstop if it has already gone. So the promise printed on the card — *"Nothing you are doing
is lost — refresh whenever it suits you"* — is now true even when the browser promotes a waiting worker
while a booking form is half-filled.

**How it is verified from here on — in a browser, repeatably.** `npm run verify:update-card`
(→ `scripts/verify-update-card.mjs`) starts `next start` if nothing is answering, drives the installed
Chrome/Edge over the **DevTools Protocol** (no Playwright, no Puppeteer, no new dependency — Node's own
`WebSocket` and `fetch`), appends one comment to `public/sw.js` to simulate a deploy, and watches what a
guest sees. It restores `sw.js` byte-for-byte before exiting, and checks that it did.

| Assertion | Evidence |
|---|---|
| the page is controlled by the worker | `navigator.serviceWorker.controller` = `/sw.js` |
| the card appears after a deploy | first seen **116 ms** after the check |
| it stays long enough to read | present for **≥ 4,002 ms** |
| no reload the guest did not ask for | `never` — this was **1,544 ms** before the fix |
| it is really painted | hit-test at its own centre returns the card |
| the pixels, measured | **366×344 at (12, 488)** in 390×844 · `rgb(255,255,255)` on `rgb(23,21,19)` · radius **14px** · `fixed` z1000 · buttons `UPDATE NOW` / `Later` · **4** changelog bullets |
| **Later** defers it | card gone, page **not** reloaded, new worker **still waiting** |
| a later visit offers it again | the card returns from `reg.waiting` |
| **Update now** applies it | one reload, the new worker takes over, nothing left waiting |
| the screenshots | `docs/evidence/service-worker-update-card.png` (+ `-detail`) |

`npm run verify:sw` grew the matching rule so this cannot regress unnoticed — **install must not
`skipWaiting`; the `SKIP_WAITING` message must** (17 cases, all passing). The two checks are a pair on
purpose: the browser script proves the card is visible, the stub script proves *why* it can be.

### Deliberately not built

**No Firebase in the manager app.** The portal already has `/admin/notifications` for broadcasts, and
a manager build would need its own Firebase Android app plus a `google-services.json` containing
`com.sunrisemotel.admin` — the `google-services` plugin fails hard when the config has no matching
package, which would break a working guest build. `SunriseAdminApp/README.md` records exactly what to
add if staff push is ever wanted (a `staff` topic, not `all_users`).

---
## 6. One guest, one identity — and the four briefs, checked one by one

The guest-identity brief ("one email + one phone = one guest") was audited against the code and the
database, and the gaps that were real were fixed. The full row-by-row answer, covering all four briefs
with evidence for **and** against each requirement, is `docs/BUILD-REQUEST-AUDIT.md`. This section is
the evidence for the part that changed.

**What was actually broken.** `findOrCreateGuest` compared the phone number as a **raw string**, so
`0888 123 456`, `+265 888 123 456` and `888123456` were three different guests — the duplicate bug
described in the brief, reproduced from the code rather than guessed. Worse, `POST /api/bookings` never
called it at all: a booking made on the website wrote free-text contact details and left
`bookings.guestId` **null** until the front desk happened to invite an account
(`src/lib/guest-account.ts:53`). Two more files had grown their own copies of the phone rule and had
already drifted apart (`/api/reviews`, `/api/guest/activate`).

**What it is now.**

| Fix | Where | Evidence |
|---|---|---|
| one definition of a phone number — nine significant digits, `+265…`, `null` for `n/a` | `src/lib/phone.ts` (new) | `phoneKey("0888 123 456")` = `phoneKey("+265888123456")` = `"888123456"` |
| matching moved **into SQL**, so pre-rule rows still match and are rewritten in place | `src/lib/hotel.ts:64` | `right(regexp_replace(phone,'[^0-9]','','g'),9)` |
| a web booking creates/links the guest | `src/app/api/bookings/route.ts:83`, `:130` | `guestId` is set before the transaction commits |
| the two drifted copies removed | `/api/reviews`, `/api/guest/activate` | the activation check now **fails closed** on an unusable number |
| the rule enforced by the database, not by code that remembers to call a helper | migration `drizzle/0007_nasty_cannonball.sql` | `guests_email_identity_unique` on `lower(email)`, `guests_phone_identity_unique` on the nine digits — both **confirmed present in the live database** |
| the rule and the database proven to agree | `npm run verify:identity` → `scripts/verify-guest-identity.mjs` (new) | **ALL CHECKS PASSED** — 38 cases, then a read-only report of split identities |

Migration 0007 was applied only after `verify:identity` reported **no** duplicated email addresses and
**no** duplicated phone numbers, and the script refuses `--apply` while any exist — which is why adding
the unique indexes could not fail on the live data.

**Still open, and named rather than implied:** `bookings.guestId` is still nullable (older rows hold
null; closing it needs a backfill that runs the same rules over existing bookings, then `SET NOT
NULL`); a guest cannot ask for a password reset themselves — the desk can, and the 1-hour
`password_reset` token is already consumed by `/api/guest/activate`, but nothing *issues* one yet; and
the premium booking-form redesign of Brief 3 is not started, because it is the motel's money path and
cannot be half-shipped. `docs/BUILD-REQUEST-AUDIT.md` lists these with what each one costs.

## Menu prices and booking offers

The admin portal now has manager-only menu-item create, edit, price, availability and removal
controls backed by `/api/admin/menu`; the front desk retains its separate sold-out-only action.
Offer posts can optionally carry a numeric MWK price per room-night. A blank price keeps an offer
display-only, while a priced active Offer can be selected during booking. The booking endpoint reads
the active offer prices itself, multiplies each by the stay length, and stores the priced selection
in the booking extras and invoice line items; browser-supplied extra amounts are not used for these
new selections.

Migration `drizzle/0015_bookable_offer_price.sql` adds the nullable offer rate. It is part of the
workspace migration history and must be applied by the normal Drizzle deployment workflow before
the new offer controls are used against a database. This addendum is a source-code change, not a
claim that a production database has already been migrated.

*This file is the per-section evidence behind **Part D** of `README.md`, which documents the
mechanism of the same change. Keep the two in step: when a gap listed here is closed, move the row
rather than leaving a sentence that is no longer true.*