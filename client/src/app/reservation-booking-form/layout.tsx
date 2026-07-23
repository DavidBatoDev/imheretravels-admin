import ConsentModeDefault from "@/components/analytics/ConsentModeDefault";
import GoogleTagManager, {
  GoogleTagManagerNoScript,
} from "@/components/analytics/GoogleTagManager";
import ConsentBanner from "@/components/analytics/ConsentBanner";
import CookieSettingsToggle from "@/components/analytics/CookieSettingsToggle";

/**
 * Route-scoped layout — analytics + consent are wired here, not in the shared app root
 * layout, so they apply ONLY to this public, guest-facing booking form. Every other admin
 * route (dashboard, bookings, tours, etc.) is internal-only and stays untagged.
 *
 * This is a nested layout, not the app root, so it has no `<head>` to render into the way
 * `www`'s equivalent setup does. That's fine: `ConsentModeDefault` is a synchronous script
 * that runs at parse time regardless of DOM position, and `GoogleTagManager` uses
 * `afterInteractive` (inherently later) — so the required ordering (consent defaults before
 * GTM) holds without needing `<head>` placement.
 */
export default function ReservationBookingFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ConsentModeDefault />
      <GoogleTagManagerNoScript />
      <GoogleTagManager />
      {children}
      <ConsentBanner />
      <CookieSettingsToggle />
    </>
  );
}
