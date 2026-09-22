import { describe, it, expect } from "vitest";
import { allocateFromCashReceived } from "@/app/functions/columns/payment-calculation-helpers";
import { extractBookingEvents, sumEvents, usesPerSlotCash } from "./booking-finance";

const D = new Date(2026, 0, 1);
const TODAY = new Date(2026, 8, 22);

describe("allocateFromCashReceived — per-slot cash model", () => {
  it("with nothing paid it is a plain even split", () => {
    expect(allocateFromCashReceived(1699, 4)).toEqual({ amounts: [424.75, 424.75, 424.75, 424.75], cashReceived: 0, overpaid: 0 });
  });

  it("legacy booking (no *AmountPaid) behaves as paid === asked", () => {
    const r = allocateFromCashReceived(1699, 4, [424.75, 424.75, "", ""], [], [D, D, null, null]);
    expect(r.amounts).toEqual([424.75, 424.75, 424.75, 424.75]);
    expect(r.cashReceived).toBe(849.5);
  });

  it("overpaying P1 shrinks the later terms by exactly the excess", () => {
    // Asked 424.75, paid 500 → +75.25 spread over P2–P4
    const r = allocateFromCashReceived(1699, 4, [424.75], [500], [D]);
    expect(r.amounts[0]).toBe(424.75); // history kept
    expect(r.amounts.slice(1).reduce((s, x) => s + x, 0)).toBeCloseTo(1699 - 500, 2);
    expect(r.overpaid).toBe(0);
  });

  it("an overpayment bigger than one term's share flows on, nothing is clamped away", () => {
    // Sam-style: asked 237.5 on P1, paid 500 (excess 262.5 > one share)
    const r = allocateFromCashReceived(950, 4, [237.5], [500], [D]);
    expect(r.amounts.slice(1).reduce((s, x) => s + x, 0)).toBeCloseTo(450, 2);
    expect(r.overpaid).toBe(0);
  });

  it("partial payment leaves the shortfall on later terms", () => {
    const r = allocateFromCashReceived(950, 4, [237.5], [200], [D]);
    expect(r.amounts.slice(1).reduce((s, x) => s + x, 0)).toBeCloseTo(750, 2);
  });

  it("reservation overpayment is handled by the caller passing a lower totalDue", () => {
    // £1,949 tour, £300 paid on a £250 reservation → totalDue 1,649
    const r = allocateFromCashReceived(1949 - 300, 4);
    expect(r.amounts).toEqual([412.25, 412.25, 412.25, 412.25]);
  });

  it("overpaying the final term is reported, not absorbed", () => {
    const r = allocateFromCashReceived(950, 2, [475, 475], [475, 600], [D, D]);
    expect(r.amounts).toEqual([475, 475]);
    expect(r.cashReceived).toBe(1075);
    expect(r.overpaid).toBe(125);
  });

  it("overpaying beyond everything owed zeroes the open terms and reports the excess", () => {
    const r = allocateFromCashReceived(950, 4, [237.5], [1000], [D]);
    expect(r.amounts.slice(1)).toEqual([0, 0, 0]);
    expect(r.overpaid).toBe(50);
  });

  it("Sam Hernandez: P1 260, P2 230, P3 310 paid on a £950 schedule → P4 owes 150", () => {
    const r = allocateFromCashReceived(950, 4, [260, 230, 230, 230], [260, 230, 310, undefined], [D, D, D, null]);
    expect(r.amounts[3]).toBe(150);
    expect(r.cashReceived).toBe(800);
  });
});

describe("finance module — per-slot cash", () => {
  const base = {
    id: "b", bookingCode: "SB", tourPackageName: "T",
    originalTourCost: 1100, reservationFee: 150, reservationDate: new Date(2025, 6, 1),
    paymentPlan: "P4",
    p1DueDate: "Jul 25, 2025", p2DueDate: "Aug 29, 2025", p3DueDate: "Sep 26, 2025", p4DueDate: "Oct 31, 2025",
    p1Amount: 260, p2Amount: 230, p3Amount: 230, p4Amount: 230,
    p1DatePaid: new Date(2025, 10, 14), p2DatePaid: new Date(2025, 11, 16), p3DatePaid: new Date(2026, 0, 22),
  };

  it("gross uses what arrived, not what was asked, when *AmountPaid is present", () => {
    const events = extractBookingEvents({ ...base, p3AmountPaid: 310 }, TODAY);
    expect(usesPerSlotCash({ ...base, p3AmountPaid: 310 })).toBe(true);
    expect(sumEvents(events).grossRevenue).toBe(150 + 260 + 230 + 310);
  });

  it("reservation overpayment counts the cash received", () => {
    const events = extractBookingEvents({ ...base, reservationAmountPaid: 200 }, TODAY);
    expect(events.find((e) => e.eventType === "reservation")?.grossRevenue).toBe(200);
  });

  it("legacy manual credit is ignored once per-slot fields exist (no double count)", () => {
    const events = extractBookingEvents(
      { ...base, p1AmountPaid: 260, manualCredit: 80, creditFrom: "P3", p3Amount: 150, p4Amount: 230 },
      TODAY,
    );
    expect(events.some((e) => e.eventType === "manual_credit")).toBe(false);
  });

  it("legacy booking without per-slot fields is unchanged", () => {
    expect(usesPerSlotCash(base)).toBe(false);
    expect(sumEvents(extractBookingEvents(base, TODAY)).grossRevenue).toBe(150 + 260 + 230 + 230);
  });
});
