/**
 * Financial Reports Data Model
 *
 * This module defines types for the Revenue Report system.
 * Each booking's financial history is decomposed into a series of
 * FinancialEvents, one per transaction-relevant date.
 *
 * Design mirrors the "Revenue Report" spreadsheet:
 * - Reservation Date  → grossRevenue = reservationFee
 * - Px Due Date       → expectedRevenue = pxAmount
 * - Px Date Paid      → grossRevenue = pxAmount
 * - Cancellation Date → refundedAmount, cancelledBookingsCount++
 *
 * Overdue rule: Px is overdue ONLY if its due date has passed AND
 * it was never paid (datePaid is null/undefined). Once paid, overdue = 0.
 */

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type FinancialEventType =
  | "reservation"      // Reservation Date → gross revenue (reservation fee)
  | "px_due"           // Px Due Date → expected revenue
  | "px_paid"          // Px Date Paid → gross revenue (installment payment)
  | "px_overdue"       // Px Due Date + 1 day (only when never paid) → overdue
  | "full_payment_due" // Full Payment Due Date → expected revenue
  | "full_payment_paid"// Full Payment Date Paid → gross revenue
  | "manual_credit"    // Overpayment on a term/reservation → gross revenue (cash received)
  | "cancellation";    // Cancellation Request Date → refunded amount

// Which installment (P1–P4 or full)
export type PaymentSlot = "p1" | "p2" | "p3" | "p4" | "full";

// ---------------------------------------------------------------------------
// Core Event Row (mirrors one row in the spreadsheet)
// ---------------------------------------------------------------------------

export interface FinancialEvent {
  /** ISO date string (YYYY-MM-DD) for the event */
  date: string;
  /** Human-readable label for the History column */
  history: string;
  eventType: FinancialEventType;
  paymentSlot?: PaymentSlot;

  // Booking context
  bookingId: string;
  bookingCode: string;
  tourName: string;

  // Financial columns (mutually exclusive per event, except netRevenue)
  grossRevenue: number;
  expectedRevenue: number;
  overdueUnpaidAmount: number;
  refundedAmount: number; // negative value (e.g. -424.50)
  cancelledBookingsCount: number; // 0 or 1 per cancellation event

  // Derived — updated when building the row set
  netRevenue: number; // grossRevenue + refundedAmount (refund is negative)
}

// ---------------------------------------------------------------------------
// Per-Booking Summary (aggregated from all its events)
// ---------------------------------------------------------------------------

export interface BookingFinancialSummary {
  bookingId: string;
  bookingCode: string;
  tourName: string;
  bookingStatus: string;

  totalGrossRevenue: number;
  totalExpectedRevenue: number;
  totalOverdueUnpaid: number;
  totalRefunded: number;    // sum of refundedAmount values (negative)
  totalNetRevenue: number;  // totalGrossRevenue + totalRefunded
  isCancelled: boolean;

  /** Ordered timeline of financial events for drill-down view */
  events: FinancialEvent[];
}

// ---------------------------------------------------------------------------
// Aggregated Report Metrics (for the overview dashboard)
// ---------------------------------------------------------------------------

export interface FinancialReportMetrics {
  /** Total gross revenue actually collected within the date range */
  totalGrossRevenue: number;
  /** Total net revenue (gross minus refunds) within the date range */
  totalNetRevenue: number;
  /** Sum of all truly overdue (unpaid past-due) amounts */
  totalOverdueUnpaid: number;
  /** Sum of all expected (future scheduled) payments within the range */
  totalExpectedRevenue: number;
  /** Sum of all refunded amounts (positive number, e.g. 424.50) */
  totalRefunded: number;
  /** Total number of cancelled bookings */
  cancelledBookingsCount: number;
  /** Average net revenue per booking (non-cancelled) */
  averageBookingValue: number;
  /** Revenue grouped by tour package */
  revenueByTour: TourRevenueSummary[];
  /** Daily/weekly/monthly buckets for the Revenue Trends chart */
  revenueTrend: RevenueTrendBucket[];
}

export interface TourRevenueSummary {
  tourName: string;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  bookingCount: number;
  percentage: number; // share of total gross revenue
}

export type TrendGranularity = "daily" | "weekly" | "monthly";

export interface RevenueTrendBucket {
  /** Label for the x-axis (e.g. "Jan 15", "Week 3", "Feb 2026") */
  label: string;
  /** ISO date string for the start of the bucket */
  date: string;
  grossRevenue: number;
  expectedRevenue: number;
  refundedAmount: number; // positive number
  overdueUnpaid: number;
}

// ---------------------------------------------------------------------------
// Date Range Filter
// ---------------------------------------------------------------------------

export type DateRangePreset =
  | "all_time"
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "last_12_months"
  | "custom";

export interface DateRangeFilter {
  preset: DateRangePreset;
  /** ISO date string — inclusive start date */
  startDate: string;
  /** ISO date string — inclusive end date */
  endDate: string;
}

// ---------------------------------------------------------------------------
// Full Report Output
// ---------------------------------------------------------------------------

export interface FinancialReport {
  generatedAt: string; // ISO timestamp
  dateRange: DateRangeFilter;
  metrics: FinancialReportMetrics;
  /** Per-booking summaries (used for drill-down and data table) */
  bookingSummaries: BookingFinancialSummary[];
  /** All events flat-sorted by date (used for timeline view) */
  allEvents: FinancialEvent[];
}
