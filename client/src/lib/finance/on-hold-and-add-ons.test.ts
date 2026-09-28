import { describe, it, expect } from "vitest";
import { addOnTotals, formatAddOnsSummary, normalizeAddOns, parseAddOnDate } from "./add-ons";
import { deriveLifecycleStatus, extractBookingEvents, sumEvents } from "./booking-finance";
import bookingStatusFunction from "@/app/functions/columns/payment-setting/booking-status";
import getRemainingBalanceFunction from "@/app/functions/columns/payment-setting/remaining-balance";
import getTotalPaidAmountFunction from "@/app/functions/columns/payment-setting/paid";

const TODAY = new Date(2026, 8, 28);
const D = new Date(2026, 0, 10);
const PAST = new Date(2026, 6, 18);
const PAST_RETURN = new Date(2026, 6, 27);
const FUTURE = new Date(2026, 11, 1);

describe("add-ons helpers", () => {
  it("normalises junk and keeps real rows", () => {
    expect(normalizeAddOns(undefined)).toEqual([]);
    expect(normalizeAddOns("")).toEqual([]);
    const list = normalizeAddOns([
      { item: "Private room", amount: "300", datePaid: "2025-11-21", notes: "paid by relative" },
      { item: "", amount: 0 },
      null,
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ item: "Private room", amount: 300, datePaid: "2025-11-21" });
  });

  it("parses YYYY-MM-DD as a local date (no timezone day-shift)", () => {
    const d = parseAddOnDate("2025-11-21")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2025, 10, 21]);
  });

  it("totals paid and unpaid", () => {
    expect(addOnTotals([
      { id: "a", item: "Room", amount: 300, datePaid: "2025-11-21" },
      { id: "b", item: "Excursion", amount: 45.5 },
    ])).toEqual({ count: 2, total: 345.5, paid: 300, unpaid: 45.5 });
    expect(formatAddOnsSummary([{ id: "a", item: "Room", amount: 300, datePaid: "2025-11-21" }])).toContain("paid");
  });
});

describe("finance module — add-ons", () => {
  const base = {
    id: "x", bookingCode: "SB", tourPackageName: "T", originalTourCost: 1100, reservationFee: 150,
    reservationDate: new Date(2025, 10, 2), paymentPlan: "P2", tourDate: PAST, returnDate: PAST_RETURN,
    p1DueDate: "Nov 28, 2025", p1Amount: 475, p1DatePaid: D, p2DueDate: "Dec 26, 2025", p2Amount: 475, p2DatePaid: D,
  };

  it("a paid add-on is gross revenue dated the day it was paid", () => {
    const events = extractBookingEvents({ ...base, addOns: [{ id: "a", item: "Private room", amount: 300, datePaid: "2025-11-21" }] }, TODAY);
    const ev = events.find((e) => e.eventType === "add_on_paid")!;
    expect(ev.date).toBe("2025-11-21");
    expect(ev.history).toBe("Add-on: Private room");
    expect(sumEvents(events).grossRevenue).toBe(150 + 475 + 475 + 300);
  });

  it("an unpaid add-on is Expected before the tour and Overdue after it", () => {
    const before = extractBookingEvents({ ...base, tourDate: FUTURE, addOns: [{ id: "a", item: "Room", amount: 300 }] }, TODAY);
    expect(sumEvents(before).expectedRevenue).toBe(300);
    const after = extractBookingEvents({ ...base, addOns: [{ id: "a", item: "Room", amount: 300 }] }, TODAY);
    expect(sumEvents(after).overdueUnpaid).toBe(300);
  });

  it("nothing is owed for add-ons on a cancelled booking", () => {
    const events = extractBookingEvents({ ...base, bookingStatus: "Cancelled", addOns: [{ id: "a", item: "Room", amount: 300 }] }, TODAY);
    expect(sumEvents(events).outstandingBalance).toBe(0);
  });

  it("lifecycle: paid add-on keeps a fully-paid booking Completed; unpaid one makes it Elapsed", () => {
    expect(deriveLifecycleStatus({ ...base, addOns: [{ id: "a", item: "Room", amount: 300, datePaid: "2025-11-21" }] }, TODAY)).toBe("Completed");
    expect(deriveLifecycleStatus({ ...base, addOns: [{ id: "a", item: "Room", amount: 300 }] }, TODAY)).toBe("Elapsed");
  });
});

