# The Travelling Guest — Booking, Paying and Arriving from Outside Malawi

**Text only. No code. Addendum to the Complete System Specification v2 (Part 25).**

---

## PART 1 — WHY THIS IS THE MOST IMPORTANT SEGMENT

Up to now the specification has quietly assumed a local guest: someone who walks in, calls, or WhatsApps,
pays by Airtel Money or cash, and arrives the same day. That guest exists and matters. But there is
another guest, and commercially they are the one worth designing for first:

| | **Local guest** | **Travelling guest** |
|---|---|---|
| Books | Same week, often same day | Weeks or months ahead |
| Pays | On arrival, or by mobile money | **Before arrival, from another country** |
| Can use Airtel Money / TNM Mpamba | Yes | **No** |
| Can use a National Bank transfer | Yes | Practically, no |
| Holds Malawi kwacha on arrival | Yes | **No** |
| Can walk in and look at the room | Yes | **No** |
| Needs reassurance | Some | **A great deal** |
| Typical value | 1–3 nights | 2–14 nights, NGO and business rates |
| Cancels | Rarely, late | Sometimes, early — and wants a refund |

The travelling guest is the **only segment that reliably prepays**, and prepayment is what makes a
10-room motel's cash flow predictable. They are also the segment that cannot use a single one of the
payment channels the system currently offers.

So the requirement is not "add card payments as an option". The requirement is:

> **A guest in London, Lusaka, Johannesburg or New York must be able to find the motel, see the real
> price in their own currency, pay a deposit with their own card, and hold a confirmed room — without
> ever speaking to anyone.**

Everything in this document follows from that sentence.

---

## PART 2 — WHO THE TRAVELLER IS

| Segment | Why they come | What they need |
|---|---|---|
| **Independent tourists** | Lake Malawi, Liwonde, Nyika, Majete, Zomba Plateau | Easy prepayment, directions, an airport pickup, honest reviews |
| **NGO, UN and diplomatic staff** | Assignments in Lilongwe, often weeks or months | A **proper tax invoice** for reimbursement, PO numbers, corporate accounts, reliable Wi-Fi, secure parking |
| **Business travellers and consultants** | Meetings, projects, audits | Fast booking, a receipt, quiet, express check-out |
| **Diaspora Malawians** | Visiting family, funerals, holidays | Paying **from abroad for a room someone else uses** |
| **Overland and regional travellers** | Driving through from Zambia, Mozambique, Tanzania | Secure parking, late arrival, a room held until they get there |
| **Group and delegation bookings** | Workshops, conferences, elections monitoring | Multiple rooms, one payer, one invoice |

---

## PART 3 — THE PAYMENT PROBLEM, STATED PLAINLY

A traveller sitting in another country has exactly three ways to pay a Malawian motel, and the current
system supports none of them.

| Channel | Works for a traveller? | Why |
|---|---|---|
| Cash at the desk | No | They have no kwacha and may arrive at 23:00 |
| Airtel Money | **No** | Requires a Malawian SIM and a local wallet |
| TNM Mpamba | **No** | Same |
| National Bank of Malawi transfer | Practically no | An international wire to a local account is slow, expensive and confusing |
| **Visa / Mastercard issued abroad** | **Yes — this is the one** | The only channel that works instantly from anywhere |
| **PayPal** | Yes, **via a gateway** — not directly (see Part 24) | PayPal cannot settle to a Malawian bank directly |
| Wise / SWIFT | Yes, but slow | Best for NGO and corporate, not for a tourist booking tonight |

So the honest conclusion: **card payments are not a nice-to-have for this segment — they are the only
door.** Which is why the PayChangu integration from Part 24 should be built *first*, before the
manual-claim verification queue, even though the queue serves more local guests. Without it, the
traveller simply cannot book.

### 3.1 What the booking flow must therefore do

| Step | What happens |
|---|---|
| Guest searches dates and picks a room | Prices shown in **MWK with an indicative figure in their currency** |
| Guest fills the form | Name, **email (required for travellers)**, phone with country code, arrival time, requests |
| Guest chooses how to pay | **Card** and **PayPal-via-gateway** offered prominently; Airtel Money / TNM Mpamba / bank transfer still listed for local guests |
| Guest pays the deposit **now**, on the gateway's hosted page | 3D Secure authentication with their own bank |
| Webhook returns success | The booking is **confirmed immediately** — not `pending` |
| Guest receives | A confirmation email with the reference, a **PDF pro-forma**, the address, directions, the phone number, and the app link |

The critical difference from the local flow: **a traveller who pays by card should never sit in
`pending`.** They have already paid. The room should be confirmed the instant the gateway says so.

