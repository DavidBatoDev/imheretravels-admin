import { BookingSheetColumn } from "@/types/booking-sheet-column";
import {
  resolveInstallmentSchedule,
  getPaymentPlanTerms,
  roundCurrency,
  toNumber,
} from "../payment-calculation-helpers";

export const p1AmountColumn: BookingSheetColumn = {
  id: "p1Amount",
  data: {
    id: "p1Amount",
    columnName: "P1 Amount",
    dataType: "function",
    function: "getP1AmountFunction",
    parentTab: "Payment Term 1",
    includeInForms: false,
    color: "yellow",
    width: 120,
    arguments: [
      {
        name: "p1DueDate",
        type: "any",
        columnReference: "P1 Due Date",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "useDiscountedTourCost",
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
        name: "paymentCondition",
        type: "string",
        columnReference: "Available Payment Terms",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentDatePaid",
        type: "any",
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
        type: "any",
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
        type: "any",
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
        type: "any",
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
        type: "any",
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
    ],
  },
};

// Column Function Implementation
/**
 * Excel equivalent:
 * =ArrayFormula(IF($BA1003<>"", ... ))
 *
 * Description:
 * - Calculates the P1 amount based on tour cost, reservation fee,
 *   credits, payment plan, and which payments were already made.
 * - Handles proportional installment allocation with credit deduction.
 */

export default function getP1AmountFunction(
  p1DueDate?: string | Date,
  useDiscountedTourCost?: boolean,
  discountedTourCost?: number,
  originalTourCost?: number,
  reservationFee?: number,
  creditFrom?: string,
  creditAmount?: number,
  paymentPlan?: string,
  paymentCondition?: string,
  fullPaymentDatePaid?: string | Date,
  fullPaymentAmount?: number,
  p1DatePaid?: string | Date,
  p1Amount?: number,
  p2DatePaid?: string | Date,
  p2Amount?: number,
  p3DatePaid?: string | Date,
  p3Amount?: number,
  p4DatePaid?: string | Date,
  p4Amount?: number,
  reservationAmountPaid?: number | string | null,
  p1AmountPaid?: number | string | null,
  p2AmountPaid?: number | string | null,
  p3AmountPaid?: number | string | null,
  p4AmountPaid?: number | string | null,
) {
  if (!p1DueDate) return "";

  // Automatically use discounted cost if available (from active discount events)
  const discCost = toNumber(discountedTourCost);
  const origCost = toNumber(originalTourCost);
  const baseCost = discCost > 0 ? discCost : origCost;
  const total = baseCost - toNumber(reservationFee);
  const credit_from = creditFrom ?? "";
  const credit_amt = toNumber(creditAmount);

  // Case: No payment plan or condition → return unpaid balance divided by 4
  if (!paymentPlan && !paymentCondition) {
    const paidSum =
      (fullPaymentDatePaid ? toNumber(fullPaymentAmount) : 0) +
      (p2DatePaid ? toNumber(p2Amount) : 0) +
      (p3DatePaid ? toNumber(p3Amount) : 0) +
      (p4DatePaid ? toNumber(p4Amount) : 0);

    return roundCurrency((total - paidSum) / 4);
  }

  // Determine number of terms (P1–P4)
  const terms = getPaymentPlanTerms(paymentPlan);
  if (terms < 1) return "";
  const allocations = resolveInstallmentSchedule(
    baseCost,
    reservationFee,
    terms,
    credit_from,
    credit_amt,
    [p1Amount, p2Amount, p3Amount, p4Amount],
    [p1DatePaid, p2DatePaid, p3DatePaid, p4DatePaid],
    reservationAmountPaid,
    [p1AmountPaid, p2AmountPaid, p3AmountPaid, p4AmountPaid],
  );

  return roundCurrency(allocations[0] ?? 0);
}
