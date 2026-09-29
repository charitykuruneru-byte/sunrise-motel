# The Complete Admin Action Set — Everything Else, With Follow-Ups

**Text only. No code. Addendum to the Complete System Specification v2 (Part 27).**

This document lists the admin capabilities that have not been spelled out anywhere else, each with the
**complete follow-up chain**: what the system does, who is notified, and what is recorded.

Where an action is also available to staff, it is marked **[staff]**. Everything else is **admin only**.

---

# SECTION A — SETTINGS AND SYSTEM CONFIGURATION

An admin **Settings** tab holds every rule the system enforces. Changing any of these changes behaviour
immediately, and each change is audited.

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| A1 | **Set the deposit rule** | Enters the deposit percentage and the deadline in hours (e.g. 30%, 48 h) | All **future** bookings get the new rule; existing bookings keep the terms they were made under. The guest-facing text updates everywhere it appears |
| A2 | **Set the cancellation window** | Enters the free-cancellation period (e.g. 24 h before check-in) | Shown at booking, enforced at cancellation, and stamped on the booking as the policy version in force |
| A3 | **Publish a new policy version** | Sets the new tag (e.g. `2026-10`) | Every new booking is stamped with it; existing bookings keep their old tag, so the terms they agreed to are always reconstructable |
| A4 | **Set check-in / check-out times** | Changes 14:00 / 10:00 | Updates the website, the app, the invoices, the arrival guide and the FAQ in one action |
| A5 | **Set service hours** | Kitchen 07:00–22:00, braai 17:00–22:00, reception 24 h | In-app ordering is disabled outside them with a clear message and the next window offered |
| A6 | **Set the tax rate** | Enters the VAT rate and whether the motel is registered | Every **new** invoice computes `tax_amount`; existing invoices are untouched |
| A7 | **Set the indicative currency rates** | Enters MWK/USD, MWK/GBP, MWK/EUR, MWK/ZAR with a date | The website and app show indicative conversions, labelled as indicative, with the date |
| A8 | **Edit business details** | Name, address, phone, WhatsApp, email, bank account number, Airtel/TNM numbers, tax number | Updates every invoice, every email, the footer, the contact page and the app — one place, no stale numbers |
| A9 | **Edit the Wi-Fi details** | Network name and password | Updates the app home screen, the QR card entry screen and the arrival guide |
| A10 | **Manage canned replies** | Adds, edits, reorders or deletes the desk's quick replies ("On our way with towels") | They appear instantly in the message composer for every staff member |
| A11 | **Edit notification templates** | Changes the wording of any system email, SMS or WhatsApp message | All **future** messages use the new wording; sent messages are unchanged |
| A12 | **Set the SLA timers** | Reminder at 2 h, escalation at 12 h, issue nudge at 15 min, issue escalation at 1 h, order ageing at 20 min | The automatic rules adopt the new thresholds immediately |
| A13 | **Set escalation and alert recipients** | Chooses who receives escalations, reminders and the daily summary | Future alerts go to the chosen people |
| A14 | **Set alert thresholds** | e.g. "warn me when unverified payments exceed MWK 500 000" | The action centre flags it when crossed |
| A15 | **Configure rate limits** | Requests per minute per IP on booking, tracking, ordering, messaging and sign-in | Applied immediately |
| A16 | **Toggle a feature** | Turns in-app ordering, the Dine menu, the app, or the messaging thread on or off | The corresponding surface is disabled everywhere with an explanatory message, rather than failing |

---

# SECTION B — BOOKINGS THE ADMIN CREATES OR ALTERS BY HAND

