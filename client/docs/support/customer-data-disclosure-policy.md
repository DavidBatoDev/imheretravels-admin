# Customer Data Disclosure Policy

**Who this is for:** anyone who talks to customers (support, partnerships/comms, admin) — and the devs who build what those people can see.
**What it does:** tells you, field by field, **what you may share with a customer, what needs identity verification first, and what must never leave our systems.**
**Why it exists:** prompted by incident `SB-IHF-20270319-FM012` (a disputed booking where the temptation was to quote card details back to the customer). See `docs/incidents/` for the case.

*Last updated: 2026-07-17.*

---

## 1. The three rules (read this even if you read nothing else)

1. **Verify who you're talking to before sharing anything account-specific.** Replying on the original email thread to the address on file is our baseline check. If someone contacts us from a *different* address/number, or the request is high-stakes (refund, cancellation, "who paid"), confirm identity first (booking ID + name + email on file, at minimum).
2. **Only ever share a customer's *own* data — never anyone else's.** Group bookings and shared cards mean "their booking" can contain other people's personal and payment information. When in doubt, don't.
3. **Card/payment specifics and system internals never go in an email or chat.** Booking facts (what, when, how much) — fine. Card numbers, tokens, internal IDs, our costs/margins — never. If a customer needs to resolve a card issue, that's a **bank-to-bank / verified channel**, not us.

> **Golden test before you hit send:** *"Is this the customer's own booking information, and would I be comfortable if this exact text were read out to a stranger holding only this person's email address?"* If yes → fine. If it involves a card, a token, an ID, or someone else → stop.

---

## 2. Disclosure tiers — quick reference

| Tier | Meaning | Examples |
|---|---|---|
| ✅ **Shareable** | May be stated to the verified customer about their **own** booking | Booking ID, tour name, tour dates, amount paid, balance, due dates, booking status |
| ⚠️ **Verify first** | Only after you're satisfied you're speaking to the account holder, and only *their* data | Their DOB, nationality, phone, saved email; anything about additional guests |
| 🚫 **Never** | Must not be disclosed to any customer, ever, under any framing | Card details, Stripe/Firestore IDs, tokens, client secrets, access tokens, our internal costs/fees, risk scores, internal notes |

---

## 3. Field-by-field guide

### 3.1 Booking record (`bookings` collection)

| Field(s) | Tier | Notes |
|---|---|---|
| `bookingId`, `bookingCode`, `tourCode` | ✅ | The customer's own reference — fine to confirm. |
| `tourPackageName`, `formattedDate`, `tourDate`, `returnDate`, `tourDuration` | ✅ | Their trip details. |
| `reservationDate`, `bookingStatus`, `paymentProgress` | ✅ | Status facts. |
| `firstName`, `lastName`, `fullName`, `emailAddress` | ⚠️ | It's *their* identity — fine to confirm back to a verified holder, but don't broadcast it or confirm it to a third party as a way of "looking someone up." |
| `reservationFee`, `paid`, `remainingBalance` | ✅ | How much was paid / is left — reassuring and fine to share. |
| `fullPaymentDueDate`, `paymentTerm1..4` (due date / amount / date paid) | ✅ | Payment schedule — fine. Share the schedule, not the internal string formatting. |
| `paymentPlan`, `paymentCondition`, `paymentMethod` | ✅ | "You're on a 4-installment plan," etc. |
| `originalTourCost`, `discountedTourCost`, `discountType`, `discountRate`, `eventName` | ⚠️ | The price *they* pay is fine; don't expose internal discount logic or imply a price others got. |
| `manualCredit`, `creditFrom`, `travelCreditIssued`, `adminFee`, `nonRefundableAmount`, `refundableAmount`, `supplierCostsCommitted` | 🚫 | **Internal financials / our cost commitments and margins.** Communicate a refund *decision and amount*, never the internal breakdown or what we owe suppliers. |
| `totalLateFees`, `p1..p4LateFeesPenalty`, late-fee notice links | ⚠️ | A late fee they owe can be explained; don't share internal calc fields or raw links. |
| `reasonForCancellation`, `cancellationScenario`, `isNoShow` | 🚫 | Internal classification/notes. Discuss the outcome, not our internal labels. |
| `reservationEmail`, `includeBcc*`, `emailDraftLink`, `sentEmailLink`, `subjectLine*`, `generate*Draft` | 🚫 | Internal email-ops plumbing (drafts, BCC config, Gmail links). Never customer-facing. |
| `enablePaymentReminder`, `sentInitialReminderLink` | 🚫 | Internal reminder plumbing. You can say "reminders are paused"; don't share the flag/links. |
| `access_token` | 🚫🔴 | **CRITICAL.** This token is what lets someone open the public **booking-status page with no login**. Anyone with it can view the booking. Never share it, never paste the tokenised status URL to anyone but the booking's own verified owner. Treat like a password. |
| `paymentTokens` (`token`, `stripePaymentDocId`, etc.) | 🚫🔴 | **CRITICAL.** Per-installment payment tokens — effectively keys to take/authorise a payment. Never disclose. |
| `id` (Firestore doc ID), `groupId` | 🚫 | Internal identifiers. Use the human `bookingId` with customers. |