describe("finance module — cash typed into a slot with no asked amount (Grace/Claire pattern)", () => {
  it("counts a dated Full Payment Amount Paid even on a P1 booking with no due date or asked amount", () => {
    const events = extractBookingEvents({
      id: "g", tourPackageName: "India Holi", originalTourCost: 999, reservationFee: 150, reservationAmountPaid: 150,
      reservationDate: new Date(2026, 0, 6), paymentPlan: "P1", p1Amount: "", fullPaymentAmount: null,
      fullPaymentAmountPaid: 849, fullPaymentDatePaid: new Date(2026, 0, 8), tourDate: new Date(2026, 2, 1),
    }, TODAY);
    expect(sumEvents(events).grossRevenue).toBe(999);
    expect(sumEvents(events).outstandingBalance).toBe(0);
  });

  it("counts a dated P2 Amount Paid when P2's asked amount and due date are blank", () => {
    const events = extractBookingEvents({
      id: "m", tourPackageName: "T", originalTourCost: 1100, reservationFee: 150, reservationDate: D,
      paymentPlan: "P2", p1DueDate: "Nov 28, 2025", p1Amount: 550, p1DatePaid: D,
      p2Amount: "", p2DueDate: null, p2AmountPaid: 300, p2DatePaid: new Date(2025, 10, 25),
    }, TODAY);
    expect(sumEvents(events).grossRevenue).toBe(150 + 550 + 300);
  });
});

describe("On Hold", () => {
  const held = {
    id: "s", tourPackageName: "Tanzania", originalTourCost: 1949, reservationFee: 250, reservationAmountPaid: 250,
    reservationDate: new Date(2026, 1, 1), paymentPlan: "P4", tourDate: PAST, returnDate: PAST_RETURN,
    p1DueDate: "Feb 27, 2026", p1Amount: 424.75, p2DueDate: "Mar 27, 2026", p2Amount: 424.75,
    p3DueDate: "Apr 24, 2026", p3Amount: 424.75, p4DueDate: "May 29, 2026", p4Amount: 424.75,
    onHold: true, onHoldReason: "Moving to another date, TBC",
  };

  it("lifecycle is On Hold, not Elapsed, even though the tour date passed with a balance", () => {
    expect(deriveLifecycleStatus(held, TODAY)).toBe("On Hold");
    expect(deriveLifecycleStatus({ ...held, onHold: false }, TODAY)).toBe("Elapsed");
  });

  it("Cancelled still wins over On Hold", () => {
    expect(deriveLifecycleStatus({ ...held, reasonForCancellation: "Guest - Change of plans" }, TODAY)).toBe("Cancelled");
  });

  it("balance is excluded from Overdue and Expected; money already paid still counts", () => {
    const t = sumEvents(extractBookingEvents(held, TODAY));
    expect(t.overdueUnpaid).toBe(0);
    expect(t.expectedRevenue).toBe(0);
    expect(t.grossRevenue).toBe(250);
    const released = sumEvents(extractBookingEvents({ ...held, onHold: false }, TODAY));
    expect(released.overdueUnpaid).toBeCloseTo(1699, 2);
  });

  it("Booking Status column shows On Hold, and Cancelled beats it", () => {
    const args = [held.paymentPlan, 1699, undefined, undefined, undefined, undefined, undefined, PAST, PAST_RETURN] as const;
    expect(bookingStatusFunction("", ...args, true)).toBe("On Hold");
    expect(bookingStatusFunction("", ...args, false)).toBe("Elapsed");
    expect(bookingStatusFunction("Guest - Change of plans", ...args, true)).toBe("Cancelled");
  });
});

describe("column functions — add-ons", () => {
  // Mwanahalima-style: £1,100 tour fully paid in two terms, plus a £300 private room.
  const D1 = new Date(2025, 11, 1), D2 = new Date(2025, 11, 15);
  const room = [{ id: "a", item: "Private room", amount: 300, datePaid: "2025-11-21" }];

  it("Remaining Balance adds unpaid add-ons and is 0 when they are paid", () => {
    const rb = (addOns: unknown) =>
      getRemainingBalanceFunction("T", false, 0, 1100, 150, "", 0, "P2", undefined, 0,
        D1 as any, 475, D2 as any, 475, undefined, 0, undefined, 0, 0, 0, 0, 0,
        undefined, undefined, undefined, undefined, undefined, undefined, addOns);
    expect(rb(room)).toBe(0);
    expect(rb([{ id: "a", item: "Private room", amount: 300 }])).toBe(300);
  });

  it("P1-settled rule no longer hides an unpaid add-on", () => {
    expect(getRemainingBalanceFunction("T", false, 0, 1100, 150, "", 0, "P1", undefined, 0,
      D1 as any, 950, undefined, 0, undefined, 0, undefined, 0, 0, 0, 0, 0,
      undefined, undefined, undefined, undefined, undefined, undefined,
      [{ id: "a", item: "Room", amount: 300 }])).toBe(300);
  });

  it("Paid includes paid add-ons", () => {
    expect(getTotalPaidAmountFunction("T", 150, "", 0, undefined, 0, D1, 475, D2, 475, undefined, 0, undefined, 0,
      0, 0, 0, 0, undefined, undefined, undefined, undefined, undefined, undefined, room)).toBe(150 + 950 + 300);
  });
});
