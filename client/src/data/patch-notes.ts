export type PatchNoteCategory = "feature" | "improvement" | "fix" | "breaking";

export type PatchNote = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  version?: string;
  categories: PatchNoteCategory[];
  content: string; // markdown
};

export const PATCH_NOTES: PatchNote[] = [
  {
    slug: "stripe-only-payments",
    title: "Revolut & Ulster Removed — Stripe-Only Payments",
    description:
      "Revolut and Ulster have been discontinued as payment methods. Stripe is now the only payment option. Bookers with outstanding balances on Revolut were migrated to Stripe; settled and cancelled records are preserved unchanged.",
    date: "2026-06-19",
    version: "1.2.0",
    categories: ["breaking", "improvement"],
    content: `# Revolut & Ulster Removed — Stripe-Only Payments

## Summary

Per the client's decision, the **Revolut** and **Ulster** bank-transfer payment methods have been **discontinued**. **Stripe is now the only payment method.** Bookers who had selected Revolut and still owe money were moved to Stripe; fully-paid and cancelled bookings on Revolut/Ulster are kept untouched as historical records.

---

## What Changed

### 1. Affected bookings migrated to Stripe

The **8 Revolut bookings with an outstanding balance** were switched to Stripe. Each change is recorded in the booking's **version history** (old → new payment method) for a full audit trail. No customer emails were triggered by the switch.

### 2. Historical records preserved

Bookings already **fully paid (confirmed)** or **cancelled** on Revolut (49 bookings) or Ulster (1 booking) were **not changed** — they remain as-is for the record.

### 3. Payment pages & forms

- The booking-status **Pay Now** modal is now **Stripe-only** (the Revolut bank-transfer tab and screenshot upload were removed).
- The admin **Payment Method** dropdown now offers only Stripe.
- New bookings (including group guests) now default to **Stripe**.

### 4. Emails

Revolut and Ulster payment instructions were removed from the **Reservation**, **Initial Payment Reminder**, and **Scheduled Reminder** email templates. Customers now only see the Stripe option.

### 5. Transactions page

The **Revolut filter** and the Revolut payment listing / approval section were removed. The page now shows Stripe transactions only.

---

## What's Kept

- **"Revolut Pay" via Stripe** is retained — it is processed through Stripe (like Apple Pay / Google Pay), so it stays under the Stripe-only policy.
- All historical Revolut / Ulster booking and payment records remain in the system.

---

## Scope

| Group | Outcome |
|---|---|
| Revolut bookings with an outstanding balance (8) | Migrated to Stripe |
| Fully-paid / cancelled Revolut (49) and Ulster (1) bookings | Left unchanged |
| New bookings | Default to Stripe |

---

## Files Changed

| File | Change |
|---|---|
| \`create-bookings-from-payment.ts\` | Guest default payment method → Stripe |
| \`api/stripe-payments/select-plan/route.ts\` | Fallback payment method → Stripe |
| \`PayNowModal.tsx\` | Stripe-only checkout |
| \`booking-status/[bookingDocumentId]/page.tsx\` | Removed Revolut submission wiring |
| \`transactions/page.tsx\` | Removed Revolut filter, listing & approval |
| \`TransactionFilterDialog.tsx\` | Removed payment-method filter |
| \`payment-setting/payment-method.ts\` | Dropdown options → Stripe only |
| \`emailTemplates\` (+ source HTML, migrations 006 / 009) | Removed Revolut / Ulster instructions |
| \`revolut-payment-service.ts\`, \`types/revolut-payment.ts\`, \`on-revolut-payment-status-email.ts\` | Removed (manual-Revolut feature retired) |
`,
  },
  {
    slug: "2-month-final-payment-deadline",
    title: "2-Month Final Payment Deadline Policy",
    description:
      "Installment due dates for new bookings are now capped 2 calendar months before the tour departure date. Bookings made after this window require full payment within 48 hours.",
    date: "2026-06-02",
    version: "1.1.0",
    categories: ["feature", "breaking"],
    content: `# 2-Month Final Payment Deadline Policy

## Summary

Starting **June 1, 2026**, all new bookings must be **fully paid at least 2 calendar months before the tour departure date**. This policy is now enforced across installment scheduling, the booking reservation form, confirmation emails, and the bookings dashboard.

---

## What Changed

### 1. Installment Due Dates (P1–P4)

The installment schedule previously allowed the last payment to fall as late as **3 days before the tour**. Under the new policy, the last eligible installment date is now **2 calendar months before departure**.

| Scenario | Old cutoff | New cutoff |
|---|---|---|
| Tour: Aug 4, 2026 | Jul 31 (3 days before) | Jun 4 (2 months before) |
| Tour: Oct 15, 2026 | Oct 12 (3 days before) | Aug 15 (2 months before) |
| Tour: Dec 31, 2026 | Dec 28 (3 days before) | Oct 31 (2 months before) |

The cutoff uses **calendar months**, not 60 days. Aug 4 minus 2 months = Jun 4 exactly.

---

### 2. Eligible Last Fridays Count

The number of eligible last-Friday installment slots is now calculated against the 2-month cutoff rather than the 3-day cutoff. This determines the payment condition (P1/P2/P3/P4 or Last Minute Booking).

**Example — booking June 2, 2026 for August 5, 2026 tour:**
- 2-month cutoff = June 5
- Last Fridays before June 5 that are also more than 2 days after June 2: **none**
- Result: 0 eligible slots → **Last Minute Booking** → full payment within 48 hours

---

### 3. Payment Condition Logic

| Eligible slots | Condition |
|---|---|
| 0 (tour imminent, e.g. 3 days away) | Last Minute Booking — 48hr full payment |
| 0 (booked past the 2-month deadline) | Last Minute Booking — 48hr full payment |
| 1 | Standard Booking, P1 |
| 2 | Standard Booking, P2 |
| 3 | Standard Booking, P3 |
| ≥ 4 | Standard Booking, P4 |

---

### 4. Confirmation Emails

All draft confirmation emails now include a **Final Balance Deadline** notice showing the exact 2-month deadline date prominently.

The notice appears in:
- **Reservation draft email** (P1/P2/P3/P4 scenarios) — red notice box with the deadline date
- **Booking status confirmation email** (with QR code) — red sidebar notice above "What's Next?"

The 48-hour full payment scenario (Last Minute Booking) does **not** show this notice because the customer already needs to pay immediately.

---

### 5. Reservation Booking Form — Step 3

The payment plan selector in Step 3 now shows a red **"Final balance deadline: [date]"** notice above the plan options. This tells the customer their hard deadline before they choose a payment plan.

---

### 6. Bookings Dashboard

Each booking card in the dashboard now shows a **"Final Balance Deadline"** row:

| Colour | Meaning |
|---|---|
| Grey | Deadline is more than 30 days away |
| Amber + days remaining | Deadline within 30 days |
| Red + "Overdue" | Deadline has passed and balance not cleared |

---

## Policy Scope

### Applies to (new bookings)
All bookings with a **reservation date on or after June 1, 2026**.

### Does not apply (old bookings)
Bookings with a **reservation date before June 1, 2026** continue to use the original 3-day cutoff. Their installment schedules are unchanged.

---

## Scenarios

### Scenario A — Early booking, installments available
> **Reservation: January 15, 2026 → Tour: August 4, 2026**
>
> Pre-policy booking. Old 3-day cutoff applies.
> Eligible Fridays: Jan 30, Feb 27, Mar 27, Apr 24, May 29, Jun 26, Jul 31 → **P4**
> Last installment: **Jul 31, 2026** (unchanged)

---

### Scenario B — New booking, installments available
> **Reservation: June 1, 2026 → Tour: October 15, 2026**
>
> 2-month cutoff = **August 15, 2026**
> Eligible Fridays before Aug 15: Jun 26, Jul 31 → **P2**
> Last installment: **Jul 31, 2026** ✅ (before Aug 15 deadline)

---

### Scenario C — Booking made close to the 2-month mark
> **Reservation: June 2, 2026 → Tour: August 5, 2026**
>
> 2-month cutoff = **June 5, 2026**
> Last Fridays between June 4 (res+2 days) and June 5: **none**
> Result: 0 eligible → **Last Minute Booking** → full payment within 48 hours

This is intentional: the customer is booking when the installment window has effectively closed.

---

### Scenario D — Genuinely last-minute booking
> **Reservation: August 1, 2026 → Tour: August 5, 2026**
>
> 4 days before departure. Regardless of policy, 0 eligible Fridays.
> Result: **Last Minute Booking** → full payment within 48 hours

---

## Files Changed

| File | Change |
|---|---|
| \`p1-due-date.ts\` through \`p4-due-date.ts\` | 2-month cutoff for new bookings |
| \`eligible2ndofmonths.ts\` | 2-month eligible count for new bookings |
| \`booking-calculations.ts\` — \`getEligible2ndOfMonths\` | 2-month eligible count |
| \`booking-calculations.ts\` — \`generateInstallmentDueDates\` | 2-month due date cap |
| \`bookingFlow.ts\` — \`getEligibleLastFridayDates\` | 2-month cutoff in form preview |
| \`reservationEmail.html\` | Added \`{{ finalPaymentDeadline }}\` notice box |
| \`reservationConfirmationWithQR.html\` | Added Final Payment Deadline section |
| \`generate-reservation-email.ts\` | Computes \`finalPaymentDeadline\` template var |
| \`send-booking-confirmation-email.ts\` | Same |
| \`send-booking-status-confirmation.ts\` | Same |
| \`Step3PaymentPlanSelectorCard.tsx\` | Deadline notice in payment plan selector |
| \`BookingsSection.tsx\` | Final Balance Deadline label on booking cards |
`,
  },
];

export function getPatchNote(slug: string): PatchNote | undefined {
  return PATCH_NOTES.find((n) => n.slug === slug);
}

export const CATEGORY_LABELS: Record<PatchNoteCategory, string> = {
  feature: "Feature",
  improvement: "Improvement",
  fix: "Bug Fix",
  breaking: "Breaking Change",
};

export const CATEGORY_COLORS: Record<PatchNoteCategory, string> = {
  feature: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  improvement:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  fix: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  breaking: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};