### 3.2 Stripe payment record (`stripePayments` collection) & live Stripe

| Field(s) | Tier | Notes |
|---|---|---|
| `payment.amount`, `payment.currency`, `payment.type` | ✅ | "£250 reservation fee" — fine. |
| `payment.status` (e.g. `reserve_paid`) | ⚠️ | Say it in plain English ("your reservation is paid"), not the raw status code. |
| `customer.email` | ⚠️ | Confirm to the verified holder only. |
| `customer.birthdate`, `customer.nationality` | ⚠️ | Sensitive personal data. Confirm to the verified holder only; never to anyone else. |
| `booking.additionalGuests[]` (other people's name/email/DOB/nationality) | 🚫 | **Someone else's personal data.** Do not disclose one traveller's details to another, including the main booker, without that person's basis to receive it. |
| `stripeIntentId`, `id`, `bookingDocumentId`, `payment.clientSecret` | 🚫🔴 | **CRITICAL.** Stripe intent/charge IDs, Firestore IDs, and especially the **`clientSecret`** are internal/security-sensitive. The client secret can be used to interact with the payment. Never send any of these to a customer. |
| **Card details** — last-4, brand, expiry, `fingerprint`, issuer/bank, `billing_details.name`, country (from live Stripe) | 🚫🔴 | **NEVER, under any framing.** We often can't even prove the card belongs to the person emailing us — quoting it can hand one person **another person's** payment data (a data-protection breach) and can arm a chargeback. If a customer disputes a card charge, direct them to their **card-issuing bank**; we cooperate with the bank's verification, we don't disclose card data ourselves. |
| Stripe **Radar risk / risk score**, decline codes, network status | 🚫 | Internal fraud signals. Never share with customers. |

### 3.3 Emails / notifications / internal ops

| Field(s) | Tier | Notes |
|---|---|---|
| `scheduledEmails` status, cron/queue internals, notification IDs | 🚫 | Internal. "Your reminders are paused" is fine; the mechanics are not. |
| Internal notes, admin comments, escalation labels | 🚫 | Never customer-facing. |

---

## 4. If a customer pushes for something on the 🚫 list

Stay warm, hold the line, redirect:

> "For security and privacy reasons we're not able to share payment-card or account-security details by email. If you believe a card was used without your permission, your card-issuing bank can investigate that with you directly — and we're very happy to cooperate with any checks they need."

Do **not** confirm-or-deny card specifics even indirectly ("was it a Visa?", "did it end in 42-something?"). "We can't discuss card details by email" is the whole answer.

---

## 5. What you *can* always do (so this doesn't feel restrictive)

You can fully reassure a verified customer about **their own booking**:
- what they booked and the dates,
- how much was paid and what's outstanding,
- that no automatic charges happen and no card is stored,
- the status of reminders, refunds decisions, and next steps.

That covers ~95% of what customers actually want. The policy only removes the small set of things that are *someone else's*, *a secret/key*, or *our internal numbers*.

---

## 6. For developers — building this in

The disclosure tiers above should be enforced by the system, not just by people:

- **Public/customer-facing surfaces** (booking-status page, customer emails, any future customer API) must only ever read ✅-tier fields. Never serialise `access_token`, `paymentTokens`, `clientSecret`, `stripeIntentId`, internal cost fields, or other travellers' PII into a customer-visible payload.
- **Treat `access_token` and `paymentTokens.token` as secrets** — never log them, never include them in emails except the single intended tokenised link to the booking's own owner.
- When adding a **new field** to `Booking` or `StripePaymentDocument`, tag its disclosure tier here in the same PR. New fields default to 🚫 until classified.
- Ties into the incident remediations: capturing `billing_details.name` (rec #14) and provenance logging (rec #9) both add sensitive fields — classify them 🚫/⚠️ on arrival.

---

*Questions or a field that isn't listed? Default to "don't share" and check with an admin. CONFIDENTIAL — internal policy.*
