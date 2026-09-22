import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const bookingStatusColumn: BookingSheetColumn = {
  id: "bookingStatus",
  data: {
    id: "bookingStatus",
    columnName: "Booking Status",
    dataType: "function",
    function: "bookingStatusFunction",
    parentTab: "Payment Setting",
    includeInForms: false,
    color: "yellow",
    width: 168,
    options: ["", "Confirmed", "Pending", "Cancelled", "Completed", "Elapsed"],
    arguments: [
      {
        name: "reason",
        type: "string",
        columnReference: "Reason for Cancellation",
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
        name: "remainingBalance",
        type: "string | number",
        columnReference: "Remaining Balance",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "fullPaymentDatePaid",
        type: "any",
        columnReference: "Full Payment Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p1DatePaid",
        type: "any",
        columnReference: "P1 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p2DatePaid",
        type: "any",
        columnReference: "P2 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p3DatePaid",
        type: "any",
        columnReference: "P3 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "p4DatePaid",
        type: "any",
        columnReference: "P4 Date Paid",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "tourDate",
        type: "any",
        columnReference: "Tour Date",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "returnDate",
        type: "any",
        columnReference: "Return Date",
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
 * Booking Status (Excel translation)
 */
export default function bookingStatusFunction(
  reason: string | null | undefined,
  paymentPlan: string | null | undefined,
  remainingBalance: number | string | null | undefined,
  fullPaymentDatePaid: any,
  p1DatePaid: any,
  p2DatePaid: any,
  p3DatePaid: any,
  p4DatePaid: any,
  tourDate?: any,
  returnDate?: any,
): string {
  // --- 1. Handle cancellation ---
  if (reason && reason.trim() !== "") return "Cancelled";

  // --- 2. Normalize plan & balance ---
  const plan = (paymentPlan || "").trim();
  const hasAnyDate =
    fullPaymentDatePaid || p1DatePaid || p2DatePaid || p3DatePaid || p4DatePaid;

  // Detect completely empty rows early
  const isAllEmpty =
    !plan &&
    !hasAnyDate &&
    (remainingBalance === null || remainingBalance === undefined);
  if (isAllEmpty) return "";

  const rem =
    typeof remainingBalance === "string"
      ? parseFloat(remainingBalance.replace(/[^\d.-]/g, "")) || 0
      : typeof remainingBalance === "number"
      ? remainingBalance
      : 0;

  // --- 3. Enhanced date parser (handles Firestore timestamps too) ---
  const toDate = (d: any): Date | null => {
    if (!d) return null;

    if (typeof d === "object" && d?.type === "firestore/timestamp/1.0") {
      return new Date(d.seconds * 1000);
    }

    if (typeof d?.seconds === "number" && typeof d?.nanoseconds === "number") {
      return new Date(d.seconds * 1000);
    }

    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;

    if (typeof d === "string") {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  };

  const p1 = toDate(p1DatePaid);
  const p2 = toDate(p2DatePaid);
  const p3 = toDate(p3DatePaid);
  const p4 = toDate(p4DatePaid);
  const full = toDate(fullPaymentDatePaid);

  // --- 4. Extract total payment terms ---
  const tot =
    plan === "Full Payment"
      ? 1
      : plan.match(/P(\d)/)
      ? parseInt(plan.match(/P(\d)/)![1], 10)
      : 0;

  // --- 5. Count how many payments made ---
  const paidCount =
    plan === "Full Payment" ? 0 : [p1, p2, p3, p4].filter(Boolean).length;

  // --- 6. Determine last payment date ---
  const maxDate = (...dates: (Date | null)[]): Date | null => {
    const valid = dates.filter((d): d is Date => d instanceof Date);
    if (valid.length === 0) return null;
    return new Date(Math.max(...valid.map((d) => d.getTime())));
  };

  const lastPaid =
    plan === "Full Payment"
      ? full
      : plan === "P1"
      ? p1
      : plan === "P2"
      ? maxDate(p1, p2)
      : plan === "P3"
      ? maxDate(p1, p2, p3)
      : plan === "P4"
      ? maxDate(p1, p2, p3, p4)
      : null;

  // --- 6b. Elapsed: tour has ENDED and a balance is still owing ---
  // Mirrors the daily elapseBookingsDaily stamp, so an edit to the row
  // cannot revert a stamped "Elapsed" back to "Installment n/m".
  // (Cancelled already returned above; a settled booking falls through.)
  const tourEnd = toDate(returnDate) ?? toDate(tourDate);
  if (tourEnd && rem > 0) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (tourEnd < startOfToday) return "Elapsed";
  }

  // --- 7. Compute base status ---
  let baseStatus = "";
  if (rem === 0 && (paidCount > 0 || full)) {
    baseStatus = "Booking Confirmed";
  } else if (plan === "") {
    baseStatus = "";
  } else if (plan === "Full Payment") {
    baseStatus = "Waiting for Full Payment";
  } else {
    baseStatus = `Installment ${paidCount}/${tot}`;
  }

  // --- 8. Extend with date or "last paid" info ---
  const formatDate = (d: Date | null): string =>
    d
      ? d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

  let status = baseStatus;

  if (rem === 0 && baseStatus === "Booking Confirmed") {
    status = lastPaid ? `${baseStatus} — ${formatDate(lastPaid)}` : baseStatus;
  } else if (paidCount > 0 && lastPaid) {
    status = `${baseStatus} — last paid ${formatDate(lastPaid)}`;
  }

  return status || "";
}
