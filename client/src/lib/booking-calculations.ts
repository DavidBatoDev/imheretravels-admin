/**
 * Server-side booking calculation utilities
 *
 * These functions duplicate the logic from client-side column functions
 * for use in API routes and Cloud Functions.
 */

import { Timestamp } from "firebase/firestore";

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Normalize various date formats to a Date object
 */
export function toDate(input: unknown): Date | null {
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
      return (input as any).toDate();
    }

    // Firestore-like { seconds, nanoseconds }
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
      return new Date(s * 1000 + Math.floor(ns / 1e6));
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
        return new Date(yyyy, mm - 1, dd);
      }

      // yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yyyy, mm, dd] = raw.split("-").map(Number);
        return new Date(yyyy, mm - 1, dd);
      }

      // ISO string or natural language
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize a Date to UTC date-only (00:00 UTC).
 */
export function normalizeUTCDate(dateInput: Date): Date {
  return new Date(
    Date.UTC(
      dateInput.getUTCFullYear(),
      dateInput.getUTCMonth(),
      dateInput.getUTCDate(),
    ),
  );
}

/**
 * Format date as "yyyymmdd"
 */
export function formatDateYYYYMMDD(dateInput: unknown): string {
  const date = toDate(dateInput);
  if (!date) return "";

  const utc = normalizeUTCDate(date);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Format date as "MMM d, yyyy" (e.g., "Dec 2, 2025")
 */
export function formatDateDisplay(dateInput: unknown): string {
  const date = toDate(dateInput);
  if (!date) return "";

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format Firebase Timestamp or Date to dd/mm/yyyy format
 * Silently filters out invalid timestamps but logs errors to console
 */
export function formatTimestampToDDMMYYYY(dateInput: unknown): string {
  try {
    const date = toDate(dateInput);
    if (!date) return "";

    const utc = normalizeUTCDate(date);
    const day = String(utc.getUTCDate()).padStart(2, "0");
    const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const year = utc.getUTCFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error(
      "Error formatting timestamp to dd/mm/yyyy:",
      error,
      dateInput,
    );
    return "";
  }
}

/**
 * Format a Timestamp to "Month Day Year" format (e.g., "February 03 2026")
 */
export function formatTimestampToMonthDayYear(dateInput: unknown): string {
  try {
    const date = toDate(dateInput);
    if (!date) return "";

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const utc = normalizeUTCDate(date);
    const day = String(utc.getUTCDate()).padStart(2, "0");
    const month = monthNames[utc.getUTCMonth()];
    const year = utc.getUTCFullYear();

    return `${month} ${day} ${year}`;
  } catch (error) {
    console.error(
      "Error formatting timestamp to Month Day Year:",
      error,
      dateInput,
    );
    return "";
  }
}

/**
 * Normalize tour date to 9:00 AM UTC+8 (01:00 UTC)
 * Ensures consistent day calculations regardless of input time.
 */
export function normalizeTourDateToUTCPlus8Nine(
  dateInput: unknown,
): Date | null {
  const date = toDate(dateInput);
  if (!date) return null;

  // Shift to UTC+8 to preserve the intended calendar day
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();

  // 09:00 in UTC+8 equals 01:00 UTC
  return new Date(Date.UTC(year, month, day, 1, 0, 0, 0));
}

/**
 * Parse "Month Day Year" format back to Date object
 */
export function parseMonthDayYear(dateString: string): Date | null {
  try {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const parts = dateString.trim().split(/\s+/);
    if (parts.length !== 3) return null;

    const [monthName, dayStr, yearStr] = parts;
    const monthIndex = monthNames.indexOf(monthName);
    if (monthIndex === -1) return null;

    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);

    if (isNaN(day) || isNaN(year)) return null;

    return new Date(Date.UTC(year, monthIndex, day));
  } catch (error) {
    console.error("Error parsing Month Day Year:", error, dateString);
    return null;
  }
}

// ============================================================================
// BOOKING IDENTIFIER FUNCTIONS
// ============================================================================

/**
 * Generate booking code from booking type
 * "Single Booking" -> "SB", "Duo Booking" -> "DB", "Group Booking" -> "GB"
 */
export function getBookingCode(bookingType: string): string {
  if (!bookingType) return "";
  if (bookingType === "Single Booking") return "SB";
  if (bookingType === "Duo Booking") return "DB";
  if (bookingType === "Group Booking") return "GB";
  return "";
}

/**
 * Get traveller initials from first and last name
 */
export function getTravellerInitials(
  firstName: string,
  lastName: string,
): string {
  const f = firstName && firstName.length > 0 ? firstName[0] : "";
  const l = lastName && lastName.length > 0 ? lastName[0] : "";
  return (f + l).toUpperCase();
}

/**
 * Get full name from first and last name
 */
export function getFullName(firstName: string, lastName: string): string {
  return `${firstName || ""} ${lastName || ""}`.trim();
}

/**
 * Generate the unique counter for tour package bookings
 * This requires querying existing bookings for the same tour package
 */
export async function getTourPackageUniqueCounter(
  tourPackageName: string,
  existingBookingsCount: number,
): Promise<string> {
  if (!tourPackageName) return "";
  const count = existingBookingsCount + 1;
  return String(count).padStart(3, "0");
}

/**
 * Generate full booking ID
 * Format: {BookingCode}-{TourCode}-{FormattedDate}-{Initials}{Counter}
 * Example: SB-PKG-20250915-JD001
 */
export function generateBookingId(
  bookingCode: string,
  tourCode: string,
  formattedDate: string,
  travellerInitials: string,
  uniqueCounter: string,
): string {
  if (
    !bookingCode ||
    !tourCode ||
    !formattedDate ||
    !travellerInitials ||
    !uniqueCounter
  ) {
    return "";
  }
  return `${bookingCode}-${tourCode}-${formattedDate}-${travellerInitials}${uniqueCounter}`;
}

// ============================================================================
// PAYMENT CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate days between reservation date and tour date
 */
export function getDaysBetweenDates(
  reservationDate: unknown,
  tourDate: unknown,
): number | "" {
  const localToDate = (input: unknown): Date | null => {
    if (input === null || input === undefined) return null;
    if (typeof input === "string" && input.trim() === "") return null;

    try {
      if (
        typeof input === "object" &&
        input !== null &&
        "toDate" in (input as any) &&
        typeof (input as any).toDate === "function"
      ) {
        return (input as any).toDate();
      }
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
        return new Date(s * 1000 + Math.floor(ns / 1e6));
      }
      if (input instanceof Date) return input;
      if (typeof input === "number") return new Date(input);
      if (typeof input === "string") {
        const raw = input.trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
          const [dd, mm, yyyy] = raw.split("/").map(Number);
          return new Date(yyyy, mm - 1, dd);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          const [yyyy, mm, dd] = raw.split("-").map(Number);
          return new Date(yyyy, mm - 1, dd);
        }
        return new Date(raw);
      }
      return null;
    } catch {
      return null;
    }
  };

  const res = localToDate(reservationDate);
  const tour = localToDate(tourDate);

  if (!res || isNaN(res.getTime()) || !tour || isNaN(tour.getTime())) return "";

  const normalizeToUTCDate = (d: Date): Date =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  const resDate = normalizeToUTCDate(res);
  const tourDateOnly = normalizeToUTCDate(tour);

  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = (tourDateOnly.getTime() - resDate.getTime()) / msPerDay;

  return diff;
}

