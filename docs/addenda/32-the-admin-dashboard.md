# The Admin Dashboard — Complete Walkthrough & Authority Guide

**Text only. No code. Addendum to the Complete System Specification v2 (Part 29).**

---

# PART 1 — THE DIRECT ANSWER TO YOUR QUESTION

**Yes — the admin adds and removes almost everything. A front-desk staff account adds and removes
exactly two things: housekeeping states and service tasks.**

| Stuff | Staff can add? | Staff can remove? |
|---|---|---|
| **Housekeeping states** (clean / dirty / inspected / out of order) | ✅ Yes | ✅ Yes |
| **Service tasks** | ✅ Yes | ✅ Yes |
| **The audit log** | ❌ Nobody | ❌ **Nobody — not even the admin** |

Everything else — rooms, rates, physical rooms, the menu, the FAQ, home page content, reviews, banners,
notices, **gallery pictures**, **posts and events**, push broadcasts, canned replies, notification
templates, settings, staff accounts, guest accounts, payments, discounts, refunds, manual charges, and
deleting a booking — is **admin only**. A staff account that tries any of them, through the interface
or by calling the endpoint directly, receives **HTTP 403**.

**Why those two are the exceptions:** they are the things that change *hourly* during a shift. A
housekeeper cannot wait for a manager to mark a room clean, and a guest asking for towels cannot wait
for a manager to create the task. Everything else — especially anything the public sees — changes
rarely and shapes the motel's face to the world, so it stays with the admin.

**What staff absolutely do have is complete sight of the house and complete reach into it:**

- The room map showing **exactly who is in which room**, with each room's state, open issue count and
  folio balance.
- Every guest detail, every balance, every folio and every timeline.
- **Notifications about rooms and requests** — new orders, new messages, emergencies, maintenance
  requests, arrivals, departures, escalations and reminders.
- The whole booking pipeline, room assignment, housekeeping states, orders, the message queue, service
  tasks, guest account invitations, cash payments, reports and the audit trail.

They run the desk. They just do not publish to the world, and they do not touch money beyond cash.

**And one rule that overrides everything:** role checks are enforced **on the server in every mutating
route**. Hiding a button in the interface is cosmetic.

The full matrix is in Part 5.

The full matrix is in Part 5.

---

# PART 2 — THE DASHBOARD SHELL

Everything below is reached from one signed-in page at `/admin`.

| Element | What it does |
|---|---|
| **Identity strip** | Shows who is signed in and their role — `Admin — Willard Kulemeka` or `Staff STF002 — …` |
| **Global search** | One box searching guests (name, phone, email), bookings (reference, booking number), rooms (number), invoices (number), orders and message threads. Results grouped by type, each clickable |
| **Date-range filter** | Applies to reports, revenue and the arrivals/departures board |
| **Refresh** | Reloads every list, the stat strip and the dashboard |
| **Lock** | Signs out and clears the session |
| **Live refresh** | The board, the payment queue and the issue queue update without a page reload |
| **Role-aware rendering** | Staff see a reduced dashboard. Auditors see everything **read-only**, with no action buttons at all |

---

# PART 3 — THE ACTION CENTRE (what the admin must look at first)

A single strip of things waiting for a human. Nothing in the system can sit unattended without
appearing here.

| Counter | What it means | What the admin does |
|---|---|---|
| **Payments to verify** | Guests have claimed payments nobody has confirmed, with the MWK at risk | Open the queue, check each against the bank or Airtel/TNM statement, tap **Verify** or **Reject** |
| **Unassigned arrivals** | Guests arriving today with no room number | Open the arrivals board and assign a room to each |
| **Emergency issues** | A guest has tagged a message as emergency | Open it immediately — locked out, medical, security |
| **Open complaints** | Message threads waiting for a reply, with the oldest age shown | Open the issue queue and reply |
| **Escalated bookings** | Bookings idle for 12 hours or more | Open them and act — approve, cancel, or follow up |

---

# PART 4 — THE DASHBOARD, PANEL BY PANEL

## 4.1 Overview

