# Sunrise Motel Theme Audit

**Status:** Audited against the retained master view, `http://localhost:3112/admin?section=overview#hp-main`.

## Existing Theme

**Master page:** `src/app/admin/page.tsx` renders the manager overview and its menu/section state. `src/app/admin/layout.tsx` supplies admin metadata and renders its children; it does not render the page shell. The `#hp-main` fragment does not select a separate file or component.

**Observed master theme:** Sunrise orange `#F28C18`, deep orange `#C95612`, ink `#171513`, warm ivory `#F8F5F0`, white surfaces, and a dark green sidebar `#26392F` (measured as `rgb(38, 57, 47)`). The active admin navigation is orange with an 8px radius. Admin controls use compact 4px rounding; the display logo/heading uses the existing Georgia serif, and operational text uses the system sans stack. Icons are from `lucide-react`.

## Sources Checked

| Source | Finding |
|---|---|
| Master overview renderer | `src/app/admin/page.tsx` renders the overview, statistics, next actions, and manager sign-in. |
| Admin route layout | `src/app/admin/layout.tsx` sets manager metadata and wraps pages with `src/components/admin/admin-route-gate.tsx`; it contains no visual shell. |
| Tailwind config | No `tailwind.config.js` or `tailwind.config.ts` exists. Tailwind v4 is loaded with `@import "tailwindcss"` in `src/app/globals.css`; the product theme itself is authored in CSS. |
| Shared CSS tokens | `src/app/globals.css` defines the global palette, radius scale, font stacks, and manager sidebar rules. |
| Home-page theme | `src/app/home-premium.css` defines page-scoped `hp-*` tokens. These are already in production use and intentionally differ slightly from the global values (for example `--hp-ink: #14110f`, cream `#FBF7F0`, and gold `#D4A017`). Keep them local to the home page. |
| Inner-page styling | `src/app/inner-pages.css` and `src/app/enhancements.css` use global tokens and established component classes. |
| Navigation | `src/app/site-nav.css` and `src/components/site-nav.tsx` establish a dark charcoal header/utility bar, orange active states, a pill CTA, and a mobile sticky CTA. |
| Manager portal | `src/app/globals.css` styles the ink header, dark green sidebar, orange active item, and warm ivory canvas. The manager overview's browser theme color is `#171513`. |
| Desk | `/desk` renders the existing `DeskConsole` from `src/components/desk/desk-console.tsx`; retain its current navigation model and role-aware controls. |
| UI component library | No `src/components/ui/` directory exists. Reuse the existing components and CSS classes rather than introducing a new design system. |
| Logo | `public/images/sunrise-logo.svg` and `src/components/sunrise-logo.tsx` carry the orange `#F28C18` emblem, dark `#171513` wordmark and existing serif/sans pairing. Use the current logo component/asset and placement. There is no `public/logo.png` at the expected root path. |

## Extracted Tokens

| Role | Existing value | Source / usage |
|---|---|---|
| Primary brand color | `#F28C18` | `--orange`; sunrise mark and primary booking/availability actions |
| Secondary brand color | `#C95612` | `--orange-deep`; emphasis, active tab text and supporting CTA states |
| Warm accent | `#D4A017` | Browser theme color and isolated home-page `--hp-gold`; not a replacement for global orange |
| Background | `#F8F5F0` | Global `--ivory`; home page uses its existing scoped `#FBF7F0` cream |
| Text | `#171513` | Global `--ink`; home-page scope uses existing `#14110F` |
| Supporting surface | `#EFE8DF` / `#E9D8C4` | Global `--ivory-deep` / `--sand` |
| Supporting status color | `#526A57` | Global `--sage`; `#E8EFE9` is its light surface |
| Muted text | `#756C64` | Global `--muted`; home scope uses its own `#6D635B` |
| Display font | `Georgia, "Times New Roman", serif` | `--serif`; brand and page headings |
| Body font | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` | `--sans`; system stack, no remote font dependency |
| Default control radius | `4px` | `--radius-sm` |
| Other existing radii | `8px`, `14px`, `999px` | `--radius-md`, `--radius-lg`, and intentional navigation/pill controls |
| Home button/card radius | `6px` / `14px` | Existing `--hp-radius-btn` / `--hp-radius-card` |
| Card surface | White or existing page cream | Existing card styles in global CSS and `.hp-*` styles |
| Shadows | Context-specific and restrained | Examples: room card `0 6px 20px rgba(0,0,0,.04)`; home tokens `--hp-shadow-1/2/3` |
| Header / manager chrome | `#171513` | Existing public header and manager header |
| Manager sidebar | `#26392F` (measured from `.admin-side-nav`) | Preserve the master page's dark green sidebar and orange active state. |

