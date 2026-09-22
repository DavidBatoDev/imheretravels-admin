import { BookingSheetColumn } from "@/types/booking-sheet-column";
import {
  getAppliedManualCreditAmount,
  hasPaidDate,
  roundCurrency,
  toNumber,
  hasPerSlotCash,
  cashReceivedForTerm,
  reservationCashReceived,
} from "../payment-calculation-helpers";

export const paidColumn: BookingSheetColumn = {
  id: "paid",
  data: {
    id: "paid",
    columnName: "Paid",
    dataType: "function",
    function: "getTotalPaidAmountFunction",
    parentTab: "Payment Setting",
    includeInForms: false,
    color: "yellow",
    width: 100,
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
        name: "reservationFee",
        type: "string | number",
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
        type: "string | number",
        columnReference: "Manual Credit",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentDate",
        type: "any",
        columnReference: "Full Payment Date Paid",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentAmount",
        type: "string | number",
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
        type: "string | number",
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
        type: "string | number",
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
        type: "string | number",
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
        type: "string | number",
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
export default function getTotalPaidAmountFunction(
  tourPackageName: string,
  reservationFee?: number | string | null,
  creditFrom?: string | null,
  creditAmount?: number | string | null,
  fullPaymentDate?: any,
  fullPaymentAmount?: number | string | null,
  p1DatePaid?: any,
  p1Amount?: number | string | null,
  p2DatePaid?: any,
  p2Amount?: number | string | null,
  p3DatePaid?: any,
  p3Amount?: number | string | null,
  p4DatePaid?: any,
  p4Amount?: number | string | null,
  p1LateFeesPenalty?: number | string | null,
  p2LateFeesPenalty?: number | string | null,
  p3LateFeesPenalty?: number | string | null,
  p4LateFeesPenalty?: number | string | null,
  reservationAmountPaid?: number | string | null,
  p1AmountPaid?: number | string | null,
  p2AmountPaid?: number | string | null,
  p3AmountPaid?: number | string | null,
  p4AmountPaid?: number | string | null,
  fullPaymentAmountPaid?: number | string | null,
): number | string {
  if (!tourPackageName) return "";

  const creditFromStr = (creditFrom || "").trim();
  const appliedCredit = getAppliedManualCreditAmount(
    creditFromStr,
    creditAmount,
    fullPaymentDate,
    p1DatePaid,
    p2DatePaid,
    p3DatePaid,
    p4DatePaid,
  );
  const creditAppliedTo = (source: string): boolean =>
    appliedCredit > 0 && creditFromStr === source;

  const p1IsPaid = hasPaidDate(p1DatePaid);
  const p2IsPaid = hasPaidDate(p2DatePaid);
  const p3IsPaid = hasPaidDate(p3DatePaid);
  const p4IsPaid = hasPaidDate(p4DatePaid);

  // Reservation Fee
  // Per-slot cash model: when any *AmountPaid is present, cash is what
  // arrived per slot and the legacy manual credit is ignored (it is already
  // inside those amounts). Otherwise legacy behaviour is unchanged.
  const perSlot = hasPerSlotCash(
    reservationAmountPaid, p1AmountPaid, p2AmountPaid, p3AmountPaid, p4AmountPaid, fullPaymentAmountPaid,
  );
  const resPaid = perSlot
    ? reservationCashReceived(reservationFee, reservationAmountPaid)
    : toNumber(reservationFee) +
      (creditAppliedTo("Reservation") ? appliedCredit : 0);

  // Full Payment — fullPaymentAmount is already net of any manual credit
  // (see getFullPaymentRemainingFunction), so it's counted as-is once paid.
  const fullPaid = perSlot
    ? cashReceivedForTerm(fullPaymentAmount, fullPaymentAmountPaid, fullPaymentDate)
    : hasPaidDate(fullPaymentDate) ? toNumber(fullPaymentAmount) : 0;

  // Partial Payments — p1Amount..p4Amount are already net of any manual
  // credit applied to that term (see allocateInstallmentAmounts), so each is
  // counted as-is once paid. Only a "Reservation" credit is added separately
  // above, since the Reservation Fee field is never itself discounted.
  const p1_paid = perSlot
    ? cashReceivedForTerm(p1Amount, p1AmountPaid, p1DatePaid)
    : p1IsPaid ? toNumber(p1Amount) : 0;
  const p2_paid = perSlot
    ? cashReceivedForTerm(p2Amount, p2AmountPaid, p2DatePaid)
    : p2IsPaid ? toNumber(p2Amount) : 0;
  const p3_paid = perSlot
    ? cashReceivedForTerm(p3Amount, p3AmountPaid, p3DatePaid)
    : p3IsPaid ? toNumber(p3Amount) : 0;
  const p4_paid = perSlot
    ? cashReceivedForTerm(p4Amount, p4AmountPaid, p4DatePaid)
    : p4IsPaid ? toNumber(p4Amount) : 0;

  // Late fees are counted as paid only when an actual date-paid is present.
  const p1PenaltyPaid = hasPaidDate(p1DatePaid) ? toNumber(p1LateFeesPenalty) : 0;
  const p2PenaltyPaid = hasPaidDate(p2DatePaid) ? toNumber(p2LateFeesPenalty) : 0;
  const p3PenaltyPaid = hasPaidDate(p3DatePaid) ? toNumber(p3LateFeesPenalty) : 0;
  const p4PenaltyPaid = hasPaidDate(p4DatePaid) ? toNumber(p4LateFeesPenalty) : 0;

  const totalPaid =
    resPaid +
    fullPaid +
    p1_paid +
    p2_paid +
    p3_paid +
    p4_paid +
    p1PenaltyPaid +
    p2PenaltyPaid +
    p3PenaltyPaid +
    p4PenaltyPaid;

  return roundCurrency(totalPaid);
}
