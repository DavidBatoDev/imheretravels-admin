import { describe, expect, it } from "vitest";

import {
  getEligible2ndOfMonths,
  getEligibleInstallmentDates,
  getPaymentCondition,
  getDaysBetweenDates,
} from "./booking-calculations";
import {
  MIN_INSTALLMENT_GAP_DAYS,
  computeEligibleInstallmentDatesLocal,
  lastFridayOnOrBefore,
} from "./installment-schedule";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));
const isoLocal = (dates: Date[]) =>
  dates.map(
    (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`,
  );

const DAY = 24 * 60 * 60 * 1000;

describe("lastFridayOnOrBefore", () => {
  it("returns the date itself when it is already a Friday", () => {
    // Fri 23 Oct 2026
    const friday = utc(2026, 10, 23);
    expect(lastFridayOnOrBefore(friday.getTime()).toISOString()).toBe(
      friday.toISOString(),
    );
  });

  it("walks back to the previous Friday otherwise", () => {
    // Tue 27 Oct 2026 -> Fri 23 Oct 2026
    expect(iso([lastFridayOnOrBefore(utc(2026, 10, 27).getTime())])).toEqual([
      "2026-10-23",
    ]);
    // Thu 1 Oct 2026 -> Fri 25 Sep 2026
    expect(iso([lastFridayOnOrBefore(utc(2026, 10, 1).getTime())])).toEqual([
      "2026-09-25",
    ]);
  });
});

describe("snap-back: the Durkee case (SB-BZT-B-20261227-ED003)", () => {
  // Brazil's Treasures, tour 27 Dec 2026, reserved 17 Aug 2026.
  // Cutoff = 27 Oct 2026. October's last Friday is the 30th — 3 days late.
  // Snap-back falls back to Fri 23 Oct 2026, unlocking P3.
  const res = utc(2026, 8, 17);
  const tour = utc(2026, 12, 27);

  it("offers three instalments instead of two", () => {
    expect(iso(getEligibleInstallmentDates(res, tour))).toEqual([
      "2026-08-28",
      "2026-09-25",
      "2026-10-23",
    ]);
  });

  it("maps to Standard Booking, P3", () => {
    const eligible = getEligible2ndOfMonths(res, tour);
    expect(eligible).toBe(3);
    expect(
      getPaymentCondition(tour, eligible, getDaysBetweenDates(res, tour)),
    ).toBe("Standard Booking, P3");
  });

  it("does not move the instalments that already existed", () => {
    // P1 and P2 must be byte-identical to the pre-snap-back schedule.
    const dates = getEligibleInstallmentDates(res, tour);
    expect(iso(dates.slice(0, 2))).toEqual(["2026-08-28", "2026-09-25"]);
  });

  it("keeps the final instalment on or before the deadline", () => {
    const dates = getEligibleInstallmentDates(res, tour);
    const cutoff = utc(2026, 10, 27); // tour - 2 calendar months
    const final = dates[dates.length - 1];
    expect(final.getTime()).toBeLessThanOrEqual(cutoff.getTime());
    expect((tour.getTime() - final.getTime()) / DAY).toBe(65);
  });
});

describe("snap-back guards", () => {
  it("does not fire when the month's last Friday already meets the cutoff", () => {
    // Tour 31 Dec 2026 -> cutoff 31 Oct 2026; Oct's last Friday (30th) qualifies,
    // so there is nothing to snap back to and no duplicate is appended.
    const dates = getEligibleInstallmentDates(utc(2026, 8, 17), utc(2026, 12, 31));
    expect(iso(dates)).toEqual(["2026-08-28", "2026-09-25", "2026-10-30"]);
    expect(new Set(iso(dates)).size).toBe(dates.length);
  });

  it("never produces a gap shorter than the floor", () => {
    // Sweep a year of reservation dates x lead times and assert the invariant.
    let sawSnapBack = false;
    for (let r = 0; r < 365; r += 7) {
      const res = new Date(utc(2026, 6, 1).getTime() + r * DAY);
      for (let lead = 3; lead <= 400; lead++) {
        const dates = getEligibleInstallmentDates(
          res,
          new Date(res.getTime() + lead * DAY),
        );
        for (let i = 1; i < dates.length; i++) {
          const gap = (dates[i].getTime() - dates[i - 1].getTime()) / DAY;
          expect(gap).toBeGreaterThanOrEqual(MIN_INSTALLMENT_GAP_DAYS);
          if (gap < 28) sawSnapBack = true;
        }
      }
    }
    expect(sawSnapBack).toBe(true);
  });

  it("never schedules an instalment after the deadline", () => {
    for (let r = 0; r < 365; r += 11) {
      const res = new Date(utc(2026, 6, 1).getTime() + r * DAY);
      for (let lead = 3; lead <= 400; lead += 3) {
        const tour = new Date(res.getTime() + lead * DAY);
        const cutoff = utc(
          tour.getUTCFullYear(),
          tour.getUTCMonth() - 1, // getUTCMonth() is 0-based; utc() expects 1-based
          tour.getUTCDate(),
        );
        for (const d of getEligibleInstallmentDates(res, tour)) {
          expect(d.getTime()).toBeLessThanOrEqual(cutoff.getTime());
        }
      }
    }
  });

  it("caps at four terms", () => {
    // A long lead time already yields P4; snap-back must not add a fifth.
    const dates = getEligibleInstallmentDates(utc(2026, 6, 1), utc(2027, 6, 1));
    expect(dates.length).toBeGreaterThanOrEqual(4);
    const eligible = getEligible2ndOfMonths(utc(2026, 6, 1), utc(2027, 6, 1));
    expect(
      getPaymentCondition(
        utc(2027, 6, 1),
        eligible,
        getDaysBetweenDates(utc(2026, 6, 1), utc(2027, 6, 1)),
      ),
    ).toBe("Standard Booking, P4");
  });
});

describe("policy boundaries are untouched", () => {
  it("leaves legacy bookings (reserved before 1 Jun 2026) unchanged", () => {
    // patch-notes Scenario A: res 15 Jan 2026, tour 4 Aug 2026 -> P4 ending 31 Jul 2026.
    const res = utc(2026, 1, 15);
    const tour = utc(2026, 8, 4);
    const dates = getEligibleInstallmentDates(res, tour);
    expect(iso(dates)[0]).toBe("2026-01-30");
    expect(iso(dates)[dates.length - 1]).toBe("2026-07-31");
    expect(
      getPaymentCondition(
        tour,
        getEligible2ndOfMonths(res, tour),
        getDaysBetweenDates(res, tour),
      ),
    ).toBe("Standard Booking, P4");
  });

  it("keeps a last-minute booking last-minute (patch-notes Scenario C)", () => {
    // res 2 Jun 2026, tour 5 Aug 2026 -> cutoff 5 Jun; no eligible Friday.
    const res = utc(2026, 6, 2);
    const tour = utc(2026, 8, 5);
    expect(getEligibleInstallmentDates(res, tour)).toEqual([]);
    expect(
      getPaymentCondition(
        tour,
        getEligible2ndOfMonths(res, tour),
        getDaysBetweenDates(res, tour),
      ),
    ).toBe("Last Minute Booking");
  });

  it("keeps an imminent booking last-minute (patch-notes Scenario D)", () => {
    const res = utc(2026, 8, 1);
    const tour = utc(2026, 8, 5);
    expect(getEligibleInstallmentDates(res, tour)).toEqual([]);
    expect(
      getPaymentCondition(
        tour,
        getEligible2ndOfMonths(res, tour),
        getDaysBetweenDates(res, tour),
      ),
    ).toBe("Last Minute Booking");
  });
});

describe("UTC and local call paths agree", () => {
  it("returns the same calendar dates for both entry points", () => {
    for (let r = 0; r < 365; r += 13) {
      const resUTC = new Date(utc(2026, 6, 1).getTime() + r * DAY);
      const resLocal = local(
        resUTC.getUTCFullYear(),
        resUTC.getUTCMonth() + 1,
        resUTC.getUTCDate(),
      );
      for (let lead = 3; lead <= 400; lead += 17) {
        const tourUTC = new Date(resUTC.getTime() + lead * DAY);
        const tourLocal = local(
          tourUTC.getUTCFullYear(),
          tourUTC.getUTCMonth() + 1,
          tourUTC.getUTCDate(),
        );
        expect(
          isoLocal(computeEligibleInstallmentDatesLocal(resLocal, tourLocal)),
        ).toEqual(iso(getEligibleInstallmentDates(resUTC, tourUTC)));
      }
    }
  });
});
