# Admin Content, Media & Broadcast Operations Manual

**Text only. No code. Addendum to the Complete System Specification v2 (Part 26).**

**The rule this whole document serves:** *everything is done from one page.* One admin signs in at
`/admin` and controls every image, post, event, room, rate, notification and announcement in the
system. There is no second dashboard, no separate CMS, no FTP, no editing files on a server.

---

# PART 1 — WHAT THE ADMIN PAGE CONTROLS

| Area | What it manages | Who can change it |
|---|---|---|
| **Pictures** | Every photo in the gallery, on room cards, and on posts | Admin **and** staff |
| **Posts** | Events, specials, offers, news | Admin **and** staff |
| **Rooms** | Room types, physical rooms, rates, housekeeping states | **Admin only** |
| **Notifications** | Push broadcasts and operational notices | **Admin only** |
| **Bookings** | The whole pipeline, payments, invoices | Staff for the pipeline; admin for money |
| **Guests** | Accounts, stays, history, flags | **Admin only** |
| **Staff** | Accounts, roles, credentials | **Admin only** |
| **Reports & audit** | Everything readable, exportable | Admin and staff |

Everything below is done from that single signed-in page.

---

# PART 2 — MEDIA AND UPLOADS

## 2.1 Where every image in the system lives

| Source | Where it is stored | How it is served |
|---|---|---|
| **Seed and hero photography** | `public/images/` in the project | Directly, as static files — always available, even with no database |
| **Uploaded through the admin page** | **Vercel Blob** if configured; otherwise **base64 in the PostgreSQL `uploaded_images` table** | A public CDN URL, or `/api/images/[id]` with a one-year immutable cache |
| **Pasted external URL** | Not stored at all — the URL is kept as text | Loaded from wherever it points |

**The fallback is deliberate and important.** If Vercel Blob is not configured — local development, a
tunnel, or a Blob outage — uploads still work and still produce a usable URL. Uploads never dead-end.

## 2.2 The upload process, step by step

| Step | Who | Action | What the system does next |
|---|---|---|---|
| 1 | Admin/staff | Opens the **Pictures** tab | Shows the existing gallery grouped by category, with an upload area and a "paste a URL" field |
| 2 | Admin/staff | Either **drags and drops** a file onto the upload area, or taps it to open the file picker | The file is read in the browser and a **live preview** appears with a progress bar |
| 3 | — | — | The browser checks the file **before** sending: must be an image, must be **5 MB or less**. A rejected file shows why, immediately, without a wasted upload |
| 4 | Admin/staff | Fills in the **category** (Rooms / Property / Dining / Events / Work), the **caption**, and optional **alt text** | — |
| 5 | Admin/staff | Taps **Upload** | `POST /api/upload` runs. The session is checked. The file is validated again server-side |
| 6a | System | **Blob configured** | The file goes to Vercel Blob; the response contains a public CDN URL and `storage: "blob"` |
| 6b | System | **Blob not configured, or the Blob call fails** | The bytes are stored base64 in `uploaded_images`; the response contains `/api/images/[id]` and `storage: "database"` |
| 7 | System | — | The image is attached to whatever was being edited — a gallery entry, a room type, or a post — and the change is written to the audit log |
| 8 | Admin/staff | Sees the result | The new image appears in the gallery immediately, in the right category, with its caption |

## 2.3 The rules

| Rule | Detail |
|---|---|
| **Images only** | No PDFs, no documents, no executables |
| **5 MB maximum** | Enforced in the browser *and* on the server |
| **A URL is always returned** | On Vercel, on a tunnel, and locally — the admin never ends up with a broken reference |
| **Immutable caching** | `/api/images/[id]` is served with a one-year immutable cache, so a replaced image gets a new id rather than a stale cache |
| **Audited** | Every upload is written to the audit log with the uploader and the filename |
| **Removable** | Any image can be removed from the Pictures tab; the change is immediate and audited |

## 2.4 What each image is used for