/**
 * Calculate eligible last-Friday dates count for payment terms
 */
export function getEligible2ndOfMonths(
  reservationDate: unknown,
  tourDate: unknown,
): number | "" {
  const res = toDate(reservationDate);
  const tour = toDate(tourDate);

  if (!res || !tour) return "";

  const resUTC = normalizeUTCDate(res);
  const tourUTC = normalizeUTCDate(tour);

  // Align with installment due-date generation:
  // last Friday dates in (res + 2, tour - 3].
  const monthCount =
    (tourUTC.getUTCFullYear() - resUTC.getUTCFullYear()) * 12 +
    (tourUTC.getUTCMonth() - resUTC.getUTCMonth()) +
    1;

  if (monthCount <= 0) return 0;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const installmentDates: Date[] = Array.from(
    { length: monthCount },
    (_, i) => {
      const t = Date.UTC(
        resUTC.getUTCFullYear(),
        resUTC.getUTCMonth() + i + 1,
        0,
      );
      const lastDay = new Date(t);
      const offset = (lastDay.getUTCDay() - 5 + 7) % 7; // days back to last Friday
      return new Date(t - offset * DAY_MS);
    },
  );

  // Bookings made on/after June 1 2026: 2-month-before-tour cutoff.
  const POLICY_DATE = new Date(Date.UTC(2026, 5, 1));
  const isNewPolicy = resUTC.getTime() >= POLICY_DATE.getTime();
  const twoMonthsBeforeTour = new Date(
    Date.UTC(tourUTC.getUTCFullYear(), tourUTC.getUTCMonth() - 2, tourUTC.getUTCDate()),
  );
  const cutoffDate = isNewPolicy
    ? twoMonthsBeforeTour
    : new Date(tourUTC.getTime() - 3 * DAY_MS);

  const eligible = installmentDates.filter(
    (d) =>
      d.getTime() > resUTC.getTime() + 2 * DAY_MS &&
      d.getTime() <= cutoffDate.getTime(),
  );

  return eligible.length;
}

/**
 * Determine payment condition based on eligible installment dates and days between
 */
export function getPaymentCondition(
  tourDate: unknown,
  eligible2ndOfMonths: number | "",
  daysBetween: number | "",
): string {
  if (toDate(tourDate) === null) return "";
  if (eligible2ndOfMonths === "" || daysBetween === "") return "";

  const eligible = Number(eligible2ndOfMonths);
  const days = Number(daysBetween);

  if (eligible === 0 && days < 3) return "Invalid Booking";
  if (eligible === 0 && days >= 3) return "Last Minute Booking";
  if (eligible === 1) return "Standard Booking, P1";
  if (eligible === 2) return "Standard Booking, P2";
  if (eligible === 3) return "Standard Booking, P3";
  if (eligible >= 4) return "Standard Booking, P4";

  return "";
}

/**
 * Get available payment terms string
 */
export function getAvailablePaymentTerms(
  paymentCondition: string,
  isCancelled: boolean = false,
): string {
  if (isCancelled) return "Cancelled";
  if (!paymentCondition) return "";

  const paymentTerms: Record<string, string> = {
    "Invalid Booking": "Invalid",
    "Last Minute Booking": "Full payment required within 48hrs",
    "Standard Booking, P1": "P1",
    "Standard Booking, P2": "P2",
    "Standard Booking, P3": "P3",
    "Standard Booking, P4": "P4",
  };

  return paymentTerms[paymentCondition] || "";
}

// ============================================================================
// PAYMENT DUE DATE CALCULATIONS
// ============================================================================

/**
 * Calculate Full Payment due date (reservation date + 2 days)
 */