Not every booking arrives through the website. These are the manual paths.

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| B1 | **Create a booking for a guest** | Fills the form on the guest's behalf — phone booking, walk-in, WhatsApp request, or a travel agent's email | Booking created as `pending` or, if paid at the desk, `confirmed`. Reference, booking number and pro-forma generated exactly as for a web booking. Recorded in the audit log as created by a manager, with the manager's label |
| B2 | **Create a walk-in booking** | Same, with the room assigned immediately and `checked_in` set | Room becomes `occupied`; folio opened; guest can be given the QR and PIN straight away |
| B3 | **Create a group booking** | One payer, several rooms, several guests | One invoice to the payer; each guest linked to their own room, folio and message thread; bulk invitation available |
| B4 | **Attach a booking to a corporate account** | Selects the account and enters a PO number if required | The invoice changes from "pay on arrival" to "invoice monthly"; the booking appears on that account's statement |
| B5 | **Create a manual invoice** | Issues an invoice not tied to a booking — a day workspace, a function deposit, a corporate charge | Invoice number issued, recorded, downloadable and emailable |
| B6 | **Reassign the responsible staff member** | Changes who owns the booking | Future reminders and escalations go to the new owner; `staff_assigned` written to the timeline |
| B7 | **Reinstate a cancelled or released booking** | Restores it, subject to availability | If the room has since been taken, the admin is told and offered the next available room. `reinstated` written to the timeline and the audit log |
| B8 | **Merge two bookings** | Combines a duplicate into one | Folio items, payments and events are moved to the surviving booking; the duplicate is cancelled with a reason; both actions audited |
| B9 | **Delete a booking** | Confirms deletion | Booking, events and invoice rows removed; the invoice is kept and marked `cancelled` so its number is never reused; the room is released; a **full snapshot stays in the audit log** |

---

# SECTION C — MONEY BEYOND RECORDING PAYMENTS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| C1 | **Apply a discount** | Enters an amount or percentage with a reason | `discount` set, total recomputed through the single pricing function, invoice updated, folio adjusted, `discount_applied` audited with the reason |
| C2 | **Apply a service fee** | Enters an amount with a reason | `service_fee` set, total recomputed, invoice updated |
| C3 | **Post a manual charge** | Adds a folio item — minibar, laundry, damage, a late fee | `folio_items` row created with `posted_by` = the admin, visible on the guest's bill immediately, and pushed to them if the app is installed |
| C4 | **Post a damage or loss charge** | Enters the amount and a description | Folio charge, photo attachment encouraged, audited, and flagged on the guest record for future stays |
| C5 | **Void a charge or an order** | Voids with a mandatory reason | The item leaves the total, `void_reason` recorded, `voided` written to the timeline and the audit log. **Voids are audited hardest because that is where money quietly disappears** |
| C6 | **Issue a goodwill credit** | Credits an amount with a reason | Negative folio item, audited, and the guest is told what was credited and why |
| C7 | **Issue a refund** | Full or partial, back to the original card or by bank transfer | Gateway refund initiated; negative `payments` row recorded; the guest is emailed and pushed a refund confirmation; audited with the reason |
| C8 | **Set up a payment arrangement** | Records an agreed split or schedule | The arrangement is stored on the booking and visible at check-out so the desk does not have to remember it |
| C9 | **Move a deposit to new dates** | Instead of refunding, transfers it | The original payment stays linked; the new booking shows it as already paid; audited |
| C10 | **Write off a balance** | Marks an unpaid balance as written off with a reason | The folio closes; the write-off appears in the revenue report as a loss, not as revenue; audited |
| C11 | **Adjust a recorded payment** | Corrects an amount entered in error | The original entry is preserved and the correction recorded as a separate line, so the history is never rewritten |
| C12 | **Open and close a cash float** | Records the till's opening and closing amounts | Discrepancies are flagged at day close rather than discovered at month end |
| C13 | **Reconcile the till** | Counts cash against the system's cash total | Variances shown per staff member; recorded and audited |

---

