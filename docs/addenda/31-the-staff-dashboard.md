# The Staff (Front Desk) Dashboard — Complete Walkthrough

**Text only. No code. Addendum to the Complete System Specification v2 (Part 30).**

---

# PART 1 — WHO STAFF ARE, AND THE LINE THEY WORK TO

Staff are the **front desk**. They run the house. Their dashboard is an **operational board**, not a
control panel — everything on it answers one of four questions:

1. **Who is arriving, and where do they sleep?**
2. **Who is here now, and what do they need?**
3. **What is broken, dirty, or waiting?**
4. **What has somebody asked me for that I have not answered?**

**What staff can add or remove — exactly two things:**

| Stuff | Add | Remove |
|---|---|---|
| **Housekeeping states** (clean / dirty / inspected / out of order) | ✅ | ✅ |
| **Service tasks** | ✅ | ✅ |

**What staff can do but not add:** work the booking pipeline, assign and reassign rooms, handle orders,
answer messages, invite guest accounts, record cash, print and export reports, read the audit trail,
and **look up any guest by ID with their full room and booking history**.

**What staff can never touch:** posts, events, gallery pictures, the menu (except one sold-out toggle —
see Part 15), reviews, the FAQ, home page content, banners, notices, push broadcasts, canned replies,
notification templates, settings, staff accounts, room types, rates, refunds, discounts, voids, manual
charges, deleting a booking, day close, night audit, maintenance mode, backups, app versions.

**And one rule that overrides everything:** every one of those blocks is enforced **on the server**.
Hiding a button is cosmetic — a staff account that calls an admin endpoint directly gets **403**.

---

# PART 2 — WHAT STAFF SEE VERSUS WHAT THEY CAN CHANGE

Important to be clear about, because "can't change it" does not mean "can't see it":

| Information | Staff can see it? | Staff can change it? |
|---|---|---|
| Who is in which room, and the room's state | ✅ | ✅ |
| A guest's ID, name and phone number | ✅ | ❌ |
| A guest's **full room and booking history** | ✅ | ❌ |
| A guest's order, message and complaint history | ✅ | ❌ |
| Stay count, total spent, regular and no-show flags | ✅ | ❌ |
| A guest's **email, ID/passport, credentials, devices and consent** | ❌ **admin only** | ❌ **admin only** |
| Every balance, folio and invoice | ✅ | ❌ |
| Total, paid and balance on a booking | ✅ | ❌ |
| Record a payment | — | ❌ **admin only** |
| Cash taken at the desk | — | ✅ |
| Assign and reassign rooms | ✅ | ✅ |
| `checked_in` / `checked_out` | — | ❌ **admin only** |
| Approve / Confirm / Cancel / Follow-up | ✅ | ✅ |
| Discounts, fees, voids, refunds, write-offs | — | ❌ **admin only** |
| Extend a stay | — | ❌ **admin only** |
| Delete a booking | — | ❌ **admin only** |
| The audit trail | ✅ | ❌ **nobody** |

The booking modal simply **does not render** the admin-only controls for a staff session. They are not
greyed out or hidden behind a permission error — they are absent, so a staff member never has to wonder
whether they are allowed.

---

# PART 3 — THE STAFF DASHBOARD SHELL

| Element | What it does |
|---|---|
| **Identity strip** | `Staff STF002 — Kondwani Phiri` |
| **Refresh** | Reloads the board, the queues and the lists |
| **Lock** | Signs out and clears the session |
| **Shift indicator** | Shows the current shift and who handed over |
| **Live refresh** | The board, the order board and the message queue update without a reload |
| **What is absent** | No settings gear, no staff tab, no rooms tab, no content tab, no notification composer, no system tools |

---

# PART 4 — THE TODAY BOARD (THE LANDING SCREEN)

The first thing a staff member sees on signing in.

