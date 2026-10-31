import { describe, expect, it } from "vitest";
import { datePrice, slotPrice, tourPriceInfo, travelDateKey } from "./pricing";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const at = (iso: string) => ({ toMillis: () => Date.parse(iso) });

describe("date-based sale pricing", () => {
  it("uses a date's own price when it has one, else the tour price", () => {
    expect(datePrice(1699, { customOriginal: 1899 })).toBe(1899);
    expect(datePrice(1699, { customOriginal: null })).toBe(1699);
    expect(datePrice(1699, undefined)).toBe(1699);
  });

  it("from price is the cheapest upcoming bookable date", () => {
    const info = tourPriceInfo(
      1699,
      [
        { startDate: at("2027-01-31T01:00:00Z"), customOriginal: 1899 },
        { startDate: at("2027-03-10T01:00:00Z") },
        { startDate: at("2026-10-01T01:00:00Z"), customOriginal: 999 }, // past
        { startDate: at("2027-05-01T01:00:00Z"), customOriginal: 1299, isAvailable: false }, // hidden
      ],
      NOW,
    );
    expect(info.fromPrice).toBe(1699);
    expect(info.pricesVary).toBe(true);
    expect(info.byDate.get("2027-01-31")).toBe(1899);
    expect(info.byDate.size).toBe(2);
  });

  it("falls back to the tour price when there are no upcoming dates", () => {
    expect(tourPriceInfo(2199, [], NOW)).toMatchObject({ fromPrice: 2199, pricesVary: false });
  });

  it("slot price = date price − discount, never below 0", () => {
    expect(slotPrice(1899, 400)).toBe(1499);
    expect(slotPrice(300, 500)).toBe(0);
    expect(travelDateKey(at("2027-01-31T01:00:00Z"))).toBe("2027-01-31");
  });
});
