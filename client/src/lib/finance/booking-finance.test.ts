import { describe, it, expect } from "vitest";
import {
  extractBookingEvents,
  extractAllEvents,
  sumEvents,
  monthlyNetRevenue,
  getCancellationDate,
  isCancelledBooking,
} from "./booking-finance";

const TODAY = new Date(2026, 8, 8); // 8 Sep 2026 (local)

const base = {
  id: "b1",
  bookingCode: "SB-1",
  tourPackageName: "Test Tour",
  reservationDate: new Date(2026, 5, 10), // 10 Jun
  reservationFee: 200,
};

describe("booking-finance", () => {
  it("dates gross revenue by when cash arrived, not by reservation date", () => {
    const events = extractBookingEvents(
      {
        ...base,
        p1DueDate: new Date(2026, 6, 1),
        p1Amount: 500,
        p1DatePaid: new Date(2026, 7, 15), // paid late, in Aug
      },
      TODAY
    );
    const gross = events.filter((e) => e.grossRevenue > 0);
    expect(gross.map((e) => [e.date, e.grossRevenue])).toEqual([
      ["2026-06-10", 200],
      ["2026-08-15", 500],
    ]);
    // Paid late → no overdue, no expected
    expect(sumEvents(events).overdueUnpaid).toBe(0);
    expect(sumEvents(events).expectedRevenue).toBe(0);
  });

  it("splits unpaid instalments into expected (future) and overdue (past)", () => {
    const events = extractBookingEvents(
      {
        ...base,
        p1DueDate: new Date(2026, 7, 28), // overdue since 29 Aug
        p1Amount: 300,
        p2DueDate: new Date(2026, 9, 1), // future
        p2Amount: 400,
      },
      TODAY
    );
    const t = sumEvents(events);
    expect(t.overdueUnpaid).toBe(300);
    expect(t.expectedRevenue).toBe(400);
    expect(t.outstandingBalance).toBe(700);
    expect(t.grossRevenue).toBe(200);
    expect(t.netRevenue).toBe(200);
    expect(events.find((e) => e.eventType === "px_overdue")?.date).toBe(
      "2026-08-29"
    );
  });

  it("keeps cash from cancelled bookings in gross, subtracts refunds, and owes nothing further", () => {
    const events = extractBookingEvents(
      {
        ...base,
        bookingStatus: "Cancelled",
        cancellationRequestDate: new Date(2026, 7, 20),
        refundableAmount: 150,
        p1DueDate: new Date(2026, 6, 1),
        p1Amount: 500, // never paid, would be overdue on an active booking
      },
      TODAY
    );
    const t = sumEvents(events);
    expect(t.grossRevenue).toBe(200);
    expect(t.refunded).toBe(150);
    expect(t.netRevenue).toBe(50);
    expect(t.overdueUnpaid).toBe(0);
    expect(t.expectedRevenue).toBe(0);
    expect(t.cancelledBookings).toBe(1);
  });

  it("falls back to updatedAt for cancelled bookings without a request date", () => {
    const b = {
      ...base,
      bookingStatus: "Cancelled",
      updatedAt: new Date(2026, 3, 24),
    };
    expect(isCancelledBooking(b)).toBe(true);
    expect(getCancellationDate(b)?.getMonth()).toBe(3);
    expect(sumEvents(extractBookingEvents(b, TODAY)).cancelledBookings).toBe(1);
    expect(getCancellationDate({ ...base, bookingStatus: "Booking Confirmed" })).toBeNull();
  });

  it("sums only events inside an inclusive range", () => {
    const events = extractBookingEvents(base, TODAY);
    expect(sumEvents(events, "2026-06-10", "2026-06-10").grossRevenue).toBe(200);
    expect(sumEvents(events, "2026-06-11", "2026-12-31").grossRevenue).toBe(0);
  });

  it("includes the last day of each month in monthly buckets", () => {
    const events = extractAllEvents(
      [
        { ...base, id: "a", reservationDate: new Date(2026, 6, 31, 18, 0) }, // 31 Jul evening
        { ...base, id: "b", reservationDate: new Date(2026, 7, 1, 0, 0) }, // 1 Aug
      ],
      TODAY
    );
    const months = monthlyNetRevenue(events, 6, TODAY);
    expect(months.map((m) => m.label)).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(months[3].totals.netRevenue).toBe(200); // Jul
    expect(months[4].totals.netRevenue).toBe(200); // Aug
  });

  it("handles Firestore-style {seconds} timestamps and serialised strings", () => {
    const events = extractBookingEvents(
      {
        ...base,
        reservationDate: { seconds: Math.floor(new Date(2026, 5, 10, 12).getTime() / 1000) },
        p1DueDate: "2026-07-01T00:00:00",
        p1Amount: "500",
        p1DatePaid: "2026-07-02T00:00:00",
      },
      TODAY
    );
    expect(sumEvents(events).grossRevenue).toBe(700);
  });
});
