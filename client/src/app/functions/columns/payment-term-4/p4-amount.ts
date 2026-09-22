import { BookingSheetColumn } from "@/types/booking-sheet-column";
import {
  resolveInstallmentSchedule,
  getPaymentPlanTerms,
  roundCurrency,
  toNumber,
} from "../payment-calculation-helpers";

export const p4AmountColumn: BookingSheetColumn = {
  id: "p4Amount",
  data: {
    id: "p4Amount",
    columnName: "P4 Amount",
    dataType: "function",
    function: "getP4AmountFunction",
    parentTab: "Payment Term 4",
    includeInForms: false,
    color: "yellow",
    width: 120,
    arguments: [
      {
        name: "p4DueDate",
        type: "any",
        columnReference: "P4 Due Date",
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
        name: "paymentMethod",
        type: "string",
        columnReference: "Payment Method",
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
export default function getP4AmountFunction(
  p4DueDate?: string | Date,
  useDiscountedTourCost?: boolean,
  discountedTourCost?: number,
  originalTourCost?: number,
  reservationFee?: number,
  creditFrom?: string,
  creditAmount?: number,
  paymentPlan?: string,
  paymentMethod?: string,
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
  // =IF($BV1003<>"", ...)
  if (!p4DueDate) return "";

  // total, credit_from, credit_amt
  const discCost = toNumber(discountedTourCost);
  const origCost = toNumber(originalTourCost);
  const baseCost = (discCost > 0) ? discCost : origCost;
  const total = baseCost - toNumber(reservationFee);
  const credit_from = creditFrom ?? "";
  const credit_amt = toNumber(creditAmount);

  // IF(AND($AO999="", $AP999=""), ...)
  if (!paymentPlan) {
    // When no payment plan is specified, calculate unpaid balance divided by 4
    const paidSum =
      (fullPaymentDatePaid ? toNumber(fullPaymentAmount) : 0) +
      (p1DatePaid ? toNumber(p1Amount) : 0) +
      (p2DatePaid ? toNumber(p2Amount) : 0) +
      (p3DatePaid ? toNumber(p3Amount) : 0);

    const result = (total - paidSum) / 4;
    return roundCurrency(result);
  }

  // LET(terms, SWITCH(...))
  const terms = getPaymentPlanTerms(paymentPlan);
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

  // IF(terms<4,"", amount)
  if (terms < 4) return "";

  return roundCurrency(allocations[3] ?? 0);
}
