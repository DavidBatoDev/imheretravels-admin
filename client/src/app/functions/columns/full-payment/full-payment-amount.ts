import { BookingSheetColumn } from "@/types/booking-sheet-column";
import { hasPerSlotCash, reservationCashReceived } from "../payment-calculation-helpers";

export const fullPaymentAmountColumn: BookingSheetColumn = {
  id: "fullPaymentAmount",
  data: {
    id: "fullPaymentAmount",
    columnName: "Full Payment Amount",
    dataType: "function",
    function: "getFullPaymentRemainingFunction",
    parentTab: "Full Payment",
    includeInForms: false,
    color: "yellow",
    width: 160,
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
        name: "paymentPlan",
        type: "string",
        columnReference: "Payment Plan",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "isMainBooker",
        type: "boolean",
        columnReference: "Is Main Booker?",
        isOptional: false,
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
        name: "creditAmount",
        type: "number",
        columnReference: "Manual Credit",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paymentCondition",
        type: "string",
        columnReference: "Payment Condition",
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
    ],
  },
};

// Column Function Implementation
/**
 * Excel equivalent (updated):
 * Returns the full payment amount if:
 * - paymentCondition is "Last Minute Booking" (regardless of payment plan), OR
 * - paymentPlan is "Full Payment"
 * Returns "" if a payment plan is selected AND it's not "Full Payment"
 *
 * Description:
 * - Calculates the remaining amount for a **Full Payment** plan or Last Minute Booking.
 * - If tourPackageName is blank, returns "".
 * - Uses discounted cost if user is the main booker, otherwise uses original cost.
 * - Rounds result using Math.round to 2 decimal places.
 */

export default function getFullPaymentRemainingFunction(
  tourPackageName: string, // corresponds to $AT1003
  paymentPlan: string, // $AM1003
  isMainBooker: boolean, // $Y1003
  discountedTourCost?: number, // $AG1003
  originalTourCost?: number, // $AF1003
  reservationFee?: number, // $AH1003
  creditAmount?: number, // $AK1003
  paymentCondition?: string, // Payment Condition
  reservationAmountPaid?: number | string | null,
): number | string {
  // if no tour package name, return ""
  if (!tourPackageName) return "";

  // If a payment plan is selected and it's not "Full Payment", hide the value
  if (
    paymentPlan &&
    paymentPlan.trim() !== "" &&
    paymentPlan.trim() !== "Full Payment"
  ) {
    return "";
  }

  // Show value if payment condition is "Last Minute Booking" OR payment plan is "Full Payment"
  const isLastMinute = paymentCondition?.trim() === "Last Minute Booking";
  const isFullPayment = paymentPlan?.trim() === "Full Payment";

  if (!isLastMinute && !isFullPayment) return "";

  // Use the discounted cost when one is actually active, otherwise fall back
  // to the original price — mirrors every other cost calculation in this
  // codebase (see p1-amount.ts, remaining-balance.ts). Gating this on
  // isMainBooker instead zeroed out baseCost for any main booker without an
  // active discount, since discountedTourCost is empty/0 for them.
  const baseCost =
    (discountedTourCost || 0) > 0
      ? discountedTourCost || 0
      : originalTourCost || 0;

  // handle reservation and credit safely
  // Per-slot cash model: a reservation overpayment is recorded as cash on the
  // reservation itself, so it (not a manual credit) reduces the full payment.
  const perSlot = hasPerSlotCash(reservationAmountPaid);
  const resFee = perSlot
    ? reservationCashReceived(reservationFee, reservationAmountPaid)
    : reservationFee || 0;
  const credit = perSlot ? 0 : creditAmount || 0;

  // compute remaining and round to 2 decimals
  const remaining = Math.round((baseCost - resFee - credit) * 100) / 100;

  return remaining;
}