| Destination | How it is set |
|---|---|
| **Room cards and the room slideshow** | The `images` field on the room type — a list of URLs. Add, reorder, or replace from the **Rooms** tab |
| **The gallery** (`/gallery`, the home gallery strip) | The **Pictures** tab, with a category and a display order |
| **A post or event card** | Chosen when the post is created — either upload a new one, or **pick from the existing gallery** |
| **A push notification poster** | Chosen in the notification composer, with a live phone preview |
| **Proof of a payment claim** | Uploaded by the *guest* through the same upload path |
| **A photo attached to a complaint** | Uploaded by the *guest* through the same upload path |

One upload path serves the admin, the staff and the guests. That is why it must never fail silently.

## 2.5 Image quality — what to enforce

Because guests are on prepaid data bundles, and because the motel's reputation partly rests on its
photography:

| Improvement | Why |
|---|---|
| **Compress on upload** | A 4 MB phone photo should not be served at full size to a guest on a 3G connection |
| **Serve responsive sizes** | A thumbnail on a phone should not download a 2000 px image |
| **Modern formats** (WebP/AVIF with a fallback) | Same quality, a fraction of the bytes |
| **Lazy-load below the fold** | The hero loads first; the gallery loads when scrolled to |
| **Descriptive alt text, required** | Both accessibility and image search |
| **A naming convention** | `room-104-bed.jpg`, not `IMG_2841.jpg` — so the media library stays usable in two years |
| **A house rule on what gets uploaded** | Real rooms, in good light, made beds, working fixtures. A photo of a broken geyser should not be on the room card |

## 2.6 What never happens

- The legacy `POST /api/admin/upload` path, which writes into `./uploads`, is **not used** — on Vercel
  that directory is wiped on every deploy, and photos uploaded that way vanish. Only the Pictures tab,
  which uses the proper path, is safe.
- Images are never deleted from the project's `public/images/` by the admin page; those are the
  permanent seed photography.
- A removed gallery image does not break a room card that referenced it — the system falls back to the
  room type's own images, then to a placeholder.

---

# PART 3 — POSTS AND EVENTS

## 3.1 Creating a post

| Step | Who | Action | Follow-up |
|---|---|---|---|
| 1 | Admin/staff | Opens the **Posts** tab and taps **New post** | A form opens |
| 2 | — | Fills in: **title**, **category** (Event / Special / Offer / News), **day**, **date**, **time**, **price tag**, **detail**, and a **picture** | The picture is either uploaded fresh or **picked from the existing gallery** |
| 3 | — | Chooses the publish action | **Publish now**, or **Schedule** for a future date and time |
| 4 | — | Chooses the push audience | **All app users** · **In-house guests only** · **Opted-in guests only** · **No push** |
| 5 | Admin/staff | Taps **Publish** | The post is created as `is_active` |
| 6 | System | — | The post appears **immediately** on the home page and on `/unwind`. If a push was chosen, it is sent to the selected audience. `posts.created` is written to the audit log |
| 7 | System | — | The post appears in the app's **What's on** feed with an **unread badge** for guests who have not opened it |

## 3.2 The five seeded posts, as the pattern

| Post | Category | What it sells |
|---|---|---|
| Sunset Happy Hour | Offer | The bar, in the evening |
| Lawn Braai & Sizzling Cuts | Event | The braai pit and the lawn |
| Match Day on the Big Screen | Event | The lounge and the screen |
| Work & Relax Day Pass | Special | The workspace and the Wi-Fi |
| Garden Dinner Evenings | Event | The restaurant |

Each one is a real revenue line that a room-only website never mentions. That is why the posts matter
commercially, not just cosmetically.

## 3.3 Managing existing posts