export function getFullPaymentDueDate(
  reservationDate: unknown,
  paymentPlan: string,
): string {
  if (paymentPlan !== "Full Payment") return "";

  const date = toDate(reservationDate);
  if (!date) return "";

  const dueDate = normalizeUTCDate(date);
  dueDate.setUTCDate(dueDate.getUTCDate() + 2);

  return formatDateDisplay(dueDate);
}

/**
 * Calculate Full Payment amount
 */
export function getFullPaymentAmount(
  paymentPlan: string,
  originalTourCost: number,
  discountedTourCost: number | null,
  reservationFee: number,
  isMainBooker: boolean,
  creditAmount: number = 0,
): number | "" {
  if (paymentPlan !== "Full Payment") return "";

  const baseCost =
    isMainBooker && discountedTourCost ? discountedTourCost : originalTourCost;
  if (!baseCost) return "";

  const amount = baseCost - reservationFee - creditAmount;
  return Math.round(amount * 100) / 100; // Round to 2 decimal places
}

/**
 * Generate P1-P4 due dates based on payment plan and payment condition
 * Matches the logic from p1-due-date.ts, p2-due-date.ts, etc.
 *
 * Key logic:
 * - When paymentPlan is empty, show dates based on paymentCondition (e.g., P2 shows "Jan 2, 2026, Feb 2, 2026")
 * - When paymentPlan is selected, show only the specific date for that installment
 */
export function generateInstallmentDueDates(
  reservationDate: unknown,
  tourDate: unknown,
  paymentPlan: string,
  paymentCondition: string,
): {
  p1DueDate: string;
  p2DueDate: string;
  p3DueDate: string;
  p4DueDate: string;
} {
  const result = { p1DueDate: "", p2DueDate: "", p3DueDate: "", p4DueDate: "" };

  if (paymentPlan === "Full Payment") return result;

  const res = toDate(reservationDate);
  const tour = toDate(tourDate);
  if (!res || !tour) return result;

  const resUTC = normalizeUTCDate(res);
  const tourUTC = normalizeUTCDate(tour);

  // Generate all valid last-day-of-month dates
  // Day 0 of (month + 1) = last day of (month), matching p1–p4DueDate.ts logic
  const monthCount =
    (tourUTC.getUTCFullYear() - resUTC.getUTCFullYear()) * 12 +
    (tourUTC.getUTCMonth() - resUTC.getUTCMonth()) +
    1;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const secondDates: Date[] = Array.from({ length: monthCount }, (_, i) => {
    const t = Date.UTC(
      resUTC.getUTCFullYear(),
      resUTC.getUTCMonth() + i + 1,
      0,
    );
    const lastDay = new Date(t);
    const offset = (lastDay.getUTCDay() - 5 + 7) % 7; // days back to last Friday
    return new Date(t - offset * DAY_MS);
  });

  // Bookings made on/after June 1 2026 use the 2-month-before-tour cutoff.
  const POLICY_DATE = new Date(Date.UTC(2026, 5, 1));
  const isNewPolicy = resUTC.getTime() >= POLICY_DATE.getTime();
  const twoMonthsBeforeTour = new Date(
    Date.UTC(tourUTC.getUTCFullYear(), tourUTC.getUTCMonth() - 2, tourUTC.getUTCDate()),
  );
  const cutoffDate = isNewPolicy
    ? twoMonthsBeforeTour
    : new Date(tourUTC.getTime() - 3 * DAY_MS);

  const validDates = secondDates.filter(
    (d) =>
      d.getTime() > resUTC.getTime() + 2 * DAY_MS &&
      d.getTime() <= cutoffDate.getTime(),
  );

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // Determine max terms based on paymentCondition
  const conditionTerms: Record<string, number> = {
    "Standard Booking, P1": 1,
    "Standard Booking, P2": 2,
    "Standard Booking, P3": 3,
    "Standard Booking, P4": 4,
  };
  const maxTerms = conditionTerms[paymentCondition] || 0;
  if (maxTerms === 0) return result;

  // P1 Due Date - matches p1-due-date.ts logic
  // Condition: P1, P2, P3, or P4
  if (
    [
      "Standard Booking, P1",
      "Standard Booking, P2",
      "Standard Booking, P3",
      "Standard Booking, P4",
    ].includes(paymentCondition)
  ) {
    if (validDates.length >= 1) {
      result.p1DueDate = fmt(validDates[0]);
    }
  }

  // P2 Due Date - matches p2-due-date.ts logic
  // Condition: P2, P3, or P4 (not P1)
  if (
    paymentPlan !== "P1" &&
    [
      "Standard Booking, P2",
      "Standard Booking, P3",
      "Standard Booking, P4",
    ].includes(paymentCondition)
  ) {
    if (validDates.length >= 2) {
      if (paymentPlan && ["P2", "P3", "P4"].includes(paymentPlan)) {
        // When payment plan selected, show only the 2nd date
        result.p2DueDate = fmt(validDates[1]);
      } else {
        // When no payment plan, show both dates comma-separated
        result.p2DueDate = `${fmt(validDates[0])}, ${fmt(validDates[1])}`;
      }
    }
  }

  // P3 Due Date - matches p3-due-date.ts logic
  // Condition: P3 or P4 (not P1, P2)
  if (
    !["P1", "P2"].includes(paymentPlan) &&
    ["Standard Booking, P3", "Standard Booking, P4"].includes(paymentCondition)
  ) {
    if (validDates.length >= 3) {
      if (paymentPlan && ["P3", "P4"].includes(paymentPlan)) {
        // When payment plan selected, show only the 3rd date
        result.p3DueDate = fmt(validDates[2]);
      } else {
        // When no payment plan, show all three dates comma-separated
        result.p3DueDate = `${fmt(validDates[0])}, ${fmt(validDates[1])}, ${fmt(
          validDates[2],
        )}`;
      }
    }
  }

  // P4 Due Date - matches p4-due-date.ts logic
  // Condition: P4 only
  if (
    !["P1", "P2", "P3"].includes(paymentPlan) &&
    paymentCondition === "Standard Booking, P4"
  ) {
    if (validDates.length >= 4) {
      if (paymentPlan === "P4") {
        // When payment plan selected, show only the 4th date
        result.p4DueDate = fmt(validDates[3]);
      } else {
        // When no payment plan, show all four dates comma-separated
        result.p4DueDate = `${fmt(validDates[0])}, ${fmt(validDates[1])}, ${fmt(
          validDates[2],
        )}, ${fmt(validDates[3])}`;
      }
    }
  }

  return result;
}

