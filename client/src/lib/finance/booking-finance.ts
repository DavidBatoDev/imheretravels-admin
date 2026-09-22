/**
 * Booking finance — the single source of truth for every money figure shown
 * in the admin (Dashboard, Reports, and the Bookings page header).
 *
 * This module is PURE: no Firebase, no fetch, no React. It takes raw booking
 * documents and returns numbers. Both screens call the same functions, so any
 * figure that appears in two places is the same computation by construction.
 *
 * ── Definitions (see FINANCE_GLOSSARY for the user-facing wording) ──────────
 *
 *  Gross Revenue     Cash received. Reservation fee on the reservation date,
 *                    plus every instalment (P1–P4 or Full) on its paid date.
 *                    Includes payments on bookings that were later cancelled.
 *
 *  Refunded          Money returned on cancellation, dated on the
 *                    cancellation date. Taken from `refundableAmount`
 *                    (fallback `travelCreditIssued`). If a cancelled booking
 *                    has no refund recorded, it is treated as fully retained.
 *
 *  Net Revenue       Gross Revenue − Refunded. THE headline revenue figure.
 *
 *  Expected Revenue  Unpaid instalments whose due date has not yet passed,
 *                    dated on the due date. Cancelled bookings are excluded
 *                    (nothing more is expected from them).
 *
 *  Overdue Unpaid    Unpaid instalments whose due date + 1 day has passed,
 *                    dated on that day. Cancelled bookings are excluded.
 *
 *  Outstanding       Expected Revenue + Overdue Unpaid on active bookings:
 *  Balance           everything still owed to the business.
 *
 *  Cancelled         A booking whose status says "cancelled", dated on its
 *                    cancellation request date (fallback: cancellation email
 *                    date, then last update).
 *
 * All dates are LOCAL calendar dates (YYYY-MM-DD). A date range is inclusive
 * on both ends.
 */

import type {
  FinancialEvent,
  FinancialEventType,
  PaymentSlot,
} from "@/types/financial-reports";

// ---------------------------------------------------------------------------
// Glossary shown in the UI
// ---------------------------------------------------------------------------

export interface FinanceTerm {
  term: string;
  definition: string;
}

export const FINANCE_GLOSSARY: FinanceTerm[] = [
  {
    term: "Net Revenue",
    definition:
      "Gross Revenue minus Refunded. The money the business actually kept. This is the headline revenue figure everywhere in the admin.",
  },
  {
    term: "Gross Revenue",
    definition:
      "All cash received: reservation fees on their reservation date plus every instalment on the date it was paid. Includes payments later refunded.",
  },
  {
    term: "Refunded",
    definition:
      "Money returned to guests on cancellation, dated on the cancellation date. A cancelled booking with no refund recorded is treated as fully retained.",
  },
  {
    term: "Expected Revenue",
    definition:
      "Money still to come that is NOT yet due: unpaid instalments whose due date is in the future, dated on that due date. Cancelled bookings are excluded. Part of Outstanding Balance.",
  },
  {
    term: "Overdue Unpaid",
    definition:
      "Money that is late: unpaid instalments whose due date has passed (due date + 1 day), dated on the day they became overdue. Cancelled bookings are excluded. Part of Outstanding Balance.",
  },
  {
    term: "Outstanding Balance",
    definition:
      "Everything guests still owe = Overdue Unpaid + Expected Revenue. Overdue is the late part that needs chasing; Expected is the on-track part not yet due.",
  },
  {
    term: "Cancelled Bookings",
    definition:
      "Bookings whose status is cancelled, dated on their cancellation request date. Retained = what they paid minus what was refunded.",
  },
  {
    term: "Date range",
    definition:
      "Every figure counts only events whose date falls inside the selected range, inclusive. 'All time' includes every event.",
  },
];

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/** Normalise any date-like value coming from Firestore/API to a JS Date. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") return new Date(value);
  // Firestore Timestamp instance (client or admin SDK)
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  // Firestore Timestamp serialised as {seconds, nanoseconds}
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds: unknown }).seconds === "number"
  ) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return null;
}

/** Format a Date to YYYY-MM-DD using the LOCAL calendar date (not UTC). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add N days to a date and return a new Date. */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Inclusive comparison of two YYYY-MM-DD strings against a range. */
export function dateInRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

