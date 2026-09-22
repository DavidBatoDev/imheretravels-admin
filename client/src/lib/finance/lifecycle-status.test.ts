import { describe, it, expect } from "vitest";
import { deriveLifecycleStatus } from "./booking-finance";

const TODAY = new Date(2026, 8, 22); // 22 Sep 2026
const PAST = new Date(2026, 3, 22); // tour ran in April
const PAST_RETURN = new Date(2026, 4, 2);
const FUTURE = new Date(2026, 10, 15); // tour in November
const FUTURE_RETURN = new Date(2026, 10, 26);
const D = new Date(2026, 0, 1);

const base = {
  originalTourCost: 1100, reservationFee: 150, reservationDate: D, paymentPlan: "P4",
  p1Amount: 237.5, p2Amount: 237.5, p3Amount: 237.5, p4Amount: 237.5,
};
const allPaid = { p1DatePaid: D, p2DatePaid: D, p3DatePaid: D, p4DatePaid: D };

describe("deriveLifecycleStatus", () => {
  it("Cancelled wins whenever a reason is present, regardless of dates or balance", () => {
    expect(deriveLifecycleStatus({ ...base, ...allPaid, tourDate: PAST, returnDate: PAST_RETURN, reasonForCancellation: "Guest personal reason" }, TODAY)).toBe("Cancelled");
    expect(deriveLifecycleStatus({ ...base, tourDate: FUTURE, bookingStatus: "Cancelled" }, TODAY)).toBe("Cancelled");
  });

  it("Completed: tour ended and nothing owed", () => {
    expect(deriveLifecycleStatus({ ...base, ...allPaid, tourDate: PAST, returnDate: PAST_RETURN }, TODAY)).toBe("Completed");
  });

  it("Confirmed: nothing owed, tour still ahead", () => {
    expect(deriveLifecycleStatus({ ...base, ...allPaid, tourDate: FUTURE, returnDate: FUTURE_RETURN }, TODAY)).toBe("Confirmed");
  });

  it("a tour that has started but not ENDED with a balance owing is still Pending, not Elapsed", () => {
    const started = new Date(2026, 8, 20), ends = new Date(2026, 8, 30);
    expect(deriveLifecycleStatus({ ...base, p1DatePaid: D, tourDate: started, returnDate: ends }, TODAY)).toBe("Pending");
  });

  it("Elapsed: tour ended with a balance owing (Sam Hernandez today)", () => {
    const sam = { ...base, p1Amount: 260, p2Amount: 230, p3Amount: 310, p4Amount: 150,
      p1DatePaid: D, p2DatePaid: D, p3DatePaid: D, tourDate: PAST, returnDate: PAST_RETURN };
    expect(deriveLifecycleStatus(sam, TODAY)).toBe("Elapsed");
  });

  it("Pending: balance owing, tour still ahead", () => {
    expect(deriveLifecycleStatus({ ...base, p1DatePaid: D, tourDate: FUTURE, returnDate: FUTURE_RETURN }, TODAY)).toBe("Pending");
  });

  it("a tour that has started but not ended is still Confirmed when paid (not yet Completed)", () => {
    const started = new Date(2026, 8, 20), ends = new Date(2026, 8, 30);
    expect(deriveLifecycleStatus({ ...base, ...allPaid, tourDate: started, returnDate: ends }, TODAY)).toBe("Confirmed");
  });

  it("uses per-slot cash when present (overpaid P3 covers P4)", () => {
    const b = { ...base, p1AmountPaid: 237.5, p2AmountPaid: 237.5, p3AmountPaid: 475, // paid P3 + P4 together
      p1DatePaid: D, p2DatePaid: D, p3DatePaid: D, tourDate: PAST, returnDate: PAST_RETURN };
    expect(deriveLifecycleStatus(b, TODAY)).toBe("Completed");
  });

  it("late fees count as owed", () => {
    expect(deriveLifecycleStatus({ ...base, ...allPaid, totalLateFees: 7.49, tourDate: PAST, returnDate: PAST_RETURN }, TODAY)).toBe("Elapsed");
  });

  it("falls back to tour date when return date is missing", () => {
    expect(deriveLifecycleStatus({ ...base, ...allPaid, tourDate: PAST }, TODAY)).toBe("Completed");
  });

  it("a stored 'Elapsed' status does not override the balance: paid in full after the tour is Completed", () => {
    expect(deriveLifecycleStatus({ ...base, ...allPaid, bookingStatus: "Elapsed", tourDate: PAST, returnDate: PAST_RETURN }, TODAY)).toBe("Completed");
  });

  it("ignores the stale bookingStatus text: a row saying 'Installment 3/4' with a past tour is Elapsed, not Pending", () => {
    expect(deriveLifecycleStatus({ ...base, p1DatePaid: D, p2DatePaid: D, p3DatePaid: D, bookingStatus: "Installment 3/4 — last paid Jan 22, 2026", tourDate: PAST, returnDate: PAST_RETURN }, TODAY)).toBe("Elapsed");
  });
});
