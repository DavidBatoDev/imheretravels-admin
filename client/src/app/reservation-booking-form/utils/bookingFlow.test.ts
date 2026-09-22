import { describe, expect, it } from "vitest";
import {
  calculateDaysBetween,
  fixTermName,
  generatePaymentScheduleForMonths,
  getAvailablePaymentTermForDate,
  getFriendlyDescription,
  isTourAllDatesTooSoon,
} from "./bookingFlow";

describe("bookingFlow utilities", () => {
  it("calculates day difference using current behavior", () => {
    const fromDate = new Date("2026-03-10T12:00:00Z");

    expect(calculateDaysBetween("2026-03-10", fromDate)).toBe(0);
    expect(calculateDaysBetween("2026-03-11", fromDate)).toBe(1);
    expect(calculateDaysBetween("2026-03-08", fromDate)).toBe(-2);
  });

  it("detects when all tour dates are too soon", () => {
    const fromDate = new Date("2026-03-10T12:00:00Z");

    expect(
      isTourAllDatesTooSoon(
        { travelDates: ["2026-03-10", "2026-03-11"] },
        fromDate,
      ),
    ).toBe(true);

    expect(
      isTourAllDatesTooSoon(
        { travelDates: ["2026-03-11", "2026-03-12"] },
        fromDate,
      ),
    ).toBe(false);

    expect(isTourAllDatesTooSoon({ travelDates: [] }, fromDate)).toBe(false);
  });

  it("maps tour date windows to payment term availability", () => {
    const fromDate = new Date("2026-03-10T12:00:00Z");

    expect(getAvailablePaymentTermForDate("2026-03-11", fromDate)).toEqual({
      term: "invalid",
      isLastMinute: false,
      isInvalid: true,
    });

    expect(getAvailablePaymentTermForDate("2026-03-20", fromDate)).toEqual({
      term: "full_payment",
      isLastMinute: true,
      isInvalid: false,
    });

    // Reserved 10 Mar 2026 => legacy policy (cutoff = tourDate - 3d).
    // Eligible last Fridays: 27 Mar, 24 Apr, 29 May => P3.
    expect(getAvailablePaymentTermForDate("2026-06-20", fromDate)).toEqual({
      term: "P3",
      isLastMinute: false,
      isInvalid: false,
    });

    expect(getAvailablePaymentTermForDate("2026-10-20", fromDate)).toEqual({
      term: "P4",
      isLastMinute: false,
      isInvalid: false,
    });
  });

  it("generates monthly schedule and preserves exact remaining balance", () => {
    const schedule = generatePaymentScheduleForMonths({
      tourDate: "2026-10-20",
      monthsRequired: 3,
      totalTourPrice: 3000,
      depositAmount: 900,
      fromDate: new Date("2026-03-10T12:00:00Z"),
    });

    // Last Friday of each month, not the retired "2nd of the month" scheme.
    expect(schedule).toHaveLength(3);
    expect(schedule[0].date).toBe("2026-03-27");
    expect(schedule[1].date).toBe("2026-04-24");
    expect(schedule[2].date).toBe("2026-05-29");

    const totalScheduled = schedule.reduce((sum, row) => sum + row.amount, 0);
    expect(totalScheduled).toBeCloseTo(2100, 8);
  });

  it("uses the second-to-last Friday for 2027+ tours reserved after the policy date", () => {
    const schedule = generatePaymentScheduleForMonths({
      tourDate: "2027-04-10",
      monthsRequired: 4,
      totalTourPrice: 3000,
      depositAmount: 900,
      fromDate: new Date("2026-10-06T12:00:00Z"),
    });

    expect(schedule.map((row) => row.date)).toEqual([
      "2026-10-23",
      "2026-11-20",
      "2026-12-18",
      "2027-01-22",
    ]);
  });

  it("keeps term naming and friendly descriptions stable", () => {
    expect(fixTermName("2 Instalment plan in 3 instalments")).toBe(
      "2 Installment plan in 3 installments",
    );

    expect(getFriendlyDescription(1)).toBe("Ready to pay in full? Pick me.");
    expect(getFriendlyDescription(4)).toContain("4 easy payments");
    expect(getFriendlyDescription(99)).toBe("");
  });
});
