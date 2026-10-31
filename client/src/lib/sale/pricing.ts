// Sale prices start from the travel date's price: a date's own price
// (customOriginal) when it has one, otherwise the tour's original price.
// Pure — shared by the claim, availability, payment and the admin editor.

import { salePriceFor } from "./slots";

export interface RawTravelDate {
  startDate?: unknown;
  isAvailable?: boolean;
  customOriginal?: number | null;
}

/** Same date key the reservation form uses: the UTC ISO day of startDate. */
export function travelDateKey(startDate: unknown): string | null {
  if (startDate == null) return null;
  const v = startDate as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  const ms =
    typeof v.toMillis === "function"
      ? v.toMillis()
      : typeof v.toDate === "function"
        ? v.toDate().getTime()
        : typeof v.seconds === "number"
          ? v.seconds * 1000
          : typeof startDate === "string" || typeof startDate === "number"
            ? new Date(startDate).getTime()
            : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

export function datePrice(basePrice: number, date: RawTravelDate | undefined): number {
  const custom = date?.customOriginal;
  return typeof custom === "number" && custom > 0 ? custom : basePrice;
}

export interface TourPriceInfo {
  basePrice: number;
  /** Lowest price over upcoming bookable dates (the "from" price); base when there are none. */
  fromPrice: number;
  /** Upcoming dates don't all share one price. */
  pricesVary: boolean;
  /** Upcoming bookable dates and their prices, by date key. */
  byDate: Map<string, number>;
}

export function tourPriceInfo(basePrice: number, travelDates: RawTravelDate[] | undefined, nowMs = Date.now()): TourPriceInfo {
  const byDate = new Map<string, number>();
  for (const d of travelDates ?? []) {
    if (d?.isAvailable === false) continue;
    const key = travelDateKey(d.startDate);
    if (!key || Date.parse(`${key}T23:59:59Z`) < nowMs) continue;
    byDate.set(key, datePrice(basePrice, d));
  }
  const prices = [...byDate.values()];
  return {
    basePrice,
    fromPrice: prices.length ? Math.min(...prices) : basePrice,
    pricesVary: new Set(prices).size > 1,
    byDate,
  };
}

/** Sale price for one slot on a given date price. */
export function slotPrice(datePriceGBP: number, discountGBP: number): number {
  return salePriceFor(datePriceGBP, discountGBP);
}