| Shows | What the admin does with it |
|---|---|
| The action centre | Works each counter until it is zero |
| **KPI row** — occupancy %, ADR, RevPAR, rooms sold, arrivals, departures, in-house, revenue today/week/month, collected, outstanding, unverified payments, cancelled loss, open issues, pending and escalated bookings | Reads the state of the business at a glance; clicks any KPI to drill into the underlying list |
| Today's arrivals and departures | Assigns rooms, marks no-shows |
| Revenue and occupancy trend | Compares against the previous period |
| Room-type performance | Decides which rate to move |
| Recent activity feed | Sees the last actions taken across the system, by whom |

## 4.2 Room Map

A grid of every physical room — the single most useful screen in the system.

| Each room shows | Controls on each room |
|---|---|
| Room number, room type | **Assign** a guest |
| Occupant name | **Reassign** |
| Housekeeping state (available / occupied / dirty / clean / inspected / out of order) | **Set state** |
| Open issue count | **Take out of order** with a reason |
| Folio balance | **Return to service** |
| Notes | **Edit notes** |

## 4.3 Arrivals & Departures

| Shows | Controls |
|---|---|
| Today's arrivals with room numbers, deposit state and arrival time | **Assign room** inline |
| Today's departures with check-out times | **Check out** |
| Unassigned arrivals, highlighted | **Mark no-show** |
| Any date range | **Print the sheet** |

## 4.4 Bookings

| Shows | Controls |
|---|---|
| Every booking as a card: guest, clickable phone, room, stay, balance, money state | **Manage & timeline** |
| Search by reference, guest name, phone or email | **Approve** |
| Status filter chips | **Confirm** |
| | **Follow-up** |
| | **Cancel** |
| | **Invoice PDF** |
| | **WhatsApp the guest** |

**The booking modal** — the full record and every control:

| Panel | Controls |
|---|---|
| Guest snapshot | Name, phone, email, stay count, total spent, regular and no-show flags |
| Stay facts | Room type, dates, nights, occupancy, rate, total, paid, balance |
| Arrival and requests | Arrival time, flight details, special requests |
| Quick decisions | Approve · Confirm · Cancel · Follow-up |
| Status buttons (role-gated) | `awaiting_payment` · `checked_in` · `checked_out` · `cancelled` |
| **Admin only** | **Assign room** · **Record payment** · **Discount** · **Service fee** · **Manual charge** · **Extend stay** |
| Invoice actions | **Email** · **Download** · **Print** · **WhatsApp link** |
| Timeline | Every event, with internal notes filtered from the guest's view |
| Manager note box | Add a note (staff and admin) |
| **Admin only** | **Delete booking & release room** |
| **Admin only** | **Reinstate** · **Merge** |

## 4.5 Payments

| Panel | Controls |
|---|---|
| **Verify queue** — claims oldest first, with amount, channel, transaction reference, screenshot and waiting time | **Verify** · **Reject with reason** · **Record cash** |
| Running total: claimed vs verified vs outstanding | |
| **Ledger** — every payment ever: claimed, verified, rejected, cash, refunded | **Refund** · **Adjust** |
| **Reconciliation** — by date range and channel | **Match against the gateway settlement report**; unmatched rows flagged in both directions |

## 4.6 Orders

| Panel | Controls |
|---|---|
| **Live board** grouped by status: new · preparing · ready · delivered, with a waiting-time clock | **Accept** · **Prepare** · **Ready** · **Deliver** · **Void with reason** |
| Each card shows the room, items, total, time ordered, and **the channel** (app, QR, PIN, reference, desk, WhatsApp, counter) | |
| Order history and voids | Review, with reasons |

## 4.7 Messages & Issues

| Panel | Controls |
|---|---|
| **Queue grouped by room** — room number, guest, stay dates, first-time or returning, kind, status, age | **Open thread** |
| Emergencies pinned and loud | **Reply** · **Canned reply** |
| Full guest context beside the thread: room, folio, open orders, previous stays, previous complaints | **Acknowledge** · **Resolve with note** · **Escalate to admin** · **Close without confirmation** |

## 4.8 Housekeeping

| Panel | Controls |
|---|---|
| Tasks by room and assignee, with due times; overdue highlighted | **Assign** · **Complete** |
| Room states | **Set clean / dirty / inspected** |
| Out-of-order rooms with reasons | **Take out of order** · **Return to service** |