### 3.2 Deposit policy differs by segment

| | Local guest | Travelling guest |
|---|---|---|
| Deposit | Optional, or pay on arrival | **Required at booking** |
| Amount | Whatever the policy says | The **full amount**, or at minimum 50% |
| Why | They can be reached by phone and WhatsApp, and will usually arrive | The room is held for weeks, they cannot be reached locally, and a no-show costs a whole night |
| Balance | On arrival | Prepaid, or on arrival |
| If unpaid | Released 48 h before arrival, as specified | **Released immediately** — an unpaid international booking holds a room for a guest who may never come |

A traveller who has paid in full is a guest who is definitely coming. That is worth more than the
flexibility of letting them pay later.

---

## PART 4 — CURRENCY AND PRICE DISPLAY

The motel charges in **MWK** and that does not change. But a traveller cannot judge MWK 85 000.

| Improvement | Detail |
|---|---|
| **Indicative currency toggle** | MWK · USD · GBP · EUR · ZAR on the room cards and the booking modal, clearly labelled "indicative". The charge is still in MWK |
| **Rate shown with a date** | "Indicative only, converted at approximately MWK 1 750 = USD 1 on 28 Sep 2026" — so the guest knows it is a guide, not a quote |
| **Gateway conversion shown** | After a card payment, the guest is told what their bank actually charged them and at what rate, because their statement will show it |
| **The invoice is in MWK** | Always, for the motel's accounting — but a USD equivalent line can be printed beneath it for reimbursement |
| **ZAR matters** | South African travellers are a large share of overland traffic through Malawi; showing ZAR removes a real hesitation |

---

## PART 5 — TRUST: THE BARRIER THAT ACTUALLY LOSES THE BOOKING

A local guest can drive past and look at the building. A traveller in another country cannot. They are
being asked to send money to a motel they have never seen, in a country they may never have visited,
based on a website. Everything below exists to close that gap.

| Barrier | What closes it |
|---|---|
| "Is this place real?" | Real photos of real rooms, the full address, a map, a landmark, the phone number with the country code, and the motel's own name on the invoice |
| "Will my room be as described?" | Honest room descriptions — bed size, room size, what the bathroom has, whether the air conditioning works, whether the hot water is reliable |
| "What if it's awful?" | Reviews with real names and dates, including any mediocre ones |
| "What if I have to cancel?" | A **clear, written refund policy**, stated at booking, with what happens to the deposit in each case |
| "Will anyone be there when I arrive?" | 24-hour reception stated plainly, and a guaranteed late check-in |
| "Is it safe?" | Secure parking, the neighbourhood, whether the gate is locked at night |
| "Can I trust the payment?" | A hosted payment page from a known gateway, 3D Secure, and a receipt that arrives immediately |
| "Who do I call if something goes wrong?" | A phone number with the country code, a WhatsApp number, and an email — all on the confirmation |

### 5.1 The single most important trust element

**A written refund policy, shown before payment.** A traveller will not send a card payment to a motel
in another country without knowing what happens if they cancel. The policy must state:

- What is refundable, and by when.
- How long a refund takes to reach their card.
- That it goes back to the **same card**.
- Who to contact.

And the system must then **actually honour it** — a refund initiated from the portal, recorded, and
confirmed to the guest. A refund policy that is not operationally real is worse than none, because it
converts a disappointed guest into an angry one.

---

## PART 6 — WHAT THE TRAVELLER NEEDS BEFORE THEY LAND

A traveller's anxiety peaks in the 48 hours before arrival. The system should send, automatically, after
a booking is confirmed and paid:

| When | What is sent |
|---|---|
| **Immediately** | Confirmation with the reference, the exact address, a map link, the phone number with country code, check-in and check-out times, what is included, and the app link |
| **3 days before** | "Your stay is in 3 days" — directions from Kamuzu International Airport, the airport transfer option, and a reminder to confirm the arrival time |
| **1 day before** | Arrival details: the flight or bus time, whether anyone will meet them, the door code or who to call, and the Wi-Fi details |
| **On arrival day** | "We are expecting you today" with the front-desk number and a WhatsApp button |
| **A downloadable arrival guide** | A one-page PDF: the address, a map, the phone number, directions from the airport and the city centre, check-in time, what to do if they arrive late, and the Wi-Fi details. **This is the single most valuable document for a traveller**, because it works with no internet on a phone with no local SIM |

### 6.1 Arrival time and late check-in

The `arrival` field currently exists as free text with no policy behind it. For travellers it matters
enormously, because they frequently arrive on a night bus, a late flight, or a long drive from Zambia.

- Arrival time becomes a **required choice** for international bookings: a time window, or "after 22:00",
  or "I don't know yet".