# SECTION D — STAY OPERATIONS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| D1 | **Approve a late check-out** | Approves or declines a guest's request | Approved: MWK 15 000 posts to the folio and the guest is told. Declined: the guest is told the standard time. Either way the request is recorded |
| D2 | **Approve a date change** | Approves a guest's request after checking availability and re-pricing | Nights, extension or reduction, and the total are recomputed; the invoice is updated; the guest is told the new figures before it takes effect |
| D3 | **Approve a stay extension** | Confirms a later check-out | Nights increase, extension fee added, invoice updated, `extended` written |
| D4 | **Move a guest to another room** | Selects a new room | The old room returns to `dirty`, the new becomes `occupied`, both rooms' histories record the move, and the guest's app updates immediately |
| D5 | **Handle an early check-out** | Checks the guest out before their booked date | The folio is settled for nights actually stayed; any prepaid balance is refunded or credited; `early_departure` recorded |
| D6 | **Override a no-show** | Marks a guest who arrived late as checked in | The `no_show` flag is reversed on the booking, the guest's no-show flag is cleared if it was their first, and the room is re-occupied |
| D7 | **Reissue a stay PIN** | Generates a new 4-digit PIN | The old PIN stops working immediately; the guest is told the new one; audited |
| D8 | **Reissue a QR mapping** | Re-points a room's QR at a different booking | The previous guest's scan stops resolving; used when a room is reassigned mid-day |
| D9 | **Set a spending limit for a third-party payer** | Enters a cap on the folio | Orders above the cap are held for the payer's approval; the desk is shown the limit on the room card |
| D10 | **Flag a room Do Not Disturb** | Sets it on the guest's behalf | Housekeeping skips the room; the room stays `occupied` rather than becoming `dirty` |
| D11 | **Record lost and found** | Logs an item, its description and where it was found | Attached to the room and the booking; visible to the desk when that guest returns |
| D12 | **Close a stay manually** | Forces check-out | Room becomes `dirty`; folio is finalised; used when a guest leaves without telling anyone |

---

# SECTION E — GUEST CRM ACTIONS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| E1 | **Merge duplicate guest records** | Selects the surviving record | Bookings, stays, payments, messages and folio history move to it; the duplicate is archived, not deleted; the merge is audited with both IDs |
| E2 | **Add a private note to a guest** | Types a note | Visible to staff and admin on that guest's card, **never** to the guest; audited |
| E3 | **Flag a guest as a no-show** | Sets the flag | Future bookings from that guest can require full prepayment; the flag is visible at the desk |
| E4 | **Mark a guest as a regular** | Sets the flag manually | The desk sees "welcome back" recognition; can trigger a loyalty reward |
| E5 | **Award a loyalty reward** | Grants a free breakfast morning or a late check-out | Recorded on the guest; the desk is told to honour it; audited |
| E6 | **Blacklist a guest** | Blocks future bookings with a reason | The booking form refuses the booking with a polite message; the desk is told why; audited |
| E7 | **Anonymise a guest (erasure request)** | Confirms the erasure | Personal details detached, account disabled, all sessions ended, message threads anonymised, **financial records retained** as required; audited |
| E8 | **Disable or reactivate a guest account** | Toggles the account | All sessions end; the guest cannot sign in; service messages to them stop; audited |
| E9 | **Reset a guest's password** | Taps **Email login** | A new password is generated, hashed, stored and emailed; every other device is signed out; audited |
| E10 | **Sign a guest out of all devices** | Confirms | Every session for that account is killed immediately; used for a lost phone |
| E11 | **Unlock a locked account** | Clears the lock | The guest can sign in again; the lock event stays in the audit log |
| E12 | **Mute or unmute a guest's messaging** | Toggles it | A muted guest can still order, see their bill and receive service notifications — only their ability to send messages pauses; audited |
| E13 | **View a guest's full history** | Opens the guest record | Every stay, order, payment, message, complaint, note and device in one place, with dates |

---