| Action | What it does | Who sees the change |
|---|---|---|
| **Edit** | Any field can be changed at any time | The public site and the app feed update immediately |
| **Pause / Resume** (Live / Paused) | The post disappears from the public site and the feed without being deleted | Nobody — it is simply not shown |
| **Delete** | Removed permanently | Nobody; the audit log keeps the record |
| **Schedule** | Published automatically at the chosen time, with the push firing then | As above |
| **Reach report** | How many guests received the push, opened it, and tapped through | Admin only |

## 3.4 Events that take bookings

An event post can carry an action button. When a guest taps it:

| Post type | The action | What the system creates |
|---|---|---|
| Braai spot or table | **Reserve** | An **event enquiry** in the desk queue: post reference, date, headcount, guest, room |
| Priced event | **Book** | A charge to the room folio, or a payment |
| Day pass | **Get day pass** | A folio charge |
| Offer | **Claim** | A claim recorded on the guest, so the desk can honour it |
| News | **Share** | A WhatsApp share |

This is what finally gives the `/unwind` reservation form somewhere to go — currently it saves nothing
and alerts nobody.

## 3.5 The posting rhythm that works

| When | What |
|---|---|
| Weekly | One or two real events — the braai, the match, the happy hour |
| Before a public holiday | Whatever is on, published a week ahead so guests can plan |
| During a guest's stay | Anything happening **tonight**, pushed as a Notice rather than a marketing post |
| Never | A post with no date, no price and no reason to act |

A post that does not answer "what is it, when is it, what does it cost, what do I do" is decoration.

---

# PART 4 — ROOMS, RATES AND HOUSEKEEPING

## 4.1 Room types — the sellable catalogue

| Action | What the admin does | What the system does next |
|---|---|---|
| **Add a room type** | Fills in the ID slug, name, description, MWK per night, how many rooms of that type, bed, sleeps, size, badge, features and images | The type appears on the public site and in availability |
| **Edit the rate** | Changes the MWK figure | **New bookings get the new rate. Existing bookings keep their frozen rate** — history is never rewritten |
| **Hide / Show** | Toggles `is_active` | A hidden type disappears from availability and from the public site, but existing bookings are untouched |
| **Remove** | Deletes the type | **A type with live bookings is deactivated instead of deleted** — the admin is told why and the bookings are safe |

## 4.2 Physical rooms — new, and the most important addition

| Action | What the admin does | What the system does next |
|---|---|---|
| **Add rooms** | Enters the door numbers against a type: "101, 102, 103, 104" | Each becomes individually assignable, trackable and cleanable |
| **Edit a room** | Changes the floor or the notes | Immediate |
| **Take out of order** | Enters a reason — "geyser cold", "window lock broken" | The room leaves sellable inventory, so availability drops and it is never sold |
| **Return to service** | Clears the note | The room becomes `clean` and sellable again |
| **Set housekeeping state** | `clean`, `dirty`, `inspected`, `occupied` | The room map and the desk board update immediately |

**Why this matters:** without it, "Room 104" is just text, and two guests can be given the same room on
the same night. With it, the same overlap rule that protects availability protects the physical room.

## 4.3 Rates — seasonal and length-of-stay

| Action | What the admin does | Effect |
|---|---|---|
| **Set a seasonal rate** | Label, date window, MWK per night | New bookings in that window are priced at that rate |
| **Set a length-of-stay discount** | e.g. 7+ nights at MWK 80 000 | Applies only to qualifying new bookings |
| **Remove a rate** | Deletes it | Future bookings revert to the base rate |

The base `rate` on the room type is always the default. A dated rate overrides it for matching stays
only. **Nothing here ever rewrites an existing booking.**

## 4.4 The menu — currently disconnected

The `menu_items` table exists and is seeded, but `/dine` renders a hard-coded array, so **editing the
database changes nothing a guest sees**. The fix is a **Menu tab** in the admin page that manages
`menu_items` directly: name, category, description, price, image, `is_available`, `is_special`. This is
also what makes in-app ordering respect real stock and real availability.

---

# PART 5 — NOTIFICATIONS AND BROADCASTS