- **Guaranteed late check-in** is stated explicitly: "Your room is held no matter what time you arrive."
- If a guest selects "after 22:00", the desk is notified so someone is actually awake.
- A guest who does not arrive by 23:59 is marked `no_show` automatically — but for a **prepaid** traveller,
  the desk is told to call before releasing the room, because they have already paid.

### 6.2 Airport pickup — needs real fields

The MWK 25 000 one-way transfer exists as an extra. For a traveller it needs to be bookable properly:

| Field | Why |
|---|---|
| Flight number and airline | So the driver can track a delay |
| Arrival date and time | |
| Number of passengers | Vehicle size |
| Luggage count and size | A traveller with two large cases needs a bigger vehicle |
| Meeting point | Arrivals hall, with the driver holding a sign with the guest's name |
| Return pickup needed? | And at what time |

A missed airport pickup is one of the worst experiences a traveller can have in an unfamiliar country,
and it is entirely avoidable with these fields.

---

## PART 7 — DOCUMENTS THE TRAVELLER NEEDS

| Document | Who needs it | Why |
|---|---|---|
| **Booking confirmation letter** | Tourists, anyone applying for a Malawi visa | Visa applications and embassy appointments ask for confirmed accommodation |
| **Proper tax invoice** | NGO, UN, diplomatic and business travellers | Reimbursement requires the motel's registered name, address, tax number, the invoice number, and a VAT/tax line |
| **Receipt** | Everyone | Proof of payment, for expenses and insurance |
| **Arrival guide** | Everyone | Works offline, on arrival |
| **Folio at check-out** | Business and NGO travellers | Itemised, for expense claims |

These are not nice-to-haves. A missing tax invoice is a reimbursement rejection, and a missing
confirmation letter can be a refused visa. Both cost the motel a guest.

**On tax:** the motel must confirm with its accountant whether it is VAT-registered and what Malawi's
standard rate is, then print it correctly on every invoice issued to a traveller. A pro-forma with no tax
line is not a valid tax document.

---

## PART 8 — REFUNDS AND CANCELLATION

| Situation | What happens |
|---|---|
| Traveller cancels within the free window | Deposit refunded in full, back to the **same card**, through the gateway |
| Traveller cancels inside the window | Deposit retained per the written policy, and the guest is told the amount and the reason |
| Traveller cancels and rebooks | The deposit can be moved to the new dates rather than refunded — better for both |
| Motel cancels (overbooking, a fault) | **Full refund immediately**, plus an apology and an offer of an alternative. This must be automatic, not negotiated |
| Guest arrives and the room is not as described | Partial refund or a room change, initiated from the portal |
| Card expired or closed | Refund to the original card fails; the desk is alerted and arranges a bank transfer instead |

**Every refund is recorded** in `payments` as a negative amount, with the reason, the actor and the
Malawi timestamp. Refunds are where trust is either kept or destroyed, so they must be auditable.

---

## PART 9 — THE DIASPORA AND THIRD-PAYER PROBLEM

A very common Malawian pattern: a relative abroad pays for a room that a family member uses.

| Problem | Solution |
|---|---|
| The payer and the guest are different people | The **payer** holds the account and pays; the **guest** is linked to the booking. The payer sees the booking and the receipt; the guest sees the room, the folio and the messages |
| The guest has no email | The payer creates the account; the guest gets a phone-number account, or uses the room QR route |
| The payer wants to control the spend | A **spending limit** on the room folio — orders above it require the payer's approval. This is genuinely reassuring to someone paying from abroad |
| The payer is not there to complain | The desk sees clearly who is paying and who is staying, and can contact the right one |
| Corporate payer | An employer books and pays; the employee stays. Same mechanism, attached to a corporate account |

Without this, the motel either refuses the booking or creates a mess of "my son paid for this".

---

## PART 10 — WHAT CHANGES IN THE APP, THE PORTAL AND THE WEBSITE

### 10.1 The guest app — the traveller's offline travel document

This is a strong, specific reason for a traveller to install the app, and it should be said to them:

> **The app holds your booking confirmation, your address, the phone number and your room number — and
> it works with no internet.**

A traveller landing at Kamuzu International at 23:00 with no local SIM, no data and no printed
confirmation can open the app and see everything. That is worth more to them than ordering breakfast.

Additional app features for travellers:

| Feature | Why |
|---|---|
| **Arrival guide, downloadable and cached** | Works with no signal |
| **"Get directions"** | Deep-links to Google Maps with the motel pinned |
| **"Call the front desk"** | One tap, with the country code already correct |
| **Airport pickup status** | Driver name, vehicle, meeting point, live updates |
| **Booking confirmation always available offline** | For visa, immigration or insurance questions |
| **Currency toggle** | See the bill in their own currency |
| **Time zone clarity** | Check-in and check-out times shown in Malawi time, with a note, because the guest's phone will be on another clock |