// ---------------------------------------------------------------------------
// Lifecycle status — derived at read time, never stored
// ---------------------------------------------------------------------------

export type LifecycleStatus =
  | "Cancelled" // customer gave a cancellation reason (or status says cancelled)
  | "Completed" // tour has ended AND nothing is owed
  | "Elapsed" // tour has ENDED AND something is still owed
  | "Confirmed" // nothing owed, tour still ahead
  | "Pending"; // something owed, tour still ahead

export const LIFECYCLE_DEFINITIONS: Record<LifecycleStatus, string> = {
  Cancelled: "The customer cancelled. Requires a cancellation reason on the booking.",
  Completed: "The tour has ended and the balance is zero. The guest travelled and paid in full.",
  Elapsed: "The tour has ended but a balance is still owing. Expired without being settled. The status it had before is kept in statusBeforeElapsed.",
  Confirmed: "Paid in full, tour still ahead.",
  Pending: "Balance still owing, tour still ahead.",
};

/**
 * Derive a booking's lifecycle state from the calendar and its balance.
 *
 * Deliberately NOT stored: the grid's bookingStatus text only changes when a
 * row is edited, so a stored "Completed"/"Elapsed" would never flip on its
 * own. Deriving it means the Dashboard and Reports are right every day
 * without a nightly job.
 *
 * Balance = tour cost − cash received (per-slot cash when present, else the
 * asked amounts on paid terms). Late fees are added to what is owed.
 */
export function deriveLifecycleStatus(
  booking: RawBooking,
  today: Date = new Date()
): LifecycleStatus {
  const status = String(booking.bookingStatus ?? "").toLowerCase();
  const reason = String(booking.reasonForCancellation ?? "").trim();
  if (reason || status.includes("cancelled")) return "Cancelled";

  const num = (v: unknown) => Number(v) || 0;
  const paid = (amount: unknown, amountPaid: unknown, date: unknown): number => {
    if (!toDate(date)) return 0;
    return amountPaid === undefined || amountPaid === null || amountPaid === ""
      ? num(amount)
      : num(amountPaid);
  };

  const cost = num(booking.discountedTourCost) || num(booking.originalTourCost);
  const reservationCash =
    booking.reservationAmountPaid === undefined || booking.reservationAmountPaid === ""
      ? num(booking.reservationFee)
      : num(booking.reservationAmountPaid);
  const cash =
    reservationCash +
    paid(booking.fullPaymentAmount, booking.fullPaymentAmountPaid, booking.fullPaymentDatePaid) +
    [1, 2, 3, 4].reduce(
      (s, n) => s + paid(booking[`p${n}Amount`], booking[`p${n}AmountPaid`], booking[`p${n}DatePaid`]),
      0
    );
  const owed = Math.round((cost + num(booking.totalLateFees) - cash) * 100) / 100;
  const settled = cost > 0 && owed <= 0.009;

  if (settled) return hasTourEnded(booking, today) ? "Completed" : "Confirmed";
  return hasTourEnded(booking, today) ? "Elapsed" : "Pending";
}

/** True once the tour's return date (fallback: tour date) is before today. */
export function hasTourEnded(booking: RawBooking, today: Date = new Date()): boolean {
  const tourDate = toDate(booking.tourDate);
  const returnDate = toDate(booking.returnDate) ?? tourDate;
  if (!returnDate) return false;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return returnDate < startOfToday;
}

// ---------------------------------------------------------------------------
// Booking helpers
// ---------------------------------------------------------------------------

export type RawBooking = Record<string, unknown>;

/** A booking is cancelled when its status says so (case-insensitive). */
export function isCancelledBooking(booking: RawBooking): boolean {
  return String(booking.bookingStatus ?? "")
    .toLowerCase()
    .includes("cancelled");
}

/**
 * The date a booking was cancelled. Some bookings were cancelled by status
 * without a cancellationRequestDate ever being set; fall back so they are
 * still counted rather than vanishing from every report.
 */
export function getCancellationDate(booking: RawBooking): Date | null {
  const explicit = toDate(booking.cancellationRequestDate);
  if (explicit) return explicit;
  if (!isCancelledBooking(booking)) return null;
  return toDate(booking.cancellationEmailSentDate) ?? toDate(booking.updatedAt);
}