```
+---------------------+---------------------+---------------------+
|  ARRIVALS TODAY  4  |  DEPARTURES TODAY 3 |  IN-HOUSE       6   |
|  1 unassigned !     |  next at 10:00      |  Rooms free: 3/10   |
+---------------------+---------------------+---------------------+
|  ! 1 deposit at risk  .  !! 1 EMERGENCY  .   4 new orders       |
+-----------------------------------------------------------------+
```

| Panel | What it shows | What staff do |
|---|---|---|
| **Arrivals today** | Every expected arrival with arrival time, room type, nights, total, deposit state | **Assign a room** · **Mark no-show** |
| **Unassigned arrivals** | Highlighted at the top | The afternoon's main job: every arrival gets a room before 15:00 |
| **Departures today** | Every departure with check-out time | **Check out** · **Print** |
| **In-house now** | Guests and rooms occupied right now | — |
| **Rooms free tonight** | Sellable rooms remaining, excluding out-of-order | — |
| **Deposits at risk** | Bookings whose deposit deadline is today | Chase the guest |
| **Emergency issues** | Any emergency-tagged message | Open immediately |
| **New orders** | Orders waiting to be accepted | Work the order board |

---

# PART 5 — THE ROOM MAP

The staff member's most-used screen. Every physical room, at a glance.

| Each room shows | Controls |
|---|---|
| Room number and type | **Assign** a guest |
| Occupant name | **Reassign** |
| Housekeeping state — available / occupied / dirty / clean / inspected / out of order | **Set state** |
| Open issue count | **Take out of order** with a reason |
| Folio balance | **Return to service** |
| Notes ("geyser cold") | **Edit notes** |

Colour-coded so a dirty room, an out-of-order room and an occupied room are distinguishable at a
glance — and never by colour alone, since the state is also written in words.

**Why this screen matters:** it is the answer to "who is in room what", and it is where the
double-assignment that is possible in the current system becomes impossible.

---

# PART 6 — BOOKINGS

## 6.1 The list

| Shows | Controls |
|---|---|
| Every booking as a card: guest, clickable phone, room, stay, balance, money state | **Manage & timeline** |
| Search by reference, guest name, phone or email | **Approve** · **Confirm** · **Follow-up** · **Cancel** |
| Status filter chips | **Invoice PDF** (download and print) |
| | **WhatsApp the guest** |

## 6.2 The booking modal — the staff version

| Panel | What staff see and can do |
|---|---|
| Guest snapshot | Name, phone, email, stay count, total spent, regular and no-show flags — **read only** |
| Stay facts | Room type, dates, nights, occupancy, rate, total, paid, balance — **read only** |
| Arrival and requests | Arrival time, flight details, special requests |
| Quick decisions | **Approve** · **Confirm** · **Cancel** · **Follow-up** |
| Status buttons | **Cancel** only. No `checked_in`, no `checked_out`, no `awaiting_payment` |
| Room | **Assign** · **Reassign** |
| Invoice | **Download** · **Print** · **WhatsApp link**. **No email — admin only** |
| Timeline | Every event, with internal notes filtered from the guest's view |
| Manager note box | **Add a note** |
| **Absent entirely** | Record payment · discount · service fee · manual charge · void · refund · extend stay · **delete booking** |

## 6.3 Taking a booking on the phone — new

The front desk takes bookings by phone and WhatsApp every day. This must be possible.

| Step | What staff do | Follow-up |
|---|---|---|
| 1 | Tap **New booking** | A form opens |
| 2 | Fill in room type, dates, occupancy, name, phone, email, arrival time, requests | Availability is checked live as the dates are entered |
| 3 | Submit | Booking created as **`pending`** with a reference, booking number and pro-forma — identical to a web booking |
| 4 | — | The guest is sent the confirmation by SMS or WhatsApp; the audit log records it was **manager-created** by that staff member |
| 5 | If the guest pays cash at the desk | Staff record the cash payment, and the booking confirms |

