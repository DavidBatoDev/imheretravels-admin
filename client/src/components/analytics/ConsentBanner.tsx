"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { ConsentChoice } from "@/lib/consent";
import { subscribe, getChoice, isPanelOpen, closePanel, setChoice } from "@/lib/consent-store";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

/**
 * "Has the client hydrated yet?" — server renders false, client renders true. A no-op
 * subscribe is correct here: the value flips exactly once, at hydration, and never changes.
 */
const noopSubscribe = () => () => {};

/**
 * Cookie-consent banner gating Google Consent Mode, built for EU/UK (GDPR/PECR) rules.
 * Ported from the `www` app's `ConsentBanner` — same behavior, restyled with admin's own
 * design tokens instead of the marketing-site type scale.
 *
 * Behaviour:
 *   - First-time visitor (no stored choice): banner auto-shows with equal-weight Accept /
 *     Reject buttons and no dismiss-without-deciding shortcut.
 *   - After a decision: the banner disappears and does NOT auto-re-prompt. It only comes
 *     back via `CookieSettingsToggle` (the floating re-entry affordance), which is the
 *     symmetric withdraw/change path required by GDPR.
 *   - In that re-opened "manage" state we add a close (✕) so they can back out without
 *     changing anything.
 */
export default function ConsentBanner() {
  const choice = useSyncExternalStore(subscribe, getChoice, () => null);
  const panelOpen = useSyncExternalStore(subscribe, isPanelOpen, () => false);

  // Render nothing until hydrated — the cookie choice can only be read client-side, so the
  // server snapshot can't distinguish "no choice yet" from "unknown". Rendering optimistically
  // would flash the banner for returning visitors who already decided.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const visible = hydrated && (panelOpen || choice === null);
  if (!GTM_ID || !visible) return null;

  const manageMode = choice !== null;
  const decide = (next: ConsentChoice) => setChoice(next);
  const btn = "rounded-lg px-5 py-2.5 text-center text-sm font-medium transition-colors min-w-28";

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
    >
      <div className="relative mx-auto flex max-w-4xl flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {manageMode && (
          <button
            type="button"
            onClick={closePanel}
            aria-label="Close cookie preferences"
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <p className="text-sm text-foreground sm:pr-4">
          {manageMode
            ? "Update your cookie preferences. You can accept or reject analytics cookies at any time."
            : "We use cookies to measure traffic on this booking form and improve your experience."}{" "}
          Read our{" "}
          <Link href="https://www.imheretravels.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-crimson-red underline">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => decide("denied")}
            className={`${btn} bg-midnight text-white hover:bg-midnight/80`}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className={`${btn} bg-crimson-red text-white hover:bg-light-red`}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