# SECTION F — CONTENT THE ADMIN OWNS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| F1 | **Edit the home page** | Changes the hero headline, the trust strip, section headings, section order, and shows or hides sections | The public site updates immediately; no developer needed |
| F2 | **Manage the FAQ** | Adds, edits, reorders or deletes questions and answers | The FAQ block and its search markup update; answers reflect the current policy |
| F3 | **Manage the Dine menu** | Adds or edits items — name, category, description, price, image, availability, special flag | `/dine` and in-app ordering update immediately; unavailable items are disabled rather than shown and failing |
| F4 | **Take an item off the menu (86 it)** | Sets `is_available = false` | It disappears from ordering instantly while staying in the menu for later |
| F5 | **Publish a site-wide banner** | Enters banner text, a link and an expiry | Appears on every public page until it expires |
| F6 | **Moderate reviews** | Publishes, hides, features or replies to a review | Hidden reviews stay in the database for the record; featured reviews appear on the landing page and in the aggregate rating |
| F7 | **Import Google Reviews** | Pastes or syncs them | Displayed with attribution; the aggregate rating and the search markup update |
| F8 | **Manage the gallery** | Uploads, reorders, recategorises, removes | Updates `/gallery`, the home strip and the post-form picker |
| F9 | **Manage posts and events** | Creates, schedules, edits, pauses, resumes, deletes | Covered in Part 26 |
| F10 | **Manage rooms and rates** | Room types, physical rooms, housekeeping states, seasonal and length-of-stay rates | Covered in Part 26 |
| F11 | **Set the app's "what's new"** | Publishes a post with a push audience | Appears in the app feed with an unread badge; deep-linked from the push |

---

# SECTION G — ENQUIRIES, REQUESTS AND THE WAITLIST

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| G1 | **Answer an event enquiry** | Replies to a braai or table reservation request | The guest is told by push, SMS or WhatsApp; if confirmed, a charge posts to their folio or a payment is taken; the enquiry closes |
| G2 | **Quote a function** | Enters a price for a group booking or event | The quote is sent to the enquirer and stored; on acceptance it converts to a booking or a manual invoice |
| G3 | **Answer a general enquiry** | Replies to a non-resident's question | The reply goes to the phone or email given; the enquiry closes; recorded |
| G4 | **Work the waitlist** | Sees who wants sold-out dates | When a booking covering those dates is cancelled or released, the waiting guests are notified automatically |
| G5 | **Convert a waitlist entry** | Offers the freed room to a specific person | The guest gets a time-limited offer; on acceptance a booking is created |
| G6 | **Assign a service task** | Assigns housekeeping or maintenance work to a person | The assignee is notified; the task appears on their list with a due time |
| G7 | **Escalate an issue to the owner** | Forwards a complaint | The owner is notified with the room, the guest and the full thread; the issue is marked escalated |
| G8 | **Close an issue without guest confirmation** | Forces closure with a reason | The guest is told it is closed and why; recorded; used when a guest cannot be reached |

---

# SECTION H — STAFF MANAGEMENT BEYOND ACCOUNTS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| H1 | **Change a staff role** | Promotes staff to admin, or demotes admin to staff | The new permissions apply on that person's **next** request; their current session is refreshed or ended; audited |
| H2 | **Create an auditor account** | Adds the read-only role | That person can see everything including money but can change nothing; every screen renders without action buttons |
| H3 | **Force a staff sign-out** | Ends another staff member's session | Used when someone leaves a terminal unlocked; audited |
| H4 | **Review staff activity** | Opens a staff member's record | Bookings handled, payments verified, issues resolved, orders voided, logins — with dates and counts |
| H5 | **Read a shift handover note** | Opens the day's notes | Outstanding issues, expected late arrivals, rooms out of order, anything the next shift must know |
| H6 | **Write a shift handover note** | Types the note | Visible to the next shift at sign-in; timestamped and attributed |
| H7 | **Deactivate or reactivate a staff account** | Toggles it | A deactivated account cannot sign in; their audit history is preserved |
| H8 | **Remove a staff account** | Deletes it | Their audit history is **preserved** — removing an account never removes what they did |
| H9 | **View all active sessions** | Opens the session list | Every signed-in staff member and device, with the sign-in time; any can be ended |

---

