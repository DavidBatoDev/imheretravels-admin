import { computeEligibleInstallmentDatesLocal } from "@/lib/installment-schedule";
import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const p1DueDateColumn: BookingSheetColumn = {
  id: "p1DueDate",
  data: {
    id: "p1DueDate",
    columnName: "P1 Due Date",
    dataType: "function",
    function: "getP1DueDateFunction",
    parentTab: "Payment Term 1",
    includeInForms: false,
    color: "yellow",
    width: 120,
    arguments: [
      {
        name: "reservationDate",
        type: "unknown",
        columnReference: "Reservation Date",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "tourDate",
        type: "unknown",
        columnReference: "Tour Date",
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
        columnReference: "Payment Condition",
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
 * Converts various date formats into a normalized "yyyy-mm-dd" string.
 * Returns:
 *  - ""        => for null/undefined/empty-string inputs
 *  - "ERROR"   => for invalid/unparseable inputs
 *  - "yyyy-mm-dd" => for valid inputs
 *
 * Accepts:
 *  - null/undefined/""
 *  - Date
 *  - number (ms since epoch)
 *  - string ("September 15, 2025 at 8:00:00 AM UTC+8", "15/09/2025", "2025-09-15")
 *  - Firestore Timestamp (has .toDate())
 *  - { seconds: number, nanoseconds?: number } shape
 *
 * NOTE: This function intentionally returns the literal "ERROR" for inputs
 * that cannot be parsed — so callers can choose to surface that or treat it
 * as a failure case.
 */
export function tourDateToYyyymmdd(tourDate: unknown): string {
  // 1) Blank handling
  if (tourDate === null || tourDate === undefined) return "";
  if (typeof tourDate === "string" && tourDate.trim() === "") return "";

  // 2) Try to normalize to a Date
  let date: Date | null = null;

  try {
    // Firestore Timestamp: has .toDate()
    if (
      typeof tourDate === "object" &&
      tourDate !== null &&
      "toDate" in (tourDate as any) &&
      typeof (tourDate as any).toDate === "function"
    ) {
      date = (tourDate as any).toDate();
    }
    // Firestore-like { seconds, nanoseconds }
    else if (
      typeof tourDate === "object" &&
      tourDate !== null &&
      "seconds" in (tourDate as any) &&
      typeof (tourDate as any).seconds === "number"
    ) {
      const s = (tourDate as any).seconds as number;
      const ns =
        typeof (tourDate as any).nanoseconds === "number"
          ? (tourDate as any).nanoseconds
          : 0;
      date = new Date(s * 1000 + Math.floor(ns / 1e6));
    }
    // Already a Date
    else if (tourDate instanceof Date) {
      date = tourDate;
    }
    // Milliseconds timestamp (number)
    else if (typeof tourDate === "number") {
      const d = new Date(tourDate);
      date = isNaN(d.getTime()) ? null : d;
    }
    // String inputs
    else if (typeof tourDate === "string") {
      const raw = (tourDate as string).trim();

      // dd/mm/yyyy
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("/").map((s) => Number(s));
        date = new Date(yyyy, mm - 1, dd);
      }
      // yyyy-mm-dd
      else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yyyy, mm, dd] = raw.split("-").map((s) => Number(s));
        date = new Date(yyyy, mm - 1, dd);
      }
      // fallback: try Date constructor (handles "October 8, 2025 ...", ISO, etc.)
      else {
        // remove common invisible characters that break parsing (e.g. narrow NBSP)
        const cleaned = raw.replace(/[\u200B-\u200F\u2028-\u202F]/g, "").trim();
        const parsed = new Date(cleaned);
        date = isNaN(parsed.getTime()) ? null : parsed;
      }
    } else {
      // unsupported type
      return "ERROR";
    }

    // 3) Validate
    if (!date || isNaN(date.getTime())) return "ERROR";

    // 4) Format yyyy-mm-dd
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "ERROR";
  }
}

/**
 * Excel equivalent:
 * =IF(
 *   OR($AM1003="Full Payment", ISBLANK($K1003)),
 *   "",
 *   IF(
 *     OR(
 *       Q1003="Standard Booking, P1",
 *       Q1003="Standard Booking, P2",
 *       Q1003="Standard Booking, P3",
 *       Q1003="Standard Booking, P4"
 *     ),
 *     LET(
 *       resDate, $K1003,
 *       tourDate, $N1003,
 *       monthCount, DATEDIF(resDate, tourDate, "M") + 1,
 *       secondDates, DATE(YEAR(resDate), MONTH(resDate) + SEQUENCE(monthCount), 2),
 *       validDates, FILTER(secondDates, (secondDates > resDate + 2) * (secondDates <= tourDate - 3)),
 *       IF(COUNTA(validDates)<1, "", TEXT(INDEX(validDates, 1), "mmm d, yyyy"))
 *     ),
 *     ""
 *   )
 * )
 *
 * Updated behavior:
 * - Uses tourDateToYyyymmdd to normalize inputs (supports Date, strings, Firestore shapes).
 * - If tourDateToYyyymmdd returns "" -> treat as blank -> returns "" (matches ISBLANK).
 * - If tourDateToYyyymmdd returns "ERROR" -> returns "ERROR" so caller can surface parse issues.
 *
 * Returns:
 *  - ""                => when reservation/tour blank or conditions not met
 *  - "ERROR"           => when reservation/tour could not be parsed
 *  - "MMM d, yyyy"     => the first valid P1 due date (e.g., "Oct 8, 2025")
 */
export default function getP1DueDateFunction(
  reservationDate?: unknown,
  tourDate?: unknown,
  paymentPlan?: string,
  paymentCondition?: string,
): string | "" | "ERROR" {
  // Same guard as Excel: if payment plan is Full Payment or reservation blank => ""
  if (paymentPlan === "Full Payment") return "";
  if (reservationDate === null || reservationDate === undefined) return "";

  const validConditions = [
    "Standard Booking, P1",
    "Standard Booking, P2",
    "Standard Booking, P3",
    "Standard Booking, P4",
  ];
  if (!validConditions.includes(paymentCondition ?? "")) return "";

  // Normalize inputs using the helper
  const resYmd = tourDateToYyyymmdd(reservationDate);
  if (resYmd === "") return ""; // treated as blank
  if (resYmd === "ERROR") return "ERROR";

  const tourYmd = tourDateToYyyymmdd(tourDate);
  if (tourYmd === "") return ""; // treated as blank
  if (tourYmd === "ERROR") return "ERROR";

  // Parse as local midnight (not UTC) to avoid the midnight trap where
  // new Date("yyyy-mm-dd") creates a UTC midnight date that .getMonth()
  // can resolve to the previous month in negative-offset timezones.
  const [ry, rm, rd] = resYmd.split("-").map(Number);
  const res = new Date(ry, rm - 1, rd);
  const [ty, tm, td] = tourYmd.split("-").map(Number);
  const tour = new Date(ty, tm - 1, td);

  // If either is still invalid (paranoid guard)
  if (isNaN(res.getTime()) || isNaN(tour.getTime())) return "ERROR";

  // Canonical rule lives in lib/installment-schedule.ts — do not reimplement.
  const validDates = computeEligibleInstallmentDatesLocal(res, tour);

  if (validDates.length < 1) return "";

  // If payment plan is P1, return only the first date
  // Otherwise return first valid date (matching spreadsheet logic)
  return validDates[0].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
