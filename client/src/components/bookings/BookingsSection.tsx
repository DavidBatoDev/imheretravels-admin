"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Fuse from "fuse.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Filter,
  X,
  User,
  Grid3X3,
  List,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  RefreshCw,
  Upload,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  FaUser,
  FaMapMarkerAlt,
  FaPlus,
  FaPlane,
  FaPhone,
  FaHashtag,
  FaCalendarAlt,
  FaEuroSign,
} from "react-icons/fa";
import { MdEmail, MdTextFields } from "react-icons/md";
import { BsCalendar3, BsCalendarEvent, BsPersonCheck } from "react-icons/bs";
import { IoWallet } from "react-icons/io5";
import { HiTrendingUp } from "react-icons/hi";
import type { Booking } from "@/types/bookings";
import { SheetColumn } from "@/types/sheet-management";
import {
  toCsv,
  downloadCsv,
  formatCsvDate,
  csvDateStamp,
  type CsvColumn,
} from "@/lib/csv-export";
import { allBookingSheetColumns } from "@/app/functions/columns";
import { functionMap } from "@/app/functions/columns/functions-index";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, getDocs } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { bookingService } from "@/services/booking-service";
import { financialReportsService } from "@/services/financial-reports-service";
import { useToast } from "@/hooks/use-toast";
import BookingDetailModal from "./BookingDetailModal";
import BookingVersionHistoryModal from "@/components/version-history/BookingVersionHistoryModal";
// import CSVImport from "../sheet-management/CSVImport";
// import SpreadsheetSync from "../sheet-management/SpreadsheetSync";

// VSCode-style icons for match options
const MatchCaseIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <text x="2" y="11" fontSize="9" fontWeight="bold" fill="currentColor">
      Aa
    </text>
  </svg>
);

const WholeWordIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <line
      x1="1"
      y1="3"
      x2="1"
      y2="13"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <text x="3.5" y="11" fontSize="8" fill="currentColor">
      ab
    </text>
    <line
      x1="12.5"
      y1="3"
      x2="12.5"
      y2="13"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

const RegexIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <text
      x="2"
      y="11"
      fontSize="8"
      fontWeight="normal"
      fill="currentColor"
      fontFamily="monospace"
    >
      .*
    </text>
  </svg>
);