## 4.9 Folios & Invoices

| Panel | Controls |
|---|---|
| Every open room bill with its line items and running total | **Post a charge** · **Credit** · **Void with reason** |
| Every invoice with number, status and balance | **Regenerate** · **Email** · **Download** · **Print** |
| Folio ageing | Review who owes what, and for how long |

## 4.10 Guests (CRM)

| Column / panel | Controls |
|---|---|
| Name, phone, email, status badge | **Merge duplicates** |
| Stay count, total spent, last stay | **Add private note** |
| Regular flag, no-show flag | **Flag no-show** · **Mark regular** · **Award reward** |
| Devices and last sign-in | **Sign out all devices** · **Revoke a device** |
| Marketing consent | |
| Full history: stays, orders, payments, messages, complaints | **Blacklist** · **Disable** · **Reset password** · **Unlock** · **Unmute** · **Anonymise** |

## 4.11 Staff

| Panel | Controls |
|---|---|
| Accounts with role and status | **Create** · **Email login** · **Deactivate / Activate** · **Remove** |
| Last login | |
| Per-staff activity: bookings handled, payments verified, issues resolved, orders voided | Review |
| Active sessions | **Force sign-out** |
| Shift handover notes | **Write** · **Read** |

## 4.12 Rooms & Rates

| Panel | Controls |
|---|---|
| Room types with rate and inventory | **Add** · **Edit rate** · **Hide / Show** · **Remove** (deactivates if live bookings) |
| Physical rooms with door numbers and states | **Add** · **Edit** · **Take out of order** · **Return to service** |
| Seasonal and length-of-stay rates | **Add** · **Remove** |

## 4.13 Menu

| Panel | Controls |
|---|---|
| Items with category, price, availability, special flag | **Add** · **Edit** · **Take off the menu** · **Remove** |

## 4.14 Content

> **This entire panel is admin only.** A staff account does not see the content controls at all — no
> posts, no events, no pictures, no banner, no reviews, no FAQ, no home page editing. The front desk
> runs the house; it does not publish to the world.

| Panel | Controls |
|---|---|
| **Home page** — hero, trust strip, section headings, section order, show/hide | **Edit** · **Reorder** |
| **FAQ** | **Add** · **Edit** · **Reorder** · **Delete** |
| **Gallery** | **Upload** · **Paste URL** · **Recategorise** · **Reorder** · **Remove** |
| **Posts & events** | **Create** · **Schedule** · **Edit** · **Pause / Resume** · **Delete** · **Reach report** |
| **Notices** | **Publish** · **Expire** |
| **Site-wide banner** | **Publish** · **Expire** |
| **Reviews** | **Publish** · **Hide** · **Feature** · **Reply** · **Import from Google** |

## 4.15 Reports

| Report | Controls |
|---|---|
| Daily bookings (print / PDF) | **Print** · **Save as PDF** |
| Arrivals sheet | **Print** |
| Payments reconciliation | **Filter by date and channel** · **Export** |
| Occupancy report | **Filter** · **Export** |
| Revenue CSV | **Export** |
| Folio / receivables ageing | **Export** |
| Guest CRM export | **Export** |
| Audit export | **Export** · **Schedule off-database** |

## 4.16 Audit Trail

| Panel | Controls |
|---|---|
| Read-only, searchable by action, reference, summary, actor | **Search** |
| Filterable by entity: bookings, invoices, pictures, posts, uploads, logins, rooms, guests, staff, notifications | **Filter** |
| | **Export CSV** |
| | **Nothing else. No edit. No delete. Ever.** |

## 4.17 Notifications

| Panel | Controls |
|---|---|
| **Composer** — title, message, target page, poster image, live phone preview, audience, schedule | **Test configuration** (`validate_only`) · **Send** |
| **Notification log** — every message attempted, with channel, recipient, template, status, provider reference | **Review** |
| Opt-in audience count | |

## 4.18 Settings

| Panel | Controls |
|---|---|
| Deposit rule, cancellation window, policy version, check-in/out times, service hours, tax rate, currency rates, business details, Wi-Fi, canned replies, notification templates, SLA timers, alert recipients, alert thresholds, rate limits, feature toggles | **Edit** each — changes apply immediately to future behaviour, never retroactively |

