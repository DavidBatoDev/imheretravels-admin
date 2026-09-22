import { BookingSheetColumn } from "@/types/booking-sheet-column";
import {
  allocateFromCashReceived,
  getPaymentPlanTerms,
  hasPaidDate,
  reservationCashReceived,
  roundCurrency,
  toNumber,
} from "../payment-calculation-helpers";

const ARG = (name: string, ref: string, type = "number") => ({
  name,
  type,
  columnReference: ref,
  isOptional: true,
  hasDefault: false,
  isRest: false,
  value: "",
});

/**
 * Overpaid Amount — cash received beyond everything the booking owes, with no
 * open term left to absorb it. This is a refund / travel credit waiting to
 * happen. There is no refund pipeline yet, so this column makes the money
 * visible instead of letting it be silently absorbed.
 *
 * Only meaningful on the per-slot cash model (*AmountPaid). Legacy rows
 * without those fields always show 0.
 */
export const overpaidAmountColumn: BookingSheetColumn = {
  id: "overpaidAmount",
  data: {
    id: "overpaidAmount",
    columnName: "Overpaid Amount",
    dataType: "function",
    function: "getOverpaidAmountFunction",
    parentTab: "Payment Setting",
    includeInForms: false,
    color: "yellow",
    width: 140,
    arguments: [
      ARG("tourPackageName", "Tour Package Name", "string"),
      ARG("discountedTourCost", "Discounted Tour Cost"),
      ARG("originalTourCost", "Original Tour Cost"),
      ARG("reservationFee", "Reservation Fee"),
      ARG("reservationAmountPaid", "Reservation Amount Paid"),
      ARG("paymentPlan", "Payment Plan", "string"),
      ARG("fullPaymentAmount", "Full Payment Amount"),
      ARG("fullPaymentAmountPaid", "Full Payment Amount Paid"),
      ARG("fullPaymentDatePaid", "Full Payment Date Paid", "any"),
      ARG("p1Amount", "P1 Amount"),
      ARG("p1AmountPaid", "P1 Amount Paid"),
      ARG("p1DatePaid", "P1 Date Paid", "any"),
      ARG("p2Amount", "P2 Amount"),
      ARG("p2AmountPaid", "P2 Amount Paid"),
      ARG("p2DatePaid", "P2 Date Paid", "any"),
      ARG("p3Amount", "P3 Amount"),
      ARG("p3AmountPaid", "P3 Amount Paid"),
      ARG("p3DatePaid", "P3 Date Paid", "any"),
      ARG("p4Amount", "P4 Amount"),
      ARG("p4AmountPaid", "P4 Amount Paid"),
      ARG("p4DatePaid", "P4 Date Paid", "any"),
      ARG("totalLateFees", "Total Late Fees"),
    ],
  },
};

export default function getOverpaidAmountFunction(
  tourPackageName?: string,
  discountedTourCost?: number | string | null,
  originalTourCost?: number | string | null,
  reservationFee?: number | string | null,
  reservationAmountPaid?: number | string | null,
  paymentPlan?: string | null,
  fullPaymentAmount?: number | string | null,
  fullPaymentAmountPaid?: number | string | null,
  fullPaymentDatePaid?: unknown,
  p1Amount?: number | string | null,
  p1AmountPaid?: number | string | null,
  p1DatePaid?: unknown,
  p2Amount?: number | string | null,
  p2AmountPaid?: number | string | null,
  p2DatePaid?: unknown,
  p3Amount?: number | string | null,
  p3AmountPaid?: number | string | null,
  p3DatePaid?: unknown,
  p4Amount?: number | string | null,
  p4AmountPaid?: number | string | null,
  p4DatePaid?: unknown,
  totalLateFees?: number | string | null,
): number | "" {
  if (!tourPackageName) return "";

  const cost = toNumber(discountedTourCost) > 0 ? toNumber(discountedTourCost) : toNumber(originalTourCost);
  if (cost <= 0) return "";

  const plan = (paymentPlan ?? "").trim();
  const owedBeyondCost = toNumber(totalLateFees);
  const totalDue = cost + owedBeyondCost - reservationCashReceived(reservationFee, reservationAmountPaid);

  if (plan === "Full Payment") {
    if (!hasPaidDate(fullPaymentDatePaid)) return 0;
    const paid =
      fullPaymentAmountPaid === undefined || fullPaymentAmountPaid === null || fullPaymentAmountPaid === ""
        ? toNumber(fullPaymentAmount)
        : toNumber(fullPaymentAmountPaid);
    return roundCurrency(Math.max(0, paid - totalDue));
  }

  const terms = getPaymentPlanTerms(plan);
  if (terms < 1) return 0;

  return allocateFromCashReceived(
    totalDue,
    terms,
    [p1Amount, p2Amount, p3Amount, p4Amount],
    [p1AmountPaid, p2AmountPaid, p3AmountPaid, p4AmountPaid],
    [p1DatePaid, p2DatePaid, p3DatePaid, p4DatePaid],
  ).overpaid;
}