## Visual Model

The retained manager overview is a warm independent-motel dashboard: an ink header, dark green sidebar, orange active navigation and actions, ivory page surface, white statistic surfaces, Georgia display headings, system-sans controls, and compact rounded controls. This is **not** a Booking.com-blue theme, a navy-sidebar SaaS theme, or a universal full-pill/`rounded-2xl` component system.

The home page deliberately has a more premium, editorial treatment in a locally scoped stylesheet. Its gold, moss and clay tokens are existing page-level accents, not permission to replace the global theme or copy the home palette indiscriminately to operational pages.

## Route Names: Use Existing Paths

Do not create duplicate routes to match generic names from a design prompt:

| Concept | Existing route |
|---|---|
| Home and room search | `/` |
| Rooms / booking catalog | `/stay` (also room section on `/`) |
| Account guest experience | `/app` |
| No-account in-room experience | `/room` |
| Staff console | `/desk` |
| Manager portal | `/admin` |
| Manager finance | `/admin/finance` |
| Manager calendar | `/admin/calendar` |
| Manager housekeeping | `/admin/housekeeping` |
| Guest record | `/admin/guests/[id]` |
| Public gallery and dining | `/gallery`, `/dine` |

There is no `/rooms` or `/my` route. Keep `/register` and `/signup` as their existing invite-only redirects; do not add self-registration.

## Android Release Identity Conflict

The repository currently has **two** Android applications, not one:

| App | Existing applicationId | Existing versionCode | Existing contract |
|---|---|---:|---|
| Guest app (`SunriseMotelApp`) | `com.sunrisemotel.app` | `4` | Its Gradle file explicitly says the applicationId is locked forever so installed users receive updates instead of a duplicate app. |
| Manager app (`SunriseAdminApp`) | `com.sunrisemotel.admin` | `1` | Separate icon and update line, deliberately installed alongside the guest app. |

The requested `com.sunrisemotellw.app` differs from both existing IDs, and “one app only” conflicts with the current two-app release design. Changing an applicationId will not upgrade the installed app; it creates a different Android identity. No package ID, app count, versionCode, signing key, or release metadata should be changed as part of the visual-only web redesign. If Android consolidation is required, treat it as a separately approved migration with an explicit upgrade/retirement plan. A versionCode increment applies only when the corresponding Android app is intentionally released.

## Non-Negotiable Design and Logic Lock

- Keep all colors, fonts, logo assets, page-scoped theme tokens, and existing navigation identity above.
- Keep the current APIs, fetches, state, handlers, server pricing, inclusive VAT behavior, status values, booking concurrency controls, authentication, authorization, audit behavior, and guest account/room-session distinction unchanged.
- Keep invite-only guest accounts; do not add registration or sign-up behavior.
- Preserve `SafeImage` for guest-facing photography.
- UI refinements may improve spacing, grouping, hierarchy, loading/error feedback and responsive layout using existing theme tokens; do not introduce new brand colors or claim unavailable workflows exist.

## Page Logic Inventory (Freeze Before Visual Work)

This inventory records the live route contracts to preserve. Components may own the data fetching and state even when a route's `page.tsx` is only a wrapper. Visual changes must not move or rewrite these calls, handlers, payloads, identity checks, result states or role gates.