# SECTION I — SYSTEM OPERATIONS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| I1 | **Check system health** | Opens the health panel | Shows database connectivity, SMTP status, Blob status, Firebase status, and the last backup time — one screen, honest |
| I2 | **Send a test email** | Enters an address and sends | Proves SMTP works without creating a booking; the result and any error are shown verbatim |
| I3 | **Send a test push** | Presses **Test configuration** | `validate_only` — proves the Firebase key, project and API work **without notifying anyone** |
| I4 | **Send a test SMS or WhatsApp** | Enters a number and sends | Proves the provider works; the provider's reference is recorded |
| I5 | **Turn on maintenance mode** | Enables it with a message | The public site shows the message; the **staff portal stays available** so the desk can keep working; audited |
| I6 | **Run a database backup** | Triggers one on demand | Confirms the backup completed and its size; the time is recorded |
| I7 | **Run a restore drill** | Restores into a scratch database | Confirms the row counts and the newest record; **an untested backup is not a backup** |
| I8 | **Export the audit log off-database** | Triggers the export | A copy lands in external storage, so the audit survives the loss of the database it protects |
| I9 | **Publish an app version** | Sets the version code, name, changelog and whether the update is forced | Installed apps detect it on their next poll and offer **Update Now**; `forceUpdate` blocks until updated |
| I10 | **Trigger an APK build** | Starts the CI build | The signed APK is built, attached to a release, and becomes the URL `/download` and the install popup use |
| I11 | **Preview the site as a guest** | Opens the public site in a preview | Lets the admin see exactly what a guest sees without booking anything; no impersonation of a guest account is ever possible |
| I12 | **Clear a stuck job** | Retries or cancels a failed background task | The failure is recorded either way, so nothing disappears silently |
| I13 | **Review error reports** | Opens the error panel | Every failed request, failed email and failed push, with the reference and the cause |

---

# SECTION J — DAY CLOSE AND NIGHT AUDIT

The classic hotel routine, which a small motel needs just as much as a large one.

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| J1 | **Run the day close** | Confirms | The day's numbers are locked: revenue, occupancy, payments, orders, voids. Nothing from earlier can be silently altered afterwards |
| J2 | **Run the night audit** | Confirms | Arrivals who never came are marked `no_show`; departures who never checked out are checked out; rooms flip to `dirty`; the occupancy figure rolls to the new day |
| J3 | **Post recurring charges** | Confirms | Any standing charges post automatically to the correct folios |
| J4 | **Review the day's exceptions** | Reads the list | Every void, write-off, discount, refund and override from the day, in one place, with reasons |
| J5 | **Confirm the cash position** | Reviews | Cash, card, mobile money and corporate receivables, each totalled and matched to the ledger |
| J6 | **Send the daily summary** | Confirms | The 07:00 email goes to the chosen recipients with yesterday's numbers and today's arrivals |

---

# SECTION K — BULK OPERATIONS

| # | Action | What the admin does | Complete follow-up |
|---|---|---|---|
| K1 | **Bulk send reminders** | Selects all overdue pending bookings | One reminder per assigned staff member, each throttled to at most one per two hours |
| K2 | **Bulk assign rooms** | Assigns rooms to several arrivals at once | Each assignment is validated individually; conflicts are reported rather than silently skipped |
| K3 | **Bulk cancel** | Cancels several bookings with one reason | Each is cancelled individually with its own audit entry and its own guest notification |
| K4 | **Bulk export** | Exports bookings, payments, guests or audit rows to CSV | The file downloads with Malawi timestamps and MWK figures |
| K5 | **Bulk invite guests** | From a group booking | One activation link per guest, each linked to that guest's own room and stay |
| K6 | **Bulk publish or pause posts** | Selects several | Each change is recorded individually |

---

# SECTION L — WHAT EVERY ADMIN ACTION RECORDS

| Recorded where | What goes there |
|---|---|
| **`booking_events`** (guest-visible timeline) | Status changes, approvals, confirmations, cancellations, room assignments, payments, invoices, follow-ups, reminders, escalations, extensions, notes, deletions. Internal notes are **filtered out** of the guest's view |
| **`audit_log`** (system-wide, append-only) | Every booking, payment, invoice, room, rate, post, image, upload, guest-account, staff-account, notification and login action — with the actor, their label, the client IP, a human-readable summary and metadata |
| **`notification_log`** | Every message attempted, on every channel, with its outcome and the provider's reference |
| **`folio_items`** | Every charge, credit, void and adjustment, with who posted it and why |
| **`payments`** | Every claim, verification, rejection, refund and cash entry |

