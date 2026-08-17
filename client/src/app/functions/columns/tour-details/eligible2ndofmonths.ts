import { computeEligibleInstallmentDatesLocal } from "@/lib/installment-schedule";
import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const eligible2ndofmonthsColumn: BookingSheetColumn = {
  id: "eligible2ndofmonths",
  data: {
    id: "eligible2ndofmonths",
    columnName: "Eligible Last Fridays",
    dataType: "function",
    function: "eligibleSecondsCountFunction",
    parentTab: "Tour Details",
    includeInForms: false,
    showColumn: true,
    color: "gray",
    width: 212.66668701171875,
    arguments: [
      {
        name: "reservationDate",
        type: "unknown",
        columnReference: "Reservation Date",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "tourDate",
        type: "unknown",
        columnReference: "Tour Date",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
    ],
  },
};

// Column Function Implementation
/**
 * NOTE:
 * Delegates to the canonical rule in lib/installment-schedule.ts:
 * - candidate date per month = last Friday of that month
 * - valid if in (reservationDate + 2 days, cutoff], where cutoff is
 *   tourDate - 2 calendar months (bookings from 1 Jun 2026) or tourDate - 3 days
 * - plus snap-back to the last Friday before the cutoff when the monthly
 *   anchor overshoots it
 *
 * Returns: number | ""  (empty string if either date is blank/invalid)
 */
export default function eligibleSecondsCountFunction(
  reservationDate: unknown, // K
  tourDate: unknown, // N
): number | "" {
  // ---------- local helpers (robust parsing like our previous funcs) ----------
  const toDate = (input: unknown): Date | null => {
    if (input === null || input === undefined) return null;
    if (typeof input === "string" && input.trim() === "") return null;

    try {
      // Firestore Timestamp (has .toDate())
      if (
        typeof input === "object" &&
        input !== null &&
        "toDate" in (input as any) &&
        typeof (input as any).toDate === "function"
      ) {
        const d = (input as any).toDate();
        return isNaN(d.getTime()) ? null : d;
      }

      // Firestore-like { seconds, nanoseconds? }
      if (
        typeof input === "object" &&
        input !== null &&
        "seconds" in (input as any) &&
        typeof (input as any).seconds === "number"
      ) {
        const s = (input as any).seconds as number;
        const ns =
          typeof (input as any).nanoseconds === "number"
            ? (input as any).nanoseconds
            : 0;
        const d = new Date(s * 1000 + Math.floor(ns / 1e6));
        return isNaN(d.getTime()) ? null : d;
      }

      // Already a Date
      if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

      // Milliseconds timestamp
      if (typeof input === "number") {
        const d = new Date(input);
        return isNaN(d.getTime()) ? null : d;
      }

      // String formats
      if (typeof input === "string") {
        const raw = input.trim();

        // dd/mm/yyyy
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
          const [dd, mm, yyyy] = raw.split("/").map(Number);
          const d = new Date(yyyy, mm - 1, dd);
          return isNaN(d.getTime()) ? null : d;
        }

        // yyyy-mm-dd
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          const [yyyy, mm, dd] = raw.split("-").map(Number);
          const d = new Date(yyyy, mm - 1, dd);
          return isNaN(d.getTime()) ? null : d;
        }

        // Natural/ISO strings (incl. "UTC+8")
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
      }

      return null;
    } catch {
      return null;
    }
  };

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // ---------- apply logic ----------
  const res = toDate(reservationDate);
  const tour = toDate(tourDate);
  if (!res || !tour) return "";

  const resD = startOfDay(res);
  const tourD = startOfDay(tour);

  // Canonical rule lives in lib/installment-schedule.ts — do not reimplement.
  return computeEligibleInstallmentDatesLocal(resD, tourD).length;
}
