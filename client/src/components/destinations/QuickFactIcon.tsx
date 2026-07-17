import type { ReactElement } from "react";

/**
 * Quick-fact icon set for the destination CMS editor. This MUST stay in sync
 * with the public renderer at
 * www/app/all-destinations/[slug]/_components/QuickFactIcon.tsx — an icon id
 * picked here renders with the identical SVG on the live page.
 */

export type QuickFactIconId =
  | "currency"
  | "beer"
  | "hello"
  | "dish"
  | "language"
  | "weather"
  | "temperature"
  | "time"
  | "power"
  | "flag"
  | "capital"
  | "population"
  | "visa"
  | "wave";

/** Ordered options for the icon picker (id → human label). */
export const QUICK_FACT_ICONS: { id: QuickFactIconId; label: string }[] = [
  { id: "currency", label: "Currency" },
  { id: "beer", label: "Local Beer" },
  { id: "hello", label: "Say Hello" },
  { id: "dish", label: "Famous Dish" },
  { id: "language", label: "Language" },
  { id: "weather", label: "Weather" },
  { id: "temperature", label: "Temperature" },
  { id: "time", label: "Time Zone" },
  { id: "power", label: "Power / Plug" },
  { id: "flag", label: "Flag" },
  { id: "capital", label: "Capital" },
  { id: "population", label: "Population" },
  { id: "visa", label: "Visa" },
  { id: "wave", label: "Beach / Sea" },
];

const ICON_PATHS: Record<QuickFactIconId, ReactElement> = {
  currency: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 14.5c0 1.1.9 2 2 2h2a2 2 0 0 0 0-4h-2a2 2 0 0 1 0-4h2c1.1 0 2 .9 2 2M12 7v2m0 8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  beer: (
    <>
      <path d="M5 8h11l-1.5 10H6.5L5 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 8V6a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 10h2a2 2 0 0 1 0 4h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  hello: (
    <path d="M8 11V6a1.5 1.5 0 0 1 3 0v4m0 0V5a1.5 1.5 0 0 1 3 0v5m0 0V7a1.5 1.5 0 0 1 3 0v5l.5 3A4 4 0 0 1 13.5 19H12a5 5 0 0 1-5-5v-3a1.5 1.5 0 0 1 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  dish: (
    <>
      <ellipse cx="12" cy="16" rx="8" ry="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 16C4.5 11.5 7.5 8 12 8s7.5 3.5 7.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 8V5m-2 0h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  language: (
    <>
      <path d="M4 5.5h16v9H10l-4 3.5v-3.5H4v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 9h8M8 11.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  weather: (
    <>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  temperature: (
    <>
      <path d="M14 13.5V6a2 2 0 1 0-4 0v7.5a3.5 3.5 0 1 0 4 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 15.5v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  power: (
    <>
      <path d="M9 3.5v4M15 3.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 7.5h10v2.5a5 5 0 0 1-10 0V7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 15v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  flag: (
    <>
      <path d="M6 3.5v17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 4.5h11l-2.2 3.2L17 11H6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  capital: (
    <>
      <path d="M4 20.5h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 20.5V10M18.5 20.5V10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 10l8-5.5 8 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M9.5 20.5v-4.5h5v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  population: (
    <>
      <circle cx="9.5" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 19a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5.8M16.5 19a5 5 0 0 0-2-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  visa: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  wave: (
    <>
      <path d="M3 9c1.8 0 1.8 1.6 3.6 1.6S8.4 9 10.2 9s1.8 1.6 3.6 1.6S15.6 9 17.4 9 19.2 10.6 21 10.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 14c1.8 0 1.8 1.6 3.6 1.6S8.4 14 10.2 14s1.8 1.6 3.6 1.6S15.6 14 17.4 14 19.2 15.6 21 15.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function QuickFactIcon({
  icon,
  className = "size-5 shrink-0",
}: {
  icon: string;
  className?: string;
}) {
  const inner = ICON_PATHS[icon as QuickFactIconId] ?? ICON_PATHS.dish;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {inner}
    </svg>
  );
}