## 4.19 System

| Panel | Controls |
|---|---|
| Health: database, SMTP, Blob, Firebase, last backup | **Check** |
| Test email · test push · test SMS/WhatsApp | **Send** |
| Maintenance mode | **Enable with a message** (staff portal stays available) |
| Backups and restore drills | **Run backup** · **Run restore drill** |
| App versions and APK builds | **Publish version** · **Trigger build** |
| Error reports | **Review** · **Retry a stuck job** |

---

# PART 5 — THE AUTHORITY MATRIX

**ADD / EDIT / REMOVE for every type of content.** This is the definitive answer.

| Stuff | ADD | EDIT | REMOVE |
|---|---|---|---|
| **Room types** | Admin | Admin | Admin — *deactivates instead if there are live bookings* |
| **Physical rooms** | Admin | Admin | Admin — *deactivates instead* |
| **Seasonal & length-of-stay rates** | Admin | Admin | Admin |
| **Housekeeping state** | Staff + Admin | Staff + Admin | Staff + Admin |
| **Out-of-order** | Staff + Admin | Staff + Admin | Staff + Admin |
| **Bookings — create** | Guest (self-serve) · Admin (manual, phone, walk-in, group) | Staff + Admin (pipeline) · Guest (own, limited) | **Delete: Admin only.** Cancel: Staff + Admin |
| **Payments — record / verify** | Admin | Admin | Admin (adjustment, with the original preserved) |
| **Discounts & service fees** | Admin | Admin | Admin |
| **Manual charges** | Admin | Admin | Admin — *void, reason mandatory* |
| **Refunds** | Admin | Admin | — |
| **Folio items — guest orders** | Guest (via the app or room session) | Guest (before the order is placed) | Admin — *void, reason mandatory* |
| **Guest accounts** | Staff + Admin (invite) · Guest (self-serve) | Guest (own details) · Admin (all) | Admin |
| **Staff accounts** | Admin | Admin | Admin — *audit history preserved* |
| **Gallery pictures** | Admin | Admin | Admin |
| **Posts & events** | Admin | Admin | Admin |
| **Notices** | Admin | Admin | Admin |
| **Menu items** | Admin | Admin | Admin |
| **Reviews** | Guest (submit) | Admin (publish / hide / feature / reply) | Admin (hide — stays in the database) |
| **FAQ** | Admin | Admin | Admin |
| **Home page content** | Admin | Admin | Admin |
| **Push broadcasts** | Admin | Admin | — |
| **Canned replies** | Admin | Admin | Admin |
| **Notification templates** | Admin | Admin | Admin |
| **Settings** | Admin | Admin | Admin |
| **Service tasks** | Guest (request) · Staff + Admin (create) | Staff + Admin | Staff + Admin |
| **Issue threads** | Guest (send) · Staff + Admin (reply) | Staff + Admin | Admin |
| **Waitlist entries** | Guest | Admin | Admin |
| **The audit log** | System — append only | **Nobody** | **Nobody** |

---

# PART 6 — WHAT ONLY THE ADMIN CAN DO

The definitive list. If a staff account attempts any of these through the interface *or* by calling the
endpoint directly, they receive **HTTP 403**.

1. Assign a physical room
2. Record or verify a payment
3. Set `checked_in`, `checked_out` or `awaiting_payment`
4. Delete a booking
5. Email an invoice PDF to a guest
6. Apply a discount or a service fee
7. Post a manual charge, damage charge or goodwill credit
8. Void a charge or an order item
9. Issue a refund
10. Write off a balance
11. Adjust a recorded payment
12. Extend a stay
13. Add, edit, hide or remove a room type
14. Add, edit or remove a physical room
15. Set a seasonal or length-of-stay rate
16. Manage the Dine menu
17. Manage the FAQ
18. Edit the home page content
19. Moderate reviews
20. Publish, edit, schedule, pause, resume or delete **posts and events**
21. Upload, add, recategorise, reorder or remove **gallery pictures**
22. Publish a site-wide banner
23. Publish a notice
24. Send a broadcast push notification
25. Manage canned replies
26. Edit notification templates
27. Change any setting
28. Create, edit, reset, deactivate or remove a staff account
29. Change a staff role
30. Force a staff sign-out
31. Merge duplicate guest records
32. Blacklist or anonymise a guest
33. Disable or reactivate a guest account
34. Reset a guest's password or sign their devices out
35. Escalate an issue to the owner
36. Close an issue without the guest's confirmation
37. Convert a waitlist entry into a booking
38. Quote a function
39. Run the day close or the night audit
40. Post recurring charges
41. Turn on maintenance mode
42. Run a backup or a restore drill
43. Export the audit log off-database
44. Publish an app version or trigger an APK build
45. Run bulk operations
46. Read the system health, error reports and staff activity