/**
 * Calculate installment amounts - matches logic from p1-amount.ts, p2-amount.ts etc.
 *
 * Key logic:
 * - When paymentPlan is empty/undefined, terms = 1, so P1 gets all remaining balance
 * - When paymentPlan is "P2", terms = 2, amount = total / 2
 * - Credit handling follows the same pattern as EditBookingModal
 */
export function calculateInstallmentAmounts(
  paymentPlan: string,
  originalTourCost: number,
  discountedTourCost: number | null,
  reservationFee: number,
  isMainBooker: boolean,
  creditAmount: number = 0,
  creditFrom: string = "",
  // Due dates to check if amounts should be calculated
  p1DueDate?: string,
  p2DueDate?: string,
  p3DueDate?: string,
  p4DueDate?: string,
  // Optional current amounts + paid dates for paid-term freeze safeguarding
  p1AmountCurrent?: number | string | null,
  p2AmountCurrent?: number | string | null,
  p3AmountCurrent?: number | string | null,
  p4AmountCurrent?: number | string | null,
  p1DatePaid?: unknown,
  p2DatePaid?: unknown,
  p3DatePaid?: unknown,
  p4DatePaid?: unknown,
): {
  p1Amount: number | "";
  p2Amount: number | "";
  p3Amount: number | "";
  p4Amount: number | "";
} {
  const roundCurrency = (value: number): number =>
    Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

  const splitAmountWithRemainder = (
    totalValue: number,
    terms: number,
  ): number[] => {
    if (terms <= 0) return [];

    const roundedTotal = roundCurrency(totalValue);
    if (terms === 1) return [roundedTotal];

    const base = Math.trunc((roundedTotal / terms) * 100) / 100;
    const amounts = new Array<number>(terms).fill(base);
    const allocated = base * (terms - 1);
    amounts[terms - 1] = roundCurrency(roundedTotal - allocated);

    return amounts;
  };

  const toFiniteNumberOrNull = (value: unknown): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
      const normalized = value.replace(/[^\d.-]/g, "").trim();
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const hasPaidDate = (value: unknown): boolean => {
    if (value == null) return false;

    if (
      typeof value === "object" &&
      (value as { type?: string })?.type === "firestore/timestamp/1.0"
    ) {
      return true;
    }

    if (
      typeof value === "object" &&
      typeof (value as { seconds?: number }).seconds === "number"
    ) {
      return true;
    }

    if (value instanceof Date) return !isNaN(value.getTime());

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return (
        normalized !== "" &&
        normalized !== "null" &&
        normalized !== "undefined"
      );
    }

    return toDate(value) !== null;
  };

  const allocateByWeight = (totalValue: number, weights: number[]): number[] => {
    if (weights.length === 0) return [];

    const totalCents = Math.max(0, Math.round(roundCurrency(totalValue) * 100));
    if (totalCents === 0) return new Array<number>(weights.length).fill(0);

    const safeWeights = weights.map((weight) =>
      Math.max(0, roundCurrency(weight)),
    );
    const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);

    if (weightSum <= 0) {
      return splitAmountWithRemainder(roundCurrency(totalValue), weights.length);
    }

    const allocationsInCents = new Array<number>(weights.length).fill(0);
    const fractions = safeWeights.map((weight, index) => {
      const raw = (weight / weightSum) * totalCents;
      const floored = Math.floor(raw);
      allocationsInCents[index] = floored;
      return { index, fraction: raw - floored };
    });

    let remainder =
      totalCents - allocationsInCents.reduce((sum, cents) => sum + cents, 0);
    if (remainder > 0) {
      const order = fractions
        .slice()
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

      for (let i = 0; i < remainder; i += 1) {
        const target = order[i % order.length];
        allocationsInCents[target.index] += 1;
      }
    }

    return allocationsInCents.map((cents) => roundCurrency(cents / 100));
  };

  const getCreditOrder = (source: string, amount: number): number => {
    if (amount <= 0) return -1;
    if (source === "Reservation") return 0;
    if (source === "P1") return 1;
    if (source === "P2") return 2;
    if (source === "P3") return 3;
    if (source === "P4") return 4;
    return -1;
  };

  const allocateInstallmentAmounts = (
    totalValue: number,
    terms: number,
    source: string,
    amount: number,
  ): number[] => {
    const creditOrder = getCreditOrder(source, amount);

    if (creditOrder === -1) {
      return splitAmountWithRemainder(totalValue, terms);
    }

    if (creditOrder === 0) {
      return splitAmountWithRemainder(totalValue - amount, terms);
    }

    if (creditOrder > terms) {
      return splitAmountWithRemainder(totalValue, terms);
    }

    const noCreditAllocation = splitAmountWithRemainder(totalValue, terms);
    const creditIndex = creditOrder - 1;
    const allocations = new Array<number>(terms).fill(0);

    for (let index = 0; index < creditIndex; index += 1) {
      allocations[index] = noCreditAllocation[index] ?? 0;
    }

    const prefixTotal = allocations
      .slice(0, creditIndex)
      .reduce((sum, value) => sum + value, 0);
    const termsAfterCredit = terms - creditOrder;

    if (termsAfterCredit === 0) {
      allocations[creditIndex] = roundCurrency(totalValue - prefixTotal);
      return allocations;
    }

    allocations[creditIndex] = roundCurrency(amount);

    const remainingTotal = roundCurrency(
      totalValue - prefixTotal - allocations[creditIndex],
    );
    const suffixAllocation = splitAmountWithRemainder(
      remainingTotal,
      termsAfterCredit,
    );

    for (let index = 0; index < suffixAllocation.length; index += 1) {
      allocations[creditIndex + 1 + index] = suffixAllocation[index];
    }

    const summed = roundCurrency(
      allocations.reduce((sum, value) => sum + (Number(value) || 0), 0),
    );
    const diff = roundCurrency(totalValue - summed);
    if (Math.abs(diff) > 0) {
      allocations[terms - 1] = roundCurrency(
        (allocations[terms - 1] ?? 0) + diff,
      );
    }

    return allocations;
  };

  const allocateInstallmentAmountsWithPaidLocks = (
    totalValue: number,
    terms: number,
    source: string,
    amount: number,
  ): number[] => {
    const baseAllocations = allocateInstallmentAmounts(
      totalValue,
      terms,
      source,
      amount,
    );

    const currentAmounts = [
      p1AmountCurrent,
      p2AmountCurrent,
      p3AmountCurrent,
      p4AmountCurrent,
    ];
    const paidDates = [p1DatePaid, p2DatePaid, p3DatePaid, p4DatePaid];

    const allocations = baseAllocations.slice(0, terms);
    const lockedIndices: number[] = [];
    const unlockedIndices: number[] = [];

    for (let index = 0; index < terms; index += 1) {
      const isPaid = hasPaidDate(paidDates[index]);
      const currentAmount = toFiniteNumberOrNull(currentAmounts[index]);

      if (isPaid && currentAmount != null) {
        allocations[index] = roundCurrency(currentAmount);
        lockedIndices.push(index);
      } else {
        unlockedIndices.push(index);
      }
    }

    if (lockedIndices.length === 0) {
      return baseAllocations;
    }

    if (unlockedIndices.length === 0) {
      return allocations;
    }

    const lockedTotal = roundCurrency(
      lockedIndices.reduce((sum, index) => sum + (allocations[index] ?? 0), 0),
    );
    const unlockedTarget = roundCurrency(totalValue - lockedTotal);

    if (unlockedTarget <= 0) {
      unlockedIndices.forEach((index) => {
        allocations[index] = 0;
      });
      return allocations;
    }

    const unlockedWeights = unlockedIndices.map(
      (index) => baseAllocations[index] ?? 0,
    );
    const unlockedAllocations = allocateByWeight(unlockedTarget, unlockedWeights);

    unlockedIndices.forEach((index, localIndex) => {
      allocations[index] = roundCurrency(unlockedAllocations[localIndex] ?? 0);
    });

    return allocations;
  };

  const result = {
    p1Amount: "" as number | "",
    p2Amount: "" as number | "",
    p3Amount: "" as number | "",
    p4Amount: "" as number | "",
  };

  if (paymentPlan === "Full Payment") return result;

  // Calculate total (same as EditBookingModal)
  const baseCost =
    isMainBooker && discountedTourCost ? discountedTourCost : originalTourCost;
  if (!baseCost) return result;

  const total = baseCost - reservationFee;
  const credit_from = creditFrom ?? "";
  const credit_amt = creditAmount ?? 0;

  // When no payment plan is specified, show preview amounts for each plan option
  // P1 shows total/1, P2 shows total/2, P3 shows total/3, P4 shows total/4
  if (!paymentPlan) {
    // P1 Amount - full remaining balance (divide by 1)
    if (p1DueDate) {
      result.p1Amount = roundCurrency(total) as number;
    }

    // P2 Amount - half of remaining balance (divide by 2)
    if (p2DueDate) {
      result.p2Amount = roundCurrency(total / 2) as number;
    }

    // P3 Amount - third of remaining balance (divide by 3)
    if (p3DueDate) {
      result.p3Amount = roundCurrency(total / 3) as number;
    }

    // P4 Amount - quarter of remaining balance (divide by 4)
    if (p4DueDate) {
      result.p4Amount = roundCurrency(total / 4) as number;
    }

    return result;
  }

  // Determine number of terms (P1-P4)
  const termsMap: Record<string, number> = {
    "": 1,
    P1: 1,
    P2: 2,
    P3: 3,
    P4: 4,
  };
  const terms = termsMap[paymentPlan ?? ""] ?? 1;
  const allocations = allocateInstallmentAmountsWithPaidLocks(
    total,
    terms,
    credit_from,
    credit_amt,
  );

  // P1 Amount - only if p1DueDate exists or terms >= 1
  if (p1DueDate || terms >= 1) {
    result.p1Amount = roundCurrency(allocations[0] ?? 0) as number;
  }

  // P2 Amount - only if terms >= 2 and p2DueDate exists
  if (terms >= 2 && p2DueDate) {
    result.p2Amount = roundCurrency(allocations[1] ?? 0) as number;
  }

  // P3 Amount - only if terms >= 3 and p3DueDate exists
  if (terms >= 3 && p3DueDate) {
    result.p3Amount = roundCurrency(allocations[2] ?? 0) as number;
  }

  // P4 Amount - only if terms >= 4 and p4DueDate exists
  if (terms >= 4 && p4DueDate) {
    result.p4Amount = roundCurrency(allocations[3] ?? 0) as number;
  }

  return result;
}

