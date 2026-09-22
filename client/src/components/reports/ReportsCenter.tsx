"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Banknote,
  TrendingUp,
  Users,
  AlertCircle,
  XCircle,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { financialReportsService } from "@/services/financial-reports-service";
import { FinancialReport, DateRangeFilter } from "@/types/financial-reports";
import { useSessionDateRange } from "@/hooks/useSessionDateRange";
import { DateRangePicker } from "@/components/reports/DateRangePicker";
import { FINANCE_GLOSSARY } from "@/lib/finance/booking-finance";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

/** Format a currency amount with a symbol prefix */
function formatCurrency(amount: number, currency = "£"): string {
  return `${currency}${Math.abs(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Metric tooltip definitions — one source of truth shared with the Dashboard
 * (see @/lib/finance/booking-finance). Keys are the card titles.
 */
const METRIC_DEFINITIONS: Record<string, string> = Object.fromEntries(
  FINANCE_GLOSSARY.map((t) => [t.term, t.definition])
);
METRIC_DEFINITIONS["Total Refunded"] = METRIC_DEFINITIONS["Refunded"];

export default function ReportsCenter() {
  const [dateRange, setDateRange] = useSessionDateRange();

  // Financial report state
  const [financialReport, setFinancialReport] =
    useState<FinancialReport | null>(null);
  const [isLoadingFinancial, setIsLoadingFinancial] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);

  const { toast } = useToast();

  // Load financial report
  const loadFinancialReport = useCallback(
    async (range: DateRangeFilter) => {
      setIsLoadingFinancial(true);
      setFinancialError(null);
      try {
        const report = await financialReportsService.generateReport(range);
        setFinancialReport(report);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to load financial report";
        setFinancialError(msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setIsLoadingFinancial(false);
      }
    },
    [toast],
  );

  // Load financial report whenever date range changes
  useEffect(() => {
    loadFinancialReport(dateRange);
  }, [dateRange, loadFinancialReport]);

  const metrics = financialReport?.metrics;
  const router = useRouter();

  const toTransactionsUrl = (status?: "paid" | "overdue" | "pending") => {
    const base = `/reports/transactions?start=${dateRange.startDate}&end=${dateRange.endDate}`;
    if (status) return `${base}&status=${status}&scrollTo=paymentSchedule`;
    return base;
  };
  const toCancellationsUrl = () =>
    `/reports/cancellations?start=${dateRange.startDate}&end=${dateRange.endDate}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Reports & Analytics
          </h1>
          <p className="text-sm text-gray-600">
            Comprehensive insights into your business performance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadFinancialReport(dateRange)}
            disabled={isLoadingFinancial}
            className="h-[34px]"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoadingFinancial ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Loading / Error states */}
        {isLoadingFinancial && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Card key={idx}>
                  <CardHeader className="space-y-2 pb-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[280px] w-full" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[240px] w-full" />
              </CardContent>
            </Card>
          </div>
        )}
        {financialError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            <XCircle className="h-4 w-4" />
            {financialError}
          </div>
        )}

        {!isLoadingFinancial && (
          <>
            {/* 7 Financial Metric Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Net Revenue */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toTransactionsUrl("paid"))}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Net Revenue
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Net Revenue"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {metrics ? formatCurrency(metrics.totalNetRevenue) : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Gross − Refunded (headline figure)
                  </p>
                </CardContent>
              </Card>

              {/* Gross Revenue */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toTransactionsUrl("paid"))}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Gross Revenue
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Gross Revenue"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {metrics ? formatCurrency(metrics.totalGrossRevenue) : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All cash received, dated when paid
                  </p>
                </CardContent>
              </Card>

              {/* Overdue Unpaid */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toTransactionsUrl("overdue"))}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Overdue Unpaid
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Overdue Unpaid"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-orange-600">
                    {metrics
                      ? metrics.totalOverdueUnpaid > 0
                        ? formatCurrency(metrics.totalOverdueUnpaid)
                        : "—"
                      : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics && metrics.totalOverdueUnpaid > 0
                      ? "Became overdue in range, still unpaid"
                      : "Nothing became overdue in range"}
                  </p>
                </CardContent>
              </Card>

              {/* Expected Revenue */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toTransactionsUrl("pending"))}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Expected Revenue
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Expected Revenue"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {metrics
                      ? formatCurrency(metrics.totalExpectedRevenue)
                      : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Unpaid, due date still in the future
                  </p>
                </CardContent>
              </Card>

              {/* Total Refunded */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toCancellationsUrl())}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Total Refunded
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Total Refunded"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <XCircle className="h-4 w-4 text-red-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-red-600">
                    {metrics
                      ? metrics.totalRefunded > 0
                        ? `−${formatCurrency(metrics.totalRefunded)}`
                        : "—"
                      : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cancellation refunds
                  </p>
                </CardContent>
              </Card>

              {/* Cancelled Bookings */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toCancellationsUrl())}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Cancelled Bookings
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Cancelled Bookings"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {metrics ? metrics.cancelledBookingsCount : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cancelled within date range
                  </p>
                </CardContent>
              </Card>

              {/* Outstanding Balance (expected + overdue) */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(toTransactionsUrl())}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium">
                      Outstanding Balance
                    </CardTitle>
                    <span
                      title={METRIC_DEFINITIONS["Outstanding Balance"]}
                      className="text-gray-400 cursor-help text-xs select-none"
                    >
                      ⓘ
                    </span>
                  </div>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {metrics
                      ? formatCurrency(
                          metrics.totalExpectedRevenue + metrics.totalOverdueUnpaid
                        )
                      : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Overdue Unpaid + Expected Revenue
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Definitions */}
            <details className="rounded-lg border border-border bg-card px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 select-none">
                How these figures are defined
              </summary>
              <p className="text-xs text-muted-foreground mt-2">
                The Dashboard and every report use these same definitions, so a
                figure that appears in two places is always the same number.
                Every figure counts only events dated inside the selected range
                ({dateRange.startDate} to {dateRange.endDate}).
              </p>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {FINANCE_GLOSSARY.map((t) => (
                  <div key={t.term}>
                    <dt className="text-xs font-semibold text-gray-800">{t.term}</dt>
                    <dd className="text-xs text-muted-foreground">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            </details>

            {/* Detailed Reports Navigation */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Detailed Reports</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Card
                  className="cursor-pointer hover:shadow-md hover:border-royal-purple/40 transition-all"
                  onClick={() => router.push(`/reports/customers?start=${dateRange.startDate}&end=${dateRange.endDate}`)}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Customer Guest List</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Guest demographics, nationality &amp; age breakdown
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Revenue Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>
                  Revenue over time — hover for details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metrics && metrics.revenueTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={metrics.revenueTrend}
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
                        tickFormatter={(v) =>
                          `£${(v as number).toLocaleString("en-GB", {
                            notation: "compact",
                          })}`
                        }
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                      />
                      <RechartsTooltip
                        content={(props: any) => {
                          const { active, payload, label } = props;
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                              <p className="font-semibold text-gray-700 mb-2">
                                {label}
                              </p>
                              {payload.map((entry: any) => (
                                <div
                                  key={entry.name}
                                  className="flex items-center gap-3 justify-between"
                                >
                                  <span
                                    style={{ color: entry.color }}
                                    className="font-medium"
                                  >
                                    {entry.name}:
                                  </span>
                                  <span className="font-bold">
                                    {formatCurrency(entry.value as number)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "12px" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="grossRevenue"
                        name="Gross Revenue"
                        stroke="#22c55e"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="expectedRevenue"
                        name="Expected Revenue"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
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
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <TrendingUp className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">
                        No trend data for this period
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Revenue by Tour Package */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Tour Package</CardTitle>
                <CardDescription>
                  Gross, Net, and Refunded amounts per tour with booking count
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!metrics || metrics.revenueByTour.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No revenue data for this period.
                  </p>
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(
                      220,
                      metrics.revenueByTour.length * 52 + 60,
                    )}
                  >
                    <BarChart
                      data={metrics.revenueByTour}
                      layout="vertical"
                      margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                      barCategoryGap="35%"
                      barGap={3}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#f0f0f0"
                      />
                      <XAxis
                        type="number"
                        domain={[0, "dataMax"]}
                        reversed={false}
                        tickFormatter={(v) =>
                          `£${(v as number).toLocaleString("en-GB", {
                            notation: "compact",
                          })}`
                        }
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e7eb" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="tourName"
                        width={175}
                        tick={{ fontSize: 11, fill: "#374151" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "#f9fafb" }}
                        content={(props: any) => {
                          const { active, payload } = props;
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                              <p className="font-semibold text-gray-700 mb-1 max-w-[200px] break-words">
                                {d.tourName}
                              </p>
                              <p className="text-green-700 font-semibold">
                                Gross: {formatCurrency(d.grossRevenue)}
                              </p>
                              <p className="text-blue-600 font-bold">
                                Net: {formatCurrency(d.netRevenue)}
                              </p>
                              <p className="text-red-600 font-semibold">
                                Refunded: {formatCurrency(d.refundedAmount)}
                              </p>
                              <p className="text-gray-500">
                                {d.bookingCount} booking
                                {d.bookingCount !== 1 ? "s" : ""} &middot;{" "}
                                {d.percentage}%
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="grossRevenue"
                        name="Gross Revenue"
                        fill="#16a34a"
                        barSize={10}
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="netRevenue"
                        name="Net Revenue"
                        fill="#2563eb"
                        barSize={10}
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="refundedAmount"
                        name="Refunded"
                        fill="#ef4444"
                        barSize={10}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
