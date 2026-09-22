/**
 * Financial Reports Service
 *
 * Fetches bookings and turns them into a FinancialReport. All money
 * definitions (gross, net, refunded, expected, overdue, cancelled) live in
 * @/lib/finance/booking-finance and are shared with the Dashboard.
 *
 * Data flow:
 *   getAllBookings() (API) → extractBookingEvents() → sumEvents(range) → report
 */

import { bookingService } from "./booking-service";
import {
  FinancialEvent,

  FinancialReport,
  FinancialReportMetrics,
  BookingFinancialSummary,
  RevenueTrendBucket,
  TourRevenueSummary,
  TrendGranularity,
  DateRangeFilter,
  DateRangePreset,

} from "@/types/financial-reports";

import {
  extractBookingEvents,
  isCancelledBooking,
  sumEvents,
  toDate,
  toISODate,
  dateInRange,
  type RawBooking,
} from "@/lib/finance/booking-finance";

// Re-exported so existing consumers keep working. The logic lives in
// @/lib/finance/booking-finance so Dashboard and Reports share one definition.
export { extractBookingEvents };

// ---------------------------------------------------------------------------
// Preset → concrete date range
// ---------------------------------------------------------------------------

export function resolveDateRangePreset(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): DateRangeFilter {
  const today = new Date();
  const todayStr = toISODate(today);

  const sub = (days: number) => toISODate(new Date(today.getTime() - days * 86400000));

  switch (preset) {
    case "all_time":
      return { preset, startDate: "2000-01-01", endDate: "2099-12-31" };

    case "today":
      return { preset, startDate: todayStr, endDate: todayStr };

    case "last_7_days":
      return { preset, startDate: sub(6), endDate: todayStr };

    case "last_30_days":
      return { preset, startDate: sub(29), endDate: todayStr };

    case "last_90_days":
      return { preset, startDate: sub(89), endDate: todayStr };

    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { preset, startDate: toISODate(start), endDate: todayStr };
    }

    case "last_month": {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastLastMonth = new Date(firstThisMonth.getTime() - 86400000);
      const firstLastMonth = new Date(
        lastLastMonth.getFullYear(),
        lastLastMonth.getMonth(),
        1
      );
      return {
        preset,
        startDate: toISODate(firstLastMonth),
        endDate: toISODate(lastLastMonth),
      };
    }

    case "last_12_months": {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      return { preset, startDate: toISODate(start), endDate: todayStr };
    }

    case "custom":
      return {
        preset,
        startDate: customStart ?? sub(29),
        endDate: customEnd ?? todayStr,
      };

    default:
      return { preset: "last_30_days", startDate: sub(29), endDate: todayStr };
  }
}

// ---------------------------------------------------------------------------
// Build per-booking summary
// ---------------------------------------------------------------------------

function buildBookingSummary(
  booking: RawBooking,
  events: FinancialEvent[]
): BookingFinancialSummary {
  let totalGross = 0;
  let totalExpected = 0;
  let totalOverdue = 0;
  let totalRefunded = 0;
  let isCancelled = isCancelledBooking(booking);

  for (const e of events) {
    totalGross += e.grossRevenue;
    totalExpected += e.expectedRevenue;
    totalOverdue += e.overdueUnpaidAmount;
    totalRefunded += e.refundedAmount; // negative
    if (e.eventType === "cancellation") isCancelled = true;
  }

  return {
    bookingId: (booking.bookingId as string) || (booking.id as string) || "",
    bookingCode: (booking.bookingCode as string) || "",
    tourName:
      (booking.tourPackageName as string) ||
      (booking.tourName as string) ||
      "Unknown Tour",
    bookingStatus: (booking.bookingStatus as string) || "Unknown",
    totalGrossRevenue: totalGross,
    totalExpectedRevenue: totalExpected,
    totalOverdueUnpaid: totalOverdue,
    totalRefunded, // negative sum
    totalNetRevenue: totalGross + totalRefunded,
    isCancelled,
    events,
  };
}

// ---------------------------------------------------------------------------
// Trend bucketing
// ---------------------------------------------------------------------------

