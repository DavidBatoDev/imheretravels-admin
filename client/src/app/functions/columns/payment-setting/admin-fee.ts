import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const adminFeeColumn: BookingSheetColumn = {
  id: "adminFee",
  data: {
    id: "adminFee",
    columnName: "Admin Fee",
    dataType: "function",
    function: "getAdminFeeFunction",
    parentTab: "Payment Setting",
    includeInForms: false,
    color: "gray",
    width: 150,
    arguments: [
      {
        name: "cancellationInitiatedBy",
        type: "string",
        columnReference: "Cancellation Initiated By",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "eligibleRefund",
        type: "string",
        columnReference: "Eligible Refund",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paidTerms",
        type: "number | string",
        columnReference: "Paid Terms",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentAmount",
        type: "number | string",
        columnReference: "Full Payment Amount",
        isOptional: true,
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
        name: "supplierCostsCommitted",
        type: "number",
        columnReference: "Supplier Costs Committed",
        isOptional: false,
        hasDefault: true,
        isRest: false,
        value: "0",
      },
      {
        name: "reasonForCancellation",
        type: "string",
        columnReference: "Reason for Cancellation",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paid",
        type: "number | string",
        columnReference: "Paid",
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
 * Calculates admin fee (10% of refundable amount) for cancelled bookings
 *
 * Admin Fee Rules:
 * 1. Admin fee = 0 when IHT cancels (IHT covers all costs)
 * 2. Admin fee = 0 when supplier costs involved (supplier takes the cost)
 * 3. Admin fee = 0 when no refund eligible
 * 4. For full payments: 10% of what was actually paid beyond the reservation
 *    fee (Paid - Reservation Fee). Full Payment Amount is the balance DUE after
 *    the reservation fee, so it must not be used: a guest who only paid the
 *    deposit would be charged a fee on money never received.
 * 5. For installments: 10% of paid terms
 *
 * The admin fee is deducted from the customer's refund to cover
 * processing and administrative costs of the cancellation.
 *
 * Parameters:
 * - cancellationInitiatedBy → Who cancelled ("Guest" | "IHT")
 * - eligibleRefund → Refund eligibility status
 * - paidTerms → Total installment payments (excludes RF)
 * - fullPaymentAmount → Full payment amount (if applicable)
 * - reservationFee → Reservation fee amount
 * - supplierCostsCommitted → Supplier costs (default 0)
 * - reasonForCancellation → Cancellation reason
 * - paid → Total amount paid (reservation fee + payments)
 *
 * Returns:
 * - number → 10% of applicable amount
 * - 0 → when admin fee doesn't apply
 * - "" → if not cancelled
 */

export default async function getAdminFee(
  cancellationInitiatedBy: string | null | undefined,
  eligibleRefund: string,
  paidTerms: number | string,
  fullPaymentAmount: number | string | null | undefined,
  reservationFee: number | string,
  supplierCostsCommitted: number = 0,
  reasonForCancellation: string,
  paid?: number | string,
): Promise<number | string> {
  // Return empty if not cancelled
  if (!reasonForCancellation) {
    return "";
  }

  // Helper to convert to number
  const toNumber = (value: any): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // IHT cancellations: No admin fee
  if (cancellationInitiatedBy === "IHT") {
    return 0;
  }

  // Supplier costs override: No admin fee (supplier bears the cost)
  if (supplierCostsCommitted > 0) {
    return 0;
  }

  // If refund is ineligible or no refund, admin fee is 0
  if (
    eligibleRefund.includes("No refund") ||
    eligibleRefund === "Refund Ineligible" ||
    eligibleRefund === "0 Paid Terms, no refund"
  ) {
    return 0;
  }

  // Determine if full payment or installment
  const fullPayment = toNumber(fullPaymentAmount);
  const paidInstallments = toNumber(paidTerms);
  const rf = toNumber(reservationFee);

  let baseAmount = 0;

  if (fullPayment > 0) {
    // Full Payment: calculate on what was actually paid beyond the RF.
    baseAmount = Math.max(0, toNumber(paid) - rf);
  } else {
    // Installment: Calculate on paid terms
    baseAmount = paidInstallments;
  }

  // If no base amount, return 0
  if (baseAmount <= 0) {
    return 0;
  }

  // Calculate 10% admin fee
  return 0.1 * baseAmount;
}