interface PaymentSlotFields {
  slot: PaymentSlot;
  dueDate: unknown;
  datePaid: unknown;
  amount: unknown; // what the term asked for
  amountPaid: unknown; // what actually arrived (per-slot cash model); absent = legacy
  label: string; // e.g. "P1", "P2", …, "Full Payment"
}

/** True when the booking carries any per-slot cash field (new model in use). */
export function usesPerSlotCash(booking: RawBooking): boolean {
  return [
    "reservationAmountPaid",
    "p1AmountPaid",
    "p2AmountPaid",
    "p3AmountPaid",
    "p4AmountPaid",
    "fullPaymentAmountPaid",
  ].some((k) => booking[k] !== undefined && booking[k] !== null && booking[k] !== "");
}

function extractPaymentSlots(booking: RawBooking): PaymentSlotFields[] {
  const slots: PaymentSlotFields[] = [];

  for (const n of [1, 2, 3, 4] as const) {
    const slot = `p${n}` as PaymentSlot;
    const dueDate = booking[`p${n}DueDate`];
    const amount = booking[`p${n}Amount`];
    if (dueDate && amount !== undefined && amount !== null && amount !== "") {
      slots.push({
        slot,
        dueDate,
        datePaid: booking[`p${n}DatePaid`],
        amount,
        amountPaid: booking[`p${n}AmountPaid`],
        label: `P${n}`,
      });
    }
  }

  if (booking.fullPaymentDueDate && booking.fullPaymentAmount) {
    slots.push({
      slot: "full",
      dueDate: booking.fullPaymentDueDate,
      datePaid: booking.fullPaymentDatePaid,
      amount: booking.fullPaymentAmount,
      amountPaid: booking.fullPaymentAmountPaid,
      label: "Full Payment",
    });
  }

  return slots;
}

/**
 * Manual credit = overpayment on a term (or the reservation fee). Returns a
 * gross-revenue event for it, or null when it should not be counted:
 *   - no credit, or credit source has no paid date (cash not evidenced), or
 *   - the schedule has NOT been reduced by the credit yet (pre-fix data), in
 *     which case the credit is already inside the term amounts.
 */
