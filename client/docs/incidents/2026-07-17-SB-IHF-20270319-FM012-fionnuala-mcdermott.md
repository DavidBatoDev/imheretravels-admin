# Incident Report & Root Cause Analysis

| | |
|---|---|
| **Subject** | Disputed booking / "I never made this booking" claim |
| **Booking** | `SB-IHF-20270319-FM012` · Firestore doc `bookings/s1dAn3lCrgAVoTYbs6NA` |
| **Customer of record** | Fionnuala McDermott — fiomcdermott890@gmail.com — +353 85 743 2178 (Ireland) |
| **Tour** | India Holi + Yoga with Dev — departs 2027-03-19 (13 days) |
| **Reported by** | Admin (Bella) — customer escalation email, 2026-07-17 |
| **Prepared** | 2026-07-17 · Source: production Firestore (`imheretravels-a3f81`) + live Stripe |
| **Status** | **INVESTIGATION COMPLETE — INCIDENT OPEN.** Evidence gathering, root-cause analysis, and the reminder freeze are done. The incident is **not closed**: customer resolution, identity confirmation, chargeback-window exposure, the booking's commercial disposition, and all remediation remain open. See §0.1 for open items and close-out criteria. |

> **Evidence note (2026-07-17).** The *investigation* is evidence-complete. Live Stripe was re-queried read-only on 2026-07-17 (`livemode=true`, PaymentIntent `pi_3TmX9ZFv3pifuM661u8abHbD`) and independently reproduces every figure in §2.3 — 3 attempts, 3 distinct Irish Visa debit cards, `risk=normal` throughout, billing name blank on all charges, **0 disputes**. Dashboard screenshots corroborate and add issuer detail (see §2.3). This closes the fact-finding — it does **not** close the incident (see §0.1).

## 0.1 Incident status — what is closed vs open