This is the part you asked about most directly, so it is worth being precise about what is broadcast,
by whom, and to whom.

## 5.1 Four kinds of announcement — and they are not the same thing

| | **1. Service messages** | **2. Operational notices** | **3. Marketing broadcasts** | **4. Digest** |
|---|---|---|---|---|
| Who starts it | **The system**, automatically | **The admin**, manually | **The admin**, manually | **The system**, on a schedule |
| Trigger | A booking, payment, order, message or stay event | "Kitchen closes at 22:00 tonight" | "Sunset Happy Hour is back" | Weekly summary of what's on |
| Who receives | The guest it concerns | **Everyone with an active stay** | Guests who **opted in** | Guests who opted in |
| Consent needed | **No** — always delivered | **No** — always delivered | **Yes** | **Yes** |
| Channel | Push + SMS + WhatsApp + email | Push | Push | Push |
| Batching | Immediate | Immediate | At publish, or scheduled | Once a week |
| Can be muted | Urgent ones, no | No | Yes | Yes |

**The separation is the whole design.** If marketing and service messages shared a channel, guests would
mute the app and stop hearing that their geyser was fixed.

## 5.2 The broadcast composer — `/admin/notifications`

| Field | Detail |
|---|---|
| **Title** | Short, appears in the status bar |
| **Message** | One or two lines |
| **Target page** | Where the app opens when the guest taps it — a post, the menu, the booking page, the gallery |
| **Poster image** | Optional, with a **live phone preview** so the admin sees exactly what will arrive |
| **Audience** | All app users · in-house guests only · opted-in guests only |
| **Schedule** | Now, or a future date and time |
| **Test configuration** | Sends `validate_only` — **proves the key, project and API work without notifying anyone**. Always press this first |
| **Send to All App Users** | The actual send |

## 5.3 What happens on send

```
Admin taps Send
      |
      v
System checks: is Firebase configured?
      |
  +---+---+
  |       |
 NO      YES
  |       |
  v       v
Honest   Mint an access token from the service-account JSON
error:   (hand-rolled RS256 JWT -- no firebase-admin dependency)
"Firebase     |
 not      POST to FCM: https://fcm.googleapis.com/v1/projects/<id>/messages:send
 configured"  |
      |       +---> topic "all_users"          (property-wide announcements)
      |       +---> individual device tokens   (that guest's registered phones)
      |       |
      v       v
Nothing   Delivery result returned
sent        |
            v
      notification_log row written:
        channel, recipient, template, status, provider reference, Malawi time
            |
            v
      audit_log row: notification.broadcast / notification.test / notification.failed
```

**The honesty rule:** without `FIREBASE_SERVICE_ACCOUNT_JSON` the composer says
`{ queued: true, delivered: false, reason: "Firebase not configured…" }` rather than pretending a
message went out. The UI never lies about a send.

## 5.4 Per-device versus topic — when each is used

| Mechanism | Used for | Why |
|---|---|---|
| **Topic `all_users`** | Genuine property-wide announcements — "we've added a room", "new menu" | One call reaches everyone, including app-closed devices, with no device list to maintain |
| **Individual device tokens** | **Everything else** — order updates, message replies, invoices, check-out reminders | A guest should not receive another guest's order status |

The Android app subscribes every install to `all_users` on first run, which is why the topic works at
all.

## 5.5 Deep links — where a push lands

| The push is about | The app opens |
|---|---|
| An order | That order |
| A message reply | That thread |
| A new post | That post |
| An invoice or receipt | That invoice |
| A booking confirmation | That booking |
| Anything else | The app home screen |

Never the generic home page. A push that lands somewhere useless is a push that teaches the guest to
ignore the next one.

## 5.6 Delivery tracking

Every attempt — send, test, failure — is written to `notification_log` with:

- The channel (push, SMS, WhatsApp, email)
- The recipient
- The template used
- The status (sent, failed, skipped)
- The provider's own reference, for disputes
- The Malawi timestamp

