import { BookingSheetColumn } from "@/types/booking-sheet-column";
import {
  getCreditOrder,
  getPaymentPlanTerms,
  hasPaidDate,
  roundCurrency,
  toNumber,
  hasPerSlotCash,
  cashReceivedForTerm,
  reservationCashReceived,
} from "../payment-calculation-helpers";

export const remainingBalanceColumn: BookingSheetColumn = {
  id: "remainingBalance",
  data: {
    id: "remainingBalance",
    columnName: "Remaining Balance",
    dataType: "function",
    function: "getRemainingBalanceFunction",
    parentTab: "Tour Details",
    includeInForms: false,
    color: "yellow",
    width: 191.33331298828125,
    arguments: [
      {
        name: "tourPackageName",
        type: "string",
        columnReference: "Tour Package Name",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "useDiscountedCost",
        type: "boolean",
        columnReference: "Use Discounted Tour Cost?",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "discountedTourCost",
        type: "number",
        columnReference: "Discounted Tour Cost",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "originalTourCost",
        type: "number",
        columnReference: "Original Tour Cost",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "reservationFee",
        type: "number",
        columnReference: "Reservation Fee",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "creditFrom",
        type: "string",
        columnReference: "Credit From",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "creditAmount",
        type: "number",
        columnReference: "Manual Credit",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paymentPlan",
        type: "string",
        columnReference: "Payment Plan",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentDate",
        type: "string",
        columnReference: "Full Payment Date Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentAmount",
        type: "number",
        columnReference: "Full Payment Amount",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1DatePaid",
        type: "string",
        columnReference: "P1 Date Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1Amount",
        type: "number",
        columnReference: "P1 Amount",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2DatePaid",
        type: "string",
        columnReference: "P2 Date Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2Amount",
        type: "number",
        columnReference: "P2 Amount",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3DatePaid",
        type: "string",
        columnReference: "P3 Date Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3Amount",
        type: "number",
        columnReference: "P3 Amount",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4DatePaid",
        type: "string",
        columnReference: "P4 Date Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4Amount",
        type: "number",
        columnReference: "P4 Amount",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1LateFeesPenalty",
        type: "number",
        columnReference: "P1 Late Fees Penalty",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2LateFeesPenalty",
        type: "number",
        columnReference: "P2 Late Fees Penalty",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3LateFeesPenalty",
        type: "number",
        columnReference: "P3 Late Fees Penalty",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4LateFeesPenalty",
        type: "number",
        columnReference: "P4 Late Fees Penalty",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "reservationAmountPaid",
        type: "number",
        columnReference: "Reservation Amount Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1AmountPaid",
        type: "number",
        columnReference: "P1 Amount Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2AmountPaid",
        type: "number",
        columnReference: "P2 Amount Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3AmountPaid",
        type: "number",
        columnReference: "P3 Amount Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4AmountPaid",
        type: "number",
        columnReference: "P4 Amount Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentAmountPaid",
        type: "number",
        columnReference: "Full Payment Amount Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
    ],
  },
};

// Column Function Implementation
/**
 * Excel equivalent:
 * =IF(
 *   ISBLANK(M1003),
 *   "",
 *   LET(
 *     total, IF($Y1003,$AG1003,$AF1003) - $AH1003 - IF($AL1003="Reservation", N($AK1003), 0),
 *     plan,  $AM1003,
 *
 *     paid,
 *       IF($AV1003<>"", $AU1003, 0) +
 *       IF($BC1003<>"", $BB1003, 0) +
 *       IF($BJ1003<>"", $BI1003, 0) +
 *       IF($BQ1003<>"", $BP1003, 0) +
 *       IF($BX1003<>"", $BW1003, 0),
 *
 *     rem, total - paid,
 *     IF(AND(plan="P1",$BC1003<>""),0,MAX(rem,0))
 *   )
 * )
 *
 * Description:
 * - Computes the **remaining balance** for a given tour package.
 * - Considers discount usage, reservation fee, credits, and all payments (Full, P1–P4).
 * - If the plan is "P1" and P1 payment has been made, remaining balance becomes 0.
 * - Returns "" if no tourPackageName provided.
 */

export default function getRemainingBalanceFunction(
  tourPackageName: string,
  useDiscountedCost?: boolean | string,
  discountedTourCost?: number | string,
  originalTourCost?: number | string,
  reservationFee?: number | string,
  creditFrom?: string,
  creditAmount?: number | string,
  paymentPlan?: string,
  fullPaymentDate?: string,
  fullPaymentAmount?: number | string,
  p1DatePaid?: string,
  p1Amount?: number | string,
  p2DatePaid?: string,
  p2Amount?: number | string,
  p3DatePaid?: string,
  p3Amount?: number | string,
  p4DatePaid?: string,
  p4Amount?: number | string,
  p1LateFeesPenalty?: number | string,
  p2LateFeesPenalty?: number | string,
  p3LateFeesPenalty?: number | string,
  p4LateFeesPenalty?: number | string,
  reservationAmountPaid?: number | string | null,
  p1AmountPaid?: number | string | null,
  p2AmountPaid?: number | string | null,
  p3AmountPaid?: number | string | null,
  p4AmountPaid?: number | string | null,
  fullPaymentAmountPaid?: number | string | null,
): number | "" {
  if (!tourPackageName) return "";

  // Normalize numeric inputs to avoid undefined values
  const origCost = toNumber(originalTourCost);
  const discCost = toNumber(discountedTourCost);
  const resFee = toNumber(reservationFee);
  const creditFromValue = creditFrom ?? "";
  const creditAmt = toNumber(creditAmount);
  const plan = (paymentPlan ?? "").trim();

  // Net the credit out of the customer's balance immediately — matching
  // allocateInstallmentAmounts / getFullPaymentRemainingFunction, which both
  // reduce the relevant term's own due amount unconditionally, not only once
  // that term is paid. Gating this on payment status would contradict the
  // (already-discounted) amount shown for that term on the customer's own
  // Payment Schedule, since remaining balance would never fully reach zero.
  const isFullPaymentPlan = plan === "Full Payment";
  const creditOrder = getCreditOrder(creditFromValue, creditAmt);
  const terms = getPaymentPlanTerms(plan);
  const creditValidForPlan =
    isFullPaymentPlan // full-payment-amount.ts nets any credit unconditionally
      ? creditAmt > 0
      : creditOrder === 0 || (creditOrder >= 1 && creditOrder <= terms);
  // Per-slot cash model: cash per slot replaces the manual credit entirely.
  const perSlot = hasPerSlotCash(
    reservationAmountPaid, p1AmountPaid, p2AmountPaid, p3AmountPaid, p4AmountPaid, fullPaymentAmountPaid,
  );
  const netCredit = perSlot ? 0 : creditValidForPlan ? creditAmt : 0;

  // Determine which total cost to use (discounted or original)
  // Automatically use discounted cost if available (from active discount events)
  const baseCost = discCost > 0 ? discCost : origCost;

  // Subtract reservation fee and any applicable manual credit
  const total =
    baseCost -
    (perSlot ? reservationCashReceived(reservationFee, reservationAmountPaid) : resFee) -
    netCredit;

  // Total paid amount so far (treat missing amounts as 0). Full Payment and
  // P1–P4 amounts are already net of any manual credit applied to that term
  // (see getFullPaymentRemainingFunction / allocateInstallmentAmounts), so
  // each is counted as-is once paid — a Reservation credit is netted out of
  // `total` above instead, since the Reservation Fee is never itself
  // discounted.
  const paid = perSlot
    ? cashReceivedForTerm(fullPaymentAmount, fullPaymentAmountPaid, fullPaymentDate) +
      cashReceivedForTerm(p1Amount, p1AmountPaid, p1DatePaid) +
      cashReceivedForTerm(p2Amount, p2AmountPaid, p2DatePaid) +
      cashReceivedForTerm(p3Amount, p3AmountPaid, p3DatePaid) +
      cashReceivedForTerm(p4Amount, p4AmountPaid, p4DatePaid)
    : (hasPaidDate(fullPaymentDate) ? toNumber(fullPaymentAmount) : 0) +
      (hasPaidDate(p1DatePaid) ? toNumber(p1Amount) : 0) +
      (hasPaidDate(p2DatePaid) ? toNumber(p2Amount) : 0) +
      (hasPaidDate(p3DatePaid) ? toNumber(p3Amount) : 0) +
      (hasPaidDate(p4DatePaid) ? toNumber(p4Amount) : 0);

  // All applied late fees increase total amount due.
  const totalLateFees =
    toNumber(p1LateFeesPenalty) +
    toNumber(p2LateFeesPenalty) +
    toNumber(p3LateFeesPenalty) +
    toNumber(p4LateFeesPenalty);

  // Only treat a term's late fee as paid when that term is marked paid.
  const paidLateFees =
    (hasPaidDate(p1DatePaid) ? toNumber(p1LateFeesPenalty) : 0) +
    (hasPaidDate(p2DatePaid) ? toNumber(p2LateFeesPenalty) : 0) +
    (hasPaidDate(p3DatePaid) ? toNumber(p3LateFeesPenalty) : 0) +
    (hasPaidDate(p4DatePaid) ? toNumber(p4LateFeesPenalty) : 0);

  const totalDue = total + totalLateFees;

  // Remaining balance - round to 2 decimal places
  const remaining = roundCurrency(totalDue - (paid + paidLateFees));

  // Special rule for P1 plan
  if (paymentPlan === "P1" && hasPaidDate(p1DatePaid)) {
    return 0;
  }

  // Ensure non-negative balance
  return Math.max(remaining, 0);
}
