import { BookingSheetColumn } from "@/types/booking-sheet-column";
import { paidLateFeeArguments, paidLateFees } from "../payment-calculation-helpers";

export const refundableAmountColumn: BookingSheetColumn = {
  id: "refundableAmount",
  data: {
    id: "refundableAmount",
    columnName: "Refundable Amount",
    dataType: "function",
    function: "getRefundableAmountFunction",
    parentTab: "Cancellation",
    includeInForms: false,
    color: "none",
    width: 200,
    arguments: [
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
        name: "adminFee",
        type: "number | string",
        columnReference: "Admin Fee",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paid",
        type: "number | string",
        columnReference: "Paid",
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
        name: "reservationFee",
        type: "number | string",
        columnReference: "Reservation Fee",
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
        name: "supplierCostsCommitted",
        type: "number",
        columnReference: "Supplier Costs Committed",
        isOptional: false,
        hasDefault: true,
        isRest: false,
        value: "0",
      },
      {
        name: "cancellationRequestDate",
        type: "date | string",
        columnReference: "Cancellation Request Date",
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
      ...paidLateFeeArguments,
    ],
  },
};

// Column Function Implementation
/**
 * Calculates refundable amount based on cancellation scenario
 *
 * Key Rules:
 * 1. Reservation Fee (RF) is ONLY refundable when IHT cancels
 * 2. For full payments: NRA (Non-Reservation Amount) = Paid - RF
 * 3. For installments: Only paidTerms are considered (RF excluded)
 * 4. Supplier costs reduce any calculated refund
 * 4b. Paid late fees are never refunded to a guest
 * 5. Admin fee is deducted from refundable amount (except IHT cancellations)
 *
 * Scenarios:
 * - IHT cancels: Full amount paid (includes RF)
 * - Guest cancels (full, early): 100% of NRA - admin fee
 * - Guest cancels (full, mid): 50% of NRA - admin fee
 * - Guest cancels (full, late): 0
 * - Guest cancels (installment, early): 100% of paid terms - admin fee
 * - Guest cancels (installment, mid): 50% of paid terms - admin fee
 * - Guest cancels (installment, late): 0
 * - Supplier costs: calculated refund - supplier costs (min 0)
 * - No-show: 0
 *
 * Parameters:
 * - reasonForCancellation → Reason with "Guest -" or "IHT -" prefix
 * - adminFee → Admin fee amount
 * - paid → Total amount paid (RF + installments or full payment)
 * - paidTerms → Installment payments only (excludes RF)
 * - reservationFee → Reservation fee amount
 * - fullPaymentAmount → Full payment amount (if applicable)
 * - supplierCostsCommitted → Supplier costs (default 0)
 * - cancellationRequestDate → Date cancellation was requested
 * - eligibleRefund → Refund eligibility status from scenario
 *
 * Returns:
 * - number → Refundable amount
 * - "" → if no cancellation date
 */

/**
 * Extract who initiated cancellation from reason string
 */
function extractInitiator(
  reasonForCancellation: string | null | undefined,
): "Guest" | "IHT" | null {
  if (!reasonForCancellation) return null;

  const reason = reasonForCancellation.trim();
  if (reason.startsWith("Guest -") || reason.startsWith("Guest-")) {
    return "Guest";
  }
  if (reason.startsWith("IHT -") || reason.startsWith("IHT-")) {
    return "IHT";
  }

  // Fallback: check if it contains the words anywhere
  const lowerReason = reason.toLowerCase();
  if (lowerReason.includes("iht")) return "IHT";
  if (lowerReason.includes("guest")) return "Guest";

  return null;
}