A staff-created booking starts as `pending` so it still passes through the same approval step as
everything else — unless the guest has already paid, in which case it confirms immediately.

---

# PART 7 — ORDERS

| Panel | Controls |
|---|---|
| **Live board** grouped by status: new · preparing · ready · delivered, with a waiting-time clock | **Accept** · **Prepare** · **Ready** · **Deliver** |
| Each card: room number, items, total, time ordered, note, and **the channel** (app, QR, PIN, reference, desk, WhatsApp, counter) | **Void** with a mandatory reason |
| Orders waiting over 20 minutes | Highlighted |
| **Enter an order for a guest** | New — for a guest with no phone, who calls down, or who is at the counter |
| **Open the ordering page on a guest's phone** | New — hands the phone over with the room already set, so the guest can browse themselves |

The **channel** on each card matters: it tells staff whether to reply by push, by SMS, or by walking to
the room.

---

# PART 8 — MESSAGES AND ISSUES

| Panel | Controls |
|---|---|
| **Queue grouped by room number** — the answer to "which room has a problem" | **Open thread** |
| Each entry: room, guest, stay dates, first-time or returning, kind, status, age | **Reply** · **Canned reply** |
| **Emergencies pinned and loud** | **Acknowledge** · **Resolve with note** · **Escalate to admin** |
| Full guest context beside the thread: room, folio, open orders, previous stays, previous complaints | **Close without confirmation** (only when the guest cannot be reached) |

Staff work this queue continuously. The SLA is a **nudge at 15 minutes** and **escalation to the admin
at 1 hour**, and an `emergency`-tagged message is never batched and never silenced.

---

# PART 9 — HOUSEKEEPING AND SERVICE TASKS

| Panel | Controls |
|---|---|
| Tasks by room and assignee, with due times; overdue highlighted | **Assign** · **Complete** |
| Task kinds: cleaning, towels, linen, maintenance, amenity, taxi, wake-up call | **Create a task** |
| Who completed each task, and when | Review |
| Room states | **Set clean / dirty / inspected** |
| Out-of-order rooms with reasons | **Take out of order** · **Return to service** |

This is one of the two things staff can add and remove freely, because it changes hourly and a guest
asking for towels cannot wait for a manager.

---

# PART 10 — GUESTS: LOOKUP, HISTORY AND THE PRIVACY LINE

Staff look guests up all day — someone arrives without a booking, someone calls about a past stay,
someone wants the room they had last time. They need to find the person and see their history. They do
**not** need to see that person's private details.

## 10.1 Looking a guest up

| How staff search | What comes back |
|---|---|
| **By guest ID** — the reference number on the record | That guest, immediately |
| By name | Matching guests |
| By phone number | Matching guests |
| From a booking card | The guest attached to it |
| From the room map | The guest in that room |

## 10.2 What staff can see on a guest record

| Field | Why staff need it |
|---|---|
| **Guest ID** | The handle for the record |
| **Name** | To greet and to match a face to a booking |
| **Phone number** | To call and to WhatsApp — the desk's two working channels |
| **Stay count, total spent, last stay** | To recognise a returning guest |
| **Regular flag, no-show flag** | To know whether to take a deposit |
| **Full room and booking history** | See 10.3 |
| Order history, message history, complaint history | To answer "what did I order last time" and "did I complain about this before" |

## 10.3 Room and booking history — the part that earns its keep

For every past stay, staff see:

| | |
|---|---|
| Room number and room type | Which physical room they had |
| Check-in and check-out dates, nights | |
| Rate charged, total, paid, balance | |
| Extras and orders | Breakfast, transfer, late check-out, what they ate |
| How they paid | Cash, bank, Airtel, TNM, card |
| Whether they showed up | Completed, cancelled, no-show, released |
| Any complaint or issue raised | And how it was resolved |

This is what lets the desk say *"you were in 201 last time, on the quiet side — shall I put you there
again?"* — which is the practical form of "when you are here, you are family", and it is impossible in
the current system because bookings are unrelated rows.

