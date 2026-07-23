"use client";

import { useSyncExternalStore } from "react";
import { subscribe, getChoice, isPanelOpen, openPanel } from "@/lib/consent-store";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const noopSubscribe = () => () => {};

/**
 * Persistent, unobtrusive re-entry point for changing/withdrawing cookie consent — the
 * GDPR/PECR-required symmetric path to `ConsentBanner`. This page has no site footer to put a
 * "Cookie Settings" link in (unlike `www`), so this renders as a small floating button in the
 * bottom-left corner instead, out of the way of the booking form.
 *
 * Only shown once a choice has already been made and the banner itself isn't currently
 * visible — before a decision, the banner is already up and this would be redundant.
 */
export default function CookieSettingsToggle() {
  const choice = useSyncExternalStore(subscribe, getChoice, () => null);
  const panelOpen = useSyncExternalStore(subscribe, isPanelOpen, () => false);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!GTM_ID || !hydrated || choice === null || panelOpen) return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      className="fixed bottom-4 left-4 z-40 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-foreground hover:border-crimson-red/50 transition-colors"
    >
      Cookie Settings
    </button>
  );
}
