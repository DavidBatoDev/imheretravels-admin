import { describe, expect, it } from "vitest";

import {
  LATE_FEE_GRACE_DAYS,
  LATE_FEE_GRACE_POLICY_DATE,
  LEGACY_LATE_FEE_GRACE_DAYS,
  asDate,
  getLateFeeGraceDays,
  isPastGrace,
  parseTermDueDate,
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

describe("shared late-fee date helpers", () => {
  it("asDate reads Dates, strings and Firestore timestamp shapes", () => {
    const d = new Date("2026-09-04T00:00:00Z");
    expect(asDate(d)).toBe(d);
    expect(asDate("2026-09-04T00:00:00Z")?.getTime()).toBe(d.getTime());
    expect(asDate({ toDate: () => d })).toBe(d);
    expect(asDate({ seconds: d.getTime() / 1000 })?.getTime()).toBe(d.getTime());
    expect(asDate({ _seconds: d.getTime() / 1000 })?.getTime()).toBe(d.getTime());
    expect(asDate("not a date")).toBeNull();
    expect(asDate("")).toBeNull();
  });

  it("parseTermDueDate picks the term's pair out of a schedule string", () => {
    const schedule = "Jul 31, 2026, Aug 28, 2026, Sep 4, 2026";
    expect(parseTermDueDate(schedule, 0)?.getDate()).toBe(31);
    expect(parseTermDueDate(schedule, 2)?.getMonth()).toBe(8);
    expect(parseTermDueDate(schedule, 2)?.getDate()).toBe(4);
    expect(parseTermDueDate("Sep 4, 2026", 0)?.getDate()).toBe(4);
    expect(parseTermDueDate("", 0)).toBeNull();
  });

  it("isPastGrace starts charging exactly graceDays after the due date", () => {
    const due = new Date(2026, 9, 2, 0, 0, 0);
    expect(isPastGrace(due, 2, new Date(2026, 9, 3, 23, 59))).toBe(false);
    expect(isPastGrace(due, 2, new Date(2026, 9, 4, 0, 0))).toBe(true);
  });
});