function manualCreditAsCash(
  booking: RawBooking
): Omit<FinancialEvent, "bookingId" | "bookingCode" | "tourName" | "netRevenue"> | null {
  const credit = Number(booking.manualCredit ?? 0);
  if (!(credit > 0)) return null;

  const source = String(booking.creditFrom ?? "").trim();
  const sourceDate =
    source === "Reservation"
      ? toDate(booking.reservationDate)
      : source === "Full Payment"
      ? toDate(booking.fullPaymentDatePaid)
      : /^P[1-4]$/.test(source)
      ? toDate(booking[`p${source[1]}DatePaid`])
      : null;
  if (!sourceDate) return null;

  const plan = String(booking.paymentPlan ?? "").trim();
  const terms = plan === "Full Payment" ? 0 : { P1: 1, P2: 2, P3: 3, P4: 4 }[plan] ?? 0;
  const cost = Number(booking.discountedTourCost) || Number(booking.originalTourCost) || 0;
  const due = cost - Number(booking.reservationFee ?? 0);
  const scheduleTotal =
    plan === "Full Payment"
      ? Number(booking.fullPaymentAmount ?? 0)
      : [1, 2, 3, 4].slice(0, terms).reduce((s, n) => s + (Number(booking[`p${n}Amount`]) || 0), 0);
  if (!(plan === "Full Payment" || terms > 0)) return null;

  const scheduleReducedByCredit = Math.abs(scheduleTotal - (due - credit)) < 0.02;
  if (!scheduleReducedByCredit) return null;

  return {
    date: toISODate(sourceDate),
    history: `Manual Credit (overpaid on ${source})`,
    eventType: "manual_credit",
    grossRevenue: credit,
    expectedRevenue: 0,
    overdueUnpaidAmount: 0,
    refundedAmount: 0,
    cancelledBookingsCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Event extraction — one booking → its dated financial events
// ---------------------------------------------------------------------------

/**
 * Decompose one booking document into its ordered list of FinancialEvents.
 * `today` is injected for testability (defaults to actual today).
 */
export function extractBookingEvents(
  booking: RawBooking,
  today: Date = new Date()
): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  const todayStr = toISODate(today);
  const cancelled = isCancelledBooking(booking);

  const bookingId = (booking.bookingId as string) || (booking.id as string) || "";
  const bookingCode = (booking.bookingCode as string) || bookingId;
  const tourName =
    (booking.tourPackageName as string) ||
    (booking.tourName as string) ||
    "Unknown Tour";

  const makeEvent = (
    partial: Omit<FinancialEvent, "bookingId" | "bookingCode" | "tourName" | "netRevenue">
  ): FinancialEvent => ({
    ...partial,
    bookingId,
    bookingCode,
    tourName,
    netRevenue: partial.grossRevenue + partial.refundedAmount, // refundedAmount is negative
  });

  // ── 1. Reservation Date → Gross Revenue = reservation cash received ────
  // Per-slot model: reservationAmountPaid is what arrived (may exceed the
  // fee); legacy bookings fall back to the fee itself.
  const reservationDate = toDate(booking.reservationDate);
  const reservationCash = Number(
    booking.reservationAmountPaid ?? booking.reservationFee ?? 0
  );

  if (reservationDate && reservationCash > 0) {
    events.push(
      makeEvent({
        date: toISODate(reservationDate),
        history: "Reservation Date",
        eventType: "reservation",
        grossRevenue: reservationCash,
        expectedRevenue: 0,
        overdueUnpaidAmount: 0,
        refundedAmount: 0,
        cancelledBookingsCount: 0,
      })
    );
  }

  // ── 2. Payment slots (P1–P4 / Full) ────────────────────────────────────
  for (const slotData of extractPaymentSlots(booking)) {
    const dueDate = toDate(slotData.dueDate);
    if (!dueDate) continue;

    const paidDate = toDate(slotData.datePaid);
    const amount = Number(slotData.amount ?? 0);
    if (amount <= 0) continue;

    const dueDateStr = toISODate(dueDate);
    const dueEventType: FinancialEventType =
      slotData.slot === "full" ? "full_payment_due" : "px_due";
    const paidEventType: FinancialEventType =
      slotData.slot === "full" ? "full_payment_paid" : "px_paid";

    const isSlotPaid = !!paidDate;
    const overdueDate = addDays(dueDate, 1);
    const overdueDateStr = toISODate(overdueDate);
    const isSlotOverdue = !isSlotPaid && overdueDateStr <= todayStr;

    // Nothing more is expected from, or overdue on, a cancelled booking.
    const stillOwed = !isSlotPaid && !cancelled;

    // Due date → Expected Revenue (only truly pending: unpaid, not yet overdue, not cancelled)
    events.push(
      makeEvent({
        date: dueDateStr,
        history: `${slotData.label} Due Date`,
        eventType: dueEventType,
        paymentSlot: slotData.slot,
        grossRevenue: 0,
        expectedRevenue: stillOwed && !isSlotOverdue ? amount : 0,
        overdueUnpaidAmount: 0,
        refundedAmount: 0,
        cancelledBookingsCount: 0,
      })
    );

    if (paidDate) {
      // Cash received on this term: per-slot AmountPaid when recorded, else
      // the asked amount (legacy assumption paid === asked).
      const paidRaw = slotData.amountPaid;
      const cashPaid =
        paidRaw === undefined || paidRaw === null || paidRaw === ""
          ? amount
          : Number(paidRaw) || 0;
      events.push(
        makeEvent({
          date: toISODate(paidDate),
          history: `${slotData.label} Date Paid`,
          eventType: paidEventType,
          paymentSlot: slotData.slot,
          grossRevenue: cashPaid,
          expectedRevenue: 0,
          overdueUnpaidAmount: 0,
          refundedAmount: 0,
          cancelledBookingsCount: 0,
        })
      );
    } else if (stillOwed && isSlotOverdue) {
      events.push(
        makeEvent({
          date: overdueDateStr,
          history: `${slotData.label} Overdue`,
          eventType: "px_overdue",
          paymentSlot: slotData.slot,
          grossRevenue: 0,
          expectedRevenue: 0,
          overdueUnpaidAmount: amount,
          refundedAmount: 0,
          cancelledBookingsCount: 0,
        })
      );
    }
  }

  // ── 2b. Manual credit → Gross Revenue (overpayment, cash received) ─────
  //
  // A manual credit is money the guest sent OVER what a term asked for. It
  // is real cash, so it belongs in Gross Revenue, dated when it arrived (the
  // paid date of the term it came from; the reservation date for a
  // reservation-fee overpayment).
  //
  // It is only counted once the schedule has been reduced by it. Before the
  // Aug-2026 allocation fix, P1–P4 credits left the schedule at the full
  // amount, so the credit is already inside the term amounts on those
  // bookings; adding it again would double-count. Once a booking is
  // backfilled (or re-saved with the fixed allocation) the schedule drops by
  // the credit and this event starts counting. Net effect: gross is right
  // both before and after the backfill.
  // Skipped entirely once a booking carries per-slot cash fields: the
  // overpayment is then already inside *AmountPaid and counted above.
  const creditEvent = usesPerSlotCash(booking) ? null : manualCreditAsCash(booking);
  if (creditEvent) events.push(makeEvent(creditEvent));

  // ── 3. Cancellation → Refunded Amount ──────────────────────────────────
  const cancellationDate = getCancellationDate(booking);
  const refundableAmount = Number(
    booking.refundableAmount ?? booking.travelCreditIssued ?? 0
  );

  if (cancellationDate) {
    events.push(
      makeEvent({
        date: toISODate(cancellationDate),
        history: "Cancellation Request Date",
        eventType: "cancellation",
        grossRevenue: 0,
        expectedRevenue: 0,
        overdueUnpaidAmount: 0,
        // Stored as negative so Net Revenue = Gross + Refunded
        refundedAmount: refundableAmount > 0 ? -refundableAmount : 0,
        cancelledBookingsCount: 1,
      })
    );
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// ---------------------------------------------------------------------------
// Aggregation — events in a range → the headline numbers
// ---------------------------------------------------------------------------

export interface FinanceTotals {
  grossRevenue: number;
  refunded: number; // positive
  netRevenue: number; // gross − refunded
  expectedRevenue: number;
  overdueUnpaid: number;
  outstandingBalance: number; // expected + overdue
  cancelledBookings: number;
}

export function emptyTotals(): FinanceTotals {
  return {
    grossRevenue: 0,
    refunded: 0,
    netRevenue: 0,
    expectedRevenue: 0,
    overdueUnpaid: 0,
    outstandingBalance: 0,
    cancelledBookings: 0,
  };
}

/**
 * Sum events whose date falls inside [start, end] (inclusive YYYY-MM-DD).
 * Omit the range to sum everything.
 */
export function sumEvents(
  events: FinancialEvent[],
  start?: string,
  end?: string
): FinanceTotals {
  const t = emptyTotals();
  for (const e of events) {
    if (start && end && !dateInRange(e.date, start, end)) continue;
    t.grossRevenue += e.grossRevenue;
    t.refunded += Math.abs(e.refundedAmount);
    t.expectedRevenue += e.expectedRevenue;
    t.overdueUnpaid += e.overdueUnpaidAmount;
    t.cancelledBookings += e.cancelledBookingsCount;
  }
  t.netRevenue = t.grossRevenue - t.refunded;
  t.outstandingBalance = t.expectedRevenue + t.overdueUnpaid;
  return t;
}

/** Events for every booking, flat and sorted by date. */
export function extractAllEvents(
  bookings: RawBooking[],
  today: Date = new Date()
): FinancialEvent[] {
  return bookings
    .flatMap((b) => extractBookingEvents(b, today))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Net revenue per calendar month for the last `months` months (oldest first),
 * bucketed by event date. Month bounds are [1st, 1st of next month).
 */
export function monthlyNetRevenue(
  events: FinancialEvent[],
  months: number,
  today: Date = new Date()
): { monthStart: Date; label: string; totals: FinanceTotals }[] {
  const out: { monthStart: Date; label: string; totals: FinanceTotals }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    out.push({
      monthStart,
      label: monthStart.toLocaleDateString("en", { month: "short" }),
      totals: sumEvents(events, toISODate(monthStart), toISODate(monthEnd)),
    });
  }
  return out;
}
