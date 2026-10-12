import { describe, it, expect, vi } from "vitest";

// The service imports the shared bookings store, which imports Firebase.
vi.mock("@/lib/firebase", () => {
  const fake = { __fake: true };
  return {
    app: fake, auth: fake, db: fake, storage: fake,
    functions: fake, functionsUsCentral: fake,
  };
});

import { buildReport, computeDataBounds } from "./financial-reports-service";
import { extractAllEvents, sumEvents } from "@/lib/finance/booking-finance";

const bookings = [
  {
    id: "b1",
    tourPackageName: "Tour A",
    reservationDate: new Date(2026, 1, 10), // 10 Feb
    tourDate: new Date(2026, 5, 1),
    reservationFee: 200,
    p1DueDate: new Date(2026, 2, 1),
    p1Amount: 500,
    p1DatePaid: new Date(2026, 2, 3),
  },
  {
    id: "b2",
    tourPackageName: "Tour B",
    reservationDate: new Date(2025, 11, 20), // 20 Dec 2025 (earliest)
    tourDate: new Date(2026, 8, 1),
    reservationFee: 150,
    fullPaymentDueDate: new Date(2027, 0, 15), // latest due date
    fullPaymentAmount: 900,
  },
];

describe("computeDataBounds", () => {
  it("spans earliest reservation to latest payment due date", () => {
    expect(computeDataBounds(bookings)).toEqual({
      startDate: "2025-12-20",
      endDate: "2027-01-15",
    });
  });

  it("falls back to a default window when there is no data", () => {
    const { startDate, endDate } = computeDataBounds([]);
    const year = new Date().getFullYear();
    expect(startDate).toBe(`${year - 3}-01-01`);
    expect(endDate).toBe(`${year + 2}-12-31`);
  });
});

describe("buildReport", () => {
  it("builds the report from in-memory bookings without fetching", () => {
    const range = {
      preset: "all_time" as const,
      ...computeDataBounds(bookings),
    };
    const report = buildReport(bookings, range);

    const expected = sumEvents(extractAllEvents(bookings as never));
    expect(report.metrics.totalGrossRevenue).toBe(expected.grossRevenue);
    expect(report.bookingSummaries).toHaveLength(2);
    expect(report.dateRange).toEqual(range);
    // Events are globally sorted by date
    const dates = report.allEvents.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("keeps only bookings with an event inside the range", () => {
    const report = buildReport(bookings, {
      preset: "custom" as never,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(report.bookingSummaries.map((s) => s.bookingId)).toEqual([
      "b1",
    ]);
  });
});
