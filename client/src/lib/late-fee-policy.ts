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
 * MIRRORED in functions/src/late-fee-policy.ts (the Cloud Functions package
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

/**
 * Automation restart gate. When config/late-fees `chargeDueFrom` is set, the
 * nightly checker and Process Now only charge terms due on/after it, so turning
 * automation back on never back-charges terms that fell due while it was off.
 * Send Notice (a staff action on one term) ignores it. Unset → no gate.
 */
export function isDueDateChargeable(
  dueDate: Date,
  chargeDueFrom: unknown,
): boolean {
  const from = toDateValue(chargeDueFrom);
  return !from || dueDate.getTime() >= from.getTime();
}

/**
 * Coerce a stored date (Date, ISO/display string, Firestore Timestamp or its
 * serialised {seconds}/{_seconds} form) to a Date. Anything else → null.
 */
export function asDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const parsed = value.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime())
        ? parsed
        : null;
    }

    if (typeof value.seconds === "number") {
      const parsed = new Date(value.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value._seconds === "number") {
      const parsed = new Date(value._seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

/**
 * A term's due date. `pNDueDate` can hold the whole schedule as one string
 * ("Jul 31, 2026, Aug 28, 2026, …"), so take the termIndex-th "Mon D, YYYY" pair.
 */
export function parseTermDueDate(dueDateRaw: any, termIndex: number): Date | null {
  if (!dueDateRaw) return null;

  if (typeof dueDateRaw === "string" && dueDateRaw.includes(",")) {
    const parts = dueDateRaw.split(",").map((part) => part.trim());
    const partStart = termIndex * 2;
    const partEnd = partStart + 1;

    if (parts.length > partEnd) {
      return asDate(`${parts[partStart]}, ${parts[partEnd]}`);
    }
  }

  return asDate(dueDateRaw);
}

/** The overdue guard: a fee may apply once `now >= dueDate + graceDays`. */
export function isPastGrace(dueDate: Date, graceDays: number, now: Date): boolean {
  const graceCutoff = new Date(dueDate.getTime());
  graceCutoff.setDate(graceCutoff.getDate() + graceDays);
  return now >= graceCutoff;
}
