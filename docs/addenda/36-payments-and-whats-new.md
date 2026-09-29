# Payments (Visa & PayPal) and the "What's New" Feed

**Text only. No code. Addendum to the Complete System Specification v2 (Part 24).**

---

# SECTION A — PAYMENTS: VISA, PAYPAL AND WHAT IS ACTUALLY POSSIBLE

## A1. The honest finding on PayPal — read this first

You asked for PayPal. Before designing it, this needs saying plainly, because it changes the decision:

**A Malawi-registered business cannot withdraw PayPal money into a Malawian bank account.**

PayPal's own *Receive Funds and Automatic Transfer Agreement* covers Malawi, and its terms state that
payments received are automatically transferred to a **linked US bank account or Visa credit card**,
that **all received payments are subject to a 30-day hold**, and that you may not hold a balance — every
amount must be withdrawn [[10]](https://www.paypal.com/bw/legalhub/paypal/recpymt-full). Malawian
freelancers report the same from experience: linking a National Bank Visa card works for *spending*, but
withdrawing received funds to a local bank does not, and the common workaround is a PayPal account
opened in South Africa or Kenya [[2]](https://www.reddit.com/r/Malawi/comments/1rfa099/how_do_you_guys_use_paypal_with_a_malawi_account).

So a direct "Pay with PayPal" button on Sunrise Motel's site would collect money the motel cannot get
into its own bank account. **Do not build it that way.**

### The correct way to offer PayPal

PayPal can still be offered — through an **aggregator that settles locally**. Flutterwave has a
partnership with PayPal that lets African merchants accept "Pay with PayPal" from customers anywhere in
the world, with the merchant settled in local currency
[[4]](https://techcrunch.com/2021/03/15/flutterwave-and-paypal-partner-to-allow-african-merchants-to-accept-and-make-payments).

So the design is:

| Option | Verdict |
|---|---|
| Direct PayPal merchant account | **No** — funds cannot be withdrawn to a Malawian bank |
| **PayPal via Flutterwave** | **Yes** — the guest pays with their PayPal account, the motel is settled in MWK by the gateway |
| A PayPal account held abroad by an owner or relative | Not recommended — compliance and accounting mess, and it is the guest's money arriving in a personal account |

**Recommendation:** build card payments first (A3), and add "PayPal — international guests" later
through the same gateway, once the card flow is proven.

## A2. The full payment picture for a motel in Malawi

| Channel | Who uses it | Status |
|---|---|---|
| **Cash at the desk** | Everyone | Already supported |
| **National Bank of Malawi transfer** | Local guests, corporate | Already supported |
| **Airtel Money** | The majority of local guests | Already supported |
| **TNM Mpamba** | The majority of local guests | Already supported |
| **Visa / Mastercard** | NGO staff, diplomats, tourists, business travellers, anyone booking from abroad | **Build this** |
| **PayPal (via a gateway)** | International guests paying from abroad | **Later, via Flutterwave** |
| **Wise or SWIFT transfer** | International NGOs and corporate guests | Manual, documented on the invoice |
| **Corporate account, invoiced monthly** | NGOs, embassies, consultants | Already specified in Part 10.3 |

An important reality check: **card penetration in Malawi is low and mobile money dominates**
[[3]](https://payatlas.com/countries/malawi-mw). So card payments will never be the main channel — but
they are the *only* channel that works for a guest in London booking a room for next week, and that
guest is worth having. Build it as a secondary channel, not the primary one.

## A3. Visa and Mastercard — what to build

### A3.1 Which gateway

| Gateway | Notes |
|---|---|
| **PayChangu** — **recommended** | Malawian company headquartered in Lilongwe, licensed by the Reserve Bank of Malawi to pilot a payment gateway (June 2024). One API accepts **Visa/Mastercard, Airtel Money, TNM Mpamba and bank transfers** — one integration covers every channel the motel needs. Low fees, free automatic payouts, USSD support [[1]](https://www.247malawi.com/paychangu-malawis-digital-payment-game-changer-transforming-the-future-of-finance/) [[2]](https://grokipedia.com/paychangu). It already powers payments for a Lilongwe hotel (Amaryllis) [[2]](https://grokipedia.com/paychangu) |
| **Flutterwave** | Pan-African, supports Malawi, cards + mobile money + bank transfer, and the PayPal partnership above. Roughly 1.4% local and 3.8% international [[5]](https://paymentproviders.io/providers/flutterwave) |
| **Paynow / DPO Group** | Local aggregator and regional PSP respectively, both support cards and mobile money [[3]](https://payatlas.com/countries/malawi-mw) |

**The single integration that matters most is PayChangu**, because it replaces the manual
bank/Airtel/TNM reconciliation with one gateway *and* adds cards at the same time.

### A3.2 The one rule that must never be broken

> **The motel's server never sees, stores, logs or transmits a card number.**

Card details go **only** into the gateway's hosted checkout page. Sunrise Motel redirects the guest
there, the guest pays, and the gateway tells the motel the result. This keeps the motel completely
outside the scope of card-industry security compliance, which is the difference between a day's work
and a permanent legal and audit burden.

Concretely:

- No card form anywhere on the motel's own pages.
- No card number, expiry, CVV or cardholder name in the database, in a log, in an error message, or in
  a support ticket.
- The only thing stored is the gateway's **transaction reference**, the amount, the currency, the
  status and optionally the last four digits.
- **3D Secure** authentication is used, which is standard for Malawi and shifts liability for fraud to
  the card issuer [[3]](https://payatlas.com/countries/malawi-mw).

### A3.3 The payment flow

```
Guest taps "Pay with card"
        |
        v
System creates a payment intent: reference, amount in MWK, what it is for
(deposit, full balance, or a takeaway order)
        |
        v
Guest is redirected to the gateway's hosted page  -->  enters card details THERE
        |
        v
Gateway authenticates with 3D Secure
        |
   +----+-----+
   v          v
SUCCESS    DECLINED
   |          |
   v          v
Webhook    Guest sees a clear failure message
to the     and is offered Airtel Money / TNM
motel      Mpamba / bank transfer instead
   |
   v
System matches the webhook to the intent by transaction reference
(idempotent -- a repeated webhook never double-credits)
   |
   v
payments row created with status "verified", channel "card"
   |
   v
The EXISTING auto-confirm logic fires:
  full payment  ->  booking confirmed
                    invoice flips to "paid"
                    receipt PDF issued
                    guest emailed / pushed the receipt
```

### A3.4 What this changes in the existing design

| Existing part | Change |
|---|---|
| `payments` table | New `channel` value `card`; new fields `gateway`, `gateway_reference`, `card_last4`, `card_brand`, `currency`, `gateway_fee` |
| **Payments to verify queue** | Card payments arrive **already verified** — they never sit in the queue. The queue is now only for manual claims (bank, Airtel, TNM). Show a separate "settled automatically" count so the desk is not confused |
| Auto-confirm | Unchanged — a verified card payment behaves exactly like a verified manual payment |
| **Revenue reports** | Must show **net** revenue, not gross: the gateway fee is recorded per transaction and subtracted |
| **Reconciliation** | A new daily task: download the gateway's settlement report and match it against the payments ledger. The system should flag any gateway transaction with no matching ledger row, and vice versa |
| **Refunds** | New capability: full or partial, initiated from the portal, recorded in `payments` with a negative amount, audited with a reason. Refunds go back through the gateway to the original card |
| Deposit | Unchanged — the guest can now pay the deposit by card at the moment of booking instead of waiting for a bank transfer |
| Check-out | The folio can be settled by card, including **split payment** (part card, part Airtel Money, part cash) |
| Takeaway | Can be paid by card at order time rather than on collection |

### A3.5 Where card payment appears in the guest app

| Screen | What happens |
|---|---|
| Booking confirmation | "Pay your deposit now" — card, or the existing channels |
| Room bill / folio | "Settle balance" — card, with the amount pre-filled |
| Express check-out | Settle by card and walk out |
| Takeaway order | Pay now by card, or on collection |
| Invoice screen | "Pay outstanding balance" |

### A3.6 Currency

The motel charges in **MWK**, and that does not change. The gateway converts an international card into
MWK at its own rate. The system stores the MWK amount charged and the gateway's exchange rate, so the
revenue report is honest about what actually arrived. The landing page can show an *indicative* USD
figure for international guests, clearly labelled as indicative.

---

# SECTION B — "WHAT'S NEW": THE IN-APP FEED

## B1. The problem this solves

The motel already publishes posts — events, specials, offers, news — and they already appear on the
home page and `/unwind`. But:

- A guest **inside the app** has no reason to open it unless they are ordering or messaging.
- A guest who is **in-house right now** has no idea that tonight is Garden Dinner Evenings or that
  Sunset Happy Hour starts at 17:00.
- There is no way to tell a guest about something **without sending a push**, and pushing for every post
  is how an app gets uninstalled.

The fix is a **"What's new" feed inside the app**, plus a separate **Notices** channel for operational
announcements.

## B2. Two different feeds — and why they must be separate

| | **What's on** | **Notices** |
|---|---|---|
| What it is | Events, specials, offers, news — the marketing feed | Operational announcements: "kitchen closes at 22:00 tonight", "Wi-Fi maintenance 14:00–15:00", "braai moved to the lawn" |
| Source | The existing `posts` table | A new `notices` type, or posts flagged `is_notice` |
| Opt-in required | **Yes** — marketing consent | **No** — always delivered, never muted |
| Push | Batched, at most one a day | Immediate |
| Who sees it | Everyone who opted in, plus a browseable feed for all | Everyone with an active stay |
| Examples | Sunset Happy Hour, Lawn Braai & Sizzling Cuts, Match Day on the Big Screen, Work & Relax Day Pass, Garden Dinner Evenings | "Hot water restored in Room 201", "Reception closes at 22:00 tonight" |

Separating them is what stops a guest muting the app entirely: they can turn off offers and still be
told their geyser is fixed.

## B3. The "What's on" feed — screens and behaviour

### B3.1 The feed

| Element | Detail |
|---|---|
| **Placement** | A tab in the app, with an **unread badge** on the icon |
| **Filter chips** | All · Events · Offers · Specials · News |
| **"This week" section** | Events sorted by date, with today highlighted — the first thing an in-house guest wants |
| **Cards** | Image, category badge, title, day, date, time, price tag, and a short detail line |
| **Expiring offers** | "Ends Friday" in a warning colour — honest urgency from the post's own date, never invented |
| **Relevance** | An in-house guest sees events that fall **within their stay dates** pinned to the top |
| **Pull to refresh** | |
| **Offline** | Cached, so the feed opens with no connection |
| **Read state** | Tapping a card marks it read; the unread badge decrements |

### B3.2 The post detail screen

| Element | Detail |
|---|---|
| Full image, title, category, day, date, time, price tag, full detail | |
| **Action button** — depends on the post type | |
| · Event with a table or braai spot | **Reserve** → opens the reservation form (currently UI-only on `/unwind`; here it creates a real enquiry) |
| · Event with a price | **Book** → adds it to the folio or takes payment |
| · Offer | **Claim** → records the claim on the guest, so the desk can honour it |
| · Day pass | **Get day pass** → same |
| · News | **Share** on WhatsApp |
| **"Tell me more"** | Opens a message thread with the desk, pre-filled with the post title |
| **Gallery link** | "See photos" opens the gallery filtered to that category |
| **Add to calendar** | For dated events |

### B3.3 Notifications from the feed

| Event | What happens |
|---|---|
| A post is published | **Optional** push to guests who have **opted in to offers**. The admin chooses at publish time |
| A post is scheduled | Published automatically at its time, with the push firing then |
| Nothing new for a while | A **weekly digest** — one push, "This week at Sunrise: Happy Hour Thursday, Braai Saturday" — instead of one push per post |
| A guest opens a push | **Deep link straight to that post**, not the app home screen |
| A notice is published | Immediate push to **everyone with an active stay**, regardless of marketing consent |

Notification fatigue is the main risk here, which is why the digest exists and why marketing consent is
separate from service messages.

## B4. The admin side

| Capability | Detail |
|---|---|
| **Publish** | Already exists in the Posts tab. Now extended with: choose the push audience (all app users / in-house guests only / opted-in only), and schedule for a future date |
| **Reach reporting** | How many guests received the push, how many opened it, how many tapped through to the post. This is the first time the motel will know whether its posts do anything |
| **Pause / resume / delete** | Already exists |
| **Notices composer** | A simpler form for operational announcements — title, one line, optional expiry — pushed immediately to in-house guests |
| **Event reservations** | When a guest taps **Reserve**, the enquiry lands in the desk queue as a task, with the date, headcount and post reference attached |

## B5. What this changes elsewhere

| Part of the spec | Change |
|---|---|
| Part 2.10 (app screens) | Add the **What's on** tab and the **Notices** banner on the home screen |
| Part 3.3 (notifications) | Add post-published and notice-published rows; marketing consent now gates the marketing ones |
| Part 4.3 (unwind reservations) | The `/unwind` reservation form finally has a destination — it becomes an enquiry task in the desk queue |
| Part 8 (admin dashboard) | Add reach reporting to the Posts tab and a Notices composer |
| Part 10 (data model) | Add `post_reads` (which guest has read which post), `post_claims`, `event_enquiries`, and `notices` |
| Landing page | The home page's "What's on" section gains a deep link into the app for guests who have it installed |

---

# SECTION C — UPDATED PAYMENT CHANNEL LIST

The complete list of ways a guest can pay, after these additions:

| # | Channel | Who | Automatic? |
|---|---|---|---|
| 1 | Cash at the desk | Everyone | No — recorded by staff |
| 2 | National Bank of Malawi transfer | Local, corporate | No — verified by staff |
| 3 | Airtel Money | Most local guests | No — verified by staff |
| 4 | TNM Mpamba | Most local guests | No — verified by staff |
| 5 | **Visa / Mastercard via gateway** | NGO, diplomatic, tourist, international | **Yes — webhook, auto-verified, auto-confirms** |
| 6 | **PayPal via gateway** | International guests paying from abroad | **Yes — webhook** |
| 7 | Wise / SWIFT transfer | International NGOs and corporate | No — reconciled manually |
| 8 | Corporate account, invoiced monthly | NGOs, embassies | No — accounts receivable |

Channels 5 and 6 are the only automatic ones, and they are also the only ones that carry a gateway fee —
so the revenue report must show **net of fees** to be honest.

---

# SECTION D — RECOMMENDATIONS ON ALL OF THIS

1. **Do not build direct PayPal.** The money cannot reach a Malawian bank account. If a guest insists on
   PayPal, offer it through the gateway, or take a Wise/SWIFT transfer and record it manually.
2. **Build card payments through PayChangu**, not a bespoke integration. It is Malawian, Reserve
   Bank-licensed, covers cards *and* mobile money in one API, is already proven with a Lilongwe hotel,
   and means one integration instead of three.
3. **Never touch a card number.** Hosted checkout only. This single decision keeps the motel out of
   card-industry compliance scope permanently.
4. **Treat card payments as a secondary channel.** Mobile money is what your local guests use; cards are
   for the international and NGO guest booking from abroad. Do not let card integration delay the
   manual-claim verification queue, which serves far more guests.
5. **Make the webhook idempotent.** A repeated or duplicated webhook must never credit a booking twice.
   Match on the gateway's transaction reference, and reject anything that does not match.
6. **Record the gateway fee per transaction.** Revenue reported gross is a lie the manager will
   eventually notice.
7. **Reconcile daily, automatically flagged.** The system should surface any gateway transaction with no
   matching ledger row, and any ledger row with no gateway settlement. That is a five-minute check
   instead of a month-end surprise.
8. **Split the two feeds.** "What's on" is marketing and needs consent; "Notices" is operational and
   must always arrive. Merging them is how an app gets muted forever.
9. **Use the weekly digest, not one push per post.** Five posts in a week is five interruptions; one
   digest is one.
10. **Measure reach.** Publishing a post and never knowing if anyone saw it is the current state. Reach
    reporting turns the posts tab from a chore into a channel.

---

# SECTION E — IN SHORT

**Payments:** add **Visa and Mastercard** through a local gateway — **PayChangu** is the strongest fit,
being Malawian, Reserve Bank-licensed, covering cards *and* Airtel Money *and* TNM Mpamba in one API,
and already used by a Lilongwe hotel. Card details go only to the gateway's hosted page, never to the
motel's server, which keeps the motel permanently outside card-security compliance. Card payments
arrive **already verified** by webhook and trigger the existing auto-confirm, so they never sit in the
verification queue — but they carry a fee, so the revenue report must show net of fees, and the daily
routine gains a reconciliation check.

**PayPal:** do not build it directly. A Malawi business cannot withdraw PayPal funds to a Malawian bank
account — PayPal's own terms route received funds to a linked **US bank account or Visa card** with a
30-day hold. Offer PayPal later, through the same gateway, as a channel for international guests paying
from abroad, settled to the motel in MWK.

**What's new:** a **"What's on" feed inside the app** — the existing posts table, with filters, a
"This week" section, read state, an unread badge, and an action button per post type (reserve a braai
spot, claim an offer, book an event, share on WhatsApp). Alongside it, a separate **Notices** channel
for operational announcements that always arrives and is never muted. Posts can be scheduled, pushes go
only to guests who opted in, a weekly digest replaces one-push-per-post, and for the first time the
motel can see how many guests actually received and opened each post.
