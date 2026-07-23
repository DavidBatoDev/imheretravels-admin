import { CONSENT_COOKIE, consentState } from "@/lib/consent";

/**
 * Google Consent Mode v2 defaults — must run BEFORE the GTM container so tags never fire
 * without consent.
 *
 * This is a plain inline `<script>` (not `next/script`), rendered directly into the JSX tree.
 * `GoogleTagManager` uses `next/script`'s `afterInteractive` strategy, which only ever runs
 * after hydration — so a synchronous script executing at parse time is guaranteed to run
 * first regardless of where in the tree it's declared, same ordering guarantee `www` gets
 * from placing this in `<head>`. This layout has no `<head>` access (it's a nested route
 * layout, not the app root), so it renders into `<body>` instead — document position doesn't
 * matter here, only that it runs before GTM does.
 *
 * Privacy-first posture: every signal defaults to `denied` for all visitors, and the GTM
 * container stays dormant until `ConsentBanner` grants consent. `wait_for_update` gives the
 * banner a moment to apply a returning visitor's stored choice before tags evaluate.
 *
 * The stored-choice re-application reads `document.cookie` at runtime (not on the server), so
 * it stays correct even on a cached/prerendered response.
 *
 * Renders nothing unless `NEXT_PUBLIC_GTM_ID` is set — parity with `GoogleTagManager`.
 */
export default function ConsentModeDefault() {
  if (!process.env.NEXT_PUBLIC_GTM_ID) return null;

  const denied = JSON.stringify({ ...consentState("denied"), wait_for_update: 500 });
  const granted = JSON.stringify(consentState("granted"));

  const js = `window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=window.gtag||gtag;
gtag('consent','default',${denied});
try{if(document.cookie.split('; ').indexOf('${CONSENT_COOKIE}=granted')!==-1){gtag('consent','update',${granted});}}catch(e){}`;

  return (
    <script id="consent-mode-default" dangerouslySetInnerHTML={{ __html: js }} />
  );
}