| Surface | Current data/API contract | Existing actions and state that must remain |
|---|---|---|
| `/` | `GET /api/availability` for selected dates and tonight's room count; `GET /api/admin/gallery`; `GET /api/posts`; `GET /api/reviews`; `POST /api/waitlist`; `POST /api/bookings`; invoice and tracking links from the booking response. | Date/night and occupancy controls; room gallery; booking modal with breakfast, transfer and late checkout; guest form; request submission and 409/error recovery; waitlist form; review expansion; app-banner dismissal; slideshow controls. |
| `/stay` | `GET /api/availability` on date changes; `POST /api/bookings`; invoice link after success. | Date/night, guest and room selection; extras; booking form; success reference and refresh of availability. Keep the existing public pricing calculation and server result behavior. |
| `/gallery` | Shared `GalleryGrid` calls `GET /api/admin/gallery` (intentionally public read). | Category filter and image lightbox, including Escape and arrow-key navigation. |
| `/dine` | Server route reads `menu_items` through Drizzle; falls back to its current built-in menu if the database read fails. No API is called by the public order form. | Category filter, quantity basket, table/takeaway selection and modal form currently show a local success state only. Sold-out items stay non-orderable. Do not claim the public form created a persisted order. |
| `/unwind` | Event cards are local content; no reservation API is called. | Reservation form and success state are local UI state. Preserve the current inputs and success behavior; do not imply a persisted reservation. |
| `/connect` | No enquiry API is called. | Workspace enquiry form and success state are local UI state. Preserve the current flow; do not imply a saved enquiry. |
| `/app` | `GET /api/guest/me`; `POST /api/guest/auth`; `POST /api/guest/orders`; `POST /api/guest/messages`; `POST /api/guest/requests`; account/session actions through `/api/guest/auth`. Published What's-on content is loaded by the guest feed component from `GET /api/posts`. | Invite-only sign-in; active stay context; five app tabs; order basket and service choice; private messages; service requests; device/account settings and sign-out. No self-registration. |
| `/room` | `GET /api/guest/room-session`; `POST /api/guest/room-session` for QR, PIN or reference + phone; `DELETE /api/guest/room-session` to forget this device; `GET /api/posts`; order/request/message APIs shared with the guest app. | QR auto-entry, PIN/reference entry, per-device logout, room-scoped order basket, messages and requests. Access remains stay-scoped and ends at checkout. |
| `/desk` | `GET`/`POST /api/admin/login`; `GET /api/desk/overview`, `/api/desk/rooms`; per-tab APIs: `/api/desk/stay`, `/rooms`, `/room-sessions`, `/orders`, `/issues`, `/tasks`, `/menu`, `/payments`, `/folios`, `/guests`, `/reviews`; invoices use `/api/invoices/[reference]`. | Existing Today, room map, room access, orders, issues, tasks, sold-out toggle, payments/folios, guests, reviews/waitlist tabs; check-in/out/no-show, room assignment, PIN/session actions, role-aware mutations, refresh and sign-out. Auditor stays read-only; staff/admin controls remain governed by existing checks. |
| `/admin` | `GET /api/admin/login`; loads bookings, invoices, gallery, posts, audit, dashboard and reminders; conditionally loads staff and rooms by role. Mutations use the matching admin APIs for login, booking changes/deletion/extension, invoice email, gallery/posts, notifications, rooms/staff and reminders. Reports use `/api/admin/reports`. | Existing tabbed manager portal, sign-in/lock, refresh, booking detail/timeline, reminders, invoices, content/media, audit, staff, rooms/rates and reports. Admin-only controls remain absent for unauthorized roles and API checks are unchanged. The manager screens are not a new sidebar application. |
| `/admin/calendar` | `GET`/`PATCH /api/admin/calendar`; `POST`/`DELETE /api/admin/room-blocks`. | Room/night grid, assign unassigned booking, add/release room blocks, and existing confirmation/error/notice states. |
| `/admin/housekeeping` | `GET /api/admin/housekeeping`; `POST`/`PATCH /api/admin/housekeeping`. | Refresh board; start cleaning; mark clean/inspected/available; set out-of-order with a reason; close tasks. Room and task state are shared with `/desk`. |
| `/admin/finance` | `GET`/`POST /api/admin/night-audit`; `GET`/`POST`/`DELETE /api/admin/expenses`; report downloads via `/api/admin/reports`. | Live finance cards, run/re-run the dated audit, record expenses, confirm before deleting an expense, refresh and download/print reports. Amounts and inclusive VAT treatment remain unchanged. |
| `/admin/guests/[id]` | `GET /api/admin/guests/[id]` on load and refresh. | Read-only Guest 360 tabs: bookings, invoices, payments, POS orders, audit and notes; preserve refresh/error states. |

**UI update:** `/` and `/stay` now expose both check-in and check-out dates in their existing search controls. The departure date is bounded to the existing 1–30-night limit and continues to drive the same availability request. Both existing booking forms also have an optional `Work / business` or `Personal / leisure` purpose choice; the choice is prefixed into the existing `requests` value so staff can see it. There is no new endpoint, state value, database column, price rule or required field.

### Requested Names That Are Not Routes

`/rooms` is the existing `/stay` catalog and `/my` is not a route: account guests use `/app`, while room-session guests use `/room`. Booking, room and guest list management currently live in `/admin` or `/desk` tabs. Do not add aliases or new endpoints as part of visual alignment. `/register` and `/signup` stay invite-only redirects.

### Logic-Preservation Verification

Before/after a visual change, compare the page/component diff: allowed changes are presentational markup/classes and CSS. No changes to `fetch` URLs/options, HTTP methods, request payloads, API route handlers, state transitions, pricing, date arithmetic, authorization, status values, guest identity resolution, or audit calls. Keep public live-data requests uncached and keep VAT included in displayed totals.