export default function BookingsSection() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [columns, setColumns] = useState<SheetColumn[]>([]);

  // Advanced filtering state
  const [columnFilters, setColumnFilters] = useState<Record<string, any>>({});
  const [dateRangeFilters, setDateRangeFilters] = useState<
    Record<string, { from?: Date; to?: Date }>
  >({});
  const [currencyRangeFilters, setCurrencyRangeFilters] = useState<
    Record<string, { min?: number; max?: number }>
  >({});

  // New dynamic filter builder state
  type FilterOperator = "eq" | "gte" | "gt" | "lte" | "lt" | "between" | "null";

  interface FilterConfig {
    id: string;
    columnId?: string;
    operator?: FilterOperator; // for number/currency
    matchOptions?: {
      matchCase: boolean;
      matchWholeWord: boolean;
      useRegex: boolean;
    }; // for string/email
    value?: any; // single value or array (for selects)
    value2?: any; // for between/date to
    dataTypeOverride?: SheetColumn["dataType"]; // for function columns
  }

  const [tempFilters, setTempFilters] = useState<FilterConfig[]>([]);
  const [activeFilters, setActiveFilters] = useState<FilterConfig[]>([]);

  // Dynamic options for select columns with loadOptions
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, string[]>
  >({});

  // Temporary filter states (for modal preview before applying)
  const [tempColumnFilters, setTempColumnFilters] = useState<
    Record<string, any>
  >({});
  const [tempDateRangeFilters, setTempDateRangeFilters] = useState<
    Record<string, { from?: Date; to?: Date }>
  >({});
  const [tempCurrencyRangeFilters, setTempCurrencyRangeFilters] = useState<
    Record<string, { min?: number; max?: number }>
  >({});

  // Card layout configuration - which column to show in each card section
  const [cardFieldMappings, setCardFieldMappings] = useState({
    field1: "fullName", // Traveler section
    field2: "tourPackageName", // Tour Package section
    field3_left: "reservationDate", // Left date
    field3_right: "tourDate", // Right date
    field4: "paid", // Payment section
  });

  // Temporary mappings for preview (before applying)
  const [tempCardFieldMappings, setTempCardFieldMappings] = useState({
    field1: "fullName",
    field2: "tourPackageName",
    field3_left: "reservationDate",
    field3_right: "tourDate",
    field4: "paid",
  });

  const [fieldSelectorOpen, setFieldSelectorOpen] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterSticky, setIsFilterSticky] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [reportMetrics, setReportMetrics] = useState<{
    netRevenue: number;
    outstandingBalances: number;
    expectedRevenue: number;
  } | null>(null);
  const [isReportMetricsLoading, setIsReportMetricsLoading] = useState(true);

  // Ref for the bookings container to enable scrolling after adding a booking
  const bookingsContainerRef = useRef<HTMLDivElement>(null);

  // Remove scroll button states - using CSS-only approach

  // Create Fuse instance for fuzzy search
  const fuse = useMemo(() => {
    if (bookings.length === 0) return null;

    // Get all string fields from bookings for comprehensive search
    const searchableFields = columns
      .filter(
        (col) =>
          col.dataType === "string" ||
          col.dataType === "email" ||
          col.dataType === "select" ||
          col.dataType === "function",
      )
      .map((col) => ({
        name: col.id,
        getFn: (booking: any) => {
          const value = booking[col.id];
          if (value === null || value === undefined) return "";
          return String(value);
        },
      }));

    // Explicitly include key identifier/function fields that are excluded by the
    // dataType filter above (bookingId is dataType "function" but produces a string).
    const explicitKeys = [
      {
        name: "bookingId",
        getFn: (booking: any) => String(booking.bookingId || ""),
        weight: 1.0, // highest priority — exact ID search must always work
      },
      {
        name: "fullName",
        getFn: (booking: any) => String(booking.fullName || ""),
        weight: 0.9,
      },
    ];

    return new Fuse(bookings, {
      keys: [
        ...explicitKeys,
        ...searchableFields
          .filter((f) => f.name !== "bookingId" && f.name !== "fullName") // avoid duplicates
          .map((field) => ({
            name: field.name,
            getFn: field.getFn,
            weight: 0.7,
          })),
      ],
      threshold: 0.3, // slightly tighter — reduces false positives for ID searches
      includeScore: true,
      minMatchCharLength: 2,
    });
  }, [bookings, columns]);

  // Load coded booking sheet columns
  useEffect(() => {
    console.log("🔍 [BOOKINGS SECTION] Loading coded booking sheet columns...");

    const loadColumns = async () => {
      // Convert BookingSheetColumn[] to SheetColumn[] and inject function implementations
      const codedColumns: SheetColumn[] = await Promise.all(
        allBookingSheetColumns.map(async (col): Promise<SheetColumn> => {
          const columnData = col.data;

          // If this is a function column, inject the actual function implementation
          if (columnData.dataType === "function" && columnData.function) {
            const funcImpl = functionMap[columnData.function];
            if (funcImpl) {
              return {
                ...columnData,
                compiledFunction: funcImpl as (...args: any[]) => any, // Inject the actual function
              };
            } else {
              console.warn(
                `⚠️  Function ${columnData.function} not found in function map for column ${columnData.columnName}`,
              );
            }
          }

          // If column has loadOptions, load dynamic options
          if (
            columnData.loadOptions &&
            typeof columnData.loadOptions === "function"
          ) {
            try {
              const dynamicOptions = await columnData.loadOptions();
              return {
                ...columnData,
                options: dynamicOptions,
              };
            } catch (error) {
              console.warn(
                `⚠️  Failed to load options for column ${columnData.columnName}:`,
                error,
              );
            }
          }

          return columnData;
        }),
      );

      console.log(
        `✅ [BOOKINGS SECTION] Loaded ${codedColumns.length} coded columns from TypeScript files`,
      );

      setColumns(codedColumns);
    };

    loadColumns();
  }, []);

  // Load dynamic options for select columns with loadOptions
  useEffect(() => {
    const loadDynamicOptions = async () => {
      const optionsMap: Record<string, string[]> = {};

      for (const col of columns) {
        if (col.dataType === "select" && col.loadOptions) {
          try {
            // Pass empty formData context for filter loading
            const options = await col.loadOptions({ formData: {} });
            optionsMap[col.id] = options;
            console.log(
              `📋 Loaded ${options.length} options for ${col.columnName}`,
            );
          } catch (error) {
            console.error(
              `Failed to load options for ${col.columnName}:`,
              error,
            );
            optionsMap[col.id] = col.options || [];
          }
        }
      }

      if (Object.keys(optionsMap).length > 0) {
        setDynamicOptions(optionsMap);
      }
    };

    if (columns.length > 0) {
      loadDynamicOptions();
    }
  }, [columns]);

  // Subscribe to real-time bookings data
  useEffect(() => {
    console.log(
      "🔍 [BOOKINGS SECTION] Setting up real-time booking subscription...",
    );

    const unsubscribe = onSnapshot(
      query(collection(db, "bookings")),
      (querySnapshot) => {
        const fetchedBookings = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Booking[];

        // Sort bookings numerically by row number
        const sortedBookings = fetchedBookings.sort((a, b) => {
          const aRow = typeof a.row === "number" ? a.row : 0;
          const bRow = typeof b.row === "number" ? b.row : 0;
          if (aRow === 0 && bRow === 0) return 0;
          if (aRow === 0) return 1;
          if (bRow === 0) return -1;
          return aRow - bRow;
        });

        console.log(
          `✅ [BOOKINGS SECTION] Received ${sortedBookings.length} bookings from Firestore`,
        );

        // Debug: Log first booking's payment and date data
        if (sortedBookings.length > 0) {
          const firstBooking = sortedBookings[0];
          console.log("🔍 [DEBUG] First booking payment data:", {
            id: firstBooking.id,
            paid: firstBooking.paid,
            paidType: typeof firstBooking.paid,
            originalTourCost: firstBooking.originalTourCost,
            originalTourCostType: typeof firstBooking.originalTourCost,
            discountedTourCost: firstBooking.discountedTourCost,
            discountedTourCostType: typeof firstBooking.discountedTourCost,
            useDiscountedTourCost: firstBooking.useDiscountedTourCost,
          });

          console.log("🔍 [DEBUG] First booking date data:", {
            id: firstBooking.id,
            reservationDate: firstBooking.reservationDate,
            reservationDateType: typeof firstBooking.reservationDate,
            reservationDateIsTimestamp:
              firstBooking.reservationDate &&
              typeof firstBooking.reservationDate === "object" &&
              (firstBooking.reservationDate as any).toDate,
            tourDate: firstBooking.tourDate,
            tourDateType: typeof firstBooking.tourDate,
            tourDateIsTimestamp:
              firstBooking.tourDate &&
              typeof firstBooking.tourDate === "object" &&
              (firstBooking.tourDate as any).toDate,
          });
        }

        // Use real data if available, otherwise show empty state
        if (sortedBookings.length > 0) {
          setBookings(sortedBookings);
        } else {
          console.log(
            "📝 [BOOKINGS SECTION] No real data found, showing empty state",
          );
          setBookings([]);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("❌ Error listening to bookings:", error);
        console.log(
          "📝 [BOOKINGS SECTION] Error occurred, showing empty state",
        );
        setBookings([]);
        setIsLoading(false);
      },
    );

    // Cleanup subscription on unmount
    return () => {
      console.log("🧹 [BOOKINGS SECTION] Cleaning up booking subscription");
      unsubscribe();
    };
  }, []);

  // Handle query parameters for opening modals
  useEffect(() => {
    const bookingId = searchParams?.get("bookingId");
    const action = searchParams?.get("action");
    const mode = searchParams?.get("mode");

    if (bookingId && bookings.length > 0) {
      const booking = bookings.find(
        (b) => b.id === bookingId || b.bookingId === bookingId
      );
      if (booking) {
        setSelectedBooking(booking);
        setIsDetailModalOpen(true);
      }
    } else if (action === "new") {
      setIsAddModalOpen(true);
    }
  }, [searchParams, bookings]);

  // Track scroll position to detect when filter becomes sticky
  useEffect(() => {
    const handleScroll = () => {
      const filterSection = document.querySelector("[data-filter-section]");
      if (filterSection) {
        const rect = filterSection.getBoundingClientRect();
        setIsFilterSticky(rect.top <= 64); // 64px is the top-16 offset (16 * 4px)
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Minimal JavaScript for CSS-only scroll button visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      const isAtTop = scrollTop <= 10;
      const isAtBottom = scrollTop >= documentHeight - windowHeight - 10;

      // Set data attributes for CSS
      document.body.setAttribute(
        "data-scroll",
        isAtTop ? "top" : isAtBottom ? "bottom" : "middle",
      );
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial call
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get total cost for a booking with validation
  const getTotalCost = (booking: Booking) => {
    const originalCost = Number(booking.originalTourCost) || 0;
    const discountedCost = Number(booking.discountedTourCost) || 0;

    if (discountedCost > 0) {
      return discountedCost;
    }
    return originalCost;
  };

  // Safe number conversion with fallback
  const safeNumber = (value: any, fallback: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  };

  // Safe date conversion for Firebase Timestamps
  const safeDate = (value: any): Date => {
    // If it's already a Date object, return it
    if (value instanceof Date) {
      return value;
    }

    // If it's a Firebase Timestamp, convert to Date
    if (
      value &&
      typeof value === "object" &&
      value.toDate &&
      typeof value.toDate === "function"
    ) {
      return value.toDate();
    }

    // If it's a string or number, try to create a Date
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      return isNaN(date.getTime()) ? new Date() : date;
    }

    // Fallback to current date
    return new Date();
  };

  // Helper function to determine booking status category
  const getBookingStatusCategory = (
    status: string | null | undefined,
  ): string => {
    if (typeof status !== "string" || status.trim() === "") return "Pending";

    const statusLower = status.toLowerCase();
    if (statusLower.includes("confirmed")) return "Confirmed";
    if (statusLower.includes("cancelled")) return "Cancelled";
    if (statusLower.includes("installment")) return "Pending"; // Installments are pending payments
    if (statusLower.includes("completed")) return "Completed";

    return "Pending"; // Default fallback
  };

  // CSV export of bookings filtered by selected status category
  const [isExportingCancelled, setIsExportingCancelled] = useState(false);

  const BOOKING_STATUS_CATEGORIES = [
    "Confirmed",
    "Pending",
    "Cancelled",
    "Completed",
  ];

  // Status categories selected in the export settings popover.
  const [exportStatuses, setExportStatuses] = useState<string[]>([
    "Cancelled",
  ]);

  const toggleExportStatus = (status: string) => {
    setExportStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  const handleExportCancelled = async () => {
    setIsExportingCancelled(true);
    try {
      const selected = bookings.filter((b) =>
        exportStatuses.includes(getBookingStatusCategory(b.bookingStatus)),
      );

      if (selected.length === 0) {
        toast({
          title: "Nothing to export",
          description: "No bookings match the selected status.",
        });
        return;
      }

      // The contact (WhatsApp) number lives on the reservation payment doc,
      // not on the booking. Build an email -> whatsAppNumber map from the
      // stripePayments collection (main booker + each guest).
      const whatsAppByEmail = new Map<string, string>();
      try {
        const paymentsSnap = await getDocs(collection(db, "stripePayments"));
        paymentsSnap.forEach((docSnap) => {
          const p = docSnap.data() as any;
          const customerEmail = p?.customer?.email;
          const customerNumber = p?.customer?.whatsAppNumber;
          if (customerEmail && customerNumber && !whatsAppByEmail.has(customerEmail)) {
            whatsAppByEmail.set(String(customerEmail), String(customerNumber));
          }
          const guests: any[] = p?.booking?.guestDetails || [];
          guests.forEach((g) => {
            if (g?.email && g?.whatsAppNumber && !whatsAppByEmail.has(g.email)) {
              whatsAppByEmail.set(String(g.email), String(g.whatsAppNumber));
            }
          });
        });
      } catch (err) {
        console.error("Failed to load payments for contact numbers:", err);
        toast({
          title: "Contact numbers unavailable",
          description:
            "Could not load payments, so contact numbers will be blank.",
          variant: "destructive",
        });
      }

      const columns: CsvColumn<Booking>[] = [
        { header: "Email Address", value: (b) => b.emailAddress || "" },
        {
          header: "Contact Number",
          value: (b) => whatsAppByEmail.get(b.emailAddress) || "",
        },
        { header: "Full Name", value: (b) => b.fullName || "" },
        { header: "Booking Code", value: (b) => b.bookingCode || "" },
        { header: "Booking ID", value: (b) => b.bookingId || "" },
        { header: "Status", value: (b) => b.bookingStatus || "" },
        { header: "Tour Package", value: (b) => b.tourPackageName || "" },
        { header: "Tour Date", value: (b) => formatCsvDate(b.tourDate) },
        {
          header: "Reservation Date",
          value: (b) => formatCsvDate(b.reservationDate),
        },
        {
          header: "Reason for Cancellation",
          value: (b) => b.reasonForCancellation || "",
        },
        {
          header: "Cancellation Request Date",
          value: (b) => formatCsvDate(b.cancellationRequestDate),
        },
        {
          header: "Cancellation Scenario",
          value: (b) => b.cancellationScenario || "",
        },
        {
          header: "Original Tour Cost",
          value: (b) =>
            b.originalTourCost !== undefined ? b.originalTourCost : "",
        },
        {
          header: "Paid",
          value: (b) => (b.paid !== undefined ? b.paid : ""),
        },
        {
          header: "Remaining Balance",
          value: (b) =>
            b.remainingBalance !== undefined ? b.remainingBalance : "",
        },
        {
          header: "Refundable Amount",
          value: (b) =>
            b.refundableAmount !== undefined ? b.refundableAmount : "",
        },
        {
          header: "Travel Credit Issued",
          value: (b) =>
            b.travelCreditIssued !== undefined ? b.travelCreditIssued : "",
        },
      ];

      const csv = toCsv(selected, columns);
      downloadCsv(`bookings-${csvDateStamp()}.csv`, csv);

      toast({
        title: "Export complete",
        description: `Exported ${selected.length} booking${
          selected.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export failed",
        description: "Could not export bookings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingCancelled(false);
    }
  };

  // Check if a booking is invalid (missing essential data)
  const isBookingInvalid = (booking: Booking): boolean => {
    // A booking is considered invalid if it's missing critical identifying information
    // Check if the booking has no meaningful data at all
    const hasNoBookingId =
      !booking.bookingId || booking.bookingId.trim() === "";
    const hasNoName = !booking.fullName || booking.fullName.trim() === "";
    const hasNoEmail =
      !booking.emailAddress || booking.emailAddress.trim() === "";
    const hasNoPackage =
      !booking.tourPackageName || booking.tourPackageName.trim() === "";

    // A booking is invalid if it's missing all three critical fields
    return hasNoBookingId || hasNoName || hasNoEmail || hasNoPackage;
  };

  // Handle booking deletion
  const handleDeleteBooking = async (bookingId: string) => {
    try {
      await bookingService.deleteBookingWithRowShift(bookingId);
      toast({
        title: "🗑️ Booking Deleted",
        description: "Booking deleted and subsequent rows shifted down",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to delete booking:", error);
      toast({
        title: "❌ Delete Failed",
        description: `Failed to delete booking: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    }
  };

  // Calculate statistics with validation - memoized to prevent unnecessary recalculations
  const statistics = useMemo(() => {
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(
      (b) => getBookingStatusCategory(b.bookingStatus) === "Confirmed",
    ).length;
    const pendingBookings = bookings.filter(
      (b) => getBookingStatusCategory(b.bookingStatus) === "Pending",
    ).length;
    const cancelledBookings = bookings.filter(
      (b) => getBookingStatusCategory(b.bookingStatus) === "Cancelled",
    ).length;
    const completedBookings = bookings.filter(
      (b) => getBookingStatusCategory(b.bookingStatus) === "Completed",
    ).length;

    return {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      completedBookings,
    };
  }, [bookings]);

  const {
    totalBookings,
    confirmedBookings,
    pendingBookings,
    cancelledBookings,
    completedBookings,
  } = statistics;

  useEffect(() => {
    let active = true;

    const loadFinancialMetrics = async () => {
      try {
        if (active) setIsReportMetricsLoading(true);
        const bounds = await financialReportsService.getDataBounds();
        const report = await financialReportsService.generateReport({
          preset: "all_time",
          startDate: bounds.startDate,
          endDate: bounds.endDate,
        });

        if (!active) return;
        setReportMetrics({
          netRevenue: report.metrics.totalNetRevenue,
          outstandingBalances: report.metrics.totalOverdueUnpaid,
          expectedRevenue: report.metrics.totalExpectedRevenue,
        });
      } catch (error) {
        console.error("Failed to load financial metrics for bookings:", error);
      } finally {
        if (active) setIsReportMetricsLoading(false);
      }
    };

    loadFinancialMetrics();

    return () => {
      active = false;
    };
  }, [bookings]);

  const getStatusBgColor = (booking: Booking) => {
    const category = getBookingStatusCategory(booking.bookingStatus);
    if (category === "Pending" && checkOverduePayments(booking).hasOverdue) {
      return "bg-orange-500/20";
    }
    switch (category) {
      case "Confirmed":
        return "bg-spring-green/20";
      case "Pending":
        return "bg-sunglow-yellow/20";
      case "Cancelled":
        return "bg-crimson-red/20";
      case "Completed":
        return "bg-blue-500/20";
      default:
        return "bg-gray-200";
    }
  };

  const getDisplayStatus = (booking: Booking): string => {
    const category = getBookingStatusCategory(booking.bookingStatus);
    if (category === "Pending" && checkOverduePayments(booking).hasOverdue) {
      return "Overdue";
    }
    return category;
  };

  const getBookingTypeBgColor = (type: string) => {
    switch (type) {
      case "Individual":
        return "bg-crimson-red/20";
      case "Group":
        return "bg-blue-500/20";
      default:
        return "bg-gray-200";
    }
  };

  const getPaymentPlanCode = (booking: Booking) => {
    // If paymentPlan exists, use it
    if (booking.paymentPlan) {
      return booking.paymentPlan.substring(0, 2).toUpperCase();
    }

    // Otherwise, extract from availablePaymentTerms
    if (booking.availablePaymentTerms) {
      const terms = booking.availablePaymentTerms.trim();
      // Get first 2 characters
      return terms.substring(0, 2).toUpperCase();
    }

    return null;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
  };

  // Get payment progress from the booking field
  const calculatePaymentProgress = (booking: Booking) => {
    // paymentProgress is stored as a string like "50%" from the function column
    const progressValue = booking.paymentProgress as any;
    
    if (typeof progressValue === 'string') {
      const progress = parseInt(progressValue.replace("%", "")) || 0;
      return Math.min(Math.max(progress, 0), 100);
    }
    
    if (typeof progressValue === 'number' && !isNaN(progressValue)) {
      return Math.min(Math.max(progressValue, 0), 100);
    }
    
    return 0;
  };

  // Check if booking has overdue payments
  const checkOverduePayments = (booking: Booking): { hasOverdue: boolean; message: string } => {
    // Don't show warnings for cancelled bookings
    if (booking.bookingStatus?.toLowerCase() === 'cancelled') {
      return { hasOverdue: false, message: "" };
    }

    const now = new Date();

    // Helper to check if a date is overdue
    const isOverdue = (dueDate: any): boolean => {
      if (!dueDate) return false;
      
      let date: Date | null = null;
      // Handle Firestore timestamps
      if (typeof dueDate === 'object' && dueDate?.toDate && typeof dueDate.toDate === 'function') {
        date = dueDate.toDate();
      } else if (dueDate instanceof Date) {
        date = dueDate;
      } else if (typeof dueDate === 'string') {
        date = new Date(dueDate);
      }
      
      if (!date || isNaN(date.getTime())) return false;
      return date < now;
    };

    // Helper to check if payment is made
    const isPaid = (datePaid: any): boolean => {
      if (!datePaid) return false;
      if (typeof datePaid === 'object' && datePaid?.toDate) return true;
      if (datePaid instanceof Date && !isNaN(datePaid.getTime())) return true;
      if (typeof datePaid === 'string' && datePaid.trim() !== '') return true;
      return false;
    };

    const paymentPlan = (booking.availablePaymentTerms || booking.paymentPlan || "").toUpperCase();

    // Check Full Payment
    if (paymentPlan.includes("FULL PAYMENT")) {
      if (isOverdue(booking.fullPaymentDueDate) && !isPaid(booking.fullPaymentDatePaid)) {
        return { hasOverdue: true, message: "Full payment is overdue" };
      }
    }

    // Check P1 - Check if the field exists rather than relying on plan string
    if (booking.p1DueDate) {
      if (isOverdue(booking.p1DueDate) && !isPaid(booking.p1DatePaid)) {
        return { hasOverdue: true, message: "P1 installment is overdue" };
      }
    }

    // Check P2
    if (booking.p2DueDate) {
      if (isOverdue(booking.p2DueDate) && !isPaid(booking.p2DatePaid)) {
        return { hasOverdue: true, message: "P2 installment is overdue" };
      }
    }

    // Check P3
    if (booking.p3DueDate) {
      if (isOverdue(booking.p3DueDate) && !isPaid(booking.p3DatePaid)) {
        return { hasOverdue: true, message: "P3 installment is overdue" };
      }
    }

    // Check P4
    if (booking.p4DueDate) {
      if (isOverdue(booking.p4DueDate) && !isPaid(booking.p4DatePaid)) {
        return { hasOverdue: true, message: "P4 installment is overdue" };
      }
    }

    // Check if the final 2-month balance deadline has passed and booking isn't fully paid
    const progress = calculatePaymentProgress(booking);
    if (progress < 100) {
      const finalDeadline = getFinalBalanceDeadline(booking);
      if (finalDeadline && finalDeadline.date < now) {
        return { hasOverdue: true, message: `Full balance was due by ${finalDeadline.label} (2 months before tour)` };
      }
    }

    return { hasOverdue: false, message: "" };
  };

  // Compute the final balance deadline (tourDate - 2 calendar months).
  // Returns a { date, label } object or null if tourDate cannot be resolved.
  const getFinalBalanceDeadline = (booking: Booking): { date: Date; label: string } | null => {
    const raw: any = booking.tourDate;
    if (!raw) return null;

    let d: Date | null = null;
    if (typeof raw.toDate === "function") d = raw.toDate();
    else if (raw._seconds) d = new Date(raw._seconds * 1000);
    else if (raw.seconds) d = new Date(raw.seconds * 1000);
    else if (raw instanceof Date) d = raw;

    if (!d || isNaN(d.getTime())) return null;

    const deadline = new Date(d.getFullYear(), d.getMonth() - 2, d.getDate());
    const label = deadline.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return { date: deadline, label };
  };

  // Get active filters count
  const getActiveFiltersCount = () => {
    let count = 0;
    count += Object.keys(columnFilters).length;
    count += Object.keys(dateRangeFilters).length;
    count += Object.keys(currencyRangeFilters).length;
    // Count advanced filters that have a column selected
    count += activeFilters.filter((f) => f.columnId).length;
    return count;
  };

  // Clear specific column filter
  const clearColumnFilter = (columnId: string) => {
    setColumnFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnId];
      return newFilters;
    });
    setDateRangeFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnId];
      return newFilters;
    });
    setCurrencyRangeFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnId];
      return newFilters;
    });
  };

  // Clear specific column filter (temp state for modal)
  const clearTempColumnFilter = (columnId: string) => {
    setTempColumnFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnId];
      return newFilters;
    });
    setTempDateRangeFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnId];
      return newFilters;
    });
    setTempCurrencyRangeFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnId];
      return newFilters;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({});
    setDateRangeFilters({});
    setCurrencyRangeFilters({});
  };

  // Clear all temp filters (for modal)
  const clearAllTempFilters = () => {
    setTempColumnFilters({});
    setTempDateRangeFilters({});
    setTempCurrencyRangeFilters({});
  };

  // Get active temp filters count (for modal display)
  const getTempActiveFiltersCount = () => {
    let count = 0;
    count += Object.keys(tempColumnFilters).length;
    count += Object.keys(tempDateRangeFilters).length;
    count += Object.keys(tempCurrencyRangeFilters).length;
    // Count advanced filters that have a column selected
    count += tempFilters.filter((f) => f.columnId).length;
    return count;
  };

  // Handle booking card click
  const handleBookingClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsDetailModalOpen(true);

    // Add booking ID to URL
    const params = new URLSearchParams(searchParams?.toString?.() ?? "");
    params.set("bookingId", booking.id);
    router.push(`/bookings?${params.toString()}`, { scroll: false });
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedBooking(null);

    // Remove booking ID from URL
    const params = new URLSearchParams(searchParams?.toString?.() ?? "");
    params.delete("bookingId");
    params.delete("action");
    params.delete("mode");
    router.push(`/bookings?${params.toString()}`, { scroll: false });
  };

  // Handle booking update
  const handleBookingUpdate = (updatedBooking: Booking) => {
    // Update the booking in the local bookings array
    setBookings((prevBookings) =>
      prevBookings.map((booking) =>
        booking.id === updatedBooking.id ? updatedBooking : booking,
      ),
    );

    // Update the selected booking as well
    setSelectedBooking(updatedBooking);
  };

  // Handle new booking creation
  const handleBookingCreate = (newBookingData: Partial<Booking>) => {
    // Close the modal - the Firebase listener will automatically add the booking
    // in the correct sorted position when AddBookingModal saves it to Firebase
    setIsAddModalOpen(false);

    console.log(
      "✅ [BOOKINGS SECTION] New booking created, Firebase will handle updates:",
      newBookingData,
    );

    // Scroll to the bottom after the booking is added
    // Use setTimeout to ensure the DOM is updated with the new booking before scrolling
    setTimeout(() => {
      if (bookingsContainerRef.current) {
        bookingsContainerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    }, 500); // Wait for Firebase to update the bookings list
  };

  // Get column label from column ID
  const humanizeColumnId = (columnId: string) =>
    columnId
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const getColumnLabel = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    return column?.columnName || humanizeColumnId(columnId);
  };

  // Get sample preview value for a column
  const getSamplePreviewValue = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    if (!column) return "Sample Data";

    // Return appropriate sample based on data type
    if (column.dataType === "date") return "Jan 15, 2024";
    if (column.dataType === "currency") return "£1,250";
    if (column.dataType === "boolean") return "Yes";
    if (columnId === "bookingId") return "BOOK-001";
    if (columnId === "emailAddress") return "traveler@example.com";
    if (columnId === "fullName") return "John Doe";
    if (columnId === "tourPackageName") return "Europe Adventure";
    if (columnId.toLowerCase().includes("phone")) return "+1 234 567 8900";
    if (columnId.toLowerCase().includes("code")) return "ABC123";

    return `<${column.columnName}>`;
  };

  // Get icon component for a column
  const getFieldIcon = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    if (!column) return MdTextFields;

    // Return appropriate icon based on column type and name
    if (column.dataType === "date") return FaCalendarAlt;
    if (column.dataType === "currency") return FaEuroSign;
    if (column.dataType === "boolean") return BsPersonCheck;

    // Specific field icons
    if (
      columnId === "tourPackageName" ||
      columnId.toLowerCase().includes("tour")
    )
      return FaMapMarkerAlt;
    if (columnId === "fullName" || columnId.toLowerCase().includes("name"))
      return FaUser;
    if (columnId === "emailAddress" || columnId.toLowerCase().includes("email"))
      return MdEmail;
    if (columnId.toLowerCase().includes("phone")) return FaPhone;
    if (
      columnId.toLowerCase().includes("id") ||
      columnId.toLowerCase().includes("code")
    )
      return FaHashtag;
    if (columnId === "reservationDate") return BsCalendarEvent;
    if (columnId === "tourDate") return FaPlane;

    // Default icon for unknown fields
    return MdTextFields;
  };

  // Handle field selection (updates preview only)
  const handleFieldSelect = (fieldKey: string, columnId: string) => {
    setTempCardFieldMappings((prev) => ({
      ...prev,
      [fieldKey]: columnId,
    }));
    setFieldSelectorOpen(null);
  };

  // Apply card field changes
  const handleApplyCardChanges = () => {
    setCardFieldMappings(tempCardFieldMappings);
    setShowFilters(false);
  };

  // Apply all changes (both filters and card mappings)
  const handleApplyAllChanges = () => {
    // Apply filter changes
    setColumnFilters(tempColumnFilters);
    setDateRangeFilters(tempDateRangeFilters);
    setCurrencyRangeFilters(tempCurrencyRangeFilters);
    setActiveFilters(tempFilters);

    // Apply card field changes
    setCardFieldMappings(tempCardFieldMappings);

    // Close modal
    setShowFilters(false);
  };

  // Reset temp mappings and filters when opening filter dialog
  useEffect(() => {
    if (showFilters) {
      setTempCardFieldMappings(cardFieldMappings);
      setTempColumnFilters(columnFilters);
      setTempDateRangeFilters(dateRangeFilters);
      setTempCurrencyRangeFilters(currencyRangeFilters);
      setTempFilters(activeFilters);
    }
  }, [
    showFilters,
    cardFieldMappings,
    columnFilters,
    dateRangeFilters,
    currencyRangeFilters,
    activeFilters,
  ]);

  // Get field value from booking based on column ID
  const getFieldValue = (booking: Booking, columnId: string) => {
    const value = (booking as any)[columnId];
    const column = columns.find((col) => col.id === columnId);

    if (value === null || value === undefined) return "N/A";

    // Date-like fields should always format cleanly, even before column metadata loads.
    const isLikelyDateField =
      columnId === "tourDate" ||
      columnId === "reservationDate" ||
      columnId === "returnDate" ||
      column?.dataType === "date";
    const isTimestampLike =
      value &&
      typeof value === "object" &&
      (typeof (value as any).toDate === "function" ||
        typeof (value as any).seconds === "number" ||
        typeof (value as any)._seconds === "number");

    if (isLikelyDateField || isTimestampLike) {
      return safeDate(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    if (column?.dataType === "currency") {
      return formatCurrency(safeNumber(value, 0));
    }

    if (column?.dataType === "boolean") {
      return value ? "Yes" : "No";
    }

    return String(value);
  };

  // Scroll functions
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  };

  // Filter bookings based on search and filters
  const searchResults = useMemo(() => {
    if (!fuse || searchTerm === "") {
      return bookings;
    }
    // Special case: searching for 'Invalid Booking' in main search
    if (searchTerm.trim().toLowerCase() === "invalid booking") {
      return bookings.filter(isBookingInvalid);
    }
    const results = fuse.search(searchTerm);
    return results.map((result) => result.item);
  }, [fuse, searchTerm, bookings]);

  const filteredBookings = searchResults.filter((booking) => {
    // matchesSearch is now handled by Fuse.js above
    const matchesSearch = true;

    // If new activeFilters exist, use them. Otherwise fall back to legacy per-column temp states
    if (activeFilters.length > 0) {
      const satisfiesAll = activeFilters.every((f) => {
        if (!f.columnId) return true;
        const col = columns.find((c) => c.id === f.columnId);
        if (!col) return true;
        const rawValue = (booking as any)[f.columnId];
        const effectiveType =
          col.dataType === "function"
            ? f.dataTypeOverride || "string"
            : col.dataType;

        // Special case: searching for 'Invalid Booking' in bookingId column
        if (
          f.columnId === "bookingId" &&
          String(f.value).toLowerCase().includes("invalid booking")
        ) {
          return isBookingInvalid(booking);
        }

        // String-like
        if (effectiveType === "string" || effectiveType === "email") {
          const text = rawValue == null ? "" : String(rawValue);
          let haystack = text;
          let needle = f.value == null ? "" : String(f.value);
          const opts = f.matchOptions || {
            matchCase: false,
            matchWholeWord: false,
            useRegex: false,
          };
          if (!opts.matchCase) {
            haystack = haystack.toLowerCase();
            needle = needle.toLowerCase();
          }
          if (opts.useRegex) {
            try {
              const pattern = opts.matchWholeWord
                ? `(^|\b)(${needle})(\b|$)`
                : needle;
              const flags = opts.matchCase ? "" : "i";
              const re = new RegExp(pattern, flags);
              return re.test(text);
            } catch {
              return false;
            }
          }
          if (opts.matchWholeWord) {
            const re = new RegExp(
              `(^|\b)${needle}(\b|$)`,
              opts.matchCase ? "" : "i",
            );
            return re.test(text);
          }
          return haystack.includes(needle);
        }

        // Number/currency
        if (effectiveType === "number" || effectiveType === "currency") {
          if (f.operator === "null") return rawValue == null || rawValue === "";
          const num =
            typeof rawValue === "number"
              ? rawValue
              : parseFloat(String(rawValue || ""));
          if (Number.isNaN(num)) return false;
          switch (f.operator) {
            case "eq":
              return num === Number(f.value);
            case "gte":
              return num >= Number(f.value);
            case "gt":
              return num > Number(f.value);
            case "lte":
              return num <= Number(f.value);
            case "lt":
              return num < Number(f.value);
            case "between":
              return num >= Number(f.value) && num <= Number(f.value2);
            default:
              return true;
          }
        }

        // Date
        if (effectiveType === "date") {
          const v = rawValue;
          let d: Date | null = null;
          if (v && typeof v === "object" && (v as any).toDate)
            d = (v as any).toDate();
          else if (v instanceof Date) d = v;
          else if (typeof v === "number")
            d = new Date(v > 1000000000000 ? v : v * 1000);
          else if (typeof v === "string") d = new Date(v);
          if (!d || Number.isNaN(d.getTime())) return false;
          const from = f.value ? new Date(f.value) : undefined;
          const to = f.value2 ? new Date(f.value2) : undefined;
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        }

        // Boolean
        if (effectiveType === "boolean") {
          const boolVal = !!rawValue;
          return String(boolVal) === String(f.value);
        }

        // Select (multi OR)
        if (effectiveType === "select") {
          const values: string[] = Array.isArray(f.value)
            ? f.value
            : f.value
              ? [String(f.value)]
              : [];
          if (values.length === 0) return true;
          const cell = rawValue == null ? "" : String(rawValue);
          return values.includes(cell);
        }

        return true;
      });
      return matchesSearch && satisfiesAll;
    }

    // Legacy path (if no activeFilters yet): keep existing logic
    const matchesColumnFilters = columns.every((col) => {
      const columnKey = col.id;
      const cellValue = (booking as any)[columnKey];
      if (col.dataType === "date" && dateRangeFilters[columnKey]) {
        const { from, to } = dateRangeFilters[columnKey];
        if (!cellValue) return !from && !to;
        let date: Date | null = null;
        if (
          cellValue &&
          typeof cellValue === "object" &&
          "toDate" in cellValue
        ) {
          date = (cellValue as any).toDate();
        } else if (typeof cellValue === "number") {
          date = new Date(
            cellValue > 1000000000000 ? cellValue : cellValue * 1000,
          );
        } else if (typeof cellValue === "string") {
          date = new Date(cellValue);
        } else if (cellValue instanceof Date) {
          date = cellValue;
        }
        if (!date) return !from && !to;
        if (from && date < from) return false;
        if (to && date > to) return false;
      }
      if (col.dataType === "currency" && currencyRangeFilters[columnKey]) {
        const { min, max } = currencyRangeFilters[columnKey];
        const numericValue =
          typeof cellValue === "number"
            ? cellValue
            : parseFloat(cellValue?.toString() || "0") || 0;
        if (min !== undefined && numericValue < min) return false;
        if (max !== undefined && numericValue > max) return false;
      }
      if (columnFilters[columnKey]) {
        const filterValue = columnFilters[columnKey].toLowerCase();
        const cellString = cellValue?.toString().toLowerCase() || "";
        return cellString.includes(filterValue);
      }
      return true;
    });
    return matchesSearch && matchesColumnFilters;
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crimson-red mx-auto mb-4"></div>
            <p className="text-muted-foreground text-lg">Loading bookings...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gmail-style Loading Indicator for Creating Booking */}
      {isCreatingBooking && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-crimson-red text-white px-4 py-2 rounded-b-lg shadow-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span className="text-sm font-medium">Creating booking...</span>
          </div>
        </div>
      )}
      {/* Statistics Cards with Add Button */}
      <div className="w-full space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[1fr_1fr_auto] sm:gap-4">
        {/* Stats Cards Container - Full width on mobile, 50-50 on desktop */}
        <div className="grid grid-cols-2 gap-3 sm:contents">
          {/* Total Bookings */}
          <Card className="relative overflow-hidden border border-border hover:border-crimson-red transition-all duration-300 hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 pr-6">
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                    Total Bookings
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {totalBookings}
                  </p>
                  {/* Breakdown */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] sm:text-xs">
                    {confirmedBookings > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-spring-green"></div>
                        <p className="text-xs text-muted-foreground">
                          Confirmed:{" "}
                          <span className="text-spring-green font-bold">
                            {confirmedBookings}
                          </span>
                        </p>
                      </div>
                    )}
                    {pendingBookings > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-vivid-orange"></div>
                        <p className="text-xs text-muted-foreground">
                          Pending:{" "}
                          <span className="text-vivid-orange font-bold">
                            {pendingBookings}
                          </span>
                        </p>
                      </div>
                    )}
                    {completedBookings > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <p className="text-xs text-muted-foreground">
                          Completed:{" "}
                          <span className="text-blue-500 font-bold">
                            {completedBookings}
                          </span>
                        </p>
                      </div>
                    )}
                    {cancelledBookings > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-crimson-red"></div>
                        <p className="text-xs text-muted-foreground">
                          Cancelled:{" "}
                          <span className="text-crimson-red font-bold">
                            {cancelledBookings}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-full rounded-br-none">
                  <BsCalendar3 className="h-6 w-6 text-foreground" />
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 p-4 sm:hidden">
                <BsCalendar3 className="h-full w-full text-foreground opacity-80" />
              </div>
            </CardContent>
          </Card>

          {/* Net Revenue, Outstanding Balances & Expected Revenue */}
          <Card className="relative overflow-hidden border border-border hover:border-crimson-red transition-all duration-300 hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 pr-6">
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                    Net Revenue
                  </p>
                  {isReportMetricsLoading ? (
                    <Skeleton className="h-9 w-36" />
                  ) : (
                    <p className="text-2xl sm:text-3xl font-bold text-spring-green">
                      {formatCurrency(reportMetrics?.netRevenue ?? 0)}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-2 h-2 rounded-full bg-vivid-orange"></div>
                    <p className="text-xs text-muted-foreground">
                      Outstanding Balances:{" "}
                      {isReportMetricsLoading ? (
                        <span className="inline-block h-4 w-20 align-middle ml-1 rounded-md bg-muted animate-pulse" />
                      ) : (
                        <span className="text-vivid-orange font-bold">
                          {formatCurrency(
                            reportMetrics?.outstandingBalances ?? 0,
                          )}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-2 h-2 rounded-full bg-crimson-red"></div>
                    <p className="text-xs text-muted-foreground">
                      Expected Revenue:{" "}
                      {isReportMetricsLoading ? (
                        <span className="inline-block h-4 w-20 align-middle ml-1 rounded-md bg-muted animate-pulse" />
                      ) : (
                        <span className="text-crimson-red font-bold">
                          {formatCurrency(reportMetrics?.expectedRevenue ?? 0)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center justify-center p-4 bg-gradient-to-br from-crimson-red/20 to-crimson-red/10 rounded-full rounded-br-none">
                  <HiTrendingUp className="h-6 w-6 text-foreground" />
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br from-crimson-red/20 to-crimson-red/10 p-4 sm:hidden">
                <HiTrendingUp className="h-full w-full text-foreground opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile Quick Actions */}
        <div className="sm:hidden w-full">
          <div className="grid grid-cols-2 gap-2">

            {/* Add Booking Button - Mobile (Right) */}
            <button
              type="button"
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
                  const params = new URLSearchParams(
                    searchParams?.toString?.() ?? "",
                  );
                  params.set("bookingId", newBookingId);
                  params.delete("action");
                  router.push(`/bookings?${params.toString()}`, {
                    scroll: false,
                  });

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
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-3 text-[11px] text-foreground shadow-sm hover:border-crimson-red/40 hover:shadow-md transition-all duration-200"
            >
              <div className="bg-crimson-red mb-2 flex h-10 w-10 items-center justify-center rounded-full text-white">
                <FaPlus className="h-5 w-5" />
              </div>
              <span className="text-center leading-tight">Add Booking</span>
            </button>
          </div>
        </div>

        {/* Desktop Add Booking & Import Buttons */}
        <div className="hidden sm:flex items-center justify-center gap-3">
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
                const params = new URLSearchParams(
                  searchParams?.toString?.() ?? "",
                );
                params.set("bookingId", newBookingId);
                params.delete("action");
                router.push(`/bookings?${params.toString()}`, {
                  scroll: false,
                });

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
            className="group h-20 w-20 rounded-full rounded-br-none bg-crimson-red hover:bg-royal-purple text-white transition-all duration-300 hover:scale-105 shadow-lg relative"
            title="Add New Booking"
          >
            <FaPlus className="h-10 w-10 absolute group-hover:opacity-0 group-hover:scale-0 transition-all duration-300" />
            <span className="text-[9px] font-medium opacity-0 scale-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 whitespace-nowrap font-hk-grotesk">
              ADD BOOKING
            </span>
          </Button>
        </div>
      </div>

      {/* Search and Filters Section */}
      <Card
        data-filter-section
        className={`border border-border backdrop-blur-sm transition-all duration-300 ${
          isFilterSticky ? "shadow-[0_-12px_60px_0px_rgba(0,0,0,0.6)]" : ""
        }`}
        style={{ backgroundColor: "hsl(var(--card-surface))" }}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search across all fields ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border focus:border-crimson-red focus:ring-crimson-red/20"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Filters Button */}
            <Dialog open={showFilters} onOpenChange={setShowFilters}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-border hover:bg-crimson-red/10 hover:border-crimson-red hover:text-crimson-red px-3 sm:px-4"
                >
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {getActiveFiltersCount() > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 bg-crimson-red text-white"
                    >
                      {getActiveFiltersCount()}
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>

              {/* Version History Button */}
              <Button
                variant="outline"
                onClick={() => setIsVersionHistoryOpen(true)}
                className="flex items-center gap-2 border-border hover:bg-royal-purple/10 hover:border-royal-purple hover:text-royal-purple px-3 sm:px-4"
                title="Version History"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="hidden sm:inline">Version History</span>
              </Button>

              {/* Export Bookings Button with status settings */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 border-border hover:bg-crimson-red/10 hover:border-crimson-red hover:text-crimson-red px-3 sm:px-4"
                    title="Export bookings to CSV"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Export settings
                      </p>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() =>
                          setExportStatuses(
                            exportStatuses.length ===
                              BOOKING_STATUS_CATEGORIES.length
                              ? []
                              : [...BOOKING_STATUS_CATEGORIES],
                          )
                        }
                      >
                        {exportStatuses.length ===
                        BOOKING_STATUS_CATEGORIES.length
                          ? "Clear all"
                          : "Select all"}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Filter by status
                    </p>
                    <div className="space-y-2">
                      {BOOKING_STATUS_CATEGORIES.map((status) => (
                        <label
                          key={status}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={exportStatuses.includes(status)}
                            onCheckedChange={() => toggleExportStatus(status)}
                          />
                          <span>{status}</span>
                        </label>
                      ))}
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={handleExportCancelled}
                      disabled={
                        isExportingCancelled || exportStatuses.length === 0
                      }
                    >
                      <Download className="h-4 w-4" />
                      {isExportingCancelled ? "Exporting..." : "Export CSV"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="text-lg font-semibold text-foreground">
                      Advanced Filters & Card Customization
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                      {getTempActiveFiltersCount() > 0 && (
                        <>
                          <span className="text-sm text-muted-foreground">
                            {getTempActiveFiltersCount()} filter
                            {getTempActiveFiltersCount() !== 1 ? "s" : ""}{" "}
                            configured
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearAllTempFilters}
                            className="text-xs border-border hover:bg-crimson-red/10 hover:border-crimson-red hover:text-crimson-red"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Clear All
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTempColumnFilters({});
                          setTempDateRangeFilters({});
                          setTempCurrencyRangeFilters({});
                          setTempCardFieldMappings({
                            field1: "fullName",
                            field2: "tourPackageName",
                            field3_left: "reservationDate",
                            field3_right: "tourDate",
                            field4: "paid",
                          });
                        }}
                        className="text-xs border-crimson-red/30 text-crimson-red hover:bg-crimson-red/10 hover:border-crimson-red"
                      >
                        Reset to Default
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex flex-col lg:flex-row gap-6 pt-4">
                  {/* Left Side - Filters (70%) */}
                  <div className="flex-1 lg:w-[60%] space-y-6">
                    {/* Advanced Column Filters - Filter Builder */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-foreground">
                          Advanced Column Filters
                        </Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTempFilters((prev) => [
                              ...prev,
                              {
                                id: crypto.randomUUID(),
                                operator: "eq",
                                matchOptions: {
                                  matchCase: false,
                                  matchWholeWord: false,
                                  useRegex: false,
                                },
                              },
                            ])
                          }
                          className="text-xs"
                        >
                          <FaPlus className="h-3 w-3 mr-1" /> Create Filter
                        </Button>
                      </div>
                      <div className="h-96 overflow-y-auto border border-border rounded-lg p-4 bg-muted/20 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-crimson-red/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-crimson-red/40">
                        <div className="space-y-3">
                          {tempFilters.length === 0 && (
                            <Card
                              onClick={() =>
                                setTempFilters((prev) => [
                                  ...prev,
                                  {
                                    id: crypto.randomUUID(),
                                    operator: "eq",
                                    matchOptions: {
                                      matchCase: false,
                                      matchWholeWord: false,
                                      useRegex: false,
                                    },
                                  },
                                ])
                              }
                              className="border-2 border-dashed border-crimson-red/40 hover:border-crimson-red/60 hover:bg-gradient-to-br hover:from-crimson-red/5 hover:to-royal-purple/5 transition-all duration-300 cursor-pointer group shadow-sm hover:shadow-md"
                            >
                              <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
                                <div className="relative mb-6">
                                  <div className="absolute inset-0 bg-crimson-red/20 rounded-full blur-xl group-hover:bg-crimson-red/30 transition-colors"></div>
                                  <div className="relative p-4 bg-gradient-to-br from-crimson-red/20 to-royal-purple/20 rounded-full rounded-br-none group-hover:from-crimson-red/30 group-hover:to-royal-purple/30 transition-all duration-300">
                                    <Filter className="h-8 w-8 text-crimson-red group-hover:scale-110 transition-transform duration-300" />
                                  </div>
                                </div>
                                <h3 className="text-base font-bold text-foreground mb-2 group-hover:text-crimson-red transition-colors">
                                  Create Your First Filter
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-xs mb-4 leading-relaxed">
                                  Filter bookings by column values, dates,
                                  amounts, and more to find exactly what you
                                  need
                                </p>
                                <div className="flex items-center gap-2 text-xs text-crimson-red font-medium mt-2">
                                  <FaPlus className="h-3 w-3" />
                                  <span>Click to get started</span>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                          {tempFilters.map((f, idx) => {
                            const selectedColumn = columns.find(
                              (c) => c.id === f.columnId,
                            );
                            const effectiveType =
                              selectedColumn?.dataType === "function"
                                ? f.dataTypeOverride || "string"
                                : selectedColumn?.dataType;
                            return (
                              <Card
                                key={f.id}
                                className="group border border-border bg-background hover:border-crimson-red/50 hover:shadow-md transition-all duration-200 w-full"
                              >
                                <CardContent className="p-3 space-y-2">
                                  {/* Filter Header with Column Info */}
                                  <div className="flex items-start justify-between gap-3 pb-1.5 border-b border-border/50">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <div className="p-1.5 bg-crimson-red/10 rounded-lg group-hover:bg-crimson-red/20 transition-colors">
                                        <Filter className="h-4 w-4 text-crimson-red" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        {selectedColumn ? (
                                          <>
                                            <p className="text-sm font-semibold text-foreground truncate">
                                              {selectedColumn.columnName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {effectiveType === "string" ||
                                              effectiveType === "email"
                                                ? "Text filter"
                                                : effectiveType === "number" ||
                                                    effectiveType === "currency"
                                                  ? "Numeric filter"
                                                  : effectiveType === "date"
                                                    ? "Date filter"
                                                    : effectiveType ===
                                                        "boolean"
                                                      ? "Boolean filter"
                                                      : effectiveType ===
                                                          "select"
                                                        ? "Selection filter"
                                                        : "Filter"}
                                            </p>
                                          </>
                                        ) : (
                                          <>
                                            <p className="text-sm font-semibold text-muted-foreground">
                                              Select a column
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Choose a column to filter by
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 flex-shrink-0 hover:bg-crimson-red/10 hover:text-crimson-red transition-colors"
                                      onClick={() =>
                                        setTempFilters((prev) =>
                                          prev.filter((x) => x.id !== f.id),
                                        )
                                      }
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  {/* Filter Controls */}
                                  <div className="space-y-2 pt-1.5">
                                    {/* Column selector and Data Type in one row */}
                                    <div className="flex items-end gap-2 flex-wrap">
                                      <div className="flex-1 min-w-[200px] space-y-1.5">
                                        <Label className="text-xs font-medium text-muted-foreground">
                                          Column
                                        </Label>
                                        <Select
                                          value={f.columnId || ""}
                                          onValueChange={(val) =>
                                            setTempFilters((prev) => {
                                              const copy = [...prev];
                                              copy[idx] = {
                                                ...copy[idx],
                                                columnId: val,
                                              };
                                              return copy;
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-8 border-border hover:border-crimson-red/50 focus:border-crimson-red">
                                            <SelectValue placeholder="Select a column to filter" />
                                          </SelectTrigger>
                                          <SelectContent className="max-h-64">
                                            {columns.map((c) => (
                                              <SelectItem
                                                key={c.id}
                                                value={c.id}
                                              >
                                                {c.columnName}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {/* Function column data type override */}
                                      {selectedColumn?.dataType ===
                                        "function" && (
                                        <div className="w-[160px] space-y-1.5">
                                          <Label className="text-xs font-medium text-muted-foreground">
                                            Data Type
                                          </Label>
                                          <Select
                                            value={
                                              f.dataTypeOverride || "string"
                                            }
                                            onValueChange={(val) =>
                                              setTempFilters((prev) => {
                                                const copy = [...prev];
                                                copy[idx] = {
                                                  ...copy[idx],
                                                  dataTypeOverride: val as any,
                                                };
                                                return copy;
                                              })
                                            }
                                          >
                                            <SelectTrigger className="h-8 border-border hover:border-crimson-red/50 focus:border-crimson-red">
                                              <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {(
                                                [
                                                  "string",
                                                  "number",
                                                  "date",
                                                  "boolean",
                                                  "select",
                                                  "email",
                                                  "currency",
                                                ] as const
                                              ).map((t) => (
                                                <SelectItem key={t} value={t}>
                                                  {t}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}
                                    </div>

                                    {/* Dynamic input based on type */}
                                    {effectiveType === "string" ||
                                    effectiveType === "email" ? (
                                      <div className="space-y-1">
                                        <div className="flex items-end gap-2 flex-wrap">
                                          <div className="flex-1 min-w-[200px] space-y-1">
                                            <Label className="text-xs font-medium text-muted-foreground">
                                              Filter Value
                                            </Label>
                                            <Input
                                              className="h-8 border-border hover:border-crimson-red/50 focus:border-crimson-red"
                                              placeholder="Enter text to search for"
                                              defaultValue={f.value || ""}
                                              onBlur={(e) =>
                                                setTempFilters((prev) => {
                                                  const copy = [...prev];
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    value: e.target.value,
                                                  };
                                                  return copy;
                                                })
                                              }
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <Label className="text-xs font-medium text-muted-foreground">
                                              Match Options
                                            </Label>
                                            <div className="flex items-center gap-2">
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      type="button"
                                                      variant={
                                                        f.matchOptions
                                                          ?.matchCase
                                                          ? "default"
                                                          : "outline"
                                                      }
                                                      size="icon"
                                                      className="h-8 w-8 border-border hover:border-crimson-red/50"
                                                      onClick={() =>
                                                        setTempFilters(
                                                          (prev) => {
                                                            const copy = [
                                                              ...prev,
                                                            ];
                                                            const mo = copy[idx]
                                                              .matchOptions || {
                                                              matchCase: false,
                                                              matchWholeWord: false,
                                                              useRegex: false,
                                                            };
                                                            copy[idx] = {
                                                              ...copy[idx],
                                                              matchOptions: {
                                                                ...mo,
                                                                matchCase:
                                                                  !mo.matchCase,
                                                              },
                                                            };
                                                            return copy;
                                                          },
                                                        )
                                                      }
                                                    >
                                                      <MatchCaseIcon className="h-4 w-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>Match Case</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      type="button"
                                                      variant={
                                                        f.matchOptions
                                                          ?.matchWholeWord
                                                          ? "default"
                                                          : "outline"
                                                      }
                                                      size="icon"
                                                      className="h-8 w-8 border-border hover:border-crimson-red/50"
                                                      onClick={() =>
                                                        setTempFilters(
                                                          (prev) => {
                                                            const copy = [
                                                              ...prev,
                                                            ];
                                                            const mo = copy[idx]
                                                              .matchOptions || {
                                                              matchCase: false,
                                                              matchWholeWord: false,
                                                              useRegex: false,
                                                            };
                                                            copy[idx] = {
                                                              ...copy[idx],
                                                              matchOptions: {
                                                                ...mo,
                                                                matchWholeWord:
                                                                  !mo.matchWholeWord,
                                                              },
                                                            };
                                                            return copy;
                                                          },
                                                        )
                                                      }
                                                    >
                                                      <WholeWordIcon className="h-4 w-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>Match Whole Word</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      type="button"
                                                      variant={
                                                        f.matchOptions?.useRegex
                                                          ? "default"
                                                          : "outline"
                                                      }
                                                      size="icon"
                                                      className="h-8 w-8 border-border hover:border-crimson-red/50"
                                                      onClick={() =>
                                                        setTempFilters(
                                                          (prev) => {
                                                            const copy = [
                                                              ...prev,
                                                            ];
                                                            const mo = copy[idx]
                                                              .matchOptions || {
                                                              matchCase: false,
                                                              matchWholeWord: false,
                                                              useRegex: false,
                                                            };
                                                            copy[idx] = {
                                                              ...copy[idx],
                                                              matchOptions: {
                                                                ...mo,
                                                                useRegex:
                                                                  !mo.useRegex,
                                                              },
                                                            };
                                                            return copy;
                                                          },
                                                        )
                                                      }
                                                    >
                                                      <RegexIcon className="h-4 w-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>
                                                      Use Regular Expression
                                                    </p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : effectiveType === "number" ||
                                      effectiveType === "currency" ? (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Select
                                          value={f.operator || "eq"}
                                          onValueChange={(val) =>
                                            setTempFilters((prev) => {
                                              const copy = [...prev];
                                              copy[idx] = {
                                                ...copy[idx],
                                                operator: val as any,
                                              };
                                              return copy;
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-8 w-[150px] flex-shrink-0">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="eq">
                                              Equal to (=)
                                            </SelectItem>
                                            <SelectItem value="between">
                                              Between (&gt;= && &lt;=)
                                            </SelectItem>
                                            <SelectItem value="gte">
                                              Greater than or equal (&gt;=)
                                            </SelectItem>
                                            <SelectItem value="gt">
                                              Greater than (&gt;)
                                            </SelectItem>
                                            <SelectItem value="lte">
                                              Less than or equal (&lt;=)
                                            </SelectItem>
                                            <SelectItem value="lt">
                                              Less than (&lt;)
                                            </SelectItem>
                                            <SelectItem value="null">
                                              Is Null
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                        {f.operator === "between" ? (
                                          <>
                                            <Input
                                              type="number"
                                              className="h-8 w-[120px] flex-shrink-0"
                                              placeholder="Min"
                                              defaultValue={f.value ?? ""}
                                              onBlur={(e) =>
                                                setTempFilters((prev) => {
                                                  const copy = [...prev];
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    value: e.target.value,
                                                  };
                                                  return copy;
                                                })
                                              }
                                            />
                                            <Input
                                              type="number"
                                              className="h-8 w-[120px] flex-shrink-0"
                                              placeholder="Max"
                                              defaultValue={f.value2 ?? ""}
                                              onBlur={(e) =>
                                                setTempFilters((prev) => {
                                                  const copy = [...prev];
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    value2: e.target.value,
                                                  };
                                                  return copy;
                                                })
                                              }
                                            />
                                          </>
                                        ) : f.operator === "null" ? null : (
                                          <Input
                                            type="number"
                                            className="h-8 w-[160px] flex-shrink-0"
                                            placeholder="Value"
                                            defaultValue={f.value ?? ""}
                                            onBlur={(e) =>
                                              setTempFilters((prev) => {
                                                const copy = [...prev];
                                                copy[idx] = {
                                                  ...copy[idx],
                                                  value: e.target.value,
                                                };
                                                return copy;
                                              })
                                            }
                                          />
                                        )}
                                      </div>
                                    ) : effectiveType === "date" ? (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Input
                                          type="date"
                                          className="h-8 flex-shrink-0"
                                          value={
                                            f.value
                                              ? new Date(f.value)
                                                  .toISOString()
                                                  .split("T")[0]
                                              : ""
                                          }
                                          onChange={(e) =>
                                            setTempFilters((prev) => {
                                              const copy = [...prev];
                                              copy[idx] = {
                                                ...copy[idx],
                                                value: e.target.value
                                                  ? new Date(e.target.value)
                                                  : undefined,
                                              };
                                              return copy;
                                            })
                                          }
                                        />
                                        <Input
                                          type="date"
                                          className="h-8 flex-shrink-0"
                                          value={
                                            f.value2
                                              ? new Date(f.value2)
                                                  .toISOString()
                                                  .split("T")[0]
                                              : ""
                                          }
                                          onChange={(e) =>
                                            setTempFilters((prev) => {
                                              const copy = [...prev];
                                              copy[idx] = {
                                                ...copy[idx],
                                                value2: e.target.value
                                                  ? new Date(e.target.value)
                                                  : undefined,
                                              };
                                              return copy;
                                            })
                                          }
                                        />
                                      </div>
                                    ) : effectiveType === "select" ? (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 flex-shrink-0"
                                            onClick={() => {
                                              console.log(
                                                "📊 Selected column:",
                                                selectedColumn?.id,
                                              );
                                              console.log(
                                                "📊 All dynamicOptions:",
                                                dynamicOptions,
                                              );
                                              console.log(
                                                "📊 Options for this column:",
                                                dynamicOptions[
                                                  selectedColumn?.id || ""
                                                ] ||
                                                  selectedColumn?.options ||
                                                  [],
                                              );
                                            }}
                                          >
                                            {Array.isArray(f.value) &&
                                            f.value.length > 0
                                              ? `${f.value.length} selected`
                                              : "Select options"}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 p-2">
                                          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                                            {(() => {
                                              const options =
                                                dynamicOptions[
                                                  selectedColumn?.id || ""
                                                ] ||
                                                selectedColumn?.options ||
                                                [];

                                              if (options.length === 0) {
                                                return (
                                                  <div className="p-2 text-xs text-muted-foreground text-center">
                                                    No options available
                                                  </div>
                                                );
                                              }

                                              return options.map((opt) => {
                                                const selected =
                                                  Array.isArray(f.value) &&
                                                  f.value.includes(opt);
                                                return (
                                                  <div
                                                    key={opt}
                                                    className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer"
                                                    onClick={() =>
                                                      setTempFilters((prev) => {
                                                        const copy = [...prev];
                                                        const arr =
                                                          Array.isArray(
                                                            copy[idx].value,
                                                          )
                                                            ? [
                                                                ...(copy[idx]
                                                                  .value as string[]),
                                                              ]
                                                            : [];
                                                        const i =
                                                          arr.indexOf(opt);
                                                        if (i >= 0)
                                                          arr.splice(i, 1);
                                                        else arr.push(opt);
                                                        copy[idx] = {
                                                          ...copy[idx],
                                                          value: arr,
                                                        };
                                                        return copy;
                                                      })
                                                    }
                                                  >
                                                    <div
                                                      className={`h-4 w-4 border border-border rounded-sm ${
                                                        selected
                                                          ? "bg-crimson-red"
                                                          : "bg-background"
                                                      }`}
                                                    />
                                                    <span className="text-xs">
                                                      {opt || "(Empty)"}
                                                    </span>
                                                  </div>
                                                );
                                              });
                                            })()}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : (
                                      <Input
                                        className="h-8 w-[220px] flex-shrink-0"
                                        placeholder="Enter value"
                                        defaultValue={f.value || ""}
                                        onBlur={(e) =>
                                          setTempFilters((prev) => {
                                            const copy = [...prev];
                                            copy[idx] = {
                                              ...copy[idx],
                                              value: e.target.value,
                                            };
                                            return copy;
                                          })
                                        }
                                      />
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Side - Card Preview (30%) */}
                  <div className="lg:w-[40%] space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Card Preview
                    </h3>

                    {/* Scaled Card Preview */}
                    <div
                      className="transform scale-90 origin-top-left"
                      style={{ width: "111%", height: "auto" }}
                    >
                      <Card className="group border border-border overflow-hidden relative pointer-events-none">
                        {/* Row Number - Upper Left */}
                        <div className="absolute top-2 left-2 z-10">
                          <div className="bg-crimson-red/90 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded rounded-br-none shadow-sm">
                            1
                          </div>
                        </div>

                        {/* Card Header */}
                        <CardHeader className="p-3 pb-2 border-b border-border/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1 pl-8">
                                <Badge
                                  variant="outline"
                                  className="text-xs font-medium border-0 text-foreground px-1.5 py-0 rounded-full bg-spring-green/20"
                                >
                                  Confirmed
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-xs font-medium border-0 text-foreground px-1.5 py-0 rounded-full bg-blue-500/20"
                                >
                                  Group
                                </Badge>
                              </div>
                              <h3 className="font-bold text-lg text-foreground truncate font-mono">
                                BOOK-001
                              </h3>
                              <div className="text-xs flex items-center gap-1 mt-0.5 truncate text-muted-foreground">
                                <MdEmail className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">
                                  traveler@example.com
                                </span>
                              </div>
                            </div>
                            <div className="text-2xl bg-crimson-red/10 font-bold text-crimson-red font-mono px-2 py-1 rounded-full rounded-br-none">
                              P2
                            </div>
                          </div>
                        </CardHeader>

                        {/* Card Content */}
                        <CardContent className="p-3 pt-2 space-y-2 pointer-events-auto">
                          {/* Field 1 - Traveler */}
                          {(() => {
                            const IconComponent = getFieldIcon(
                              tempCardFieldMappings.field1,
                            );
                            return (
                              <Popover
                                open={fieldSelectorOpen === "field1"}
                                onOpenChange={(open) =>
                                  setFieldSelectorOpen(open ? "field1" : null)
                                }
                              >
                                <PopoverTrigger asChild>
                                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-crimson-red/10 cursor-pointer border-2 border-dashed border-transparent hover:border-crimson-red/50 transition-all">
                                    <IconComponent className="h-4 w-4 text-foreground flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] text-muted-foreground font-medium">
                                        {getColumnLabel(
                                          tempCardFieldMappings.field1,
                                        )}
                                      </p>
                                      <p className="text-sm font-semibold text-foreground truncate">
                                        {getSamplePreviewValue(
                                          tempCardFieldMappings.field1,
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-64 p-2"
                                  onWheel={(e) => e.stopPropagation()}
                                >
                                  <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-hide">
                                    <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
                                      Select Field
                                    </p>
                                    <p className="text-[10px] text-crimson-red font-medium px-2 py-0.5 bg-crimson-red/5 rounded mb-1">
                                      💡 Recommended: Full Name
                                    </p>
                                    {columns
                                      .filter(
                                        (col) =>
                                          !col.columnName
                                            .toLowerCase()
                                            .includes("delete"),
                                      )
                                      .map((col) => (
                                        <button
                                          key={col.id}
                                          onClick={() =>
                                            handleFieldSelect("field1", col.id)
                                          }
                                          className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors ${
                                            tempCardFieldMappings.field1 ===
                                            col.id
                                              ? "bg-crimson-red/10 font-semibold"
                                              : ""
                                          }`}
                                        >
                                          {col.columnName}
                                        </button>
                                      ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })()}

                          {/* Field 2 - Tour Package */}
                          {(() => {
                            const IconComponent = getFieldIcon(
                              tempCardFieldMappings.field2,
                            );
                            return (
                              <Popover
                                open={fieldSelectorOpen === "field2"}
                                onOpenChange={(open) =>
                                  setFieldSelectorOpen(open ? "field2" : null)
                                }
                              >
                                <PopoverTrigger asChild>
                                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-crimson-red/10 cursor-pointer border-2 border-dashed border-transparent hover:border-crimson-red/50 transition-all">
                                    <IconComponent className="h-4 w-4 text-foreground flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] text-muted-foreground font-medium">
                                        {getColumnLabel(
                                          tempCardFieldMappings.field2,
                                        )}
                                      </p>
                                      <p className="text-sm font-semibold text-foreground truncate">
                                        {getSamplePreviewValue(
                                          tempCardFieldMappings.field2,
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-64 p-2"
                                  onWheel={(e) => e.stopPropagation()}
                                >
                                  <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-hide">
                                    <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
                                      Select Field
                                    </p>
                                    <p className="text-[10px] text-crimson-red font-medium px-2 py-0.5 bg-crimson-red/5 rounded mb-1">
                                      💡 Recommended: Tour Package Name
                                    </p>
                                    {columns
                                      .filter(
                                        (col) =>
                                          !col.columnName
                                            .toLowerCase()
                                            .includes("delete"),
                                      )
                                      .map((col) => (
                                        <button
                                          key={col.id}
                                          onClick={() =>
                                            handleFieldSelect("field2", col.id)
                                          }
                                          className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors ${
                                            tempCardFieldMappings.field2 ===
                                            col.id
                                              ? "bg-crimson-red/10 font-semibold"
                                              : ""
                                          }`}
                                        >
                                          {col.columnName}
                                        </button>
                                      ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })()}

                          {/* Field 3 - Dates (Grid with two fields) */}
                          <div className="grid grid-cols-2 gap-2">
                            {(() => {
                              const IconComponentLeft = getFieldIcon(
                                tempCardFieldMappings.field3_left,
                              );
                              return (
                                <Popover
                                  open={fieldSelectorOpen === "field3_left"}
                                  onOpenChange={(open) =>
                                    setFieldSelectorOpen(
                                      open ? "field3_left" : null,
                                    )
                                  }
                                >
                                  <PopoverTrigger asChild>
                                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-crimson-red/10 cursor-pointer border-2 border-dashed border-transparent hover:border-crimson-red/50 transition-all">
                                      <IconComponentLeft className="h-4 w-4 text-foreground flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-muted-foreground font-medium">
                                          {getColumnLabel(
                                            tempCardFieldMappings.field3_left,
                                          )}
                                        </p>
                                        <p className="text-xs font-semibold text-foreground">
                                          {getSamplePreviewValue(
                                            tempCardFieldMappings.field3_left,
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-64 p-2"
                                    onWheel={(e) => e.stopPropagation()}
                                  >
                                    <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-hide">
                                      <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
                                        Select Field
                                      </p>
                                      <p className="text-[10px] text-crimson-red font-medium px-2 py-0.5 bg-crimson-red/5 rounded mb-1">
                                        💡 Recommended: Reservation Date
                                      </p>
                                      {columns
                                        .filter(
                                          (col) =>
                                            !col.columnName
                                              .toLowerCase()
                                              .includes("delete"),
                                        )
                                        .map((col) => (
                                          <button
                                            key={col.id}
                                            onClick={() =>
                                              handleFieldSelect(
                                                "field3_left",
                                                col.id,
                                              )
                                            }
                                            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors ${
                                              tempCardFieldMappings.field3_left ===
                                              col.id
                                                ? "bg-crimson-red/10 font-semibold"
                                                : ""
                                            }`}
                                          >
                                            {col.columnName}
                                          </button>
                                        ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            })()}

                            {(() => {
                              const IconComponentRight = getFieldIcon(
                                tempCardFieldMappings.field3_right,
                              );
                              return (
                                <Popover
                                  open={fieldSelectorOpen === "field3_right"}
                                  onOpenChange={(open) =>
                                    setFieldSelectorOpen(
                                      open ? "field3_right" : null,
                                    )
                                  }
                                >
                                  <PopoverTrigger asChild>
                                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-crimson-red/10 cursor-pointer border-2 border-dashed border-transparent hover:border-crimson-red/50 transition-all">
                                      <IconComponentRight className="h-4 w-4 text-foreground flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-muted-foreground font-medium">
                                          {getColumnLabel(
                                            tempCardFieldMappings.field3_right,
                                          )}
                                        </p>
                                        <p className="text-xs font-semibold text-foreground">
                                          {getSamplePreviewValue(
                                            tempCardFieldMappings.field3_right,
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-64 p-2"
                                    onWheel={(e) => e.stopPropagation()}
                                  >
                                    <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-hide">
                                      <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
                                        Select Field
                                      </p>
                                      <p className="text-[10px] text-crimson-red font-medium px-2 py-0.5 bg-crimson-red/5 rounded mb-1">
                                        💡 Recommended: Tour Date
                                      </p>
                                      {columns
                                        .filter(
                                          (col) =>
                                            !col.columnName
                                              .toLowerCase()
                                              .includes("delete"),
                                        )
                                        .map((col) => (
                                          <button
                                            key={col.id}
                                            onClick={() =>
                                              handleFieldSelect(
                                                "field3_right",
                                                col.id,
                                              )
                                            }
                                            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors ${
                                              tempCardFieldMappings.field3_right ===
                                              col.id
                                                ? "bg-crimson-red/10 font-semibold"
                                                : ""
                                            }`}
                                          >
                                            {col.columnName}
                                          </button>
                                        ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            })()}
                          </div>

                          {/* Field 4 - Payment (Non-interactive, always shows payment) */}
                          <div className="p-2.5 rounded-lg bg-muted/30 opacity-60">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <IoWallet className="h-4 w-4 text-foreground" />
                                <span className="text-xs font-semibold text-foreground">
                                  Payment Status
                                </span>
                              </div>
                              <span className="text-xs font-bold text-crimson-red">
                                50%
                              </span>
                            </div>
                            <div className="w-full bg-background/50 rounded-full h-2 mb-1.5 border border-border/30">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-crimson-red to-crimson-red/80"
                                style={{ width: "50%" }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground text-[10px]">
                                Fixed payment section
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>

                {/* Modal Footer with Apply Changes button */}
                <div className="flex items-center justify-end pt-4 border-t border-border mt-6">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowFilters(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleApplyAllChanges}
                      className="bg-crimson-red hover:bg-crimson-red/90 text-white"
                    >
                      Apply Changes
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* View Mode Toggle */}
            <div className="flex border border-border rounded-md bg-background shadow-sm">
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className={`rounded-r-none border-r border-border transition-colors ${
                  viewMode === "cards"
                    ? "bg-primary hover:bg-primary/90 text-white shadow shadow-primary/25"
                    : "hover:bg-crimson-red/10"
                }`}
                title="Card view"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className={`rounded-l-none transition-colors ${
                  viewMode === "list"
                    ? "bg-primary hover:bg-primary/90 text-white shadow shadow-primary/25"
                    : "hover:bg-crimson-red/10"
                }`}
                title="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bookings Display */}
      {filteredBookings.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No bookings found
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              No bookings match your search criteria. Try adjusting your
              filters.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("All");
                setTypeFilter("All");
              }}
              className="border-border hover:bg-crimson-red/10 hover:border-crimson-red hover:text-crimson-red"
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div
          ref={bookingsContainerRef}
          className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"
        >
          {filteredBookings
            .filter((booking) => booking.id && booking.id.trim() !== "") // Filter out bookings with empty IDs
            .map((booking) => {
              const isInvalid = isBookingInvalid(booking);
              const hasAutoTag = booking.tags?.includes("auto");
              return (
                <Card
                  key={booking.id}
                  onClick={() => handleBookingClick(booking)}
                  className={`group border transition-all duration-300 cursor-pointer overflow-hidden relative ${
                    isInvalid
                      ? "border-crimson-red bg-crimson-red/5 hover:border-crimson-red hover:bg-crimson-red/10"
                      : "border-border "
                  } ${
                    hasAutoTag
                      ? "border-t-4 border-t-green-500 hover:border-green-500/50"
                      : "border-t-4 border-t-red-500 hover:border-crimson-red/50"
                  }`}
                >
                  {/* Row Number - Upper Left */}
                  <div className="absolute top-2 left-2 z-10">
                    <div className="bg-crimson-red/90 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded rounded-br-none shadow-sm">
                      {booking.row || "-"}
                    </div>
                  </div>

                  {/* Delete Button - Center (only for invalid bookings) */}
                  {isInvalid && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="destructive"
                        className="h-20 w-20 rounded-full rounded-br-none bg-crimson-red hover:bg-crimson-red/90 text-white transition-all duration-300 hover:scale-105 shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBooking(booking.id);
                        }}
                        title="Delete invalid booking"
                      >
                        <Trash2 className="h-8 w-8" />
                      </Button>
                    </div>
                  )}

                  {/* Blur overlay for invalid bookings on hover */}
                  {isInvalid && (
                    <div className="absolute inset-0 bg-background/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-5" />
                  )}

                  {/* Card Header */}
                  <CardHeader className="p-2 sm:p-3 pb-1.5 sm:pb-2 border-b border-border/50">
                    <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1 pl-6 sm:pl-8">
                          <Badge
                            variant="outline"
                            className={`text-[8px] sm:text-xs font-medium border-0 text-foreground px-0.5 sm:px-1.5 py-0 rounded-full truncate max-w-[60px] sm:max-w-[80px] ${getStatusBgColor(
                              booking,
                            )}`}
                            title={booking.bookingStatus || "Pending"}
                          >
                            {getDisplayStatus(booking)}
                          </Badge>
                          {booking.bookingType !== "Individual" && (
                            <Badge
                              variant="outline"
                              className={`text-[8px] sm:text-xs font-medium border-0 text-foreground px-0.5 sm:px-1.5 py-0 rounded-full truncate max-w-[60px] sm:max-w-[80px] ${getBookingTypeBgColor(
                                booking.bookingType,
                              )}`}
                              title={booking.bookingType}
                            >
                              {booking.bookingType}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-xs sm:text-base text-foreground group-hover:text-crimson-red transition-colors truncate font-mono pt-1 sm:pt-1.5">
                            {booking.bookingId || "Invalid Booking"}
                          </h3>
                          {(() => {
                            const overdueStatus = checkOverduePayments(booking);
                            if (overdueStatus.hasOverdue) {
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex-shrink-0 pt-1 sm:pt-1.5">
                                        <svg
                                          className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{overdueStatus.message}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <CardDescription className="text-[8px] sm:text-[10px] flex items-center gap-1 mt-0.5 truncate">
                          <MdEmail className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0 text-foreground" />
                          <span className="truncate">
                            {booking.emailAddress}
                          </span>
                        </CardDescription>
                      </div>
                      {/* Payment Plan Code */}
                      {getPaymentPlanCode(booking) && (
                        <div className="text-base sm:text-xl bg-crimson-red/10 font-bold text-crimson-red font-mono px-1 sm:px-2 py-0.5 sm:py-1 rounded-full rounded-br-none">
                          {getPaymentPlanCode(booking)}
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  {/* Card Content */}
                  <CardContent className="p-2 sm:p-3 pt-1.5 sm:pt-2 space-y-1.5 sm:space-y-2">
                    {/* Field 1 - Dynamic */}
                    {(() => {
                      const IconComponent = getFieldIcon(
                        cardFieldMappings.field1,
                      );
                      return (
                        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <IconComponent className="h-3 w-3 sm:h-4 sm:w-4 text-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[7px] sm:text-[9px] text-muted-foreground font-medium">
                              {getColumnLabel(cardFieldMappings.field1)}
                            </p>
                            <p className="text-[8px] sm:text-xs font-semibold text-foreground truncate">
                              {getFieldValue(booking, cardFieldMappings.field1)}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Field 2 - Dynamic */}
                    {(() => {
                      const IconComponent = getFieldIcon(
                        cardFieldMappings.field2,
                      );
                      return (
                        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <IconComponent className="h-3 w-3 sm:h-4 sm:w-4 text-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[7px] sm:text-[9px] text-muted-foreground font-medium">
                              {getColumnLabel(cardFieldMappings.field2)}
                            </p>
                            <p className="text-[8px] sm:text-xs font-semibold text-foreground truncate">
                              {getFieldValue(booking, cardFieldMappings.field2)}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Fields 3 - Dynamic Dates */}
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      {(() => {
                        const IconComponentLeft = getFieldIcon(
                          cardFieldMappings.field3_left,
                        );
                        return (
                          <div className="flex items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <IconComponentLeft className="h-3 w-3 sm:h-4 sm:w-4 text-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[7px] sm:text-[9px] text-muted-foreground font-medium">
                                {getColumnLabel(cardFieldMappings.field3_left)}
                              </p>
                              <p className="text-[8px] sm:text-[10px] font-semibold text-foreground">
                                {getFieldValue(
                                  booking,
                                  cardFieldMappings.field3_left,
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const IconComponentRight = getFieldIcon(
                          cardFieldMappings.field3_right,
                        );
                        return (
                          <div className="flex items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <IconComponentRight className="h-3 w-3 sm:h-4 sm:w-4 text-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[7px] sm:text-[9px] text-muted-foreground font-medium">
                                {getColumnLabel(cardFieldMappings.field3_right)}
                              </p>
                              <p className="text-[8px] sm:text-[10px] font-semibold text-foreground">
                                {getFieldValue(
                                  booking,
                                  cardFieldMappings.field3_right,
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Field 4 - Dynamic Payment */}
                    <div className="p-1.5 sm:p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          <IoWallet className="h-3 w-3 sm:h-4 sm:w-4 text-foreground" />
                          <span className="text-[7px] sm:text-[10px] font-semibold text-foreground">
                            {getColumnLabel(cardFieldMappings.field4)}
                          </span>
                        </div>
                        <span
                          className={`text-[8px] sm:text-[10px] font-bold ${
                            calculatePaymentProgress(booking) === 100
                              ? "text-spring-green"
                              : "text-crimson-red"
                          }`}
                        >
                          {calculatePaymentProgress(booking)}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-background/50 rounded-full h-1.5 sm:h-2 mb-1 sm:mb-1.5 border border-border/30">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            calculatePaymentProgress(booking) === 100
                              ? "bg-gradient-to-r from-spring-green to-spring-green/80"
                              : "bg-gradient-to-r from-crimson-red to-crimson-red/80"
                          }`}
                          style={{
                            width: `${calculatePaymentProgress(booking)}%`,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[7px] sm:text-[10px]">
                        <div className="flex items-center gap-0.5 sm:gap-1">
                          <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-spring-green"></div>
                          <span className="text-muted-foreground">
                            Paid:{" "}
                            <span className="font-bold text-spring-green">
                              {formatCurrency(safeNumber(booking.paid, 0))}
                            </span>
                          </span>
                        </div>
                        {getTotalCost(booking) - safeNumber(booking.paid, 0) >
                          0 && (
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-crimson-red"></div>
                            <span className="text-muted-foreground">
                              Due:{" "}
                              <span className="font-bold text-crimson-red">
                                {formatCurrency(
                                  getTotalCost(booking) -
                                    safeNumber(booking.paid, 0),
                                )}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Final Balance Deadline */}
                    {(() => {
                      const deadline = getFinalBalanceDeadline(booking);
                      const isFullyPaid = calculatePaymentProgress(booking) === 100;
                      const isCancelled = booking.bookingStatus?.toLowerCase() === "cancelled";
                      if (!deadline || isFullyPaid || isCancelled) return null;

                      const now = new Date();
                      const daysUntil = Math.ceil(
                        (deadline.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                      );
                      const isOverdue = daysUntil < 0;
                      const isUrgent = daysUntil >= 0 && daysUntil <= 30;

                      return (
                        <div
                          className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg border ${
                            isOverdue
                              ? "bg-red-500/10 border-red-500/30"
                              : isUrgent
                                ? "bg-amber-500/10 border-amber-500/30"
                                : "bg-muted/30 border-border/30"
                          }`}
                        >
                          <svg
                            className={`h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 ${isOverdue ? "text-red-500" : isUrgent ? "text-amber-500" : "text-muted-foreground"}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-[7px] sm:text-[9px] text-muted-foreground font-medium">
                              Final Balance Deadline
                            </p>
                            <p
                              className={`text-[8px] sm:text-[10px] font-bold ${
                                isOverdue
                                  ? "text-red-500"
                                  : isUrgent
                                    ? "text-amber-500"
                                    : "text-foreground"
                              }`}
                            >
                              {deadline.label}
                              {isOverdue && " · Overdue"}
                              {isUrgent && !isOverdue && ` · ${daysUntil}d left`}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}

          {/* Add Booking Card */}
          <Card
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
                const params = new URLSearchParams(
                  searchParams?.toString?.() ?? "",
                );
                params.set("bookingId", newBookingId);
                params.delete("action");
                router.push(`/bookings?${params.toString()}`, {
                  scroll: false,
                });

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
            className="group border-2 border-dashed border-crimson-red/30 hover:border-crimson-red/50 hover:bg-crimson-red/5 transition-all duration-300 cursor-pointer overflow-hidden relative"
          >
            <CardHeader className="p-3 pb-2 border-b border-border/50">
              <div className="flex items-center justify-center">
                <div className="p-2 bg-crimson-red/10 rounded-full rounded-br-none">
                  <FaPlus className="h-5 w-5 text-crimson-red" />
                </div>
              </div>
              <h3 className="font-bold text-lg text-crimson-red text-center mt-2">
                Add New Booking
              </h3>
              <CardDescription className="text-xs text-center text-muted-foreground">
                Click to create a new booking
              </CardDescription>
            </CardHeader>

            <CardContent className="p-3 pt-2 space-y-2">
              <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-muted/30">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">
                    New Booking
                  </p>
                  <p className="text-sm font-semibold text-crimson-red">
                    Click to start
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-muted/30">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Status
                  </p>
                  <Badge
                    variant="outline"
                    className="text-xs font-medium border-crimson-red/30 text-crimson-red px-2 py-1 rounded-full"
                  >
                    New
                  </Badge>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-muted/30">
                <div className="flex items-center justify-center gap-1.5 mb-1.5">
                  <IoWallet className="h-4 w-4 text-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Payment
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-muted-foreground">
                    Will be calculated
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        // List View
        <Card ref={bookingsContainerRef} className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-muted/30">
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[40px] md:w-auto">
                      Row #
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[100px] md:min-w-[150px] md:w-auto">
                      Booking ID
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[130px] md:w-auto">
                      Email
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[90px] md:w-auto">
                      {getColumnLabel(cardFieldMappings.field1)}
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[90px] md:w-auto">
                      {getColumnLabel(cardFieldMappings.field2)}
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[80px] md:w-auto">
                      {getColumnLabel(cardFieldMappings.field3_left)}
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[80px] md:w-auto">
                      {getColumnLabel(cardFieldMappings.field3_right)}
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[70px] md:w-auto">
                      Booking Status
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[60px] md:w-auto">
                      Payment
                    </th>
                    <th className="text-left py-0.5 px-0.5 md:py-2 md:px-3 font-semibold text-foreground text-[7px] md:text-[10px] min-w-[50px] md:w-auto">
                      Plan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings
                    .filter((booking) => booking.id && booking.id.trim() !== "") // Filter out bookings with empty IDs
                    .map((booking) => {
                      const isInvalid = isBookingInvalid(booking);
                      const hasAutoTag = booking.tags?.includes("auto");
                      return (
                        <tr
                          key={booking.id}
                          onClick={() => handleBookingClick(booking)}
                          className={`group border-b transition-colors duration-200 cursor-pointer relative ${
                            isInvalid
                              ? "border-crimson-red bg-crimson-red/10 hover:bg-crimson-red/20"
                              : "border-border hover:bg-crimson-red/5"
                          } ${
                            hasAutoTag
                              ? "border-l-4 border-l-green-400"
                              : "border-l-4 border-l-red-400"
                          }`}
                        >
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            <span className="font-mono text-[7px] md:text-[10px] font-semibold text-crimson-red bg-crimson-red/10 px-0.5 py-0 md:px-1.5 md:py-0.5 rounded-full rounded-br-none">
                              {booking.row || "-"}
                            </span>
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            {(() => {
                              const overdueStatus = checkOverduePayments(booking);
                              return (
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[7px] md:text-[10px] font-semibold text-crimson-red truncate">
                                    {booking.bookingId || "Invalid Booking"}
                                  </span>
                                  {overdueStatus.hasOverdue && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex-shrink-0">
                                            <svg
                                              className="h-3 w-3 md:h-3.5 md:w-3.5 text-amber-500"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path
                                                fillRule="evenodd"
                                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                                clipRule="evenodd"
                                              />
                                            </svg>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{overdueStatus.message}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            <div className="flex items-center gap-0.5 md:gap-1">
                              <MdEmail className="h-2 w-2 md:h-2.5 md:w-2.5 text-foreground flex-shrink-0" />
                              <span className="text-[7px] md:text-[10px] text-foreground truncate">
                                {booking.emailAddress}
                              </span>
                            </div>
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            {(() => {
                              const IconComponent = getFieldIcon(
                                cardFieldMappings.field1,
                              );
                              const value = getFieldValue(
                                booking,
                                cardFieldMappings.field1,
                              );
                              return (
                                <div className="flex items-center gap-0.5 md:gap-1">
                                  <IconComponent className="h-2 w-2 md:h-2.5 md:w-2.5 text-foreground flex-shrink-0" />
                                  <span className="text-[7px] md:text-[10px] text-foreground truncate">
                                    {value}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            {(() => {
                              const IconComponent = getFieldIcon(
                                cardFieldMappings.field2,
                              );
                              const value = getFieldValue(
                                booking,
                                cardFieldMappings.field2,
                              );
                              return (
                                <div className="flex items-center gap-0.5 md:gap-1">
                                  <IconComponent className="h-2 w-2 md:h-2.5 md:w-2.5 text-foreground flex-shrink-0" />
                                  <span className="text-[7px] md:text-[10px] text-foreground truncate">
                                    {value}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            {(() => {
                              const IconComponent = getFieldIcon(
                                cardFieldMappings.field3_left,
                              );
                              const value = getFieldValue(
                                booking,
                                cardFieldMappings.field3_left,
                              );
                              return (
                                <div className="flex items-center gap-0.5 md:gap-1">
                                  <IconComponent className="h-2 w-2 md:h-2.5 md:w-2.5 text-foreground flex-shrink-0" />
                                  <span className="text-[7px] md:text-[10px] text-foreground">
                                    {value}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            {(() => {
                              const IconComponent = getFieldIcon(
                                cardFieldMappings.field3_right,
                              );
                              const value = getFieldValue(
                                booking,
                                cardFieldMappings.field3_right,
                              );
                              return (
                                <div className="flex items-center gap-0.5 md:gap-1">
                                  <IconComponent className="h-2 w-2 md:h-2.5 md:w-2.5 text-foreground flex-shrink-0" />
                                  <span className="text-[7px] md:text-[10px] text-foreground">
                                    {value}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            <Badge
                              variant="outline"
                              className={`text-[7px] md:text-[10px] font-medium border-0 text-foreground px-0.5 py-0 md:px-1 md:py-0 rounded-full truncate max-w-[80px] ${getStatusBgColor(
                                booking,
                              )}`}
                              title={booking.bookingStatus || "Pending"}
                            >
                              {getDisplayStatus(booking)}
                            </Badge>
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`text-[7px] md:text-[10px] font-bold ${
                                    calculatePaymentProgress(booking) === 100
                                      ? "text-spring-green"
                                      : "text-crimson-red"
                                  }`}
                                >
                                  {calculatePaymentProgress(booking)}%
                                </span>
                              </div>
                              <div className="w-10 md:w-20 bg-muted rounded-full h-0.5 md:h-1">
                                <div
                                  className={`h-full rounded-full ${
                                    calculatePaymentProgress(booking) === 100
                                      ? "bg-spring-green"
                                      : "bg-crimson-red"
                                  }`}
                                  style={{
                                    width: `${calculatePaymentProgress(
                                      booking,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-0.5 px-0.5 md:py-2 md:px-3 relative">
                            {getPaymentPlanCode(booking) && (
                              <div className="text-[7px] md:text-[10px] font-bold text-crimson-red font-mono bg-crimson-red/10 px-0.5 py-0 md:px-1.5 md:py-0.5 rounded-full rounded-br-none inline-block">
                                {getPaymentPlanCode(booking)}
                              </div>
                            )}
                            {/* Delete Button Overlay - shown on hover for invalid bookings */}
                            {isInvalid && (
                              <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto">
                                <Button
                                  variant="destructive"
                                  className="h-6 w-6 md:h-8 md:w-8 rounded-full rounded-br-none bg-crimson-red hover:bg-crimson-red/90 text-white transition-all duration-300 hover:scale-105 shadow-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteBooking(booking.id);
                                  }}
                                  title="Delete invalid booking"
                                >
                                  <Trash2 className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                  {/* Add Booking Row */}
                  <tr
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
                        const newBookingId = await bookingService.createBooking(
                          {},
                        );
                        const bookingData = {
                          id: newBookingId,
                          row: nextRowNumber,
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        } as any;
                        await bookingService.updateBooking(
                          newBookingId,
                          bookingData,
                        );

                        // Navigate with bookingId to open detail modal
                        const params = new URLSearchParams(
                          searchParams?.toString?.() ?? "",
                        );
                        params.set("bookingId", newBookingId);
                        params.delete("action");
                        router.push(`/bookings?${params.toString()}`, {
                          scroll: false,
                        });

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
                            error instanceof Error
                              ? error.message
                              : "Unknown error"
                          }`,
                          variant: "destructive",
                        });
                      }
                    }}
                    className="group border-b border-dashed border-crimson-red/30 hover:border-crimson-red/50 hover:bg-crimson-red/5 transition-all duration-300 cursor-pointer"
                  >
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <div className="flex items-center justify-center">
                        <div className="p-0.5 md:p-2 bg-crimson-red/10 rounded-full rounded-br-none">
                          <FaPlus className="h-2.5 w-2.5 md:h-4 md:w-4 text-crimson-red" />
                        </div>
                      </div>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-[10px] font-medium text-crimson-red">
                        Add New Booking
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        Click to create
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        New booking
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <Badge
                        variant="outline"
                        className="text-[7px] md:text-xs font-medium border-crimson-red/30 text-crimson-red px-1 py-0 md:px-2 md:py-1 rounded-full"
                      >
                        New
                      </Badge>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        -
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        -
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        -
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        -
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 md:py-4 md:px-3 text-center">
                      <span className="text-[7px] md:text-xs text-muted-foreground">
                        -
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedBooking && (
        <BookingDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleModalClose}
          booking={selectedBooking}
          onBookingUpdate={handleBookingUpdate}
          router={router}
          searchParams={searchParams}
        />
      )}
      <BookingVersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        columns={columns}
        currentUserId="current-user-id" // TODO: Replace with actual user ID from auth
        currentUserName="Current User" // TODO: Replace with actual user name from auth
        allBookingsData={bookings}
      />

      {/* Fixed Scroll Buttons - CSS-only visibility */}
      <Button
        onClick={scrollToTop}
        size="sm"
        className="fixed right-6 bottom-20 z-50 h-10 w-10 rounded-full bg-crimson-red hover:bg-crimson-red/90 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 scroll-to-top-btn"
        title="Scroll to top"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        onClick={scrollToBottom}
        size="sm"
        className="fixed right-6 bottom-6 z-50 h-10 w-10 rounded-full bg-crimson-red hover:bg-crimson-red/90 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 scroll-to-bottom-btn"
        title="Scroll to bottom"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
