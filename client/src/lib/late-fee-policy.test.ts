import { describe, expect, it } from "vitest";

import {
  LATE_FEE_GRACE_DAYS,
  LATE_FEE_GRACE_POLICY_DATE,
  LEGACY_LATE_FEE_GRACE_DAYS,
  getLateFeeGraceDays,
  usesShortLateFeeGrace,
} from "./late-fee-policy";

describe("late-fee grace policy", () => {
  it("goes live at 24 Sep 2026 00:00 Manila", () => {
    expect(LATE_FEE_GRACE_POLICY_DATE.toISOString()).toBe(
      "2026-09-23T16:00:00.000Z",
    );
  });

  it("keeps existing bookings on the legacy grace", () => {
    const lastMinuteBefore = new Date("2026-09-23T23:59:59+08:00");
    expect(usesShortLateFeeGrace(lastMinuteBefore)).toBe(false);
    expect(getLateFeeGraceDays(lastMinuteBefore)).toBe(
      LEGACY_LATE_FEE_GRACE_DAYS,
    );
    expect(getLateFeeGraceDays(new Date("2026-06-01"))).toBe(3);
  });

  it("uses the 2-day grace from the policy date on", () => {
    expect(getLateFeeGraceDays(LATE_FEE_GRACE_POLICY_DATE)).toBe(
      LATE_FEE_GRACE_DAYS,
    );
    expect(getLateFeeGraceDays(new Date("2026-10-05"))).toBe(2);
  });

  it("accepts Firestore timestamp shapes", () => {
    const seconds = Math.floor(
      new Date("2026-10-01T00:00:00Z").getTime() / 1000,
    );
    expect(getLateFeeGraceDays({ seconds })).toBe(2);
    expect(getLateFeeGraceDays({ _seconds: seconds })).toBe(2);
    expect(
      getLateFeeGraceDays({ toDate: () => new Date("2026-01-01") }),
    ).toBe(3);
  });

  it("applies config graceDays to legacy bookings only", () => {
    expect(getLateFeeGraceDays(new Date("2026-07-01"), 5)).toBe(5);
    expect(getLateFeeGraceDays(new Date("2026-10-01"), 5)).toBe(2);
  });

  it("treats a missing reservation date as legacy", () => {
    expect(getLateFeeGraceDays(undefined)).toBe(3);
    expect(getLateFeeGraceDays("not a date")).toBe(3);
  });
});
