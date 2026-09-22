"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  TrendingUp,
  Search,
  X,
  SlidersHorizontal,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { financialReportsService } from "@/services/financial-reports-service";
import { FinancialReport, DateRangeFilter, FinancialEvent } from "@/types/financial-reports";
import { DateRangePicker } from "@/components/reports/DateRangePicker";
import { useSessionDateRange } from "@/hooks/useSessionDateRange";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetailRow {
  bookingId: string;
  bookingCode: string;
  tourName: string;
  installment: string; // "Reservation Fee" | "P1" | "P2" | "P3" | "P4" | "Full Payment"
  dueDate: string;
  paidDate: string | null;
  lastPaidDate: string | null; // most recent paid date across the booking (for pending/overdue context)
  amount: number;
  status: "paid" | "pending" | "overdue";
  grossRevenue: number;
  expectedRevenue: number;
  outstanding: number;
  refundedAmount: number;
  netRevenue: number;
}

type SortKey = keyof Pick<
  DetailRow,
  "bookingCode" | "tourName" | "installment" | "dueDate" | "amount" | "grossRevenue" | "netRevenue" | "expectedRevenue" | "outstanding" | "refundedAmount" | "status"
>;

type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return `£${Math.abs(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtSigned(amount: number): string {
  return amount < 0 ? `−${fmt(amount)}` : fmt(amount);
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // Append local time to avoid UTC midnight → local-time day shift
  const date = d.includes("T") ? new Date(d) : new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Build a flat list of payment-slot rows from a financial report, filtered to the date range.
 * Paid rows are included when their PAID DATE falls in range (revenue collected).
 * Pending/overdue rows are included when their DUE DATE falls in range (upcoming obligations).
 */
function buildDetailRows(report: FinancialReport, startDate: string, endDate: string): DetailRow[] {
  const rows: DetailRow[] = [];

  for (const summary of report.bookingSummaries) {
    const events = summary.events;

    // ── Most recent paid date for this booking (used as context on pending rows) ──
    const bookingLastPaidDate: string | null =
      events
        .filter(
          (e) =>
            (e.eventType === "px_paid" ||
              e.eventType === "full_payment_paid" ||
              e.eventType === "reservation" ||
              e.eventType === "manual_credit") &&
            e.grossRevenue > 0
        )
        .map((e) => e.date)
        .sort()
        .reverse()[0] ?? null;

    // ── Reservation Fee ──────────────────────────────────────────────────────
    const reservationEv = events.find((e) => e.eventType === "reservation");
    if (reservationEv && reservationEv.date >= startDate && reservationEv.date <= endDate) {
      rows.push({
        bookingId: summary.bookingId,
        bookingCode: summary.bookingCode,
        tourName: summary.tourName,
        installment: "Reservation Fee",
        dueDate: reservationEv.date,
        paidDate: reservationEv.date,
        lastPaidDate: null,
        amount: reservationEv.grossRevenue,
        status: "paid",
        grossRevenue: reservationEv.grossRevenue,
        expectedRevenue: 0,
        outstanding: 0,
        refundedAmount: 0,
        netRevenue: reservationEv.grossRevenue,
      });
    }

    // ── Manual Credit (overpayment = cash received) ───────────────────────────
    // Emitted by the finance module only once the schedule has been reduced by
    // the credit, so this row and the Gross Revenue headline always agree.
    for (const creditEv of events.filter((e) => e.eventType === "manual_credit")) {
      if (creditEv.date < startDate || creditEv.date > endDate) continue;
      rows.push({
        bookingId: summary.bookingId,
        bookingCode: summary.bookingCode,
        tourName: summary.tourName,
        installment: creditEv.history, // "Manual Credit (overpaid on P3)"
        dueDate: creditEv.date,
        paidDate: creditEv.date,
        lastPaidDate: null,
        amount: creditEv.grossRevenue,
        status: "paid",
        grossRevenue: creditEv.grossRevenue,
        expectedRevenue: 0,
        outstanding: 0,
        refundedAmount: 0,
        netRevenue: creditEv.grossRevenue,
      });
    }

    // ── Payment Slots (P1–P4, Full) ──────────────────────────────────────────
    // Gather all due events regardless of date — we'll decide inclusion per-slot below
    const allDueEvents = events.filter(
      (e) => e.eventType === "px_due" || e.eventType === "full_payment_due"
    );

    for (const dueEv of allDueEvents) {
      const slot = dueEv.paymentSlot;
      const paidEv = events.find(
        (e) =>
          (e.eventType === "px_paid" || e.eventType === "full_payment_paid") &&
          e.paymentSlot === slot
      );
      const overdueEv = events.find(
        (e) => e.eventType === "px_overdue" && e.paymentSlot === slot
      );

      // dueEv.expectedRevenue holds the slot amount for pending slots only (service zeroes it
      // for paid/overdue). Fall back to the paid or overdue event's amount field.
      const amount =
        dueEv.expectedRevenue > 0
          ? dueEv.expectedRevenue
          : paidEv
          ? paidEv.grossRevenue
          : overdueEv
          ? overdueEv.overdueUnpaidAmount
          : 0;
      const isPaid = !!paidEv;
      const isOverdue = !isPaid && !!overdueEv;
      const status: DetailRow["status"] = isPaid ? "paid" : isOverdue ? "overdue" : "pending";

      // Date-range gate:
      // • Paid    → include if paid date is within range
      // • Overdue → include if overdue event date (dueDate + 1) is within range — matches service
      // • Pending → include if due date is within range
      const rangeDate = isPaid ? paidEv!.date : isOverdue ? overdueEv!.date : dueEv.date;
      if (rangeDate < startDate || rangeDate > endDate) continue;

      const installmentLabel =
        dueEv.eventType === "full_payment_due"
          ? "Full Payment"
          : `P${["p1", "p2", "p3", "p4"].indexOf(slot!) + 1}`;

      rows.push({
        bookingId: summary.bookingId,
        bookingCode: summary.bookingCode,
        tourName: summary.tourName,
        installment: installmentLabel,
        dueDate: dueEv.date,
        paidDate: paidEv ? paidEv.date : null,
        lastPaidDate: isPaid ? null : bookingLastPaidDate,
        amount,
        status,
        grossRevenue: isPaid ? amount : 0,
        expectedRevenue: (!isPaid && !isOverdue) ? amount : 0,
        outstanding: isOverdue ? amount : 0,
        refundedAmount: 0,
        netRevenue: isPaid ? amount : 0,
      });
    }

    const refundEvents = events.filter(
      (e) => e.eventType === "cancellation" && e.refundedAmount < 0
    );

    for (const refundEv of refundEvents) {
      if (refundEv.date < startDate || refundEv.date > endDate) continue;

      const refundValue = Math.abs(refundEv.refundedAmount);
      rows.push({
        bookingId: summary.bookingId,
        bookingCode: summary.bookingCode,
        tourName: summary.tourName,
        installment: "Refund",
        dueDate: refundEv.date,
        paidDate: refundEv.date,
        lastPaidDate: null,
        amount: refundValue,
        status: "paid",
        grossRevenue: 0,
        expectedRevenue: 0,
        outstanding: 0,
        refundedAmount: refundValue,
        netRevenue: -refundValue,
      });
    }
  }

  // Sort by the display date (paid date for paid rows, due date otherwise)
  rows.sort((a, b) => {
    const dateA = a.status === "paid" && a.paidDate ? a.paidDate : a.dueDate;
    const dateB = b.status === "paid" && b.paidDate ? b.paidDate : b.dueDate;
    return dateA.localeCompare(dateB);
  });
  return rows;
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 justify-between">
          <span style={{ color: entry.color }} className="font-medium">
            {entry.name}:
          </span>
          <span className="font-bold">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DetailRow["status"] }) {
  if (status === "paid")
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Paid</Badge>;
  if (status === "overdue")
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">Overdue</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">Pending</Badge>;
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-blue-600" />
          ) : (
            <ArrowDown className="h-3 w-3 text-blue-600" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-gray-400" />
        )}
      </span>
    </th>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TransactionsDetailPageContent() {
  const router = useRouter();
  const params = useSearchParams();

  const startDate = params.get("start") ?? "";
  const endDate = params.get("end") ?? "";
  const statusParam = params.get("status") as DetailRow["status"] | null;
  const scrollToParam = params.get("scrollTo") ?? "";

  const [dateRange, setDateRange] = useSessionDateRange(
    startDate && endDate
      ? { preset: "custom", startDate, endDate }
      : undefined
  );

  const handleDateRangeChange = useCallback((range: DateRangeFilter) => {
    setDateRange(range);
    const p = new URLSearchParams();
    p.set("start", range.startDate);
    p.set("end", range.endDate);
    router.replace(`/reports/transactions?${p.toString()}`);
  }, [setDateRange, router]);

  const [report, setReport] = useState<FinancialReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<"all" | DetailRow["status"]>(
    statusParam ?? "all"
  );
  const [searchText, setSearchText] = useState("");
  const [tourFilter, setTourFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── Chart line toggles (scorecard → chart line key) ────────────────────────
  // Keys: "netRevenue" | "grossRevenue" | "overdueUnpaid" | "expectedRevenue" | "refundedAmount"
  const [activeLines, setActiveLines] = useState<Set<string>>(
    () => new Set(["netRevenue", "grossRevenue", "overdueUnpaid", "expectedRevenue", "refundedAmount"])
  );

  const toggleLine = (key: string) => {
    setActiveLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Always keep at least one line
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ── Fetch report ────────────────────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await financialReportsService.generateReport(dateRange);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // ── Scroll to Payment Schedule if requested via URL ─────────────────────────
  useEffect(() => {
    if (!scrollToParam || isLoading) return;
    const el = document.getElementById(scrollToParam);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, [scrollToParam, isLoading]);

  // ── Build rows ──────────────────────────────────────────────────────────────
  const allRows = useMemo(
    () => (report ? buildDetailRows(report, dateRange.startDate, dateRange.endDate) : []),
    [report, dateRange.startDate, dateRange.endDate]
  );

  const uniqueTours = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.tourName))).sort(),
    [allRows]
  );
  const uniqueSources = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.installment))).sort(),
    [allRows]
  );

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.bookingId.toLowerCase().includes(q) ||
          r.bookingCode.toLowerCase().includes(q) ||
          r.tourName.toLowerCase().includes(q)
      );
    }
    if (tourFilter) rows = rows.filter((r) => r.tourName === tourFilter);
    if (sourceFilter) rows = rows.filter((r) => r.installment === sourceFilter);
    rows = [...rows].sort((a, b) => {
      // When sorting by Source Date, use the display date (paid date for paid rows)
      const getDisplayDate = (r: DetailRow) =>
        sortKey === "dueDate"
          ? (r.status === "paid" && r.paidDate ? r.paidDate : r.dueDate)
          : String(r[sortKey]);
      const av = sortKey === "dueDate" ? getDisplayDate(a) : a[sortKey];
      const bv = sortKey === "dueDate" ? getDisplayDate(b) : b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [allRows, statusFilter, searchText, tourFilter, sourceFilter, sortKey, sortDir]);

  const activeFilterCount = [
    statusFilter !== "all",
    searchText.trim() !== "",
    tourFilter !== "",
    sourceFilter !== "",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter("all");
    setSearchText("");
    setTourFilter("");
    setSourceFilter("");
  };

  // ── Sort toggle ─────────────────────────────────────────────────────────────
  const handleSort = (col: SortKey) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  // ── Summary stats ───────────────────────────────────────────────────────────
  const metrics = report?.metrics;

  // Derive scorecard totals from allRows so they always match the table
  const rowTotals = useMemo(() => ({
    grossRevenue: allRows.reduce((s, r) => s + r.grossRevenue, 0),
    netRevenue:   allRows.reduce((s, r) => s + r.netRevenue, 0),
    expected:     allRows.reduce((s, r) => s + r.expectedRevenue, 0),
    outstanding:  allRows.reduce((s, r) => s + r.outstanding, 0),
    refunded:     allRows.reduce((s, r) => s + r.refundedAmount, 0),
  }), [allRows]);

  // Extend trend data with netRevenue = grossRevenue - refundedAmount
  const trendData = useMemo(
    () =>
      (metrics?.revenueTrend ?? []).map((b) => ({
        ...b,
        netRevenue: b.grossRevenue - b.refundedAmount,
      })),
    [metrics]
  );

  const paidCount = allRows.filter((r) => r.status === "paid").length;
  const pendingCount = allRows.filter((r) => r.status === "pending").length;
  const overdueCount = allRows.filter((r) => r.status === "overdue").length;

  const periodLabel =
    dateRange.startDate && dateRange.endDate
      ? `${fmtDate(dateRange.startDate)} \u2013 ${fmtDate(dateRange.endDate)}`
      : "All time";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/reports")}
            className="gap-1 text-gray-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Button>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Financial Transactions Detail
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              All payment events for{" "}
              <span className="font-medium">{periodLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
            <Button
              variant="outline"
              size="sm"
              onClick={loadReport}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading transactions…
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            {error}
          </div>
        )}

        {/* Summary Cards — click to toggle chart line */}
        {report && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {/* Net Revenue */}
            <Card
              className={`cursor-pointer transition-all border-2 ${
                activeLines.has("netRevenue")
                  ? "border-purple-500 shadow-md"
                  : "border-transparent opacity-60"
              }`}
              onClick={() => toggleLine("netRevenue")}
              title="Toggle Net Revenue line"
            >
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Net Revenue</p>
                <p className="text-xl font-bold text-purple-700">{fmt(rowTotals.netRevenue)}</p>
              </CardContent>
            </Card>
            {/* Gross Revenue */}
            <Card
              className={`cursor-pointer transition-all border-2 ${
                activeLines.has("grossRevenue")
                  ? "border-green-500 shadow-md"
                  : "border-transparent opacity-60"
              }`}
              onClick={() => toggleLine("grossRevenue")}
              title="Toggle Gross Revenue line"
            >
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Gross Revenue</p>
                <p className="text-xl font-bold text-green-700">{fmt(rowTotals.grossRevenue)}</p>
              </CardContent>
            </Card>
            {/* Outstanding */}
            <Card
              className={`cursor-pointer transition-all border-2 ${
                activeLines.has("overdueUnpaid")
                  ? "border-orange-500 shadow-md"
                  : "border-transparent opacity-60"
              }`}
              onClick={() => toggleLine("overdueUnpaid")}
              title="Toggle Outstanding line"
            >
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Outstanding</p>
                <p className="text-xl font-bold text-orange-600">{fmt(rowTotals.outstanding)}</p>
              </CardContent>
            </Card>
            {/* Expected */}
            <Card
              className={`cursor-pointer transition-all border-2 ${
                activeLines.has("expectedRevenue")
                  ? "border-blue-500 shadow-md"
                  : "border-transparent opacity-60"
              }`}
              onClick={() => toggleLine("expectedRevenue")}
              title="Toggle Expected Revenue line"
            >
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Expected</p>
                <p className="text-xl font-bold text-blue-600">{fmt(rowTotals.expected)}</p>
              </CardContent>
            </Card>
            {/* Refunded */}
            <Card
              className={`cursor-pointer transition-all border-2 ${
                activeLines.has("refundedAmount")
                  ? "border-red-500 shadow-md"
                  : "border-transparent opacity-60"
              }`}
              onClick={() => toggleLine("refundedAmount")}
              title="Toggle Refunded line"
            >
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Refunded</p>
                <p className="text-xl font-bold text-red-600">
                  {rowTotals.refunded > 0 ? `−${fmt(rowTotals.refunded)}` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Revenue Trends Line Chart */}
        {trendData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                Revenue Over Time
              </CardTitle>
              <CardDescription>
                Gross Revenue, Expected Revenue, Net Revenue, and Refunded amounts over the
                selected period. Click a scorecard to show/hide its line.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={trendData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    tickFormatter={(v) => `£${(v as number).toLocaleString("en-GB", { notation: "compact" })}`}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="netRevenue"
                    name="Net Revenue"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    hide={!activeLines.has("netRevenue")}
                  />
                  <Line
                    type="monotone"
                    dataKey="grossRevenue"
                    name="Gross Revenue"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    hide={!activeLines.has("grossRevenue")}
                  />
                  <Line
                    type="monotone"
                    dataKey="overdueUnpaid"
                    name="Outstanding"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 5 }}
                    hide={!activeLines.has("overdueUnpaid")}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedRevenue"
                    name="Expected Revenue"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    hide={!activeLines.has("expectedRevenue")}
                  />
                  <Line
                    type="monotone"
                    dataKey="refundedAmount"
                    name="Refunded"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                    activeDot={{ r: 5 }}
                    hide={!activeLines.has("refundedAmount")}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card id="paymentSchedule">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>Payment Schedule</CardTitle>
                <CardDescription>
                  {filteredRows.length} payment row
                  {filteredRows.length !== 1 ? "s" : ""}
                  {activeFilterCount > 0 && (
                    <span className="ml-1 text-orange-600 font-medium">
                      (filtered from {allRows.length})
                    </span>
                  )}
                  {" — click column headers to sort"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter pills */}
                {(
                  [
                    { key: "all", label: "All" },
                    { key: "paid", label: `Paid (${paidCount})` },
                    { key: "pending", label: `Pending (${pendingCount})` },
                    { key: "overdue", label: `Overdue (${overdueCount})` },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      statusFilter === key
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {/* Advanced filter toggle */}
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    showFilters || activeFilterCount > 0
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 bg-white text-blue-700 rounded-full px-1.5 text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Advanced filter panel */}
            {showFilters && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  {/* Search */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Search</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Booking ID, tour name…"
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {searchText && (
                        <button
                          onClick={() => setSearchText("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tour Name */}
                  <div className="min-w-[180px]">
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Tour Name</label>
                    <select
                      value={tourFilter}
                      onChange={(e) => setTourFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="">All tours</option>
                      {uniqueTours.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Source */}
                  <div className="min-w-[150px]">
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Source</label>
                    <select
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="">All sources</option>
                      {uniqueSources.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Booking Status */}
                  <div className="min-w-[140px]">
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Booking Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | DetailRow["status"])}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="all">All statuses</option>
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>

                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <X className="h-3 w-3" />
                      Clear all
                    </button>
                  )}
                </div>

                {/* Active filter chips */}
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {searchText.trim() && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                        Search: &ldquo;{searchText.trim()}&rdquo;
                        <button onClick={() => setSearchText("")}><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {tourFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                        Tour: {tourFilter}
                        <button onClick={() => setTourFilter("")}><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {sourceFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                        Source: {sourceFilter}
                        <button onClick={() => setSourceFilter("")}><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {statusFilter !== "all" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                        Status: {statusFilter}
                        <button onClick={() => setStatusFilter("all")}><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-y-auto overflow-x-hidden max-h-[640px]">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="border-b border-gray-200">
                    <SortHeader label="Booking ID" col="bookingCode" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="pl-3" />
                    <SortHeader label="Tour Name" col="tourName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Source" col="installment" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Source Date" col="dueDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Booking Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-center" />
                    <SortHeader label="Gross" col="grossRevenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortHeader label="Net Rev" col="netRevenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortHeader label="Expected" col="expectedRevenue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortHeader label="Outstanding" col="outstanding" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortHeader label="Refund" col="refundedAmount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right pr-3" />
                  </tr>
                  {filteredRows.length > 0 && (
                    <tr className="border-b-2 border-gray-300 bg-gray-100">
                      <td colSpan={5} className="px-2 py-2 pl-3 text-xs font-semibold text-gray-600">
                        Totals ({filteredRows.length} rows)
                      </td>
                      <td className="px-2 py-2 text-right text-xs font-bold text-green-700">
                        {fmt(filteredRows.reduce((s, r) => s + r.grossRevenue, 0))}
                      </td>
                      <td className="px-2 py-2 text-right text-xs font-bold text-purple-700">
                        {fmtSigned(filteredRows.reduce((s, r) => s + r.netRevenue, 0))}
                      </td>
                      <td className="px-2 py-2 text-right text-xs font-bold text-blue-600">
                        {fmt(filteredRows.reduce((s, r) => s + r.expectedRevenue, 0))}
                      </td>
                      <td className="px-2 py-2 text-right text-xs font-bold text-orange-600">
                        {fmt(filteredRows.reduce((s, r) => s + r.outstanding, 0))}
                      </td>
                      <td className="px-2 py-2 pr-3 text-right text-xs font-bold text-red-600">
                        {filteredRows.reduce((s, r) => s + r.refundedAmount, 0) > 0
                          ? `−${fmt(filteredRows.reduce((s, r) => s + r.refundedAmount, 0))}`
                          : "—"}
                      </td>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-gray-400 text-sm">
                        No payment data for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, i) => (
                      <tr
                        key={`${row.bookingId}-${row.installment}-${i}`}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-2 py-3 pl-3">
                          <button
                            onClick={() => router.push(`/bookings?bookingId=${row.bookingId}`)}
                            className="font-mono text-xs text-blue-700 font-semibold hover:underline hover:text-blue-900 text-left block truncate max-w-full"
                            title={`Open booking ${row.bookingId}`}
                          >
                            {row.bookingId}
                          </button>
                          {row.bookingCode && row.bookingCode !== row.bookingId && (
                            <span className="block text-gray-400 font-normal text-xs truncate" title={row.bookingCode}>{row.bookingCode}</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-gray-900 truncate" title={row.tourName}>
                          {row.tourName}
                        </td>
                        <td className="px-2 py-3 text-gray-700 font-medium truncate" title={row.installment}>
                          {row.installment}
                        </td>
                        <td className="px-2 py-3 text-gray-600">
                          {row.status === "paid" && row.paidDate ? (
                            <>
                              <span className="text-green-700 font-medium">{fmtDate(row.paidDate)}</span>
                              {row.installment !== "Reservation Fee" && (
                                <span className="block text-xs text-gray-400">
                                  Due: {fmtDate(row.dueDate)}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {fmtDate(row.dueDate)}
                              {row.installment !== "Reservation Fee" && (
                                <span className="block text-xs text-gray-400">
                                  {row.installment} Due Date
                                </span>
                              )}
                              {row.lastPaidDate && (
                                <span className="block text-xs text-gray-400">
                                  Last paid: {fmtDate(row.lastPaidDate)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-2 py-3 text-right text-green-700 font-medium">
                          {row.grossRevenue > 0 ? fmt(row.grossRevenue) : "—"}
                        </td>
                        <td className="px-2 py-3 text-right text-purple-700 font-medium">
                          {row.netRevenue !== 0 ? fmtSigned(row.netRevenue) : "—"}
                        </td>
                        <td className="px-2 py-3 text-right text-blue-600">
                          {row.expectedRevenue > 0 ? fmt(row.expectedRevenue) : "—"}
                        </td>
                        <td className="px-2 py-3 text-right text-orange-600 font-medium">
                          {row.outstanding > 0 ? fmt(row.outstanding) : "—"}
                        </td>
                        <td className="px-2 py-3 pr-3 text-right text-red-600 font-medium">
                          {row.refundedAmount > 0 ? `−${fmt(row.refundedAmount)}` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function TransactionsDetailPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="p-6 text-sm text-gray-500">Loading report…</div>
        </DashboardLayout>
      }
    >
      <TransactionsDetailPageContent />
    </Suspense>
  );
}
