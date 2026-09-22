import { describe, it, expect } from "vitest";
import { extractBookingEvents, sumEvents } from "./booking-finance";
import { calculateInstallmentAmounts } from "@/lib/booking-calculations";
import { allocateInstallmentAmountsWithPaidLocks } from "@/app/functions/columns/payment-calculation-helpers";

const TODAY = new Date(2026, 8, 22);

// A £1,949 tour, £250 reservation, P4 plan → £1,699 over 4 terms of £424.75
const base = {
  id: "b",
  bookingCode: "SB-X",
  tourPackageName: "T",
  originalTourCost: 1949,
  reservationFee: 250,
  reservationDate: new Date(2026, 1, 1),
  paymentPlan: "P4",
  p1DueDate: "Feb 27, 2026", p2DueDate: "Mar 27, 2026",
  p3DueDate: "Apr 24, 2026", p4DueDate: "May 29, 2026",
};

describe("manual credit — single allocation implementation", () => {
  it("booking-calculations delegates to the shared helper (same numbers)", () => {
    const viaLib = calculateInstallmentAmounts(
      "P4", 1949, null, 250, true, 424.75, "P3",
      "d", "d", "d", "d",
    );
    const viaHelper = allocateInstallmentAmountsWithPaidLocks(1699, 4, "P3", 424.75);
    expect([viaLib.p1Amount, viaLib.p2Amount, viaLib.p3Amount, viaLib.p4Amount]).toEqual(viaHelper);
  });

  it("a P3 overpayment of £424.75 reduces the total owed by exactly £424.75", () => {
    const r = calculateInstallmentAmounts("P4", 1949, null, 250, true, 424.75, "P3", "d", "d", "d", "d");
    const total = [r.p1Amount, r.p2Amount, r.p3Amount, r.p4Amount].reduce((s: number, x) => s + Number(x), 0);
    expect(total).toBeCloseTo(1699 - 424.75, 2);
    expect(r.p3Amount).toBe(0); // the credited term itself is what drops
    expect(r.p1Amount).toBe(424.75);
    expect(r.p4Amount).toBe(424.75);
  });

  it("a reservation overpayment reduces every term evenly", () => {
    const r = calculateInstallmentAmounts("P4", 1949, null, 250, true, 100, "Reservation", "d", "d", "d", "d");
    expect(r.p1Amount).toBe(399.75);
    expect(r.p4Amount).toBe(399.75);
  });

  it("keeps already-paid terms locked and pushes the reduction onto open terms", () => {
    const r = calculateInstallmentAmounts(
      "P4", 1949, null, 250, true, 260, "P1",
      "d", "d", "d", "d",
      260, 230, 230, 230,                 // current amounts (old broken schedule)
      new Date(), new Date(), new Date(), // P1–P3 paid
      undefined,                          // P4 open
    );
    expect(r.p1Amount).toBe(260);
    expect(r.p2Amount).toBe(230);
    expect(r.p3Amount).toBe(230);
    // locked 720; correct total 1439 → P4 = 719? No: total owed = 1699−260 = 1439, minus locked 720 = 719
    expect(r.p4Amount).toBe(719);
  });
});

describe("manual credit — finance module counts it as cash once applied", () => {
  it("ignores a credit whose schedule was never reduced (pre-fix data, avoids double count)", () => {
    // Broken schedule: still sums to the full £1,699 with credit inside it
    const events = extractBookingEvents(
      { ...base, manualCredit: 424.75, creditFrom: "P3",
        p1Amount: 424.75, p2Amount: 212.37, p3Amount: 530.94, p4Amount: 530.94,
        p1DatePaid: new Date(2026, 2, 26), p2DatePaid: new Date(2026, 2, 23), p3DatePaid: new Date(2026, 3, 25) },
      TODAY,
    );
    expect(events.some((e) => e.eventType === "manual_credit")).toBe(false);
    expect(sumEvents(events).grossRevenue).toBeCloseTo(250 + 424.75 + 212.37 + 530.94, 2);
  });

  it("counts the credit, dated on the credited term's paid date, once the schedule reflects it", () => {
    const events = extractBookingEvents(
      { ...base, manualCredit: 424.75, creditFrom: "P3",
        p1Amount: 424.75, p2Amount: 424.75, p3Amount: 0, p4Amount: 424.75, // reduced by 424.75
        p1DatePaid: new Date(2026, 2, 26), p2DatePaid: new Date(2026, 2, 23), p3DatePaid: new Date(2026, 3, 25) },
      TODAY,
    );
    const credit = events.find((e) => e.eventType === "manual_credit");
    expect(credit?.date).toBe("2026-04-25");
    expect(credit?.grossRevenue).toBe(424.75);
    // cash received = 250 + 424.75 + 424.75 + (0 term + 424.75 overpay)
    expect(sumEvents(events).grossRevenue).toBeCloseTo(250 + 424.75 + 424.75 + 424.75, 2);
  });

  it("dates a reservation overpayment on the reservation date", () => {
    const events = extractBookingEvents(
      { ...base, paymentPlan: "P1", manualCredit: 100, creditFrom: "Reservation",
        p1Amount: 1599, p1DatePaid: new Date(2026, 3, 9) },
      TODAY,
    );
    const credit = events.find((e) => e.eventType === "manual_credit");
    expect(credit?.date).toBe("2026-02-01");
    expect(sumEvents(events).grossRevenue).toBe(1949);
  });

  it("does not count a credit whose source term has no paid date (cash not evidenced)", () => {
    const events = extractBookingEvents(
      { ...base, manualCredit: 424.75, creditFrom: "P3",
        p1Amount: 424.75, p2Amount: 424.75, p3Amount: 0, p4Amount: 424.75 }, // reduced, but P3 unpaid
      TODAY,
    );
    expect(events.some((e) => e.eventType === "manual_credit")).toBe(false);
  });
});
