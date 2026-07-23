/**
 * Shared constants and helpers for Google Consent Mode v2.
 *
 * Scoped to the `/reservation-booking-form` page only (see its `layout.tsx`) — this is the
 * only public, guest-facing page in the admin app that collects PII/payment details, so it's
 * the only one that needs analytics + consent gating. The rest of the dashboard is internal
 * and stays untagged.
 *
 * The flow, end to end (mirrors the `www` app's implementation):
 *   1. `ConsentModeDefault` sets every consent signal to "denied" before GTM loads, and
 *      re-applies a stored "granted" choice for returning visitors.
 *   2. GTM (`GoogleTagManager`) loads and honours that consent state — GA4/ads tags stay
 *      dormant until consent is granted.
 *   3. `ConsentBanner` lets a first-time visitor accept or reject, persists the choice in a
 *      cookie, and pushes a `consent: update` so tags start firing immediately on accept.
 *
 * Everything is a no-op unless `NEXT_PUBLIC_GTM_ID` is set.
 */

/** Cookie that records the visitor's choice. Host-only (no `Domain=`), so this is independent
 * of the same-named cookie on www.imheretravels.com — no cross-subdomain leakage. */
export const CONSENT_COOKIE = "iht_consent";

/** One year, in seconds — the max the choice is remembered before we ask again. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

export type ConsentChoice = "granted" | "denied";

/**
 * The Consent Mode v2 signals we manage. `security_storage` is intentionally omitted —
 * it is essential (always granted) and not something a banner should gate.
 */
export const CONSENT_SIGNALS = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
  "analytics_storage",
] as const;

/** Build a `{signal: value}` map for a `gtag('consent', ...)` call. */
export function consentState(value: ConsentChoice): Record<string, ConsentChoice> {
  return Object.fromEntries(CONSENT_SIGNALS.map((s) => [s, value]));
}

declare global {
  interface Window {
    // Defined by the inline `ConsentModeDefault` script (loads before any client code runs).
    gtag?: (...args: unknown[]) => void;
  }
}