/**
 * Calculate scheduled reminder dates (X days before due date)
 */
export function calculateScheduledReminderDates(dueDates: {
  p1DueDate: string;
  p2DueDate: string;
  p3DueDate: string;
  p4DueDate: string;
}, reservationDate?: unknown): {
  p1ScheduledReminderDate: string;
  p2ScheduledReminderDate: string;
  p3ScheduledReminderDate: string;
  p4ScheduledReminderDate: string;
} {
  const result = {
    p1ScheduledReminderDate: "",
    p2ScheduledReminderDate: "",
    p3ScheduledReminderDate: "",
    p4ScheduledReminderDate: "",
  };

  const extractFirstDate = (dueDate: string): string => {
    if (!dueDate) return "";

    // Match first full date like "Jan 2, 2026"
    const match = dueDate.match(/[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/);
    if (match?.[0]) return match[0];

    // Fallback for ISO lists like "2026-01-02, 2026-02-02"
    if (dueDate.includes(",")) {
      return dueDate.split(",")[0].trim();
    }

    return dueDate.trim();
  };

  const reservation = toDate(reservationDate);
  const reservationDay = reservation
    ? new Date(
        reservation.getFullYear(),
        reservation.getMonth(),
        reservation.getDate(),
      )
    : null;

  const calculateBaseMonday = (dueDate: string): string => {
    if (!dueDate) return "";
    const firstDate = extractFirstDate(dueDate);
    const date = toDate(firstDate);
    if (!date) return "";

    // 14 days before due date (calendar arithmetic avoids the DST trap)
    const reminder = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() - 14,
    );

    const reminderDay = new Date(
      reminder.getFullYear(),
      reminder.getMonth(),
      reminder.getDate(),
    );
    const finalReminder =
      reservationDay && reminderDay < reservationDay
        ? reservationDay
        : reminderDay;

    const y = finalReminder.getFullYear();
    const m = String(finalReminder.getMonth() + 1).padStart(2, "0");
    const d = String(finalReminder.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  result.p1ScheduledReminderDate = calculateBaseMonday(dueDates.p1DueDate);
  result.p2ScheduledReminderDate = calculateBaseMonday(dueDates.p2DueDate);
  result.p3ScheduledReminderDate = calculateBaseMonday(dueDates.p3DueDate);
  result.p4ScheduledReminderDate = calculateBaseMonday(dueDates.p4DueDate);

  return result;
}

// ============================================================================
// GROUP BOOKING UTILITIES
// ============================================================================

/**
 * Generate a 4-digit group ID
 */
export function generateGroupId(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ============================================================================
// FULL BOOKING CREATION HELPER
// ============================================================================

export interface BookingCreationInput {
  // Personal info
  email: string;
  firstName: string;
  lastName: string;

  // Booking details
  bookingType: string;
  tourPackageName: string;
  tourCode: string;
  /**
   * tourPackages document id. `tourCode` and `tourPackageName` above are
   * snapshots of what the trip was called when sold and go stale the moment a
   * tour is renamed or recoded — every report and the www review flow join on
   * this instead. Always pass it; the fallbacks exist only for legacy rows.
   */
  tourId?: string;
  tourDate: unknown;
  returnDate?: unknown;
  tourDuration?: number;

  // Payment info
  reservationFee: number;
  paidAmount: number;
  originalTourCost: number;
  discountedTourCost?: number | null;
  paymentMethod: "Stripe" | "Revolut";

  // Group booking (if applicable)
  groupId?: string;
  isMainBooking?: boolean;

  // Counter for unique ID generation (bookings with same tour package name)
  existingBookingsCount: number;

  // Total bookings count (for global row number)
  totalBookingsCount: number;
}

export interface CreatedBookingData {
  // Identifiers
  bookingId: string;
  bookingCode: string;
  tourCode: string;
  /** Stable tourPackages doc id — the durable link back to the tour. */
  tourId: string;
  travellerInitials: string;
  tourPackageNameUniqueCounter: string;
  formattedDate: string;

  // Personal info
  emailAddress: string;
  firstName: string;
  lastName: string;
  fullName: string;

  // Booking details
  reservationDate: Date;
  bookingType: string;
  tourPackageName: string;
  tourDate: unknown;
  returnDate: unknown;
  tourDuration: number | "";

  // Payment calculation fields
  daysBetweenBookingAndTourDate: number | "";
  eligible2ndofmonths: number | "";
  paymentCondition: string;
  availablePaymentTerms: string;

  // Payment amounts
  originalTourCost: number;
  discountedTourCost: number | null;
  reservationFee: number;
  paid: number;
  remainingBalance: number;

  // Full payment fields (populated later)
  fullPaymentDueDate: string;
  fullPaymentAmount: number | "";

  // Installment fields (populated later)
  p1DueDate: string;
  p1Amount: number | "";
  p2DueDate: string;
  p2Amount: number | "";
  p3DueDate: string;
  p3Amount: number | "";
  p4DueDate: string;
  p4Amount: number | "";

  // Payment method
  paymentMethod: "Stripe" | "Revolut";

  // Group booking
  isMainBooking: boolean;
  isMainBooker: boolean;
  groupIdGroupIdGenerator: string;
  groupId: string;

  // Row number (for spreadsheet compatibility)
  row: number;

  // Metadata
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a complete booking data object from input
 */
export async function createBookingData(
  input: BookingCreationInput,
): Promise<CreatedBookingData> {
  const now = new Date();

  const normalizedTourDate =
    normalizeTourDateToUTCPlus8Nine(input.tourDate) ?? input.tourDate;

  // Calculate identifiers
  const bookingCode = getBookingCode(input.bookingType);
  const travellerInitials = getTravellerInitials(
    input.firstName,
    input.lastName,
  );
  const formattedDate = formatDateYYYYMMDD(normalizedTourDate);
  const uniqueCounter = await getTourPackageUniqueCounter(
    input.tourPackageName,
    input.existingBookingsCount,
  );
  const bookingId = generateBookingId(
    bookingCode,
    input.tourCode,
    formattedDate,
    travellerInitials,
    uniqueCounter,
  );

  // Calculate payment-related fields
  const daysBetween = getDaysBetweenDates(now, normalizedTourDate);
  const eligible2ndOfMonths = getEligible2ndOfMonths(now, normalizedTourDate);
  const paymentCondition = getPaymentCondition(
    normalizedTourDate,
    eligible2ndOfMonths,
    daysBetween,
  );
  const availablePaymentTerms = getAvailablePaymentTerms(paymentCondition);

  // Determine the maximum available payment plan based on payment condition
  // This controls which pxDueDate/pxAmount fields get populated
  let maxAvailablePlan = "";
  const isLastMinuteBooking = paymentCondition === "Last Minute Booking";

  if (paymentCondition === "Standard Booking, P4") {
    maxAvailablePlan = "P4";
  } else if (paymentCondition === "Standard Booking, P3") {
    maxAvailablePlan = "P3";
  } else if (paymentCondition === "Standard Booking, P2") {
    maxAvailablePlan = "P2";
  } else if (paymentCondition === "Standard Booking, P1") {
    maxAvailablePlan = "P1";
  } else if (isLastMinuteBooking) {
    maxAvailablePlan = "Full Payment"; // Only full payment available
  }

  // Pre-calculate due dates - at step 2, no paymentPlan is selected yet
  // So we pass empty string to get comma-separated dates based on paymentCondition
  // For Last Minute Booking, don't calculate installment dates/amounts since only full payment is available
  const allDueDates = isLastMinuteBooking
    ? { p1DueDate: "", p2DueDate: "", p3DueDate: "", p4DueDate: "" }
    : generateInstallmentDueDates(
        now,
        normalizedTourDate,
        "", // Empty paymentPlan at step 2 - shows all available dates comma-separated
        paymentCondition,
      );

  // At step 2, calculate pxAmounts with empty paymentPlan (matches EditBookingModal logic)
  // When paymentPlan is empty, terms = 1, so P1 gets all remaining balance
  // The amounts will be recalculated in step 3 when they select a specific plan
  // For Last Minute Booking, don't calculate installment amounts since only full payment is available
  const allAmounts = isLastMinuteBooking
    ? { p1Amount: "", p2Amount: "", p3Amount: "", p4Amount: "" }
    : calculateInstallmentAmounts(
        "", // Empty paymentPlan at step 2 - terms will be 1
        input.originalTourCost,
        input.discountedTourCost || null,
        input.reservationFee,
        input.isMainBooking ?? true,
        0, // No credit at initial booking
        "", // No creditFrom
        allDueDates.p1DueDate,
        allDueDates.p2DueDate,
        allDueDates.p3DueDate,
        allDueDates.p4DueDate,
      );

  // For Last Minute Booking, full payment fields should be empty at creation (Step 2)
  // They will be calculated when user confirms full_payment plan in Step 3
  const fullPaymentDueDate = "";
  const fullPaymentAmount = "";

  return {
    // Identifiers
    bookingId,
    bookingCode,
    tourCode: input.tourCode,
    tourId: input.tourId ?? "",
    travellerInitials,
    tourPackageNameUniqueCounter: uniqueCounter,
    formattedDate,

    // Personal info
    emailAddress: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    fullName: getFullName(input.firstName, input.lastName),

    // Booking details
    reservationDate: now,
    bookingType: input.bookingType,
    tourPackageName: input.tourPackageName,
    tourDate: normalizedTourDate,
    returnDate: input.returnDate || "",
    tourDuration: input.tourDuration || "",

    // Payment calculation fields
    daysBetweenBookingAndTourDate: daysBetween,
    eligible2ndofmonths: eligible2ndOfMonths,
    paymentCondition,
    availablePaymentTerms,

    // Payment amounts
    originalTourCost: input.originalTourCost,
    discountedTourCost: input.discountedTourCost || null,
    reservationFee: input.reservationFee,
    paid: input.paidAmount,
    remainingBalance:
      (input.discountedTourCost || input.originalTourCost) - input.paidAmount,

    // Full payment fields (pre-calculated)
    fullPaymentDueDate,
    fullPaymentAmount,

    // Installment fields (pre-calculated, will be recalculated in Step 3)
    p1DueDate: allDueDates.p1DueDate,
    p1Amount: allAmounts.p1Amount as number | "",
    p2DueDate: allDueDates.p2DueDate,
    p2Amount: allAmounts.p2Amount as number | "",
    p3DueDate: allDueDates.p3DueDate,
    p3Amount: allAmounts.p3Amount as number | "",
    p4DueDate: allDueDates.p4DueDate,
    p4Amount: allAmounts.p4Amount as number | "",

    // Payment method
    paymentMethod: input.paymentMethod,

    // Group booking
    isMainBooking: input.isMainBooking ?? true,
    isMainBooker: false,
    groupIdGroupIdGenerator: "",
    groupId: input.groupId || "",

    // Row number (global across all bookings)
    row: input.totalBookingsCount + 1,

    // Metadata
    tags: ["auto"],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update booking with selected payment plan
 */
export interface PaymentPlanUpdateInput {
  paymentPlan: string;
  reservationDate: unknown;
  tourDate: unknown;
  paymentCondition: string;
  originalTourCost: number;
  discountedTourCost: number | null;
  reservationFee: number;
  isMainBooker: boolean;
  creditAmount?: number;
  creditFrom?: string;
  reminderDaysBefore?: number;
  p1Amount?: number | string | null;
  p2Amount?: number | string | null;
  p3Amount?: number | string | null;
  p4Amount?: number | string | null;
  p1DatePaid?: unknown;
  p2DatePaid?: unknown;
  p3DatePaid?: unknown;
  p4DatePaid?: unknown;
}

export interface PaymentPlanUpdateResult {
  paymentPlan: string;
  bookingStatus: string;
  paymentProgress: string;
  enablePaymentReminder: boolean;

  // Full payment
  fullPaymentDueDate: string;
  fullPaymentAmount: number | "";

  // Installments
  p1DueDate: string;
  p1Amount: number | "";
  p2DueDate: string;
  p2Amount: number | "";
  p3DueDate: string;
  p3Amount: number | "";
  p4DueDate: string;
  p4Amount: number | "";

  // Reminders
  p1ScheduledReminderDate: string;
  p2ScheduledReminderDate: string;
  p3ScheduledReminderDate: string;
  p4ScheduledReminderDate: string;

  updatedAt: Date;
}

export function calculatePaymentPlanUpdate(
  input: PaymentPlanUpdateInput,
): PaymentPlanUpdateResult {
  const normalizedTourDate =
    normalizeTourDateToUTCPlus8Nine(input.tourDate) ?? input.tourDate;

  // Calculate full payment fields
  const fullPaymentDueDate = getFullPaymentDueDate(
    input.reservationDate,
    input.paymentPlan,
  );
  const fullPaymentAmount = getFullPaymentAmount(
    input.paymentPlan,
    input.originalTourCost,
    input.discountedTourCost,
    input.reservationFee,
    input.isMainBooker,
    input.creditAmount,
  );

  // Calculate installment due dates
  const dueDates = generateInstallmentDueDates(
    input.reservationDate,
    normalizedTourDate,
    input.paymentPlan,
    input.paymentCondition,
  );

  // Calculate installment amounts (with due dates for proper calculation)
  const amounts = calculateInstallmentAmounts(
    input.paymentPlan,
    input.originalTourCost,
    input.discountedTourCost,
    input.reservationFee,
    input.isMainBooker,
    input.creditAmount,
    input.creditFrom || "",
    dueDates.p1DueDate,
    dueDates.p2DueDate,
    dueDates.p3DueDate,
    dueDates.p4DueDate,
    input.p1Amount,
    input.p2Amount,
    input.p3Amount,
    input.p4Amount,
    input.p1DatePaid,
    input.p2DatePaid,
    input.p3DatePaid,
    input.p4DatePaid,
  );

  // Calculate scheduled reminder dates
  const reminders = calculateScheduledReminderDates(
    dueDates,
    input.reservationDate,
  );

  // Clear unused payment term fields based on selected plan
  // If user selects P1, clear P2-P4 fields; if P2, clear P3-P4 fields, etc.
  const selectedTerms = input.paymentPlan.match(/P(\d)/)
    ? parseInt(input.paymentPlan.match(/P(\d)/)![1], 10)
    : 0;

  const finalDueDates = { ...dueDates };
  const finalAmounts = { ...amounts };
  const finalReminders = { ...reminders };

  if (selectedTerms > 0) {
    // Clear P2 fields if plan is P1
    if (selectedTerms < 2) {
      finalDueDates.p2DueDate = "";
      finalAmounts.p2Amount = "";
      finalReminders.p2ScheduledReminderDate = "";
    }
    // Clear P3 fields if plan is P1 or P2
    if (selectedTerms < 3) {
      finalDueDates.p3DueDate = "";
      finalAmounts.p3Amount = "";
      finalReminders.p3ScheduledReminderDate = "";
    }
    // Clear P4 fields if plan is P1, P2, or P3
    if (selectedTerms < 4) {
      finalDueDates.p4DueDate = "";
      finalAmounts.p4Amount = "";
      finalReminders.p4ScheduledReminderDate = "";
    }
  }

  // Calculate booking status based on payment plan (matches bookingStatusFunction logic)
  // At step 3, no payments have been made yet, so:
  // - Full Payment → "Waiting for Full Payment"
  // - P1-P4 → "Installment 0/X"
  let bookingStatus = "";
  if (input.paymentPlan === "Full Payment") {
    bookingStatus = "Waiting for Full Payment";
  } else if (input.paymentPlan.match(/P(\d)/)) {
    const totalTerms = parseInt(input.paymentPlan.match(/P(\d)/)![1], 10);
    bookingStatus = `Installment 0/${totalTerms}`;
  }

  return {
    paymentPlan: input.paymentPlan,
    bookingStatus,
    paymentProgress: "0%",
    enablePaymentReminder: false,

    fullPaymentDueDate,
    fullPaymentAmount,

    ...finalDueDates,
    ...finalAmounts,
    ...finalReminders,

    updatedAt: new Date(),
  };
}
