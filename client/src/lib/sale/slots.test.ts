import { describe, expect, it } from "vitest";
import { effectiveStatus, isSaleOpen, pickSlots, publicState, salePriceFor, type SlotLike } from "./slots";

const NOW = 1_800_000_000_000;
const ladder = (...statuses: SlotLike["status"][]): SlotLike[] =>
  statuses.map((status, i) => ({ index: i + 1, status, heldUntilMs: status === "held" || status === "paying" ? NOW + 60_000 : null }));

describe("pickSlots", () => {
  it("takes the lowest free slots in ladder order", () => {
    const picked = pickSlots(ladder("sold", "available", "available", "available"), 2, NOW);
    expect(picked?.map((s) => s.index)).toEqual([2, 3]);
  });

  it("skips held slots and refuses when not enough are free", () => {
    const slots = ladder("available", "held", "sold", "available");
    expect(pickSlots(slots, 2, NOW)?.map((s) => s.index)).toEqual([1, 4]);
    expect(pickSlots(slots, 3, NOW)).toBeNull();
  });

  it("treats an expired hold as free (lazy expiry)", () => {
    const slots: SlotLike[] = [{ index: 1, status: "held", heldUntilMs: NOW - 1 }];
    expect(pickSlots(slots, 1, NOW)?.map((s) => s.index)).toEqual([1]);
  });

  it("an unexpired paying slot is never picked", () => {
    expect(pickSlots(ladder("paying"), 1, NOW)).toBeNull();
  });

  it("rejects invalid party sizes", () => {
    expect(pickSlots(ladder("available"), 0, NOW)).toBeNull();
    expect(pickSlots(ladder("available"), 1.5, NOW)).toBeNull();
  });
});

describe("slot states", () => {
  it("maps to public states without holder detail", () => {
    expect(publicState({ index: 1, status: "paying", heldUntilMs: NOW + 1 }, NOW)).toBe("on_hold");
    expect(publicState({ index: 1, status: "held", heldUntilMs: NOW }, NOW)).toBe("available");
    expect(effectiveStatus({ index: 1, status: "sold" }, NOW)).toBe("sold");
  });
});

describe("salePriceFor", () => {
  it("matches the Black Friday CSV", () => {
    expect(salePriceFor(2199, 500)).toBe(1699);
    expect(salePriceFor(1499, 75)).toBe(1424);
    expect(salePriceFor(100, 500)).toBe(0);
  });
});

describe("isSaleOpen", () => {
  it("needs live status inside the window; null end means TBA", () => {
    expect(isSaleOpen({ status: "live", startAtMs: NOW - 1, endAtMs: null }, NOW)).toBe(true);
    expect(isSaleOpen({ status: "live", startAtMs: NOW + 1, endAtMs: null }, NOW)).toBe(false);
    expect(isSaleOpen({ status: "live", startAtMs: null, endAtMs: NOW }, NOW)).toBe(false);
    expect(isSaleOpen({ status: "paused", startAtMs: null, endAtMs: null }, NOW)).toBe(false);
  });
});