| Workstream | State | Owner |
|---|---|---|
| Investigation / evidence (Stripe + Firestore) | ✅ **Complete** | — |
| Root-cause analysis | ✅ **Complete** | — |
| Reminder freeze (P2/P3/P4 cancelled) | ✅ **Done 2026-07-17** | Admin |
| Customer reply | 🟡 **Drafted, not sent** — awaiting send + her response | Bella |
| Identity of paying card (hers vs companion's) | 🔴 **Open** — bank screenshot + companion check outstanding | Bella / customer |
| Chargeback exposure | 🔴 **Open** — dispute window runs ~until **2026-10-27** (~120 days from 29 Jun charge); monitor | Admin |
| Commercial disposition of the booking (0/4 paid; £1,049 unlikely to be paid; seat held for 2027-03-19 departure) | 🔴 **Open — undecided** | Ops / management |
| Bella's early written commitments ("non-refundable", "you entered your information") as liability if card isn't hers | 🔴 **Open risk** | Bella / management |
| Root-cause remediation (email verification, KYC, form re-order, billing-name capture, provenance/attempt logging) | 🔴 **Not started** — same defect can recur | Dev / Product |

**Close-out criteria — the incident is CLOSED only when all of:**
1. Customer reply sent **and** the matter is resolved with her (accepted, withdrawn, or adjudicated), **or** the chargeback window passes with no dispute (or a filed dispute is won);
2. The booking's commercial disposition is decided and actioned (kept, cancelled, or seat released);
3. At minimum the **P0 root-cause fix — pre-payment email/code verification (§8.2 #5)** — is shipped so this cannot silently recur.

Until then, treat this as **OPEN / monitoring**.

---

## 0. Quick access links

*Internal use. Firestore-console and Stripe links require login as an authorised admin; the public booking-status link needs no login (it carries the booking's access token).*

| Resource | Link |
|---|---|
| Booking status page (customer's own view, no login) | https://admin.imheretravels.com/booking-status/vM7HM6qQ2KSZ2p7tPhf-HTBYxhv9q0bxS0gu1BaQOrY |
| Admin → Bookings grid (search `FM012`) | https://admin.imheretravels.com/bookings |
| Firestore console — `booking` doc | https://console.firebase.google.com/project/imheretravels-a3f81/firestore/databases/-default-/data/~2Fbookings~2Fs1dAn3lCrgAVoTYbs6NA |
| Firestore console — `stripePayments` doc | https://console.firebase.google.com/project/imheretravels-a3f81/firestore/databases/-default-/data/~2FstripePayments~2FEz9sIKkrQb2NveHBJ4VJ |
| Stripe — PaymentIntent (live) | https://dashboard.stripe.com/payments/pi_3TmX9ZFv3pifuM661u8abHbD |
| Stripe — search by customer email | https://dashboard.stripe.com/search?query=fiomcdermott890%40gmail.com |
| Admin → P1 reminder email (sent 2026-07-16) | https://admin.imheretravels.com/mail/payment-reminders?emailId=syQmBoZy5Afn2YIKCCCz |
| Admin → P2 / P3 / P4 reminders | …?emailId=UVpztzShO9rcc4XKcQzY · …=YVbYaSfil2QJ9XR5KTcG · …=lYDrgmYUrDSvWfiI3e4Z |
| Sent Gmail — booking confirmation | https://mail.google.com/mail/u/0/#sent/19f13b57ced9ce81 |
| Sent Gmail — initial reminder | https://mail.google.com/mail/u/0/#sent/19f13b58cc4d9af4 |

---

## 1. The complaint & full correspondence

The customer was prompted to write in because she received the automated **P1 installment reminder** ("Payment Reminder – Fionnuala McDermott – P1 Due", sent by Bella | ImHereTravels, 2026-07-16 10:33 local). That email showed: Amount Due **£262.25**, Due 2026-07-31, method Stripe, and a Payment Tracker (Reservation Paid £250, Total Fees £1,299, Paid Installments £0, Total Paid £250, Total Unpaid £1,049) — all corroborating §2.

The e-mail thread that followed (admin timezone UTC+8; transcribed from screenshots of Bella's inbox on the `fiomcdermott890@gmail.com` thread):

| # | When (local) | From | Message (verbatim / key content) |
|---|---|---|---|
| 1 | Jul 16, 10:30 PM | Fionnuala | "I have noticed in my emails that I apparently have a trip to India booked which I don't seem to have booked? It is also not coming out of my bank account so not sure what's happening – I'll send a screenshot here. **Can you cancel and refund the money?**" |
| 2 | Jul 17, 10:43 AM | Bella | "I looked into your booking, and I can see what happened. There were **three payment attempts**: June 26 – Transaction failed; June 29 – First transaction failed; June 29 – A second transaction was successful, which confirmed your India booking. Because the successful payment was processed and you entered your information into our booking system, the booking was automatically created. Unfortunately, as outlined in our Booking Terms & Conditions, **the deposit is non-refundable**, so we cannot issue a refund." — Bella Millan, Partnerships & Communications Manager |
| 3 | Jul 17, 1:52 PM | Fionnuala | "I think you're missing what I'm saying – I'm telling you **I didn't make the booking and the money is not coming out of my account** so I don't know what account it's coming out of? It's an incorrect booking or a scam so surely the deposit can be returned? **I never entered my details**… Surely it is proof that when the payments failed **they sourced a different card**? You must be able to resolve this or I will find someone who will be able." |
| 4 | Jul 17, 3:07 PM | Bella | "We apologize for this issue. I have escalated this to [our] department and they will investigate. We'll get back to you as soon as possible." |
| 5 | Jul 17, 3:13 PM | Fionnuala | "**Can you put a freeze on the rest of the payments going out** while you are waiting to resolve this issue?" |
| 6 | Jul 17, 3:15 PM | Bella | "We don't have access to your card because **we don't do auto payments**. The email you received yesterday was a payment reminder where a guest would need to **manually put in their card information** to pay the installment." |

**Her four factual claims to test against our records:**

1. "I didn't make the booking."
2. "The money is not coming out of my account / I don't know what account it's coming from." *(She offered to send a bank screenshot showing no charge.)*
3. "I never entered my details."
4. "When the payments failed they sourced a different card."

> ⚠️ **Two admin-side notes already visible in the thread:**
> - Bella has already committed us to a "non-refundable deposit" position (msg #2) and asserted as fact that the customer "entered your information" — before the paying card's identity was verified (§7). Because the paying card's *name* is unprovable, the final reply (§8.1) **leads with facts, not accusation**.
> - Bella's msg #6 (no auto-payments, manual card entry) is correct and matches our data — good.

---

## 2. What the database actually shows

### 2.1 The booking (`bookings/s1dAn3lCrgAVoTYbs6NA`)

| Field | Value |
|---|---|
| Booking ID | `SB-IHF-20270319-FM012` |
| Created | 2026-06-29 14:07:18 UTC |
| Created by | Stripe webhook (`booking.creationLock = "webhook"`) — i.e. self-service reservation form, **not** admin-entered |
| Booking type | Single Booking (`groupSize` 1, `groupId` empty) |
| Traveller | Fionnuala McDermott · fiomcdermott890@gmail.com |
| Tour | India Holi + Yoga with Dev · 2027-03-19 → 2027-03-31 |
| Original cost | £1,299 |
| Reservation fee | £250 — paid |
| Payment plan | P4 (4 installments of £262.25) selected 2026-06-29 14:08:01 UTC |
| Remaining balance | £1,049 |
| Installments paid | 0 / 4 (`paymentProgress = 0%`) |
| Payment method | Stripe |
| Status | Installment 0/4 |

### 2.2 The Stripe payment (`stripePayments/Ez9sIKkrQb2NveHBJ4VJ`)

| Field | Value |
|---|---|
| Stripe PaymentIntent | `pi_3TmX9ZFv3pifuM661u8abHbD` |
| Amount / type | £250 GBP · `reservationFee` |
| Status | `reserve_paid` (captured — real money received) |
| Intent first created | 2026-06-26 10:38:33 UTC |
| Payment failed at | 2026-06-29 14:06:39 UTC |
| Payment succeeded at | 2026-06-29 14:07:16 UTC (37 s later) |
| Customer captured | Fionnuala McDermott · fiomcdermott890@gmail.com · +353 85 743 2178 · Ireland · DOB 1997-03-17 |

> **Attempt history — Firestore vs Stripe.** Bella's look-up (msg #2) found three attempts: Jun 26 failed, Jun 29 failed, Jun 29 succeeded. Our `stripePayments` record only persists **one** `failedAt` (the Jun 29 failure) plus the intent `createdAt` of 2026-06-26 (which lines up with the Jun 26 failed attempt). Our own DB under-records the attempt history — it keeps only the latest failure timestamp. **Stripe is the authoritative attempt log** — the full three-attempt detail is in §2.3. Three attempts over 3 days, the last two 37 s apart, reads as a person re-trying a declining card, not an automated card-testing burst (which fires many cards within seconds).

### 2.3 Card details & full attempt log — retrieved from live Stripe (re-verified 2026-07-17)

Neither our `bookings` nor `stripePayments` record stores card data. Pulled directly from live Stripe (`pi_3TmX9ZFv3pifuM661u8abHbD`, `livemode=true`) via read-only script `admin/client/scripts/stripe-attempts.js`. Three charge attempts, three different cards:

| Attempt | Time (UTC) | Charge ID | Card | Type / Country | Issuer (from dashboard) | Result | Decline reason | Radar risk |
|---|---|---|---|---|---|---|---|---|
| #1 | 2026-06-26 10:39:50 | `ch_…XwHCXMC` | Visa ••••0731 (exp 08/28) | debit · IE | Allied Irish Banks, P.L.C. | failed | `insufficient_funds` — "card has insufficient funds" | normal |
| #2 | 2026-06-29 14:06:36 | `ch_…PxT9gO6` | Visa ••••3009 (exp 02/30) | debit · IE | Bank of Ireland | failed | `insufficient_funds` — "card has insufficient funds" | normal |
| #3 | 2026-06-29 14:07:14 | `ch_…vuJA0mH` | Visa ••••4208 (exp 09/29) | debit · IE | Bank of Ireland | **succeeded** | — | normal |

**Distinct cards: 3** (••••0731, ••••3009, ••••4208), across **two different Irish banks** (AIB + Bank of Ireland). **Disputes / chargebacks: 0.** CVC check **passed** on the successful charge. Cardholder **name & billing email were NOT captured** by our checkout (blank on all three charges — see §5.3 / rec #13), so we can identify the cards' brand/type/country/issuer but **not the holder's name**.

**What this establishes:**

- All three are **genuine Irish (IE) Visa debit cards** from real Irish retail banks — consistent with the customer's stated nationality (Ireland) and `+353` mobile.
- Both failures were `insufficient_funds` (a real bank "not enough money" decline), and Stripe **Radar risk = normal** on every attempt. This is the fingerprint of **a real person/people paying a deposit** and switching cards when one lacks funds — **not** card-testing or stolen-card fraud (which shows do-not-honor/lost-stolen declines, foreign/mismatched BINs, and elevated risk).
- **No chargeback exists.** This all-but-eliminates the stolen-card / unauthorised-third-party scenario (§5.2).

### 2.4 The emails she is receiving (`scheduledEmails`)

| Reminder | Subject | Status |
|---|---|---|
| P1 | "Your 1st Installment … Due on 2026-07-31" | **SENT 2026-07-16** ← the email that triggered her reply |
| P2 | "…2nd Installment … Due 2026-08-28" | ~~pending~~ → **cancelled 2026-07-17** (freeze) |
| P3 | "…3rd Installment … Due 2026-09-25" | ~~pending~~ → **cancelled 2026-07-17** (freeze) |
| P4 | "…Final Installment … Due 2026-10-30" | ~~pending~~ → **cancelled 2026-07-17** (freeze) |

These are reminder emails for manually-paid installments. No installment has been auto-charged (0/4, 0%). P2/P3/P4 were cancelled per the freeze request (§8.1 #1).

### 2.5 Fraud-pattern checks (all negative)

- **One** booking only under this email/phone — no repeats.
- **One** successful payment only — no rapid multi-attempt "card-testing" burst.
- Personal data is **internally consistent**: Irish name + Irish mobile (`+353`) + Ireland nationality + plausible DOB (age 29).

---

## 3. Timeline (UTC)

*Times are UTC unless a local (UTC+8, admin) clock time is given for the email thread.*

| When (UTC) | Event |
|---|---|
| 2026-06-26 10:38 | Reservation started on public form; PaymentIntent created; details entered (name, email, Irish mobile, DOB, nationality). **Attempt #1 FAILED** — Visa debit ••••0731 (IE, AIB), insufficient funds |
| *(3-day gap)* | Reservation left incomplete |
| 2026-06-29 14:06:39 | **Attempt #2 FAILED** — Visa debit ••••3009 (IE, BoI), insufficient funds |
| 2026-06-29 14:07:16 | **Attempt #3 SUCCEEDS** — Visa debit ••••4208 (IE, BoI) → £250 captured (`reserve_paid`) |
| 2026-06-29 14:07:18 | Booking doc created by Stripe webhook |
| 2026-06-29 14:08:01 | P4 installment plan selected |
| 2026-06-29 14:08:09 | Booking-confirmation email sent |
| 2026-07-01 12:16 | Booking last modified |
| 2026-07-16 02:33 (10:33 local) | P1 installment reminder sent |
| 2026-07-16 10:30 PM local | Customer: "I don't seem to have booked… can you cancel and refund?" |
| 2026-07-17 10:43 AM local | Bella: explains 3 attempts; states deposit **non-refundable** |
| 2026-07-17 1:52 PM local | Customer escalates: "I never entered my details… they sourced a different card" |
| 2026-07-17 3:07 PM local | Bella escalates internally |
| 2026-07-17 3:13 PM local | Customer: "put a freeze on the rest of the payments" |
| 2026-07-17 3:15 PM local | Bella: no auto-payments; installments are manual |
| **2026-07-17** | **Live Stripe re-verified read-only; P2/P3/P4 reminders cancelled (freeze); report finalized** |

---

## 4. Claim-by-claim assessment

| Her claim | What the records show | Verdict |
|---|---|---|
| "I never entered my details" | Details are specific and correct to her — Irish mobile, DOB 1997-03-17, nationality. In a Stripe Elements flow the system **cannot** charge a card that was never entered client-side; a human entered a card **twice** (one declined, one approved) and CVC was passed. | **Contradicted.** A person affirmatively completed the form and payment. |
| "When the payments failed they sourced a different card" | Three **different** Irish Visa debit cards, from **two** different Irish banks, were manually entered (••••0731, ••••3009 declined for insufficient funds; ••••4208 succeeded). Our system cannot "source" a card — a human typed each one in. | **Wrong cause.** Real people re-entered real cards; nothing was auto-sourced. |
| "The money is not coming out of my account" | Possible — the successful card (••••4208, Bank of Ireland) may be a companion's, or one of her own she doesn't monitor. All three are Irish debit cards. Only £250 was ever taken; installments are not auto-charged. Cardholder name wasn't captured, so we can't say whose. | **Possibly true, but** the cards are genuine Irish debit cards, not an unknown "account" the system invented. |
| "I didn't make the booking" | Someone with her exact details, using three Irish debit cards from two Irish banks (two of which ran out of funds), completed it. Not fraud/stolen-card. Either she did it, or an Irish associate did it for/with her. | **Unresolved on identity, resolved on legitimacy** — it was a genuine, human, non-fraudulent booking. |

---

## 5. Root cause analysis

### 5.1 Why this booking exists at all — the enabling defect

**The public reservation flow lets anyone create a booking under any email address, with no proof of email ownership.**

`POST /api/stripe-payments/init-payment` accepts an arbitrary `email` in the request body and immediately creates a PaymentIntent + booking record. There is **no email verification step** (no OTP, no confirmation link) before the booking and reminder-email cycle are created. (The only "verify" routes in the codebase — `/stripe-payments/verify`, `/verify-payment` — verify the Stripe *payment*, not the *person's email*.)

**Consequence:** a booking can be created *for* someone (by a friend booking a group trip, or by a bad actor) and that person then starts receiving payment reminders for a booking they don't recognise. This single gap explains every confusing element of this case.

### 5.2 Most likely scenario

Ranked by fit to the evidence (with the card data in — §2.3):

1. **A legitimate Irish booking made by her or an Irish associate (most likely).** Three genuine Irish Visa debit cards from two Irish banks were tried; two declined for insufficient funds before a third succeeded. That is exactly how a real person (or a small group pooling cards) pays a deposit. If a companion's card ultimately paid, her statements ("I didn't make it", "money isn't from my account") are literally true and innocent. **We were paid legitimately.**
2. **Friendly fraud / dispute.** She made it herself (or knows who did) and is now denying it to reclaim the £250. Contestable — we hold proof of three real Irish cards, insufficient-funds declines, and normal Radar risk.
3. **Third-party card fraud (effectively ruled out).** Stolen-card use would show do-not-honor/lost-stolen declines, foreign or mismatched BINs, elevated Radar risk, and often a later chargeback. Here: all Irish debit, both declines are insufficient funds, risk normal, zero disputes. **Not this.**

**Not a scam against us.** The residual exposure is a friendly-fraud chargeback, and even that we are well-positioned to contest.

### 5.3 Contributing factors

- **No email-ownership verification** (§5.1) — root cause of the "I don't recognise this booking" confusion.
- **Our checkout doesn't capture the cardholder's billing name/email** — so even with full Stripe access we cannot mechanically prove whose cards these are. Capturing billing name would have resolved this case instantly (rec #13).
- **Failed-then-retry with different cards carries no friction/flagging**, which in volume would also permit card testing (not the case here — genuine insufficient-funds declines — but the same gap).

---

## 6. Is this a legit customer or a scammer?

**Assessment: a legitimate, non-fraudulent booking — not a scammer.** "Legitimate" may still mean someone booked her without her clearly remembering/authorising it (the §5.1 defect), but the payment itself is genuine.

- **For legitimacy:** three real Irish Visa debit cards from two Irish banks; two declined for insufficient funds; Radar risk **normal** throughout; CVC passed; **no chargeback**; correct/consistent personal data; normal 9-month booking horizon.
- **Against fraud:** none of the stolen-card/card-testing signals are present (no foreign/mismatched BINs, no do-not-honor/lost-stolen declines, no velocity burst, no elevated risk, no dispute).

**Residual risk:** a friendly-fraud chargeback — which we are well-positioned to contest with the §2.3 evidence.

**Confidence: HIGH** on legitimacy/non-fraud. The only thing still unprovable is the **cardholder's name** — our checkout never captured it (§5.3, rec #13) — so we can't mechanically confirm the cards are hers vs. a companion's.

---

## 7. Stripe check — completed & re-verified 2026-07-17

Pulled live from Stripe (§2.3). Results:

1. **Cardholder name / billing details** — ❌ **not captured** by our checkout (blank on all charges). This is the only thing left unresolved, and it's a product gap, not a Stripe limitation (rec #13).
2. **Card country & last-4** — three different Irish (IE) Visa debit cards: ••••0731 (AIB), ••••3009 (BoI) — both declined, insufficient funds — and ••••4208 (BoI, succeeded). All domestically consistent with the customer.
3. **Dispute/chargeback** — ✅ **none filed.**
4. **Radar / risk** — ✅ **normal** on all three attempts; no flags. CVC passed on the successful charge.

**Verdict:** genuine Irish debit cards + insufficient-funds declines + normal risk + CVC passed + no dispute ⇒ **legitimate, non-fraudulent payment** (§6). Whether the paying card is hers or a companion's cannot be proven (no cardholder name), but that distinction only affects *who to point her to* — not whether this was fraud.

---

## 8. Recommended actions

### 8.1 Immediate (this ticket) — freeze done; reply pending send; disposition undecided

1. **Honour the freeze request** — ✅ **DONE 2026-07-17.** The pending reminders P2/P3/P4 (`scheduledEmails` UVpzt…/YVbYa…/lYDrg…) were set to `status: cancelled`, and `bookings/s1dAn3lCrgAVoTYbs6NA.enablePaymentReminder = false`.
   > **Operational note:** the send cron (`processScheduledEmails`) gates only on `scheduledEmails.status == "pending"` — it does **not** read `enablePaymentReminder` — so cancelling the docs is what actually stops the sends. P1 had already sent (Jul 16). Nothing is auto-charged.

2. **Decision on the £250 — booking stands / deposit retained.** This was **not** fraud (genuine Irish debit cards from two Irish banks, insufficient-funds declines, normal risk, CVC passed, no dispute), so we are **not** forced into a pre-emptive refund; the T&C non-refundable deposit position is defensible. Only consider goodwill/discretionary handling if she demonstrates it was booked entirely without her involvement — a **business call**, not forced by chargeback risk (which is low and contestable). *Caveat: we cannot prove the paying card is hers, so the customer reply leads with facts, not accusation.*

3. **Approved customer reply (send to the customer).** Factual, corrects the technical misconception, and gives her a constructive next step without accusing her. **Deliberately contains NO card details** (no last-4, no card count) — see the note below:

   > **Subject:** Re: Your India Holi + Yoga with Dev booking (SB-IHF-20270319-FM012)
   >
   > Hello Fionnuala,
   >
   > We understand your frustration and we're sorry for the worry this has caused. We've looked closely into booking **SB-IHF-20270319-FM012**.
   >
   > Our records show this reservation (India Holi + Yoga with Dev) was created on **29 June 2026** using your email address, **fiomcdermott890@gmail.com**, and a single **£250** reservation fee was paid at that time. To reassure you about the account: only that one £250 fee was ever taken — there are **no further or automatic charges**, no card is stored on file, and the installment reminders are now **paused**. Installments can only ever be paid by someone manually entering card details, so nothing is taken automatically.
   >
   > We can also see that the payment was completed by **manually entering card details at checkout** — our system cannot select or "source" a card on its own; the details have to be typed in during booking. For security and data-protection reasons we're not able to share payment-card information by email.
   >
   > Because this package involves non-refundable arrangements with our tour partners, we're unable to issue a direct refund. That said, we'd genuinely like to help you get to the bottom of this:
   >
   > - It's worth checking with any **travel companion or family member** who may have booked this India trip with or for you — a booking like this can be completed and paid by someone other than the traveller.
   > - If you're happy to share the **bank statement/screenshot** you mentioned, that will help us confirm whether the payment came from your account or someone else's.
   > - If you believe your card or details were used **without your consent**, we strongly recommend contacting your **card-issuing bank** straight away to report it and secure your account — we'll gladly cooperate with any verification they need.
   >
   > We'll keep the reminders paused while we work through this with you.
   >
   > Kind regards,
   > Bella Millan · Partnerships & Communications Manager · ImHereTravels

   > **Why no card details are disclosed in the reply:**
   > - **We can't prove the paying card is hers.** If ••••4208 belongs to a companion, telling Fionnuala "your card ending 4208" discloses a **third party's payment-card data to a non-cardholder** — a data-protection/GDPR problem, not just a wording choice.
   > - **It would contradict our own position.** "Your card" asserts the exact thing we cannot prove (§7) and undercuts the facts-not-accusation stance.
   > - **It could arm a chargeback.** In a friendly-fraud scenario, handing over the last-4 plus "unauthorised" language helps build an "unauthorised transaction" dispute.
   > - **No upside.** The last-4 doesn't help her understand anything; "cards are entered manually" corrects the "they sourced a different card" misconception without any specifics. Keep card/payment specifics for a bank-to-bank / identity-verified channel.
   > - Also: the cards are Visa **debit**, not credit — the reply avoids calling them credit cards.

4. **If a chargeback is later filed:** contest it with the §2.3 evidence pack (three real Irish cards from two Irish banks, insufficient-funds history, CVC passed, normal Radar risk, no auto-pay, booking + reminder audit trail). See rec #12.

### 8.2 Short term — CONFIRMED SAFEGUARDS (approved by admin 2026-07-17)

These three are the agreed priority fixes; each closes a gap this incident exposed.

5. **[CONFIRMED] Reservation-form code verification before Stripe** — send a one-time code / confirmation link to the entered email (and/or SMS to the entered mobile) and require the guest to enter it **before** proceeding to the Stripe payment step. This is the single highest-value fix — it kills the §5.1 root cause (unverified email → unrecognised booking + reminder cycle) by proving the person controls the contact details before any PaymentIntent or booking is created. *(Supersedes/implements original rec #6.)*

6. **[CONFIRMED] Re-order the reservation flow — guest information after step 1, with passport as a second verification factor.** Move the detailed guest-information form to *after* the initial step so that a passport (or government ID) capture can act as a **2-step verification** that the identity/details entered in step 1 are genuine and self-consistent. This raises the effort/traceability bar for creating a booking in someone else's name and gives us a stronger identity artefact on file. *(Feeds directly into KYC, rec #7, and payer↔traveller binding, rec #9.)*

7. **[CONFIRMED] KYC process.** Introduce a lightweight Know-Your-Customer step for reservations (identity + contact verification, escalating to document checks for higher-value or higher-risk bookings). Combined with #5 and #6, this ensures the person named on a booking has actually consented to and verified it before we begin any payment/reminder lifecycle. *(Umbrella for #5, #6, #9, #11.)*

8. **Add an "I didn't make this / not me" one-click link** to reminder and confirmation emails, routing to a self-service dispute/cancel flow — so recipients of unrecognised bookings have a safe exit instead of an angry escalation. *(Complements the KYC front door with a clean back door.)*

9. **Log booking provenance** — capture request IP, user-agent, and a `createdVia` marker on booking creation, so future "I didn't book this" claims can be adjudicated from our own data.

### 8.3 Future / systemic developments

10. **Bind payer ↔ traveller (rec #13 dependency):** capture and store (from Stripe) the billing name/country of the paying card, and flag when it doesn't match the traveller's name/nationality for manual review.
11. **Retry/velocity friction:** flag or lightly rate-limit "failed then immediately succeeded with a different card" and repeated attempts per email/IP — Stripe Radar rules + our own guard — to deter card testing.
12. **Group bookings — explicit consent:** when a booker adds another person as a traveller, require that traveller to confirm (tie into the code verification in #5) before we start charging-reminders in their name.
13. **Chargeback playbook:** a documented dispute pack (this report's data + Stripe evidence) so future disputes are contested/settled quickly and consistently.
14. **Capture cardholder billing name/email at checkout** — this case could only be *half*-resolved because our Stripe Elements setup never collected `billing_details.name`. Enabling billing-name collection makes "whose card is this?" answerable instantly and directly powers rec #10.
15. **Persist the full payment-attempt history:** our `stripePayments` doc keeps only the latest `failedAt`, so the Jun 26 failure was invisible in our own DB and Bella had to go to Stripe. Store every attempt (timestamp, outcome, decline code, card last-4, issuer) on the payment record so support can adjudicate "I didn't do this" claims without leaving the admin app.

---

## 9. Data sources

- **Prod Firestore** (`imheretravels-a3f81`), read 2026-07-17 via authenticated REST query.
  - `bookings/s1dAn3lCrgAVoTYbs6NA`
  - `stripePayments/Ez9sIKkrQb2NveHBJ4VJ` (PaymentIntent `pi_3TmX9ZFv3pifuM661u8abHbD`)
  - `scheduledEmails/{syQmBoZy5Afn2YIKCCCz, UVpztzShO9rcc4XKcQzY, YVbYaSfil2QJ9XR5KTcG, lYDrgmYUrDSvWfiI3e4Z}`
- **Live Stripe** (§2.3, §7), read 2026-07-17 (re-verified) with a restricted read-only key via `admin/client/scripts/stripe-attempts.js`:
  - PaymentIntent `pi_3TmX9ZFv3pifuM661u8abHbD` (`livemode=true`) + charges `ch_…XwHCXMC`, `ch_…PxT9gO6`, `ch_…vuJA0mH`; disputes query (0 results).
  - Dashboard screenshots (succeeded charge, both failed charges, transactions list) provided by admin 2026-07-17 — corroborate the API and add issuer detail (AIB / Bank of Ireland).
- **Email correspondence** (§1): screenshots of Bella's inbox — `fiomcdermott890@gmail.com` thread, "Payment Reminder … P1 Due" — provided by admin 2026-07-17; transcribed verbatim.
- **Code:** `admin/client/src/app/api/stripe-payments/init-payment/route.ts` (no email-ownership verification).

---

*CONFIDENTIAL — Internal incident report · SB-IHF-20270319-FM012 · Investigation complete 2026-07-17 · Incident OPEN (see §0.1)*
