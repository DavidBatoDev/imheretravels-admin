/**
 * Late-fee grace-period policy.
 *
 * A late fee applies to an unpaid term once `now >= dueDate + graceDays`.
 * The grace period depends on when the booking was reserved:
 *  - reserved before LATE_FEE_GRACE_POLICY_DATE: config/late-fees graceDays,
 *    falling back to LEGACY_LATE_FEE_GRACE_DAYS (3) — unchanged behaviour.
 *  - reserved on/after LATE_FEE_GRACE_POLICY_DATE: LATE_FEE_GRACE_DAYS (2).
 *
 * The reservation-date gate means existing bookings keep the grace period they
 * were sold under. A booking with no parseable reservationDate is treated as
 * existing (legacy grace).
 *
 * MIRROR of src/lib/late-fee-policy.ts (the Cloud Functions package
 * cannot import from src/) — keep the two in sync.
 */

/** Go-live: reservations from 24 Sep 2026, 00:00 Asia/Manila. */
export const LATE_FEE_GRACE_POLICY_DATE = new Date("2026-09-24T00:00:00+08:00");

/** Grace period for bookings reserved on/after the policy date. */
export const LATE_FEE_GRACE_DAYS = 2;

/** Code default for bookings reserved before the policy date. */
export const LEGACY_LATE_FEE_GRACE_DAYS = 3;

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

/** Whether a booking falls under the 2-day grace policy. */
export function usesShortLateFeeGrace(reservationDate: unknown): boolean {
  const res = toDateValue(reservationDate);
  return !!res && res.getTime() >= LATE_FEE_GRACE_POLICY_DATE.getTime();
}

/**
 * Grace days for a booking. `configGraceDays` is config/late-fees graceDays and
 * only affects bookings reserved before the policy date.
 */
export function getLateFeeGraceDays(
  reservationDate: unknown,
  configGraceDays?: unknown,
): number {
  if (usesShortLateFeeGrace(reservationDate)) return LATE_FEE_GRACE_DAYS;
  const configured = Number(configGraceDays ?? LEGACY_LATE_FEE_GRACE_DAYS);
  return Number.isFinite(configured) ? configured : LEGACY_LATE_FEE_GRACE_DAYS;
}
