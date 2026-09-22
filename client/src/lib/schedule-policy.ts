/**
 * Payment-scheduling policy derivation.
 *
 * A booking's instalment schedule is generated under one of two policies, chosen
 * by its reservation date:
 *  - "legacy"   (reserved before 1 Jun 2026): instalments may fall up to a few
 *               days before the tour, so the final one can land AFTER the
 *               "paid in full 2 months before" mark — and that is valid.
 *  - "standard" (reserved on/after 1 Jun 2026): must be paid in full by 2 months
 *               before the tour.
 *
 * Within "standard", the monthly anchor also varies: bookings reserved on/after
 * SECOND_TO_LAST_FRIDAY_POLICY_DATE_UTC for tours departing in 2027 or later
 * fall due on the second-to-last Friday of each month instead of the last one
 * (lib/installment-schedule.ts). Pass `tourDate` to have that reflected.
 *
 * This is derived purely from `reservationDate` (+ `tourDate`); no new stored
 * field is needed. The cutoff mirrors POLICY_DATE in the pN due-date column
 * functions (e.g. payment-term-1/p1-due-date.ts).
 */

import { usesSecondToLastFriday } from "./installment-schedule";

export const SCHEDULE_POLICY_DATE = new Date(2026, 5, 1); // 1 Jun 2026 (local midnight)

export type SchedulePolicyKey = "legacy" | "standard";

export type ScheduleAnchor = "last-friday" | "second-to-last-friday";

export interface SchedulePolicy {
  key: SchedulePolicyKey;
  label: string;
  description: string;
  /** Which Friday of the month instalments fall on. */
  anchor: ScheduleAnchor;
}

function toDateValue(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === "object") {
    const v = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof v.toDate === "function") {
      const d = v.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** Local calendar components reinterpreted as a UTC-midnight civil date. */
function toCivilUTC(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Returns which scheduling policy a booking falls under, or null when the
 * reservation date is missing/unparseable. `tourDate` is optional; without it
 * the anchor is reported as "last-friday".
 */
export function getSchedulePolicy(
  reservationDate: unknown,
  tourDate?: unknown,
): SchedulePolicy | null {
  const res = toDateValue(reservationDate);
  if (!res) return null;

  const isLegacy = res.getTime() < SCHEDULE_POLICY_DATE.getTime();
  if (isLegacy) {
    return {
      key: "legacy",
      label: "Legacy schedule",
      description:
        "Reserved before 1 Jun 2026. Instalments may fall right up to a few days before the tour — including after the 2-month mark. This schedule is valid; do not apply the 2-month-before rule (or late fees) to due dates that match it.",
      anchor: "last-friday",
    };
  }

  const tour = toDateValue(tourDate);
  const secondToLast =
    !!tour && usesSecondToLastFriday(toCivilUTC(res), toCivilUTC(tour));

  return secondToLast
    ? {
        key: "standard",
        label: "Standard schedule (2nd-to-last Friday)",
        description:
          "Reserved on/after the 2027 policy date for a tour departing in 2027 or later. Instalments fall on the second-to-last Friday of each month; must be paid in full by 2 months before the tour.",
        anchor: "second-to-last-friday",
      }
    : {
        key: "standard",
        label: "Standard schedule",
        description:
          "Reserved on/after 1 Jun 2026. Instalments fall on the last Friday of each month; must be paid in full by 2 months before the tour.",
        anchor: "last-friday",
      };
}