**The audit log is never edited and never deleted by the application.** The portal's audit view is
read-only by design — searchable, filterable by entity and actor, and exportable to CSV. Even a deleted
booking keeps a full snapshot there.

---

# SECTION M — THE ADMIN ACTIONS MOST LIKELY TO BE FORGOTTEN, AND WHY THEY MATTER

| Action | Why it gets forgotten | Why it matters |
|---|---|---|
| **Day close** | Feels like paperwork | Without it, a void or a write-off from three weeks ago can be silently changed, and the revenue figures stop meaning anything |
| **Night audit** | Nobody is there at midnight | Arrivals who never came hold sellable rooms all night; the next morning the desk is surprised |
| **Restore drill** | Backups feel like they work | An untested backup is not a backup — the first time you find out is the worst possible time |
| **Off-database audit export** | The audit log "is in the database" | The audit log lives in the same database it protects; losing one loses both |
| **Reviewing voids and write-offs** | They are rare | Voids and write-offs are where money quietly disappears, and they are the two actions most worth reading every week |
| **Reconciling gateway settlements** | Card volume is low | One unmatched transaction is a guest who paid and was never confirmed — or money that arrived and was never recorded |
| **Reach reports** | Publishing feels like the job | A post nobody opens is not marketing; the reach report is the only way to know |
| **Merge duplicate guests** | It is tedious | Duplicates break repeat recognition, stay counts and the no-show flag — the exact things the guest record exists for |
| **Staff activity review** | It feels like surveillance | It is the only way to see that one person voids a lot, or that nobody is answering the message queue |
| **Handover notes** | Everyone "knows" | The 22:00 shift does not know what the 14:00 shift promised a guest |
| **Test email / test push after a config change** | It seems redundant | A silent SMTP or Firebase failure means guests stop being told, and nobody notices until they complain |
| **Maintenance mode before a risky change** | It is one more step | It is the difference between a brief notice and a broken booking form during a deploy |

---

# SECTION N — IN SHORT

Beyond the booking pipeline, the payments, the rooms, the posts and the broadcasts already covered, the
admin page also holds **the rules the system enforces** — deposit, cancellation window, policy version,
check-in and check-out times, service hours, tax, indicative currency rates, business and payment
details, Wi-Fi, canned replies, notification wording, SLA timers, alert thresholds and rate limits — and
changing any of them changes behaviour immediately while leaving existing bookings on the terms they
were made under.

It also holds **the bookings that never came through the website**: phone bookings, walk-ins, group
bookings, corporate bookings with PO numbers, and manual invoices — each generated with the same
reference, number and audit trail as a web booking.

It holds **the money beyond recording payments**: discounts, service fees, manual charges, damage
charges, voids with mandatory reasons, goodwill credits, refunds back to the original card, payment
arrangements, deposit transfers, write-offs, payment corrections, cash floats and till reconciliation.

It holds **the stay operations** that a front desk actually performs: approving late check-outs and date
changes, moving a guest between rooms, handling an early departure, overriding a no-show, reissuing a
PIN or a QR mapping, setting a third-party spending limit, recording lost property, and closing a stay
that a guest walked out of.

It holds **the guest record**: merging duplicates, private notes, no-show and regular flags, loyalty
rewards, blacklisting, erasure requests, account disables, password resets, device sign-outs, unlocks
and muting — each audited, and each with the guest's full history one click away.

And it holds **the operations that keep the system honest**: health checks, test emails, test pushes,
maintenance mode, backups and restore drills, off-database audit exports, app version and APK releases,
error review, the day close, the night audit, bulk operations, and the shift handover notes that stop
the 22:00 shift from not knowing what the 14:00 shift promised.
