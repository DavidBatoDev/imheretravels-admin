import { addOnTotals } from "./add-ons";

type BookingMoney = Record<string, unknown>;

const number = (value: unknown): number => {
  const parsed = typeof value === "string"
    ? Number(value.replace(/[^\d.-]/g, ""))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const paid = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "null" && normalized !== "undefined";
  }
  return true;
};

/**
 * Read-time repair for historical installment rows whose paid P amount already
 * contains a late fee that is also stored in the term's Late Fees column.
 * Their persisted Remaining Balance is understated; the open schedule remains
 * the authoritative amount the guest still has to pay.
 */
export function getDisplayedBalanceDue(
  booking: BookingMoney,
  fallback: number,
): number {
  const plan = String(booking.paymentPlan ?? "").trim();
  const match = /^P([1-4])$/.exec(plan);
  if (!match) return Math.max(0, fallback);

  const terms = Number(match[1]);
  let hasSettledLateFee = false;
  let openSchedule = 0;

  for (let term = 1; term <= terms; term += 1) {
    const datePaid = booking[`p${term}DatePaid`];
    const lateFee = number(booking[`p${term}LateFeesPenalty`]);
    if (paid(datePaid)) {
      if (lateFee > 0) hasSettledLateFee = true;
    } else {
      openSchedule += number(booking[`p${term}Amount`]) + lateFee;
    }
  }

  if (!hasSettledLateFee) return Math.max(0, fallback);
  return Math.max(
    0,
    Math.round((openSchedule + addOnTotals(booking.addOns).unpaid) * 100) / 100,
  );
}