---

# PART 7 — WHAT STAFF CAN DO WITHOUT AN ADMIN

So you know exactly where the line sits:

1. View every booking, guest detail, balance, invoice and timeline
2. **See exactly who is in which room** on the room map, with each room's state, open issues and folio balance
3. Add a manager note
4. Approve, confirm, cancel, or request a follow-up
5. Assign, reassign and change the state of physical rooms
6. Take a room out of order and return it to service
7. Accept, prepare, mark ready, deliver and void orders
8. Work the message queue: reply, acknowledge, resolve, escalate
9. Complete and assign service tasks
10. Create a guest account and resend an activation link
11. Read and export the audit trail
12. Read the dashboard and the revenue figures
13. Print and export reports
14. Record a cash payment

**And what staff receive without asking:** notifications about rooms and requests — new orders, new
messages, emergencies, maintenance requests, arrivals, departures, escalations and reminders.

That is a genuinely wide remit — the front desk runs the house. What it cannot touch is **money beyond
cash, identity, structure, the rules the system enforces, and anything the public sees.** No posts, no
events, no pictures, no banner, no menu, no reviews, no push, no settings.

---

# PART 8 — THE ADMIN'S DAILY LIST

What the admin actually needs to do, in order:

| When | What |
|---|---|
| **07:00** | Read the daily summary email |
| **Morning** | Clear the **Payments to verify** queue against the bank and Airtel/TNM statements |
| **Morning** | Assign a room to every arrival; check every assigned room is clean, not dirty |
| **Morning** | Read the issue queue — anything open overnight, especially emergencies |
| **Morning** | Print the arrivals sheet — the paper fallback |
| **Throughout the day** | Watch the order board; nothing waits over 20 minutes. Answer message threads within 15 minutes |
| **Throughout the day** | Offer the app at check-in: "I'll email you a link so you can order to your room" |
| **Evening** | Check out every departure — this is what makes rooms dirty and sellable again |
| **Evening** | Clear remaining orders and open issues |
| **Evening** | Confirm the unverified payments total is zero |
| **Weekly** | Read the audit trail. Review voids and write-offs. Check reach on last week's posts. Check rooms stuck out of order |
| **Monthly** | Restore drill. Export the audit off-database. Reconcile payments against statements. Review ADR, RevPAR and occupancy; set next month's rates |

---

# PART 9 — IN SHORT

**Yes — the admin adds and removes almost everything.** Rooms, rates, physical rooms, menu items, FAQ,
home page content, reviews, notices, push broadcasts, canned replies, notification templates, settings,
staff accounts, guest accounts, payments, discounts, refunds, manual charges, and the deletion of any
booking are all admin-only, and a staff account that tries any of them — through the interface or by
calling the endpoint directly — gets a 403.

**The exceptions are exactly four**, and they are the things that change hourly during a shift: gallery
pictures, posts and events, housekeeping states, and service tasks. A housekeeper cannot wait for a
manager to mark a room clean, and a waiter cannot wait for a manager to publish tonight's special.

**And one thing nobody can ever touch:** the audit log. It is append-only. It can be searched,
filtered and exported, but it cannot be edited or deleted by anyone, including the admin. Even a
deleted booking keeps a full snapshot in it.

The dashboard itself is nineteen panels, ordered by what needs a human: the action centre first, then
the room map and the queues, then the records, then the content, then the reports, then the settings,
then the system tools. Everything is on one page, everything is audited, and nothing the admin does can
be changed afterwards without leaving a trace.