## 10.4 What staff cannot see — admin only

| Hidden from staff | Why |
|---|---|
| **Email address** | The desk does not need to browse it. They **type** an email when inviting an account, and the system sends the link — they never see the stored one |
| **ID / passport document details** | Captured for the legal guest register, but not for general staff browsing |
| **Account credentials and status** | `invited`, `active`, `locked`, `muted`, `disabled` |
| **Devices and sessions** | Which phones are signed in, and when |
| **Marketing consent** | Whether the guest opted into offers |
| **Payment claim screenshots** | Evidence attached to a claim; the admin checks those |

A staff member who needs one of these asks the admin. The desk is not a place to browse a guest's
private file.

## 10.5 What staff can do

| Action | Follow-up |
|---|---|
| **Create a guest account** (invite) | Types the email the guest just gave them; activation link sent; audited |
| **Resend an activation link** | Previous token invalidated; new one issued |
| **Set a password at the desk** | The guest types it themselves on their own device — staff never see it |
| **Add a note to the guest record** | Visible to staff and admin, never to the guest |

Staff **cannot** merge duplicates, blacklist, anonymise, disable an account, reset a password, sign
devices out, unlock, or mute. Those are admin actions.

---

# PART 11 — PAYMENTS — CASH ONLY

| Staff can | Staff cannot |
|---|---|
| **Record a cash payment** — amount, received at the desk | Verify a claimed payment |
| See every payment in the ledger, read-only | Record a bank, Airtel or TNM payment as verified |
| See the unverified total | Issue a refund |
| | Apply a discount or fee |
| | Post a manual charge or void one |
| | Adjust a recorded payment |

The **Payments to verify queue** is visible to staff so they know what is outstanding, but the Verify
and Reject buttons are admin-only. A staff member who sees a claim they know is genuine escalates it
rather than confirming it themselves.

---

# PART 12 — REPORTS AND AUDIT

| Report | Controls |
|---|---|
| Daily bookings (print / PDF) | **Print** · **Save as PDF** |
| **Arrivals sheet** | **Print** — the paper fallback for an internet outage |
| Occupancy and revenue figures | **Read** |
| Revenue CSV | **Export** |
| Audit trail | **Search** · **Filter by entity** · **Export CSV** |
| | **No edit. No delete. Ever.** |

Staff can read revenue but cannot change it, and can read the audit trail but cannot alter it.

---

# PART 13 — SHIFT HANDOVER

| Action | Follow-up |
|---|---|
| **Write a handover note** | Visible to the next shift at sign-in; timestamped and attributed |
| **Read the day's notes** | Outstanding issues, expected late arrivals, rooms out of order, promises made to guests |
| **See who handed over** | The previous shift's name and time |

This exists so the 22:00 shift knows what the 14:00 shift promised a guest.

---

# PART 14 — THINGS I HAD NOT GIVEN STAFF, AND SHOULD HAVE

These are the actions a real front desk performs that were missing from the specification.

