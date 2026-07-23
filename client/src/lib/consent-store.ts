"use client";

import { CONSENT_COOKIE, CONSENT_MAX_AGE, consentState, type ConsentChoice } from "@/lib/consent";

/**
 * Client-side store backing the consent UI. Two pieces of state:
 *   - the visitor's **choice**, persisted in the `iht_consent` cookie (source of truth), and
 *   - a transient **panel-open** flag, so a "Cookie Settings" affordance can re-summon the
 *     banner after it has been dismissed.
 *
 * Exposed through the `useSyncExternalStore` contract (`subscribe` + primitive snapshots) so
 * React components read it without setState-in-effect and without SSR mismatches.
 *
 * GDPR/PECR note: withdrawing consent must be as easy as giving it, and a rejection must not
 * be auto-re-prompted. So the big banner only auto-shows when NO choice has been made yet;
 * once decided, it reappears only when the visitor *deliberately* re-opens it via
 * `openPanel()`. See `ConsentBanner` / `CookieSettingsToggle`.
 */

let panelOpen = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Current stored choice, or null if the visitor hasn't decided yet. */
export function getChoice(): ConsentChoice | null {
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  const value = hit?.slice(CONSENT_COOKIE.length + 1);
  return value === "granted" || value === "denied" ? value : null;
}

export function isPanelOpen(): boolean {
  return panelOpen;
}

export function openPanel(): void {
  panelOpen = true;
  emit();
}

export function closePanel(): void {
  panelOpen = false;
  emit();
}

/**
 * Persist a decision and apply it live. Pushing `consent: update` either starts (granted) or
 * stops (denied) measurement immediately — this is the withdrawal path, symmetric with
 * granting. Closes the panel afterward.
 */
export function setChoice(choice: ConsentChoice): void {
  document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax`;
  window.gtag?.("consent", "update", consentState(choice));
  panelOpen = false;
  emit();
}