### 10.2 The portal — what the desk needs for travellers

| Feature | Why |
|---|---|
| **International booking flag** | So the desk knows this guest cannot be reached by Airtel Money or a local call |
| **Arrival time and flight details on the card** | So the desk knows when to expect them and whether to wait up |
| **Airport pickup task** | With the flight number, so the driver can be dispatched and the delay tracked |
| **Payer vs guest** | Clearly separated, so the desk contacts the right person |
| **Spending limit indicator** | So the desk knows when to seek approval |
| **Prepaid indicator** | So the desk never asks a prepaid guest for money again, and never releases their room without calling |

### 10.3 The website — the traveller's first contact

| Change | Why |
|---|---|
| **English-first, clear and simple** | The traveller may not be a confident English reader; short sentences, no local slang |
| **Prices with an indicative currency toggle** | MWK is meaningless abroad |
| **"Pay by card" visible on the room card** | It is the only method that works for them |
| **The full address, a map, and directions from the airport** | Their single biggest pre-booking question |
| **Reviews with names and dates** | Their single biggest trust signal |
| **The refund policy, in plain words, before payment** | Their single biggest hesitation |
| **Secure parking, 24-hour reception, Wi-Fi, and what the neighbourhood is like** | Safety questions they will not ask out loud |
| **Airport transfer bookable at the same time as the room** | With the flight number |
| **A downloadable arrival guide** | Before they travel |
| **SEO for how travellers actually search** | "hotel near Kamuzu airport", "accommodation Lilongwe Malawi", "where to stay Lilongwe", "Liwonde national park accommodation" — the motel is a base for the reserves and the lake |
| **`schema.org` with the price range and the aggregate rating** | Star ratings in Google results are the highest-converting element for a traveller comparing options |

---

## PART 11 — RECOMMENDATIONS

1. **Build the card gateway first, ahead of everything else in the payment workstream.** It is the only
   channel that works for the traveller, and the traveller is the only guest who reliably prepays.
2. **Make prepayment the default for international bookings, and full prepayment where possible.** A
   prepaid traveller is a confirmed guest.
3. **Never require a local payment method.** Airtel Money and TNM Mpamba stay for local guests, but they
   must never be the *only* options.
4. **Confirm a traveller who pays by card is `confirmed` immediately** — not `pending`. They have paid.
5. **Write the refund policy down and make it operationally real.** Refunds initiated from the portal,
   back to the original card, recorded and audited. This is the trust-clincher.
6. **Issue a proper tax invoice and a booking confirmation letter.** NGO and business travellers cannot
   be reimbursed without them, and tourists may need them for a visa.
7. **Send the arrival guide automatically, and make it work offline.** It is the document that removes
   the most arrival-day anxiety.
8. **Collect real arrival details: flight number, arrival window, and whether they need a pickup.** A
   missed pickup ruins a stay that was otherwise perfect.
9. **Guarantee late check-in in writing.** Travellers arrive at every hour, and the fear of being locked
   out at midnight is a real booking blocker.
10. **Support the diaspora payer explicitly** — payer and guest as separate roles, with an optional
    spending limit.
11. **Show an indicative currency toggle, and label it honestly.** MWK alone loses bookings; a fake
    precision loses trust.
12. **Tell travellers about the app as an offline document, not as an ordering tool.** That is the pitch
    that actually lands with someone about to board a flight.

---

## PART 12 — IN SHORT

The travelling guest is the one who cannot use a single payment channel the system currently offers —
no Airtel Money, no TNM Mpamba, no practical bank transfer, no kwacha in their pocket on arrival. They
are also the only guest who reliably pays in advance, which is what makes a 10-room motel's cash flow
predictable. So the requirement is not "add cards as an option"; it is that **a guest in London, Lusaka
or New York must be able to find the motel, see the price in their own currency, pay a deposit with their
own card, and hold a confirmed room — without speaking to anyone.**

That means building the card gateway first, confirming a card payment immediately rather than leaving it
pending, requiring prepayment for international bookings, writing a refund policy that the system then
actually honours, issuing a proper tax invoice and a booking confirmation letter for reimbursement and
visas, collecting real arrival details including flight numbers and airport pickups, guaranteeing late
check-in in writing, and sending an arrival guide that works with no internet on a phone with no local
SIM.

And it means remembering that for this guest the app is not a food-ordering convenience — it is the
document they will open at 23:00 at Kamuzu International with no signal, to find out which room they are
in and what number to call.
