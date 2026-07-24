/**
 * The customer-facing booking status page — one place, so every email links to
 * the same thing in the same shape.
 *
 * Callers used to build this inline three different ways: two hardcoded the
 * admin domain, and the third joined `NEXT_PUBLIC_APP_URL` (which carries a
 * trailing slash) with "/booking-status/", producing a double slash in a link
 * customers actually see.
 */

const DEFAULT_APP_URL = "https://admin.imheretravels.com";

/** Base URL with any trailing slashes removed. */
export function getAppBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  return (configured || DEFAULT_APP_URL).replace(/\/+$/, "");
}

/**
 * Build a traveller's personal booking status URL.
 *
 * @param accessToken the booking's `access_token`
 * @returns the URL, or "" when the booking has no token (callers should treat
 *          an empty string as "no link available" rather than linking nowhere).
 */
export function buildBookingStatusUrl(
  accessToken: string | undefined | null,
): string {
  const token = (accessToken || "").trim();
  if (!token) return "";
  return `${getAppBaseUrl()}/booking-status/${token}`;
}
