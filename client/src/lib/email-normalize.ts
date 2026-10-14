/**
 * Email clean-up for booking data.
 *
 * Emails pasted into the admin sheet can carry a stray leading/trailing space
 * (or an invisible zero-width character). Gmail tolerates that, so reservation
 * emails still go out, but Stripe rejects the address and the guest cannot pay
 * ("Invalid email address:  name@example.com" on the booking-status page).
 *
 * Case is deliberately left alone: other records (stripePayments, scheduled
 * emails) store the address as typed and are matched against it.
 */

/** Same shape check the reservation form and BCC users already use. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Booking fields that hold the guest's email (`email` is the legacy name). */
export const BOOKING_EMAIL_FIELDS = ["emailAddress", "email"] as const;

// Zero-width space/joiners and BOM. String.prototype.trim() does not remove
// them, and they are never valid inside an address.
const INVISIBLE_CHARS = /[​-‍⁠﻿]/g;

/**
 * Strips invisible characters and surrounding whitespace (including
 * non-breaking spaces). Non-string values are returned unchanged.
 */
export function normalizeEmail<T>(value: T): T {
  if (typeof value !== "string") return value;
  return value.replace(INVISIBLE_CHARS, "").trim() as T;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_REGEX.test(value);
}

function isBookingEmailField(fieldPath: string): boolean {
  return (BOOKING_EMAIL_FIELDS as readonly string[]).includes(fieldPath);
}

/** Normalises a single booking field write if it is an email field. */
export function normalizeBookingFieldValue<T>(fieldPath: string, value: T): T {
  return isBookingEmailField(fieldPath) ? normalizeEmail(value) : value;
}

/**
 * Returns a copy of a booking write payload with its email fields normalised.
 * The input object is not mutated.
 */
export function normalizeBookingEmailFields<T extends Record<string, any>>(
  data: T,
): T {
  if (!data || typeof data !== "object") return data;
  let result: T | null = null;
  for (const field of BOOKING_EMAIL_FIELDS) {
    if (!(field in data)) continue;
    const normalized = normalizeEmail(data[field]);
    if (normalized !== data[field]) {
      result ??= { ...data };
      (result as Record<string, any>)[field] = normalized;
    }
  }
  return result ?? data;
}
