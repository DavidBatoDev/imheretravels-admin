import { BookingSheetColumn } from "@/types/booking-sheet-column";
import {
  getAppliedManualCreditAmount,
  hasPaidDate,
  roundCurrency,
  toNumber,
  hasPerSlotCash,
  cashReceivedForTerm,
} from "../payment-calculation-helpers";

export const paidTermsColumn: BookingSheetColumn = {
  id: "paidTerms",
  data: {
    id: "paidTerms",
    columnName: "Paid Terms",
    dataType: "function",
    function: "getPaidTermsFunction",
    parentTab: "Payment Setting",
    includeInForms: false,
    color: "gray",
    width: 150,
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
        name: "creditFrom",
        type: "string",
        columnReference: "Credit From",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "manualCredit",
        type: "number | string",
        columnReference: "Manual Credit",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentDatePaid",
        type: "date | string",
        columnReference: "Full Payment Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentAmount",
        type: "number | string",
        columnReference: "Full Payment Amount",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1DatePaid",
        type: "date | string",
        columnReference: "P1 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1Amount",
        type: "number | string",
        columnReference: "P1 Amount",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2DatePaid",
        type: "date | string",
        columnReference: "P2 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2Amount",
        type: "number | string",
        columnReference: "P2 Amount",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3DatePaid",
        type: "date | string",
        columnReference: "P3 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3Amount",
        type: "number | string",
        columnReference: "P3 Amount",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4DatePaid",
        type: "date | string",
        columnReference: "P4 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4Amount",
        type: "number | string",
        columnReference: "P4 Amount",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "reservationFee",
        type: "number | string",
        columnReference: "Reservation Fee",
        isOptional: false,
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
 *     credit_from,   IFNA(AQ1003,""),
 *     credit_amt,    N(AP1003),
 *
 *     full_paid, IF(BA1003<>"", AZ1003, 0),
 *     p1_paid,   IF(BJ1003<>"", IF(credit_from="P1", credit_amt, BI1003), 0),
 *     p2_paid,   IF(BS1003<>"", IF(credit_from="P2", credit_amt, BR1003), 0),
 *     p3_paid,   IF(CB1003<>"", IF(credit_from="P3", credit_amt, CA1003), 0),
 *     p4_paid,   IF(CK1003<>"", IF(credit_from="P4", credit_amt, CJ1003), 0),
 *
 *     res_paid, resfee + IF(credit_from="Reservation", credit_amt, 0),
 *
 *     full_paid + p1_paid + p2_paid + p3_paid + p4_paid
 *   )
 * )
 *
 * Description:
 * - Calculates total amount paid across all payment terms
 * - Sums Full Payment, P1-P4 payments, and reservation fee
 * - Accounts for manual credits applied to specific payment terms
 * - Returns empty string if no tour package selected
 *
 * Parameters:
 * - tourPackageName → Name of selected tour package (triggers calculation)
 * - creditFrom → Which payment term received the credit ("Reservation", "P1", "P2", "P3", "P4")
 * - manualCredit → Amount of manual credit applied
 * - fullPaymentDatePaid → Date full payment was made (triggers inclusion)
 * - fullPaymentAmount → Full payment amount
 * - p1DatePaid → Date P1 was paid
 * - p1Amount → P1 amount
 * - p2DatePaid → Date P2 was paid
 * - p2Amount → P2 amount
 * - p3DatePaid → Date P3 was paid
 * - p3Amount → P3 amount
 * - p4DatePaid → Date P4 was paid
 * - p4Amount → P4 amount
 * - reservationFee → Reservation fee amount
 *
 * Returns:
 * - number → Total paid amount
 * - "" → if no tour package selected
 */

export default async function getPaidTerms(
  tourPackageName: string,
  creditFrom: string,
  manualCredit: number | string,
  fullPaymentDatePaid: Date | string,
  fullPaymentAmount: number | string,
  p1DatePaid: Date | string,
  p1Amount: number | string,
  p2DatePaid: Date | string,
  p2Amount: number | string,
  p3DatePaid: Date | string,
  p3Amount: number | string,
  p4DatePaid: Date | string,
  p4Amount: number | string,
  reservationFee: number | string,
  reservationAmountPaid?: number | string | null,
  p1AmountPaid?: number | string | null,
  p2AmountPaid?: number | string | null,
  p3AmountPaid?: number | string | null,
  p4AmountPaid?: number | string | null,
  fullPaymentAmountPaid?: number | string | null,
): Promise<number | string> {
  // Return empty if no tour package selected
  if (!tourPackageName) return "";
  void reservationFee;

  // Get credit amount (default to 0 if invalid)
  const creditFromValue = (creditFrom || "").trim();
  const appliedCredit = getAppliedManualCreditAmount(
    creditFromValue,
    manualCredit,
    fullPaymentDatePaid,
    p1DatePaid,
    p2DatePaid,
    p3DatePaid,
    p4DatePaid,
  );
  const creditAppliedTo = (source: string): boolean =>
    appliedCredit > 0 && creditFromValue === source;

  // Per-slot cash model: cash per slot replaces the manual credit entirely.
  const perSlot = hasPerSlotCash(
    reservationAmountPaid, p1AmountPaid, p2AmountPaid, p3AmountPaid, p4AmountPaid, fullPaymentAmountPaid,
  );

  // Calculate each payment term (manual credit from Px requires matching date paid)
  const fullPaid = perSlot
    ? cashReceivedForTerm(fullPaymentAmount, fullPaymentAmountPaid, fullPaymentDatePaid)
    : hasPaidDate(fullPaymentDatePaid)
    ? creditAppliedTo("Full Payment")
      ? appliedCredit
      : toNumber(fullPaymentAmount)
    : 0;

  const p1Paid = perSlot
    ? cashReceivedForTerm(p1Amount, p1AmountPaid, p1DatePaid)
    : hasPaidDate(p1DatePaid)
    ? creditAppliedTo("P1")
      ? appliedCredit
      : toNumber(p1Amount)
    : 0;

  const p2Paid = perSlot
    ? cashReceivedForTerm(p2Amount, p2AmountPaid, p2DatePaid)
    : hasPaidDate(p2DatePaid)
    ? creditAppliedTo("P2")
      ? appliedCredit
      : toNumber(p2Amount)
    : 0;

  const p3Paid = perSlot
    ? cashReceivedForTerm(p3Amount, p3AmountPaid, p3DatePaid)
    : hasPaidDate(p3DatePaid)
    ? creditAppliedTo("P3")
      ? appliedCredit
      : toNumber(p3Amount)
    : 0;

  const p4Paid = perSlot
    ? cashReceivedForTerm(p4Amount, p4AmountPaid, p4DatePaid)
    : hasPaidDate(p4DatePaid)
    ? creditAppliedTo("P4")
      ? appliedCredit
      : toNumber(p4Amount)
    : 0;

  // Sum installment/full-term payments (reservation is intentionally excluded for paid terms)
  const totalPaid = fullPaid + p1Paid + p2Paid + p3Paid + p4Paid;

  return roundCurrency(totalPaid);
}