| # | Action | What staff do | Follow-up |
|---|---|---|---|
| 1 | **Take a phone or WhatsApp booking** | Fill the booking form on the guest's behalf | Booking created `pending`; guest confirmed by SMS/WhatsApp; audited as manager-created |
| 2 | **Register a walk-in with no booking** | Create the booking and assign a room in one flow | Room `occupied` immediately; folio opened; QR and PIN issuable on the spot |
| 3 | **Check availability for a walk-in** | Quick lookup by date | Live availability with the rooms-free badge — no booking created |
| 4 | **Capture guest ID or passport details** | Record the document type and number at check-in | Stored against the stay for the guest register; a legal requirement in Malawi and most countries |
| 5 | **Print or export the guest register** | One tap | The register of who stayed, when, and their document reference — the document an inspector asks for |
| 6 | **Handle an early arrival before check-in** | Offer luggage storage and a room-when-ready promise | Luggage task created; the room is flagged for priority cleaning; the guest is told the expected time |
| 7 | **Store luggage after check-out** | Log the bags against the room | Luggage task with a description and location; released when collected |
| 8 | **Handle a noise complaint between guests** | Open a thread with the complaining room, and a task on the offending room | Both recorded; escalation to admin if it recurs; the offending room is noted |
| 9 | **Flag a walkout** | Mark a guest who left without settling | The folio stays open and flagged; appears on the admin's exception list at day close |
| 10 | **Report a fault they noticed themselves** | Create a maintenance task without a guest message | Task on the room; if unfixable now, the room goes out of order |
| 11 | **Check the room is ready before sending a guest up** | Look at the room's state on the map | Prevents sending a guest into a dirty or occupied room — the single most damaging desk error |
| 12 | **Mark a menu item sold out during service** | Tap "sold out" on the item | It disappears from ordering instantly, in the app and at the counter, while staying in the menu for tomorrow. **See Part 15** |
| 13 | **Record a stock shortage** | Log what is running low | Appears on the admin's inventory view; prevents promising a guest something the kitchen cannot deliver |
| 14 | **Log a phone call** | Record who called, when, and what about | Attached to the booking or guest, so the next person to pick up has the context |
| 15 | **Take a message for a guest** | Record it against the room | Delivered when the guest returns or via the app |
| 16 | **Handle an upgrade request** | Offer a better room with the price difference | The difference is shown and, once the admin approves, posts to the folio |
| 17 | **Handle a same-day extension** | "Can I stay one more night tonight?" | Routed to the admin for the extension fee, or handled directly if the motel allows |
| 18 | **Call a taxi for a guest** | Create a taxi task with the destination and time | The desk sees it is done |
| 19 | **Prepare an early-departure guest** | Wake-up call, taxi, breakfast to go | Three linked tasks, all timestamped |
| 20 | **Attribute housekeeping to a person** | Record who cleaned which room | Lets the manager see who is actually doing the work |
| 21 | **Note a guest's preference for next time** | Add a note to the guest record | Visible at the next check-in — the practical form of "when you are here, you are family" |
| 22 | **Flag a security concern** | Create an urgent task with a description | Escalates immediately to the admin, with the room and the guest |
| 23 | **Confirm what a guest is owed before they leave** | Read the folio against payments recorded | Prevents charging a prepaid guest twice, and prevents letting an unpaid one walk |
| 24 | **Reconcile expected against actual arrivals at end of day** | Compare the arrivals sheet with who actually checked in | Feeds the no-show marking and tomorrow's availability |

---

# PART 15 — TWO THINGS STAFF NEED THAT CUT ACROSS "ADMIN ONLY"

These are narrow, deliberate exceptions, and they are worth stating plainly because they are where a
strict permission model breaks the front desk.

## 15.1 The sold-out toggle on menu items

Menu **management** is admin-only. But during dinner service the kitchen runs out of chambo, and
somebody at the desk must be able to stop it being ordered **immediately** — not wait for a manager.

**The fix:** staff get a single **"sold out"** toggle on each menu item. Nothing else. They cannot add
an item, edit a price, change a description, upload a photo, or delete anything. They can only stop
something being sold, and un-stop it when the kitchen has more.

This is the same shape as the housekeeping exception: it changes hourly, it is operational, and it
carries no money or reputation risk.

## 15.2 Room assignment

The README's permission matrix has room assignment as admin-only. **Operationally that cannot hold** —
the front desk assigns rooms every afternoon, all afternoon, and a manager is not always present.

**The recommendation:** give staff assignment rights, with the validation that makes it safe:

- A room cannot be assigned to a booking whose dates overlap another booking in that room.
- A room cannot be assigned while it is `dirty` or `out_of_order`.
- Every assignment and reassignment is written to the timeline and the audit log, with who did it.