This is how the motel answers "did the guest actually get told?" — a question the current system cannot
answer, because email failures are only recorded as booking timeline events.

## 5.7 The automatic service broadcasts

These need no admin action at all:

| Event | Broadcast to | Channel |
|---|---|---|
| Booking created | The guest, plus staff and admin | Push + SMS + WhatsApp + email |
| Pro-forma issued | The guest | Email with the PDF |
| Payment claimed / verified / rejected | The guest | Push + SMS + WhatsApp |
| Booking approved / confirmed / cancelled | The guest | Push + SMS + WhatsApp + email |
| Room assigned | The guest | Push + SMS |
| Order accepted / preparing / ready / delivered | The guest | Push + SMS |
| Message reply | The guest | Push + SMS + WhatsApp |
| Issue acknowledged / resolved | The guest | Push |
| Emergency issue | The desk (loud) and the admin | Portal + push |
| Deposit deadline warning / release | The guest | Push + SMS + WhatsApp |
| Reminder due (2 h) | The assigned staff member and the admin | Email + WhatsApp |
| Escalation (12 h) | The admin | Email + WhatsApp |
| Check-out reminder (09:00) | The guest | Push |
| New staff account | The new staff member | Email + WhatsApp/SMS |
| Daily 07:00 summary | The admin | Email |

## 5.8 Notification fatigue — the rules that prevent it

| Rule | Why |
|---|---|
| Marketing requires opt-in | Service messages never do |
| A **weekly digest** replaces one push per post | Five posts a week is five interruptions |
| Operational notices are limited to **in-house guests** | A guest who checked out last month does not need tonight's kitchen hours |
| Guests can mute non-urgent notifications | Without losing urgent ones |
| Reach is measured | A channel nobody opens should not be fed |

---

# PART 6 — THE GALLERY

| Action | What the admin does | Follow-up |
|---|---|---|
| **Add an image** | Uploads or pastes a URL, picks a category, writes a caption and alt text, sets the display order | Appears on `/gallery`, the home gallery strip, and in the "choose from gallery" picker inside the post form |
| **Reorder** | Drags images into a new order | The public grid reorders immediately |
| **Recategorise** | Changes Rooms → Dining | The image moves between the gallery's filters |
| **Remove** | Deletes it | Gone from every surface that referenced it; falls back to a placeholder where needed |

The gallery is the motel's shop window. It is also the source of images for posts, so keeping it
organised by category is what makes publishing a post fast.

---

# PART 7 — WHAT EVERY ACTION WRITES TO THE AUDIT LOG

| Action | Audit entry |
|---|---|
| Upload an image | `gallery.image_added` / `upload.*` |
| Remove an image | `gallery.image_removed` |
| Create a post | `posts.created` |
| Edit a post | `posts.updated` |
| Pause / resume a post | `posts.status_changed` |
| Delete a post | `posts.deleted` |
| Add or edit a room type | `rooms.created` / `rooms.updated` |
| Hide / remove a room type | `rooms.status_changed` / `rooms.deleted` |
| Add or edit a physical room | `room.created` / `room.updated` |
| Change a room's housekeeping state | `room.status_changed` |
| Take a room out of order | `room.out_of_order` |
| Set a seasonal or length-of-stay rate | `rate.created` / `rate.deleted` |
| Send a broadcast | `notification.broadcast` |
| Test a broadcast | `notification.test` |
| A failed send | `notification.failed` |
| Publish a notice | `notice.published` |
| Sign in / out / failed sign-in | `auth.login` / `auth.logout` / `auth.login_failed` |

Each entry carries the actor, their label (e.g. `Admin — Willard Kulemeka`), the client IP and the
Malawi timestamp. **The audit view is read-only by design** — it can be searched, filtered by entity,
and exported to CSV, but never edited or deleted.

---

# PART 8 — THE DAILY AND WEEKLY CONTENT ROUTINE

### Daily (5 minutes)

