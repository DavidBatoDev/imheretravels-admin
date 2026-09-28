import { describe, expect, it } from "vitest";

import eligibleSecondsCountFunction from "@/app/functions/columns/tour-details/eligible2ndofmonths";
import paymentConditionFunction from "@/app/functions/columns/tour-details/payment-condition";
import getP1DueDateFunction from "@/app/functions/columns/payment-term-1/p1-due-date";
import getP2DueDateFunction from "@/app/functions/columns/payment-term-2/p2-due-date";
import getP3DueDateFunction from "@/app/functions/columns/payment-term-3/p3-due-date";
import getP4DueDateFunction from "@/app/functions/columns/payment-term-4/p4-due-date";
import {
  parseInstallmentDatesOverride,
  resolveInstallmentDatesLocal,
} from "./installment-schedule";

// SB-PHSS-20261108-TP053: reserved Jun 25, tour Nov 8 → deadline Sep 8. The rule
// gives Jul 31 + Aug 28 only (Sep 4 is 7 days after Aug 28, under the 14-day
// floor), but the booking was sold P3 with Sep 4 as the final instalment.
const RES = "2026-06-25";
const TOUR = "2026-11-08";
const OVERRIDE = "2026-07-31, 2026-08-28, 2026-09-04";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("parseInstallmentDatesOverride", () => {
  it("parses and sorts ISO dates", () => {
    expect(
      parseInstallmentDatesOverride("2026-09-04,2026-07-31, 2026-08-28")!.map(ymd),
    ).toEqual(["2026-07-31", "2026-08-28", "2026-09-04"]);
  });

  it("ignores blank and malformed overrides entirely", () => {
    expect(parseInstallmentDatesOverride("")).toBeNull();
    expect(parseInstallmentDatesOverride(undefined)).toBeNull();
    expect(parseInstallmentDatesOverride("2026-07-31, Sep 4 2026")).toBeNull();
    expect(parseInstallmentDatesOverride("2026-02-30")).toBeNull();
  });

  it("caps at 4 terms", () => {
    expect(
      parseInstallmentDatesOverride(
        "2026-01-30, 2026-02-27, 2026-03-27, 2026-04-24, 2026-05-29",
      ),
    ).toHaveLength(4);
  });
});

describe("resolveInstallmentDatesLocal", () => {
  const res = new Date(2026, 5, 25);
  const tour = new Date(2026, 10, 8);

  it("uses the rule when there is no override", () => {
    expect(resolveInstallmentDatesLocal(res, tour).map(ymd)).toEqual([
      "2026-07-31",
      "2026-08-28",
    ]);
  });

  it("uses the override when set", () => {
    expect(resolveInstallmentDatesLocal(res, tour, OVERRIDE).map(ymd)).toEqual([
      "2026-07-31",
      "2026-08-28",
      "2026-09-04",
    ]);
  });
});

describe("column chain with an override (Tayla Pierce)", () => {
  it("without the override the row collapses to P2 and P3 is blank", () => {
    expect(eligibleSecondsCountFunction(RES, TOUR)).toBe(2);
    expect(getP3DueDateFunction(RES, TOUR, "P3", "Standard Booking, P2")).toBe("");
  });

  it("with the override the row is P3 with Sep 4 as P3", () => {
    const count = eligibleSecondsCountFunction(RES, TOUR, OVERRIDE);
    expect(count).toBe(3);

    const condition = paymentConditionFunction(TOUR, count as number, 136);
    expect(condition).toBe("Standard Booking, P3");

    expect(getP1DueDateFunction(RES, TOUR, "P3", condition, OVERRIDE)).toBe("Jul 31, 2026");
    expect(getP2DueDateFunction(RES, TOUR, "P3", condition, OVERRIDE)).toBe("Aug 28, 2026");
    expect(getP3DueDateFunction(RES, TOUR, "P3", condition, OVERRIDE)).toBe("Sep 4, 2026");
    expect(getP4DueDateFunction(RES, TOUR, "P3", condition, OVERRIDE)).toBe("");
  });
});
