import Script from "next/script";

/**
 * Google Tag Manager container (which in turn loads GA4). Reuses the same GTM-K29G5GPR
 * container as www.imheretravels.com so admin.imheretravels.com/reservation-booking-form
 * traffic lands in the same GA4 property/funnel as the rest of the booking journey.
 *
 * Renders nothing unless `NEXT_PUBLIC_GTM_ID` is set, so local dev and preview builds never
 * pollute the production GA4 property.
 *
 * Only mounted from `reservation-booking-form/layout.tsx` — every other admin route is
 * internal-only and stays untagged.
 */
export default function GoogleTagManager() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  if (!gtmId) return null;

  return (
    <Script id="gtm-init" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
    </Script>
  );
}

/**
 * The `<noscript>` half of the GTM snippet. Rendered as high as possible in `<body>` per
 * Google's guidance — this app has no `<head>` access from a nested layout, and script
 * position in `<body>` still executes in document order, which is all that matters here.
 */
export function GoogleTagManagerNoScript() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  if (!gtmId) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