export default async function getRefundableAmount(
  reasonForCancellation: string | null | undefined,
  adminFee: number | string,
  paid: number | string,
  paidTerms: number | string,
  reservationFee: number | string,
  fullPaymentAmount: number | string | null | undefined,
  supplierCostsCommitted: number = 0,
  cancellationRequestDate: Date | string,
  eligibleRefund: string,
  p1LateFeesPenalty?: number | string | null,
  p1DatePaid?: any,
  p2LateFeesPenalty?: number | string | null,
  p2DatePaid?: any,
  p3LateFeesPenalty?: number | string | null,
  p3DatePaid?: any,
  p4LateFeesPenalty?: number | string | null,
  p4DatePaid?: any,
): Promise<number | string> {
  // Return empty if no cancellation date
  if (!cancellationRequestDate) {
    return "";
  }

  // Extract who initiated from reason
  const cancellationInitiatedBy = extractInitiator(reasonForCancellation);

  // Helper to convert to number
  const toNumber = (value: any): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const admin = toNumber(adminFee);
  const totalPaid = toNumber(paid);
  const paidInstallments = toNumber(paidTerms);
  const rf = toNumber(reservationFee);
  const fullPayment = toNumber(fullPaymentAmount);
  const supplierCosts = toNumber(supplierCostsCommitted);

  let refundable = 0;

  // IHT Cancellations - Full refund including RF (no admin fee)
  if (cancellationInitiatedBy === "IHT") {
    if (eligibleRefund.includes("100% refund including RF")) {
      refundable = totalPaid; // Includes everything
    } else if (eligibleRefund.includes("Partial refund")) {
      // For partial refunds (tour started), use total paid for now
      // In future, calculate unused portion based on tour progress
      refundable = totalPaid;
    } else {
      refundable = totalPaid;
    }
    // No admin fee for IHT cancellations
    // Subtract supplier costs if any
    return Math.max(0, refundable - supplierCosts);
  }

  // Guest Cancellations - RF is NEVER refundable

  // Handle "No refund" scenarios
  if (
    eligibleRefund.includes("No refund") ||
    eligibleRefund === "0 Paid Terms, no refund" ||
    eligibleRefund === "Refund Ineligible"
  ) {
    return 0;
  }

  // Determine if this is a full payment or installment scenario
  const isFullPayment = fullPayment > 0;

  if (isFullPayment) {
    // Full Payment Scenario
    // NRA = what was actually paid beyond the reservation fee. Full Payment
    // Amount is the balance DUE after the RF, so using it refunded money that
    // was never paid (deposit-only cancellations) and subtracted the RF twice
    // (paid-in-full cancellations).
    // Paid late fees are never refundable, so they come out of the NRA too.
    const lateFees = paidLateFees(
      [p1LateFeesPenalty, p1DatePaid],
      [p2LateFeesPenalty, p2DatePaid],
      [p3LateFeesPenalty, p3DatePaid],
      [p4LateFeesPenalty, p4DatePaid],
    );
    const nra = Math.max(0, totalPaid - rf - lateFees);

    if (
      eligibleRefund.includes("100% of non-reservation amount") ||
      eligibleRefund.includes("100% of NRA")
    ) {
      refundable = nra - admin;
    } else if (
      eligibleRefund.includes("50% of non-reservation amount") ||
      eligibleRefund.includes("50% of NRA")
    ) {
      refundable = nra * 0.5 - admin;
    } else if (eligibleRefund.includes("100% refund minus Admin Fee")) {
      // Legacy format
      refundable = nra - admin;
    } else if (eligibleRefund.includes("50% refund minus Admin Fee")) {
      // Legacy format
      refundable = nra * 0.5 - admin;
    }
  } else {
    // Installment Scenario
    // Only paidTerms are refundable (RF already excluded)

    if (
      eligibleRefund.includes("100% of paid terms") ||
      eligibleRefund.includes("Refund of paid terms") ||
      eligibleRefund.includes("Refund after admin")
    ) {
      refundable = paidInstallments - admin;
    } else if (
      eligibleRefund.includes("50% of paid terms") ||
      eligibleRefund.includes("50% refund after admin")
    ) {
      refundable = paidInstallments * 0.5 - admin;
    } else if (eligibleRefund.includes("100% refund minus Admin Fee")) {
      // Legacy format
      refundable = paidInstallments - admin;
    } else if (eligibleRefund.includes("50% refund minus Admin Fee")) {
      // Legacy format
      refundable = paidInstallments * 0.5 - admin;
    }
  }

  // Subtract supplier costs (overrides any refund calculation)
  if (supplierCosts > 0) {
    refundable = Math.max(0, refundable - supplierCosts);
  }

  // Ensure non-negative
  return Math.max(0, refundable);
}