function buildRevenueTrend(
  events: FinancialEvent[],
  startDate: string,
  endDate: string,
  granularity: TrendGranularity
): RevenueTrendBucket[] {
  const buckets = new Map<string, RevenueTrendBucket>();

  const getBucketKey = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (granularity === "daily") return dateStr;
    if (granularity === "weekly") {
      // ISO week start (Monday)
      const dow = d.getDay();
      const diff = (dow === 0 ? -6 : 1) - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      return toISODate(monday);
    }
    // monthly
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };

  const formatLabel = (key: string): string => {
    const d = new Date(key);
    if (granularity === "daily")
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    if (granularity === "weekly") {
      const end = new Date(d);
      end.setDate(d.getDate() + 6);
      return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    }
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  for (const event of events) {
    if (!dateInRange(event.date, startDate, endDate)) continue;
    const key = getBucketKey(event.date);

    if (!buckets.has(key)) {
      buckets.set(key, {
        label: formatLabel(key),
        date: key,
        grossRevenue: 0,
        expectedRevenue: 0,
        refundedAmount: 0,
        overdueUnpaid: 0,
      });
    }

    const b = buckets.get(key)!;
    b.grossRevenue += event.grossRevenue;
    b.expectedRevenue += event.expectedRevenue;
    b.refundedAmount += Math.abs(event.refundedAmount);
    b.overdueUnpaid += event.overdueUnpaidAmount;
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

// ---------------------------------------------------------------------------
// Choose trend granularity based on date range width
// ---------------------------------------------------------------------------

function chooseTrendGranularity(startDate: string, endDate: string): TrendGranularity {
  const days =
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
  if (days <= 31) return "daily";
  if (days <= 90) return "weekly";
  return "monthly";
}

// ---------------------------------------------------------------------------
// Aggregate metrics across all bookings/events
// ---------------------------------------------------------------------------

function aggregateMetrics(
  summaries: BookingFinancialSummary[],
  allEvents: FinancialEvent[],
  dateRange: DateRangeFilter
): FinancialReportMetrics {
  // One shared aggregation (same function the Dashboard uses)
  const totals = sumEvents(allEvents, dateRange.startDate, dateRange.endDate);
  const totalGross = totals.grossRevenue;
  const totalRefunded = totals.refunded;
  const totalOverdue = totals.overdueUnpaid;
  const totalExpected = totals.expectedRevenue;
  const cancelledCount = totals.cancelledBookings;

  // Revenue by tour
  const tourMap = new Map<string, TourRevenueSummary>();
  for (const summary of summaries) {
    const rangedSummaryEvents = summary.events.filter((e) =>
      dateInRange(e.date, dateRange.startDate, dateRange.endDate)
    );
    if (rangedSummaryEvents.length === 0) continue;

    const tourGross = rangedSummaryEvents.reduce((s, e) => s + e.grossRevenue, 0);
    const tourRefunded = Math.abs(
      rangedSummaryEvents.reduce((s, e) => s + e.refundedAmount, 0)
    );
    const tourNet =
      tourGross +
      rangedSummaryEvents.reduce((s, e) => s + e.refundedAmount, 0);

    const existing = tourMap.get(summary.tourName);
    if (existing) {
      existing.grossRevenue += tourGross;
      existing.refundedAmount += tourRefunded;
      existing.netRevenue += tourNet;
      existing.bookingCount += 1;
    } else {
      tourMap.set(summary.tourName, {
        tourName: summary.tourName,
        grossRevenue: tourGross,
        refundedAmount: tourRefunded,
        netRevenue: tourNet,
        bookingCount: 1,
        percentage: 0,
      });
    }
  }

  // Compute percentages
  const tourList = Array.from(tourMap.values()).sort(
    (a, b) => b.grossRevenue - a.grossRevenue
  );
  for (const t of tourList) {
    t.percentage =
      totalGross > 0 ? Math.round((t.grossRevenue / totalGross) * 1000) / 10 : 0;
  }

  // Non-cancelled booking count for average
  const activeBookings = summaries.filter((s) => !s.isCancelled).length;
  const averageBookingValue =
    activeBookings > 0 ? Math.round((totalGross - totalRefunded) / activeBookings) : 0;

  // Trend
  const granularity = chooseTrendGranularity(dateRange.startDate, dateRange.endDate);
  const revenueTrend = buildRevenueTrend(
    allEvents,
    dateRange.startDate,
    dateRange.endDate,
    granularity
  );

  return {
    totalGrossRevenue: totalGross,
    totalNetRevenue: totals.netRevenue,
    totalOverdueUnpaid: totalOverdue,
    totalExpectedRevenue: totalExpected,
    totalRefunded,
    cancelledBookingsCount: cancelledCount,
    averageBookingValue,
    revenueByTour: tourList,
    revenueTrend,
  };
}

// ---------------------------------------------------------------------------
// Data Bounds Helper
// ---------------------------------------------------------------------------

/**
 * Scans all bookings to find the earliest reservation date and the latest
 * payment due date (so "All time" captures expected future revenues).
 */
async function fetchDataBounds(): Promise<{ startDate: string; endDate: string }> {
  const rawBookings = await bookingService.getAllBookings();

  let earliest: string | null = null;
  let latest: string | null = null;

  for (const b of rawBookings) {
    const booking = b as RawBooking;

    // Earliest start: reservation date
    const reservationDate = toDate(booking.reservationDate);
    if (reservationDate) {
      const str = toISODate(reservationDate);
      if (!earliest || str < earliest) earliest = str;
    }

    // Also consider tour/travel date as a potential start
    const tourDate = toDate(booking.tourDate ?? booking.travelDate ?? booking.startDate);
    if (tourDate) {
      const str = toISODate(tourDate);
      if (!earliest || str < earliest) earliest = str;
    }

    // Latest end: all payment due dates (captures expected future revenues)
    for (const n of [1, 2, 3, 4] as const) {
      const dd = toDate((booking as RawBooking)[`p${n}DueDate`]);
      if (dd) {
        const s = toISODate(dd);
        if (!latest || s > latest) latest = s;
      }
    }
    const fullDue = toDate(booking.fullPaymentDueDate);
    if (fullDue) {
      const s = toISODate(fullDue);
      if (!latest || s > latest) latest = s;
    }
  }

  const today = new Date();
  return {
    startDate: earliest ?? toISODate(new Date(today.getFullYear() - 3, 0, 1)),
    endDate: latest ?? toISODate(new Date(today.getFullYear() + 2, 11, 31)),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const financialReportsService = {
  /**
   * Fetch all bookings and build a complete FinancialReport for the given
   * date range. Results include both aggregated metrics and per-booking
   * drill-down event timelines.
   */
  async generateReport(dateRange: DateRangeFilter): Promise<FinancialReport> {
    const rawBookings = await bookingService.getAllBookings();

    const today = new Date();
    const summaries: BookingFinancialSummary[] = rawBookings.map((b) => {
      const events = extractBookingEvents(b as RawBooking, today);
      return buildBookingSummary(b as RawBooking, events);
    });

    // Flat list of all events (for timeline chart and overall drill-down)
    const allEvents = summaries
      .flatMap((s) => s.events)
      .sort((a, b) => a.date.localeCompare(b.date));

    const metrics = aggregateMetrics(summaries, allEvents, dateRange);

    // Filter booking summaries to only those with at least one event in range
    const rangedSummaries = summaries.filter((s) =>
      s.events.some((e) =>
        dateInRange(e.date, dateRange.startDate, dateRange.endDate)
      )
    );

    return {
      generatedAt: new Date().toISOString(),
      dateRange,
      metrics,
      bookingSummaries: rangedSummaries,
      allEvents,
    };
  },

  /**
   * Build the event timeline for a single booking (drill-down view).
   * Includes ALL events regardless of date range.
   */
  async getBookingTimeline(
    bookingDocumentId: string
  ): Promise<BookingFinancialSummary | null> {
    const raw = await bookingService.getBooking(bookingDocumentId);
    if (!raw) return null;
    const events = extractBookingEvents(raw as RawBooking);
    return buildBookingSummary(raw as RawBooking, events);
  },

  /**
   * Helper: resolve a preset label + optional custom dates into a DateRangeFilter.
   */
  resolveDateRange: resolveDateRangePreset,

  /**
   * Scan all bookings to find the actual earliest reservation date and the
   * latest payment due date. Used by "All time" to produce a meaningful range
   * instead of hardcoded sentinels.
   */
  getDataBounds: fetchDataBounds,
};
