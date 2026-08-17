/**
 * Canonical instalment-schedule rule.
 *
 * This module is the single source of truth for which dates a booking's
 * instalments may fall on. It previously existed as six near-identical copies
 * (booking-calculations.ts, the reservation-form preview, and the four
 * pN-due-date column functions plus eligible2ndofmonths), which drifted from
 * each other — see scripts/audit-booking-status-payment-term-mismatch.ts.
 *
 * The rule:
 *  1. Candidate date per month = the LAST FRIDAY of that month.
 *  2. A candidate is eligible when it falls strictly after reservationDate + 2d
 *     and on/before the policy cutoff.
 *  3. Cutoff = tourDate - 2 calendar months for bookings reserved on/after
 *     1 Jun 2026 ("standard" policy), or tourDate - 3d for older bookings
 *     ("legacy" policy — see lib/schedule-policy.ts).
 *  4. SNAP-BACK: when the final monthly anchor overshoots the cutoff, the term
 *     is no longer dropped. Instead the schedule falls back to the last Friday
 *     that still meets the deadline, provided it is at least
 *     MIN_INSTALLMENT_GAP_DAYS after the previous instalment.
 *
 * Timezone: the core works on "civil" dates (year/month/day with no time
 * component), represented as UTC-midnight Dates so the arithmetic is
 * unambiguous. Callers that reason in local time convert in and out with
 * toCivilUTC / fromCivilUTC; callers already in UTC pass their dates straight
 * through. Both paths produce identical calendar dates in every timezone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimum days between two consecutive instalments a snap-back may create. */
export const MIN_INSTALLMENT_GAP_DAYS = 14;

/** Terms beyond this are never offered (P1..P4), so snap-back stops here. */
export const MAX_INSTALLMENT_TERMS = 4;

/** Bookings reserved on/after this date use the 2-month-before-tour cutoff. */
export const SCHEDULE_POLICY_DATE_UTC = Date.UTC(2026, 5, 1);

/**
 * Reinterpret a Date's LOCAL calendar components as a UTC-midnight date.
 * Use when the caller parsed a date in local time (e.g. the column functions).
 */
export function toCivilUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

/**
 * Inverse of toCivilUTC: turn a UTC-midnight date back into a local-midnight
 * Date with the same calendar components.
 */
export function fromCivilUTC(date: Date): Date {
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

/** The last Friday of the month containing `year`/`month` (0-based month). */
function lastFridayOfMonth(year: number, month: number): Date {
  const lastDayMs = Date.UTC(year, month + 1, 0);
  const offset = (new Date(lastDayMs).getUTCDay() - 5 + 7) % 7; // days back to Friday
  return new Date(lastDayMs - offset * DAY_MS);
}

/**
 * The latest Friday on or before `ms`. Returns `ms` itself when it is a Friday.
 */
export function lastFridayOnOrBefore(ms: number): Date {
  const offset = (new Date(ms).getUTCDay() - 5 + 7) % 7;
  return new Date(ms - offset * DAY_MS);
}

/**
 * Core rule. Both arguments must be UTC-midnight civil dates.
 *
 * Returns the eligible instalment dates in ascending order, as UTC-midnight
 * Dates. An empty array means the booking is last-minute or invalid.
 */
export function computeEligibleInstallmentDates(
  resUTC: Date,
  tourUTC: Date,
): Date[] {
  const monthCount =
    (tourUTC.getUTCFullYear() - resUTC.getUTCFullYear()) * 12 +
    (tourUTC.getUTCMonth() - resUTC.getUTCMonth()) +
    1;

  if (monthCount <= 0) return [];

  const anchors = Array.from({ length: monthCount }, (_, i) =>
    lastFridayOfMonth(resUTC.getUTCFullYear(), resUTC.getUTCMonth() + i),
  );

  // Bookings made on/after June 1 2026: 2-month-before-tour cutoff.
  // Older bookings keep the original 3-day cutoff so their schedules are unchanged.
  const isNewPolicy = resUTC.getTime() >= SCHEDULE_POLICY_DATE_UTC;
  const twoMonthsBeforeTour = new Date(
    Date.UTC(
      tourUTC.getUTCFullYear(),
      tourUTC.getUTCMonth() - 2,
      tourUTC.getUTCDate(),
    ),
  );
  const cutoffDate = isNewPolicy
    ? twoMonthsBeforeTour
    : new Date(tourUTC.getTime() - 3 * DAY_MS);

  const earliest = resUTC.getTime() + 2 * DAY_MS;
  const eligible = anchors.filter(
    (d) => d.getTime() > earliest && d.getTime() <= cutoffDate.getTime(),
  );

  // Snap-back: when the final monthly anchor overshoots the deadline, fall back
  // to the last Friday that still meets it rather than dropping the term.
  //
  // Only extends a schedule that already has at least one instalment — a
  // Last Minute Booking stays a Last Minute Booking (48hr full payment).
  // Legacy-policy bookings are excluded so their schedules never change.
  if (
    isNewPolicy &&
    eligible.length >= 1 &&
    eligible.length < MAX_INSTALLMENT_TERMS
  ) {
    const snapped = lastFridayOnOrBefore(cutoffDate.getTime());
    const previous = eligible[eligible.length - 1].getTime();

    if (
      snapped.getTime() > earliest &&
      snapped.getTime() > previous &&
      snapped.getTime() - previous >= MIN_INSTALLMENT_GAP_DAYS * DAY_MS
    ) {
      eligible.push(snapped);
    }
  }

  return eligible;
}

/**
 * Convenience wrapper for callers working in LOCAL time: takes local-midnight
 * dates and returns local-midnight dates with the same calendar components.
 */
export function computeEligibleInstallmentDatesLocal(
  res: Date,
  tour: Date,
): Date[] {
  return computeEligibleInstallmentDates(
    toCivilUTC(res),
    toCivilUTC(tour),
  ).map(fromCivilUTC);
}