1. Check whether tonight has an event, and whether a **Notice** needs sending ("braai moved to the
   lawn", "kitchen closes early").
2. Confirm the room map has no room stuck `out_of_order` without a reason.
3. Confirm no image in the gallery is broken or missing.

### Weekly (15 minutes)

1. Publish next week's events, with dates, times and price tags.
2. Review the **reach report** on last week's posts — if nobody opened them, the content or the timing
   needs changing, not more posts.
3. Check the **unverified payments** total and clear it.
4. Read the audit trail for anything unusual — deletions, voids, rate changes, odd-hour logins.

### Monthly (30 minutes)

1. Review occupancy and revenue; set next month's seasonal rates.
2. Refresh any photography that is out of date — a repainted room, a new dish, a repaired fixture.
3. Export the audit log off-database.
4. Review which posts actually produced bookings or claims.

---

# PART 9 — FAILURE MODES AND WHAT TO DO

| Symptom | Cause | Fix |
|---|---|---|
| Uploads return no URL | Blob not configured **and** the database fallback failed | Check `DATABASE_URL`; the fallback exists precisely so this is rare |
| Photos vanish after a deploy | They went through the legacy `POST /api/admin/upload` into `./uploads`, which Vercel wipes on every deploy | Always use the **Pictures** tab, which uses the proper path |
| "Firebase not configured" in the composer | `FIREBASE_SERVICE_ACCOUNT_JSON` missing, or `FIREBASE_PROJECT_ID` not set | Add both, redeploy, and press **Test configuration** first |
| Push works but no phone buzzes | The installed build lacks the messaging dependency, `google-services.json`, or the `all_users` subscription | Rebuild the APK through CI with the secret restored |
| A post does not appear | It is `Paused`, or its date is in the future | Check Live/Paused and the schedule |
| Editing the menu changes nothing | `/dine` still reads a hard-coded array | Build the Menu tab and switch the page to `menu_items` |
| A room is still sold out after being repaired | It is still `out_of_order` | Return it to service from the Rooms tab |
| A rate change altered an old booking | It cannot — rates are frozen at booking time | If it appears to have, the booking was edited manually; check the audit log |
| The audit trail is empty for an action | The action was taken outside the system | Everything must go through the portal |

---

# PART 10 — IN SHORT

**One signed-in admin page controls everything.** Pictures, posts, events, rooms, rates, housekeeping
states, notifications and announcements — there is no second dashboard and no file transfer.

**Media** arrives by drag-and-drop or a pasted URL, is validated as an image under 5 MB in the browser
*before* it is sent, and is stored in Vercel Blob when configured or base64 in PostgreSQL when it is
not — so an upload always produces a working URL, never a dead end. One upload path serves the admin,
staff and guests, which is why it must never fail silently. Images then feed the room slideshows, the
gallery, the post cards and the push posters, and each is served with a one-year immutable cache.

**Posts and events** are created from one form — title, category, day, date, time, price tag, detail,
picture — published immediately or scheduled, optionally pushed at publish time to a chosen audience,
and then manageable forever: edit, pause, resume, delete, and read a reach report that says how many
guests actually received and opened them. An event post can carry an action button, which is what
finally gives the braai and table reservations somewhere to go.

**Rooms** are managed in two layers: the sellable room type with its rate, and the physical rooms with
their door numbers and housekeeping states. A rate change applies only to new bookings — existing
bookings keep their frozen rate — and a room type with live bookings is deactivated rather than deleted.

**Announcements travel by four distinct routes**, and keeping them separate is the whole design:
**service messages** the system sends automatically to the guest concerned; **operational notices** an
admin sends to everyone currently in-house; **marketing broadcasts** composed in the notification
composer with a live phone preview, a `validate_only` test and an opted-in audience; and a **weekly
digest** that replaces one push per post. Each lands on a deep link to the exact thing it is about,
each is recorded in a notification log with its delivery outcome, and each is written to an audit log
that can be read, filtered and exported but never edited.