The validation is what makes delegation safe. Without it, delegation is just hope.

---

# PART 16 — WHAT STAFF RECEIVE WITHOUT ASKING

| Notification | When |
|---|---|
| **New order** | The moment a guest places one |
| **New message** | The moment a guest sends one |
| **Emergency** | Immediately, loud, never batched, never muted |
| **Maintenance request** | Immediately |
| **Arrival expected** | On the morning board |
| **Departure due** | At check-out time |
| **Escalation** | When an issue passes one hour |
| **Reminder** | When a pending booking passes two hours, if they are the assignee |
| **Room state change** | When housekeeping marks a room |
| **Task assigned to them** | Immediately |
| **Payment claimed** | When a guest claims one (they see it; only the admin verifies) |

---

# PART 17 — THE STAFF DAILY ROUTINE

| When | What |
|---|---|
| **Start of shift** | Read the handover note. Read the Today board |
| **Morning** | Chase deposits at risk. Assign rooms to arrivals. Check every assigned room is clean, not dirty |
| **Morning** | Print the arrivals sheet — the paper fallback |
| **Throughout** | Work the order board; nothing waits over 20 minutes. Answer message threads within 15 minutes |
| **Throughout** | Capture ID details at check-in. Offer the app: "I'll email you a link so you can order to your room" |
| **Throughout** | Take phone bookings. Register walk-ins. Handle early arrivals and luggage |
| **Throughout** | Mark menu items sold out as the kitchen runs out |
| **Throughout** | Report faults you notice yourself, before a guest does |
| **Evening** | Check out departures — this is what makes rooms dirty and sellable again |
| **Evening** | Clear remaining orders and open issues |
| **Evening** | Reconcile expected against actual arrivals |
| **End of shift** | Write the handover note: what is outstanding, who is expected late, what is out of order, what you promised |

---

# PART 18 — IN SHORT

The staff dashboard is an **operational board, not a control panel**. It opens on the Today board —
arrivals, departures, in-house, rooms free, deposits at risk, emergencies, new orders — and everything
below it exists to answer who is arriving, who is here, what is broken, and what somebody has asked for.

Staff can add and remove exactly two things: **housekeeping states** and **service tasks**. They can
work the whole booking pipeline, assign and reassign rooms, run the order board, answer the message
queue, invite guest accounts, record cash, print and export reports, and read the audit trail. They can
look up **any guest by ID and see their full room and booking history** — every room they have slept in,
what they paid, what they ordered, and whether they showed up.

What they cannot see is the guest's **personal details**: no email address, no ID or passport document,
no account credentials or status, no devices, no marketing consent. They **type** an email when inviting
an account and the system sends the link; they never browse the stored one. And they cannot change any
of it — no merging duplicates, no blacklisting, no anonymising, no disabling, no password resets.

They cannot publish anything — no posts, no events, no pictures, no banner, no reviews, no push, no
settings — and they cannot touch money beyond cash: no verifying payments, no refunds, no discounts, no
voids, no manual charges, no extensions, no deletions. Every one of those blocks is enforced on the
server, so a staff account that tries gets a 403 rather than a greyed-out button.

And the specification now includes the two dozen things a real front desk does that were missing:
taking a booking over the phone, registering a walk-in, capturing ID for the guest register, storing
luggage before and after a stay, handling a noise complaint between two guests, flagging a walkout,
reporting a fault nobody has complained about yet, checking a room is clean *before* sending a guest
into it, marking a dish sold out mid-service, logging a call, taking a message, handling an upgrade,
calling a taxi, preparing an early-departure guest, attributing housekeeping, noting a guest's
preference for next time, flagging a security concern, and reconciling who was expected against who
actually arrived.

Plus the two narrow exceptions where a strict model would break the desk: the **sold-out toggle** on
menu items, and **room assignment** — the latter recommended with validation, because validation is
what makes delegation safe rather than hopeful.
