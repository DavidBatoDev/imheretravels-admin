"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  FiPlus,
  FiEye,
  FiAlertTriangle,
  FiFileText,
  FiUsers,
  FiDollarSign,
  FiCalendar,
  FiClock,
  FiMapPin,
  FiCreditCard,
  FiCheckCircle,
  FiXCircle,
  FiTrendingUp,
} from "react-icons/fi";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { collection, onSnapshot, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Booking } from "@/types/bookings";
import { bookingService } from "@/services/booking-service";
import {
  extractAllEvents,
  sumEvents,
  monthlyNetRevenue,
  toISODate,
  deriveLifecycleStatus,
  FINANCE_GLOSSARY,
  LIFECYCLE_DEFINITIONS,
  type LifecycleStatus,
  type RawBooking,
} from "@/lib/finance/booking-finance";

const glossary = (term: string) =>
  FINANCE_GLOSSARY.find((t) => t.term === term)?.definition ?? "";

const money = (n: number) =>
  n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import { useToast } from "@/hooks/use-toast";

export default function DashboardOverview() {
  const router = useRouter();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [paymentRemindersCount, setPaymentRemindersCount] = useState(0);
  const [paymentReminderStats, setPaymentReminderStats] = useState({
    pending: 0,
    sent: 0,
    skipped: 0,
    cancelled: 0,
  });

  // Fetch real booking data from Firebase
  useEffect(() => {
    const bookingsQuery = query(collection(db, "bookings"));

    const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
      const bookingData = snapshot.docs.map((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to JavaScript Date objects
        return {
          id: doc.id,
          ...data,
          reservationDate: data.reservationDate?.toDate
            ? data.reservationDate.toDate()
            : new Date(data.reservationDate),
          tourDate: data.tourDate?.toDate
            ? data.tourDate.toDate()
            : new Date(data.tourDate),
          returnDate: data.returnDate?.toDate
            ? data.returnDate.toDate()
            : data.returnDate
            ? new Date(data.returnDate)
            : null,
        };
      }) as Booking[];

      setBookings(bookingData);
      setIsLoading(false);
      console.log("Loaded bookings:", bookingData.length, bookingData);
    });

    return () => unsubscribe();
  }, []);

  // Fetch payment reminders count from scheduledEmails
  useEffect(() => {
    const scheduledEmailsQuery = query(
      collection(db, "scheduledEmails")
      // Optionally filter by status if needed
    );

    const unsubscribe = onSnapshot(scheduledEmailsQuery, (snapshot) => {
      const paymentReminderEmails = snapshot.docs.filter((doc) => {
        const data = doc.data();
        return data.emailType === "payment-reminder";
      });

      setPaymentRemindersCount(paymentReminderEmails.length);

      // Calculate stats by status
      const stats = {
        pending: 0,
        sent: 0,
        skipped: 0,
        cancelled: 0,
      };

      paymentReminderEmails.forEach((doc) => {
        const data = doc.data();
        const status = data.status?.toLowerCase() || "pending";
        if (status === "pending") stats.pending++;
        else if (status === "sent") stats.sent++;
        else if (status === "skipped") stats.skipped++;
        else if (status === "cancelled") stats.cancelled++;
      });

      setPaymentReminderStats(stats);
      console.log(
        "Loaded payment reminders:",
        paymentReminderEmails.length,
        stats
      );
    });

    return () => unsubscribe();
  }, []);

  // Lifecycle state derived from the calendar + balance (shared finance module),
  // so Completed / Elapsed flip on their own without anyone editing the row.
  // Cancelled requires a cancellation reason (or a cancelled status text).
  const getBookingStatusCategory = (booking: Booking): LifecycleStatus =>
    deriveLifecycleStatus(booking as unknown as RawBooking);

  // Calculate metrics from real data
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Every money figure comes from the shared finance module, the same one the
  // Reports page uses, so the two screens can never disagree. See the
  // definitions in @/lib/finance/booking-finance.
  const financeEvents = extractAllEvents(
    bookings as unknown as RawBooking[],
    today
  );
  const allTime = sumEvents(financeEvents);
  const thisMonth = sumEvents(financeEvents, toISODate(startOfMonth), toISODate(today));
  const thisWeek = sumEvents(financeEvents, toISODate(startOfWeek), toISODate(today));
  const todayTotals = sumEvents(financeEvents, toISODate(startOfToday), toISODate(today));
  const lastSixMonths = monthlyNetRevenue(financeEvents, 6, today);
  const activeBookingsOwing = new Set(
    financeEvents
      .filter((e) => e.expectedRevenue > 0 || e.overdueUnpaidAmount > 0)
      .map((e) => e.bookingId)
  ).size;

  const upcomingConfirmedBookings = bookings.filter(
    (booking) =>
      new Date(booking.tourDate) > today &&
      getBookingStatusCategory(booking) === "Confirmed"
  );

  const metrics = {
    bookingsToday: bookings.filter(
      (booking) => new Date(booking.reservationDate) >= startOfToday
    ).length,
    bookingsThisWeek: bookings.filter(
      (booking) => new Date(booking.reservationDate) >= startOfWeek
    ).length,
    bookingsThisMonth: bookings.filter(
      (booking) => new Date(booking.reservationDate) >= startOfMonth
    ).length,
    totalBookings: bookings.length,
    netRevenue: allTime.netRevenue,
    grossRevenue: allTime.grossRevenue,
    refunded: allTime.refunded,
    revenueToday: todayTotals.netRevenue,
    revenueThisWeek: thisWeek.netRevenue,
    revenueThisMonth: thisMonth.netRevenue,
    // Distinct departures (tour + date), not bookings on them.
    upcomingTours: new Set(
      upcomingConfirmedBookings.map((booking) => {
        const d = new Date(booking.tourDate);
        return `${booking.tourPackageName || booking.tourPackage || ""}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    ).size,
    upcomingConfirmedBookings: upcomingConfirmedBookings.length,
    pendingReminders: paymentRemindersCount,
    confirmedBookings: bookings.filter(
      (booking) =>
        getBookingStatusCategory(booking) === "Confirmed"
    ).length,
    pendingBookings: bookings.filter(
      (booking) => getBookingStatusCategory(booking) === "Pending"
    ).length,
    cancelledBookings: bookings.filter(
      (booking) =>
        getBookingStatusCategory(booking) === "Cancelled"
    ).length,
    completedBookings: bookings.filter(
      (booking) =>
        getBookingStatusCategory(booking) === "Completed"
    ).length,
    elapsedBookings: bookings.filter(
      (booking) => getBookingStatusCategory(booking) === "Elapsed"
    ).length,
    outstandingBalance: allTime.outstandingBalance,
    overdueUnpaid: allTime.overdueUnpaid,
    expectedRevenue: allTime.expectedRevenue,
    bookingsWithBalance: activeBookingsOwing,
    // Cash received beyond what was owed (per-slot cash model). A refund or
    // travel credit waiting to happen; no pipeline exists yet, so surface it.
    pendingRefunds: bookings.reduce(
      (sum, booking) => sum + (Number(booking.overpaidAmount) || 0),
      0
    ),
    bookingsOverpaid: bookings.filter(
      (booking) => (Number(booking.overpaidAmount) || 0) > 0.009
    ).length,
    averageMonthlyRevenue:
      lastSixMonths.reduce((sum, m) => sum + m.totals.netRevenue, 0) / 6,
    cancelledRefunded: allTime.refunded,
  };

  // Prepare chart data with fallback for empty data
  const bookingStatusData = [
    { name: "Confirmed", value: metrics.confirmedBookings, color: "#26D07C" },
    { name: "Pending", value: metrics.pendingBookings, color: "#FF8200" },
    { name: "Completed", value: metrics.completedBookings, color: "#685BC7" },
    { name: "Elapsed", value: metrics.elapsedBookings, color: "#9CA3AF" },
    { name: "Cancelled", value: metrics.cancelledBookings, color: "#EF3340" },
  ].filter((item) => item.value > 0);

  // If no data, show a placeholder
  if (bookingStatusData.length === 0) {
    bookingStatusData.push({ name: "No Data", value: 1, color: "#e5e5e5" });
  }

  // Monthly trends (last 6 months): bookings by reservation date, net revenue
  // by the date money moved (same buckets as Avg Monthly Net Revenue).
  const getMonthlyTrends = (): {
    month: string;
    bookings: number;
    revenue: number;
  }[] =>
    lastSixMonths.map(({ monthStart, label, totals }) => {
      const nextMonthStart = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        1
      );
      return {
        month: label,
        bookings: bookings.filter((booking) => {
          const d = new Date(booking.reservationDate);
          return !isNaN(d.getTime()) && d >= monthStart && d < nextMonthStart;
        }).length,
        revenue: Math.round(totals.netRevenue * 100) / 100,
      };
    });

  const monthlyTrends = getMonthlyTrends();

  // Tour package popularity
  const getTourPopularity = () => {
    if (bookings.length === 0) {
      return [];
    }

    const tourCount: { [key: string]: number } = {};
    bookings.forEach((booking) => {
      const tourName =
        booking.tourPackageName ||
        booking.tourPackage ||
        booking.tourName ||
        booking.tour ||
        booking.package ||
        null;

      if (tourName && tourName.trim() !== "") {
        const cleanName = tourName.trim();
        tourCount[cleanName] = (tourCount[cleanName] || 0) + 1;
      }
    });

    const popularity = Object.entries(tourCount)
      .filter(([name, count]) => count > 0)
      .map(([name, count]) => ({
        name: name.length > 20 ? name.substring(0, 20) + "..." : name,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    if (popularity.length === 0) {
      return [];
    }

    return popularity;
  };

  const tourPopularity = getTourPopularity();

  // Debug logging
  console.log("🔥 DASHBOARD DEBUG:", {
    totalBookings: bookings.length,
    tourPopularityData: tourPopularity,
    hasBookings: bookings.length > 0,
    tourPopularityLength: tourPopularity.length,
    firstFewBookings: bookings.slice(0, 3).map((b) => ({
      id: b.id,
      tourPackageName: b.tourPackageName,
      tourPackage: b.tourPackage,
      tourName: b.tourName,
      tour: b.tour,
      package: b.package,
    })),
    metrics,
    bookingStatusData,
  });

  const quickActions = [
    {
      title: "Create New Booking",
      description: "Add a new booking to the system",
      icon: FiPlus,
      onClick: async () => {
        setIsCreatingBooking(true);
        try {
          // Compute next row number (fill gaps)
          const rowNumbers = (bookings || [])
            .map((b) => (typeof b.row === "number" ? b.row : 0))
            .filter((n) => n > 0)
            .sort((a, b) => a - b);
          let nextRowNumber = 1;
          for (let i = 0; i < rowNumbers.length; i++) {
            if (rowNumbers[i] !== i + 1) {
              nextRowNumber = i + 1;
              break;
            }
            nextRowNumber = i + 2;
          }

          // Create minimal doc then update with id/row/timestamps
          const newBookingId = await bookingService.createBooking({});
          const bookingData = {
            id: newBookingId,
            row: nextRowNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any;
          await bookingService.updateBooking(newBookingId, bookingData);

          // Navigate with bookingId to open detail modal
          router.push(`/bookings?tab=bookings&bookingId=${newBookingId}`);

          toast({
            title: "✅ Booking Created",
            description: `Successfully created a booking in row ${nextRowNumber}`,
            variant: "default",
          });

          setIsCreatingBooking(false);
        } catch (error) {
          setIsCreatingBooking(false);
          toast({
            title: "❌ Failed to Create Booking",
            description: `Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            variant: "destructive",
          });
        }
      },
      color: "bg-primary",
      iconColor: "text-white",
    },
    {
      title: "View All Bookings",
      description: "Manage and view all bookings",
      icon: FiEye,
      onClick: () => router.push("/bookings"),
      color: "bg-spring-green",
      iconColor: "text-white",
    },
    {
      title: "Payment Reminders",
      description: "Check pending payment reminders",
      icon: FiAlertTriangle,
      onClick: () => router.push("/mail/payment-reminders"),
      color: "bg-vivid-orange",
      iconColor: "text-white",
    },
    {
      title: "Generate Report",
      description: "Create financial or booking reports",
      icon: FiFileText,
      onClick: () => {},
      color: "bg-gray-400",
      iconColor: "text-white",
      disabled: true,
    },
  ];



  return (
    <div className="space-y-6 text-sm sm:text-base">
      {/* Creating Booking Modal */}
      {isCreatingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background rounded-2xl p-8 shadow-2xl border border-border flex flex-col items-center gap-4 max-w-sm mx-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground mb-2">
                Creating a new booking
              </p>
              <p className="text-sm text-muted-foreground">
                Redirecting to /bookings page...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-hk-grotesk">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-lg">
            Welcome back! Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/bookings")}
            className="border-border text-primary hover:bg-primary/10 hover:border-primary transition-all duration-200"
          >
            <FiEye className="mr-2 h-4 w-4" />
            View All Bookings
          </Button>
          <Button
            onClick={async () => {
              setIsCreatingBooking(true);
              try {
                // Compute next row number (fill gaps)
                const rowNumbers = (bookings || [])
                  .map((b) => (typeof b.row === "number" ? b.row : 0))
                  .filter((n) => n > 0)
                  .sort((a, b) => a - b);
                let nextRowNumber = 1;
                for (let i = 0; i < rowNumbers.length; i++) {
                  if (rowNumbers[i] !== i + 1) {
                    nextRowNumber = i + 1;
                    break;
                  }
                  nextRowNumber = i + 2;
                }

                // Create minimal doc then update with id/row/timestamps
                const newBookingId = await bookingService.createBooking({});
                const bookingData = {
                  id: newBookingId,
                  row: nextRowNumber,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                } as any;
                await bookingService.updateBooking(newBookingId, bookingData);

                // Navigate with bookingId to open detail modal
                router.push(`/bookings?tab=bookings&bookingId=${newBookingId}`);

                toast({
                  title: "✅ Booking Created",
                  description: `Successfully created a booking in row ${nextRowNumber}`,
                  variant: "default",
                });

                setIsCreatingBooking(false);
              } catch (error) {
                setIsCreatingBooking(false);
                toast({
                  title: "❌ Failed to Create Booking",
                  description: `Error: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                  variant: "destructive",
                });
              }
            }}
            disabled={isCreatingBooking}
            className="bg-crimson-red hover:bg-crimson-red/90 text-white shadow shadow-crimson-red/25 transition-all duration-200"
          >
            <FiPlus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

      {/* Enhanced Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 sm:gap-4 lg:gap-6">
        {/* Total Bookings */}
        <Card className="relative overflow-hidden border border-border hover:border-crimson-red transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                  Total Bookings
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {metrics.totalBookings}
                  </p>
                )}
                {isLoading ? (
                  <div className="flex gap-2 mt-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] sm:text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-spring-green"></div>
                      <p className="text-xs text-muted-foreground">
                        Confirmed:{" "}
                        <span className="text-spring-green font-bold">
                          {metrics.confirmedBookings}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-vivid-orange"></div>
                      <p className="text-xs text-muted-foreground">
                        Pending:{" "}
                        <span className="text-vivid-orange font-bold">
                          {metrics.pendingBookings}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-crimson-red/20 to-crimson-red/10 rounded-full rounded-br-none">
                <FiUsers className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-crimson-red/20 to-crimson-red/10 p-4 sm:hidden">
              <FiUsers className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>

        {/* Net Revenue (all time) */}
        <Card className="relative overflow-hidden border border-border hover:border-spring-green transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p
                  className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide cursor-help"
                  title={glossary("Net Revenue")}
                >
                  Net Revenue <span className="normal-case">(all time)</span> ⓘ
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    £{money(metrics.netRevenue)}
                  </p>
                )}
                {isLoading ? (
                   <Skeleton className="h-4 w-40 mt-2" />
                ) : (
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-1">
                      <FiTrendingUp className="h-3 w-3 text-spring-green" />
                      <p className="text-xs text-spring-green font-bold">
                        This month: £{money(metrics.revenueThisMonth)}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Gross £{money(metrics.grossRevenue)} − Refunded £{money(metrics.refunded)}
                    </p>
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-spring-green/20 to-spring-green/10 rounded-full rounded-br-none">
                <FiDollarSign className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-spring-green/20 to-spring-green/10 p-4 sm:hidden">
              <FiDollarSign className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Tours */}
        <Card className="relative overflow-hidden border border-border hover:border-royal-purple transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                  Upcoming Tours
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {metrics.upcomingTours}
                  </p>
                )}
                {isLoading ? (
                  <Skeleton className="h-4 w-32 mt-2" />
                ) : (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <FiCalendar className="h-3 w-3 text-royal-purple" />
                      <p className="text-xs text-muted-foreground">
                        {metrics.upcomingConfirmedBookings} confirmed bookings
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-royal-purple/20 to-royal-purple/10 rounded-full rounded-br-none">
                <FiClock className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-royal-purple/20 to-royal-purple/10 p-4 sm:hidden">
              <FiClock className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>

        {/* Payment Reminders */}
        <Card className="relative overflow-hidden border border-border hover:border-vivid-orange transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                  Payment Reminders
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {metrics.pendingReminders}
                  </p>
                )}
                {isLoading ? (
                  <div className="flex gap-2 mt-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] sm:text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-vivid-orange"></div>
                      <p className="text-xs text-muted-foreground">
                        Pending:{" "}
                        <span className="text-vivid-orange font-bold">
                          {paymentReminderStats.pending}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-spring-green"></div>
                      <p className="text-xs text-muted-foreground">
                        Sent:{" "}
                        <span className="text-spring-green font-bold">
                          {paymentReminderStats.sent}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                      <p className="text-xs text-muted-foreground">
                        Skipped:{" "}
                        <span className="text-gray-400 font-bold">
                          {paymentReminderStats.skipped}
                        </span>
                      </p>
                    </div>
                    {paymentReminderStats.cancelled > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-crimson-red"></div>
                        <p className="text-xs text-muted-foreground">
                          Cancelled:{" "}
                          <span className="text-crimson-red font-bold">
                            {paymentReminderStats.cancelled}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-vivid-orange/20 to-vivid-orange/10 rounded-full rounded-br-none">
                <FiCreditCard className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-vivid-orange/20 to-vivid-orange/10 p-4 sm:hidden">
              <FiCreditCard className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 lg:gap-6">
        {/* Average Monthly Revenue */}
        <Card className="relative overflow-hidden border border-border hover:border-sunglow-yellow transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p
                  className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide cursor-help"
                  title={`Average monthly Net Revenue over the last 6 calendar months, including the current month. ${glossary("Net Revenue")}`}
                >
                  Avg Monthly Net Revenue ⓘ
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    £{money(metrics.averageMonthlyRevenue)}
                  </p>
                )}
                {isLoading ? (
                  <Skeleton className="h-4 w-40 mt-2" />
                ) : (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <FiTrendingUp className="h-3 w-3 text-sunglow-yellow" />
                      <p className="text-xs text-muted-foreground">
                        Last 6 months average
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-sunglow-yellow/20 to-sunglow-yellow/10 rounded-full rounded-br-none">
                <FiDollarSign className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-sunglow-yellow/20 to-sunglow-yellow/10 p-4 sm:hidden">
              <FiDollarSign className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>

        {/* Cancelled Bookings */}
        <Card className="relative overflow-hidden border border-border hover:border-crimson-red transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p
                  className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide cursor-help"
                  title={glossary("Cancelled Bookings")}
                >
                  Cancelled Bookings ⓘ
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {metrics.cancelledBookings}
                  </p>
                )}
                {isLoading ? (
                  <Skeleton className="h-4 w-40 mt-2" />
                ) : (
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] sm:text-xs">
                    <div className="flex items-center gap-1">
                      <FiXCircle className="h-3 w-3 text-crimson-red" />
                      <p className="text-xs text-muted-foreground">
                        Refunded:{" "}
                        <span className="text-crimson-red font-bold">
                          £{money(metrics.cancelledRefunded)}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-crimson-red/20 to-crimson-red/10 rounded-full rounded-br-none">
                <FiXCircle className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-crimson-red/20 to-crimson-red/10 p-4 sm:hidden">
              <FiXCircle className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>

        {/* Pending Payments */}
        <Card className="relative overflow-hidden border border-border hover:border-vivid-orange transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-6">
                <p
                  className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide cursor-help"
                  title={glossary("Outstanding Balance")}
                >
                  Outstanding Balance ⓘ
                </p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32 mb-2" />
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    £{money(metrics.outstandingBalance)}
                  </p>
                )}
                {isLoading ? (
                  <Skeleton className="h-4 w-40 mt-2" />
                ) : (
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-1">
                      <FiClock className="h-3 w-3 text-vivid-orange" />
                      <p className="text-xs text-muted-foreground">
                        <span
                          className="cursor-help"
                          title={glossary("Overdue Unpaid")}
                        >
                          Overdue Unpaid{" "}
                          <span className="text-vivid-orange font-bold">
                            £{money(metrics.overdueUnpaid)}
                          </span>
                        </span>{" "}
                        +{" "}
                        <span
                          className="cursor-help"
                          title={glossary("Expected Revenue")}
                        >
                          Expected Revenue £{money(metrics.expectedRevenue)}
                        </span>
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Owed by {metrics.bookingsWithBalance} active bookings
                    </p>
                    {metrics.pendingRefunds > 0.009 && (
                      <p
                        className="text-[11px] text-crimson-red font-medium cursor-help"
                        title="Cash received beyond what these bookings owe. There is no refund pipeline yet; these need a manual refund or travel credit."
                      >
                        Overpaid £{money(metrics.pendingRefunds)} on {metrics.bookingsOverpaid} booking
                        {metrics.bookingsOverpaid === 1 ? "" : "s"} — refund or credit pending
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-vivid-orange/20 to-vivid-orange/10 rounded-full rounded-br-none">
                <FiClock className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-vivid-orange/20 to-vivid-orange/10 p-4 sm:hidden">
              <FiClock className="h-full w-full text-foreground opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="sm:hidden">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-2">
             {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-3 h-[90px]">
                   <Skeleton className="h-10 w-10 rounded-full mb-2" />
                   <Skeleton className="h-3 w-16" />
                </div>
             ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action) => (
              <button
                key={`mobile-${action.title}`}
                type="button"
                onClick={action.disabled ? undefined : action.onClick}
                disabled={action.disabled}
                aria-disabled={action.disabled}
                className={
                  action.disabled
                    ? "flex flex-col items-center justify-center rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground cursor-not-allowed"
                    : "flex flex-col items-center justify-center rounded-xl border border-border bg-card p-3 text-[11px] text-foreground shadow-sm hover:border-crimson-red/40 hover:shadow-md transition-all duration-200"
                }
              >
                <div
                  className={`${action.color} mb-2 flex h-10 w-10 items-center justify-center rounded-full text-white`}
                >
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="text-center leading-tight">{action.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hidden sm:grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
           Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border border-border shadow">
              <CardContent className="p-5">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
           ))
        ) : (
          quickActions.map((action) => (
            <Card
              key={action.title}
              onClick={action.disabled ? undefined : action.onClick}
              className={`${
                action.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:shadow-lg"
              } transition-all duration-300 border border-border shadow ${
                action.disabled ? "" : "hover:border-crimson-red/40"
              } group`}
            >
              <CardContent className="p-5">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-3 rounded-full ${action.color} shadow-lg ${
                      action.disabled ? "" : "group-hover:scale-110"
                    } transition-transform duration-200`}
                  >
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm font-bold text-foreground mb-1">
                      {action.title}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      {action.description}
                    </CardDescription>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Booking Status Distribution */}
        <Card className="border border-border shadow hover:shadow-lg transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-crimson-red/5 to-spring-green/5 border-b border-border">
            <CardTitle className="text-foreground font-hk-grotesk">
              Booking Status Overview
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              <span
                className="cursor-help"
                title={Object.entries(LIFECYCLE_DEFINITIONS)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")}
              >
                Derived from tour dates and balance, always current ⓘ
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[220px] sm:h-64">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-48 w-48 rounded-full" />
                </div>
              ) : bookings.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="p-3 bg-muted/20 rounded-xl inline-block mb-3">
                      <FiUsers className="h-8 w-8 text-muted-foreground mx-auto" />
                    </div>
                    <p className="text-muted-foreground font-medium">
                      No bookings data
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Add your first booking to see the status distribution
                    </p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bookingStatusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      paddingAngle={bookingStatusData.length > 1 ? 5 : 0}
                      dataKey="value"
                    >
                      {bookingStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Booking Trends */}
        <Card className="border border-border shadow hover:shadow-lg transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-royal-purple/5 to-vivid-orange/5 border-b border-border">
            <CardTitle className="text-foreground font-hk-grotesk">
              Monthly Trends
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Bookings by reservation date, net revenue by payment date (last 6 months)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[220px] sm:h-64">
              {isLoading ? (
                <Skeleton className="w-full h-full rounded-md" />
              ) : bookings.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="p-3 bg-muted/20 rounded-xl inline-block mb-3">
                      <FiTrendingUp className="h-8 w-8 text-muted-foreground mx-auto" />
                    </div>
                    <p className="text-muted-foreground font-medium">
                      No trends data
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Booking trends will appear once you have some bookings
                    </p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrends}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: string) => {
                        if (name?.includes("Revenue")) {
                          return [`£${value.toLocaleString()}`, "Revenue (£)"];
                        }
                        return [value, "Bookings"];
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="bookings"
                      stroke="#26D07C"
                      strokeWidth={3}
                      dot={{ fill: "#26D07C", strokeWidth: 2, r: 4 }}
                      name="Bookings"
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#685BC7"
                      strokeWidth={3}
                      dot={{ fill: "#685BC7", strokeWidth: 2, r: 4 }}
                      name="Revenue (£)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tour Popularity Chart */}
      <Card className="border border-border shadow hover:shadow-lg transition-all duration-300">
        <CardHeader className="bg-gradient-to-r from-sunglow-yellow/5 to-spring-green/5 border-b border-border">
          <CardTitle className="text-foreground font-hk-grotesk">
            Most Popular Tours
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Top performing tour packages by booking count
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-[260px] sm:h-80">
            {isLoading ? (
               <Skeleton className="w-full h-full rounded-md" />
            ) : tourPopularity.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="p-3 bg-muted/20 rounded-xl inline-block mb-3">
                    <FiMapPin className="h-8 w-8 text-muted-foreground mx-auto" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    No tour data
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Tour popularity will show once you have bookings with tour
                    packages
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-2">
                    Debug: {bookings.length} bookings, {tourPopularity.length}{" "}
                    tours with data
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full w-full overflow-x-auto">
                <div className="h-full min-w-[360px] sm:min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={tourPopularity}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: any) => [value, "Bookings"]}
                      />
                      <Bar
                        dataKey="count"
                        fill="#FF8200"
                        radius={[4, 4, 0, 0]}
                        name="Bookings"
                        minPointSize={5}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border border-border shadow hover:shadow-lg transition-all duration-300">
        <CardHeader className="bg-gradient-to-r from-crimson-red/5 to-royal-purple/5 border-b border-border p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg text-foreground font-hk-grotesk">
            Recent Activity
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground">
            Latest bookings and updates from your system
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-4">
               {Array.from({ length: 5 }).map((_, i) => (
                 <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                 </div>
               ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <div className="p-2 sm:p-3 bg-muted/20 rounded-xl inline-block mb-2 sm:mb-3">
                <FiUsers className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground mx-auto" />
              </div>
              <p className="text-sm text-muted-foreground">
                No recent activity
              </p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {bookings.slice(0, 5).map((booking, index) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-2 sm:gap-4 rounded-lg border border-transparent p-2 sm:p-3 transition-colors duration-200 hover:border-border hover:bg-muted/30"
                >
                  <div
                    className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full shadow-sm flex-shrink-0 ${
                      booking.bookingStatus === "Confirmed"
                        ? "bg-spring-green"
                        : booking.bookingStatus === "Pending"
                        ? "bg-vivid-orange"
                        : booking.bookingStatus === "Completed"
                        ? "bg-royal-purple"
                        : "bg-crimson-red"
                    }`}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] sm:text-sm font-medium text-foreground truncate">
                      {booking.bookingStatus === "Confirmed"
                        ? "Booking Confirmed"
                        : booking.bookingStatus === "Pending"
                        ? "New Booking"
                        : booking.bookingStatus === "Completed"
                        ? "Tour Completed"
                        : "Booking Cancelled"}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      {booking.fullName} - {booking.tourPackageName}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="inline-block text-[10px] sm:text-xs text-muted-foreground/80 bg-background px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-border whitespace-nowrap">
                      {booking.remainingBalance > 0
                        ? `£${booking.remainingBalance} due`
                        : `£${booking.paid} paid`}
                    </span>
                  </div>
                </div>
              ))}
              {bookings.length > 5 && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => router.push("/bookings")}
                    className="text-xs"
                  >
                    View All Bookings ({bookings.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
