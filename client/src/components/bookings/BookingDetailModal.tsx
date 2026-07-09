"use client";

import React, { useState, useEffect, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FaUser,
  FaMapMarkerAlt,
  FaPlane,
  FaPhone,
  FaCalendarAlt,
  FaWallet,
  FaPoundSign,
  FaClock,
  FaFileInvoice,
  FaHashtag,
  FaTag,
  FaCode,
  FaEye,
  FaEyeSlash,
  FaCopy,
  FaEdit,
  FaTrash,
  FaTimes,
} from "react-icons/fa";
import { MdEmail } from "react-icons/md";
import {
  BsCalendarEvent,
  BsPersonCheck,
  BsGrid3X3Gap,
  BsListUl,
} from "react-icons/bs";
import { HiTrendingUp } from "react-icons/hi";
import { ExternalLink, Copy } from "lucide-react";
import type { Booking } from "@/types/bookings";
import { SheetColumn } from "@/types/sheet-management";
import { allBookingSheetColumns } from "@/app/functions/columns";
import { functionMap } from "@/app/functions/columns/functions-index";
import { bookingService } from "@/services/booking-service";
import { getSchedulePolicy } from "@/lib/schedule-policy";
import { useToast } from "@/hooks/use-toast";
import EditBookingModal from "./EditBookingModal";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { debounce } from "lodash";

interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onBookingUpdate?: (updatedBooking: Booking) => void;
  router: ReturnType<typeof useRouter>;
  searchParams: ReadonlyURLSearchParams | null;
}

export default function BookingDetailModal({
  isOpen,
  onClose,
  booking,
  onBookingUpdate,
  router,
  searchParams,
}: BookingDetailModalProps) {
  const { toast } = useToast();
  const [columns, setColumns] = useState<SheetColumn[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(true);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time booking data state (similar to EditBookingModal)
  const [realtimeBooking, setRealtimeBooking] = useState<Booking | null>(null);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = React.useRef(false);

  // Stable reference to onBookingUpdate to avoid re-subscribing the listener
  const onBookingUpdateRef =
    React.useRef<(updated: Booking) => void | undefined>(onBookingUpdate);
  useEffect(() => {
    onBookingUpdateRef.current = onBookingUpdate;
  }, [onBookingUpdate]);

  // Use real-time booking data if available, otherwise fall back to prop
  const currentBooking = realtimeBooking || booking;

  // On first mount while open, initialize from URL once; later rely solely on local state
  const initializedEditFromUrlRef = React.useRef(false);
  useEffect(() => {
    if (!initializedEditFromUrlRef.current && isOpen && currentBooking) {
      initializedEditFromUrlRef.current = true;
      // If it's a new booking (minimal data) or mode is edit, open edit modal
      const isNewBooking =
        currentBooking &&
        Object.keys(currentBooking).length <= 4 && // Only has id, row, createdAt, updatedAt
        !currentBooking.fullName &&
        !currentBooking.emailAddress;

      // Alternative check: if bookingId field is missing or empty, it's likely a new booking
      const isNewBookingByField = currentBooking && !currentBooking.bookingId;

      console.log("🔍 [BOOKING DETAIL MODAL] Checking if new booking:", {
        booking: currentBooking,
        keysCount: currentBooking ? Object.keys(currentBooking).length : 0,
        hasFullName: currentBooking?.fullName,
        hasEmail: currentBooking?.emailAddress,
        hasBookingId: currentBooking?.bookingId,
        isNewBooking,
        isNewBookingByField,
        mode: searchParams?.get("mode"),
      });

      if (
        isNewBooking ||
        isNewBookingByField ||
        searchParams?.get("mode") === "edit"
      ) {
        console.log("🚀 [BOOKING DETAIL MODAL] Opening edit modal");
        setIsEditModalOpen(true);
      }
    }
  }, [isOpen, currentBooking, searchParams]);

  // Additional useEffect to check for new bookings when real-time data updates
  useEffect(() => {
    if (isOpen && realtimeBooking) {
      // If it's a new booking (minimal data) or mode is edit, open edit modal
      const isNewBooking =
        realtimeBooking &&
        Object.keys(realtimeBooking).length <= 4 && // Only has id, row, createdAt, updatedAt
        !realtimeBooking.fullName &&
        !realtimeBooking.emailAddress;

      // Alternative check: if bookingId field is missing or empty, it's likely a new booking
      const isNewBookingByField = realtimeBooking && !realtimeBooking.bookingId;

      console.log("🔍 [BOOKING DETAIL MODAL] Real-time booking check:", {
        booking: realtimeBooking,
        keysCount: realtimeBooking ? Object.keys(realtimeBooking).length : 0,
        hasFullName: realtimeBooking?.fullName,
        hasEmail: realtimeBooking?.emailAddress,
        hasBookingId: realtimeBooking?.bookingId,
        isNewBooking,
        isNewBookingByField,
        mode: searchParams?.get("mode"),
      });

      if (
        isNewBooking ||
        isNewBookingByField ||
        searchParams?.get("mode") === "edit"
      ) {
        console.log(
          "🚀 [BOOKING DETAIL MODAL] Opening edit modal from real-time data",
        );
        setIsEditModalOpen(true);
      }
    }
  }, [isOpen, realtimeBooking, searchParams]);

  // Real-time Firebase listener for booking updates (like EditBookingModal)
  useEffect(() => {
    if (!booking?.id || !isOpen) {
      setRealtimeBooking(booking);
      return;
    }

    console.log(
      "🔍 [BOOKING DETAIL MODAL] Setting up real-time booking listener for:",
      booking.id,
    );

    const unsubscribe = onSnapshot(
      doc(db, "bookings", booking.id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const updatedBooking = {
            id: docSnapshot.id,
            ...docSnapshot.data(),
          } as Booking;

          console.log(
            "📄 [BOOKING DETAIL MODAL] Real-time booking update received:",
            updatedBooking,
          );

          setRealtimeBooking(updatedBooking);

          // Call the onBookingUpdate callback if provided
          onBookingUpdateRef.current?.(updatedBooking);
        }
      },
      (error) => {
        console.error(
          "🚨 [BOOKING DETAIL MODAL] Real-time listener error:",
          error,
        );
        // Fallback to the original booking data on error
        setRealtimeBooking(booking);
      },
    );

    return () => {
      console.log(
        "🧹 [BOOKING DETAIL MODAL] Cleaning up real-time booking listener",
      );
      unsubscribe();
    };
  }, [booking?.id, isOpen]);

  // Load coded booking sheet columns
  useEffect(() => {
    if (!isOpen) return;

    console.log("🔍 [BOOKING DETAIL MODAL] Loading coded columns...");
    setIsLoadingColumns(true);

    // Convert BookingSheetColumn[] to SheetColumn[] and inject function implementations
    const codedColumns: SheetColumn[] = allBookingSheetColumns.map(
      (col): SheetColumn => {
        const columnData = col.data;

        // If this is a function column, inject the actual function implementation
        if (columnData.dataType === "function" && columnData.function) {
          const funcImpl = functionMap[columnData.function];
          if (funcImpl) {
            return {
              ...columnData,
              compiledFunction: funcImpl as (...args: any[]) => any,
            };
          } else {
            console.warn(
              `⚠️  Function ${columnData.function} not found in function map for column ${columnData.columnName}`,
            );
          }
        }

        return columnData;
      },
    );

    console.log(
      `✅ [BOOKING DETAIL MODAL] Loaded ${codedColumns.length} coded columns`,
    );
    setColumns(codedColumns);
    setIsLoadingColumns(false);
  }, [isOpen]);

  // Set first tab as active on load - must be unconditional and placed with other hooks
  useEffect(() => {
    if (!currentBooking || !isOpen) return;

    // Group columns by parentTab
    const groupedColumns = columns.reduce(
      (groups, column) => {
        const parentTab = column.parentTab || "General";
        if (!groups[parentTab]) {
          groups[parentTab] = [];
        }
        groups[parentTab].push(column);
        return groups;
      },
      {} as Record<string, SheetColumn[]>,
    );

    // Sort parentTabs by the order they first appear in the columns
    const sortedParentTabs = Object.keys(groupedColumns).sort((a, b) => {
      const aFirstOrder = Math.min(
        ...groupedColumns[a].map((col) => col.order ?? 999),
      );
      const bFirstOrder = Math.min(
        ...groupedColumns[b].map((col) => col.order ?? 999),
      );
      return aFirstOrder - bFirstOrder;
    });

    if (sortedParentTabs.length > 0 && !activeTab) {
      setActiveTab(sortedParentTabs[0]);
    }
  }, [isOpen, columns, currentBooking, activeTab]);

  // Debounced scroll handler for better performance
  const debouncedScrollHandler = React.useCallback(
    debounce(() => {
      // Handle any scroll-related updates here if needed
    }, 16), // ~60fps
    [],
  );

  // Track active section on scroll
  useEffect(() => {
    if (!isOpen || isLoadingColumns) return;

    const handleScroll = () => {
      // Skip if we're scrolling programmatically
      if (isScrollingProgrammatically.current) return;

      if (!scrollContainerRef.current) return;

      // Get all section elements
      const sections =
        scrollContainerRef.current.querySelectorAll('[id^="tab-"]');
      if (sections.length === 0) return;

      const container = scrollContainerRef.current;
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const containerRect = container.getBoundingClientRect();
      const headerHeight = 120; // Account for sticky header

      // Check if we're at the very bottom
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;

      // Check if we're at the very top
      const isAtTop = scrollTop < 10;

      let mostVisibleSection = "";
      let maxVisibleArea = 0;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();

        // If at the bottom, select the last section
        if (isAtBottom && index === sections.length - 1) {
          mostVisibleSection = section.id.replace("tab-", "");
          maxVisibleArea = 1000; // Force this to be selected
          return;
        }

        // If at the top, select the first section
        if (isAtTop && index === 0) {
          mostVisibleSection = section.id.replace("tab-", "");
          maxVisibleArea = 1000; // Force this to be selected
          return;
        }

        // Calculate visible area of the section relative to scroll container
        const visibleTop = Math.max(rect.top, containerRect.top + headerHeight);
        const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        if (visibleHeight > maxVisibleArea) {
          maxVisibleArea = visibleHeight;
          mostVisibleSection = section.id.replace("tab-", "");
        }
      });

      if (mostVisibleSection && mostVisibleSection !== activeTab) {
        setActiveTab(mostVisibleSection);
      }
    };

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll);
      // Also listen to wheel events for when at boundaries
      scrollContainer.addEventListener("wheel", handleScroll);

      // Initial check
      setTimeout(handleScroll, 100);

      return () => {
        scrollContainer.removeEventListener("scroll", handleScroll);
        scrollContainer.removeEventListener("wheel", handleScroll);
      };
    }
  }, [isOpen, isLoadingColumns, activeTab]);

  // Removed local state syncing to avoid flicker; using URL-derived state instead

  // Prevent rendering if modal is closed or no booking data
  if (!isOpen || !currentBooking) {
    return null;
  }

  // Safe date conversion for Firebase Timestamps
  const safeDate = (value: any): Date => {
    if (value instanceof Date) {
      return value;
    }

    if (
      value &&
      typeof value === "object" &&
      value.toDate &&
      typeof value.toDate === "function"
    ) {
      return value.toDate();
    }

    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      return isNaN(date.getTime()) ? new Date() : date;
    }

    return new Date();
  };

  // Safe number conversion with fallback
  const safeNumber = (value: any, fallback: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  };

  // Get total cost for a booking with validation
  const getTotalCost = (booking: Booking | null) => {
    if (!booking) return 0;

    const originalCost = Number(booking.originalTourCost) || 0;
    const discountedCost = Number(booking.discountedTourCost) || 0;

    if (discountedCost > 0) {
      return discountedCost;
    }
    return originalCost;
  };

  // Read payment progress from the stored paymentProgress column
  const calculatePaymentProgress = (booking: Booking | null) => {
    if (!booking) return 0;

    const stored = (booking as any).paymentProgress;
    if (stored !== undefined && stored !== null) {
      if (typeof stored === "string") {
        const parsed = parseFloat(stored.replace(/%/g, ""));
        if (!isNaN(parsed)) return Math.min(Math.max(Math.round(parsed), 0), 100);
      }
      if (typeof stored === "number" && !isNaN(stored)) {
        return Math.min(Math.max(Math.round(stored), 0), 100);
      }
    }

    return 0;
  };

  // Helper function to determine booking status category
  const getBookingStatusCategory = (
    status: string | null | undefined,
  ): string => {
    if (typeof status !== "string" || status.trim() === "") return "Pending";

    const statusLower = status.toLowerCase();
    if (statusLower.includes("confirmed")) return "Confirmed";
    if (statusLower.includes("cancelled")) return "Cancelled";
    if (statusLower.includes("installment")) return "Pending";
    if (statusLower.includes("completed")) return "Completed";

    return "Pending";
  };

  // Get payment plan code
  const getPaymentPlanCode = (booking: Booking | null) => {
    if (!booking) return null;

    if (booking.paymentPlan) {
      return booking.paymentPlan.substring(0, 2).toUpperCase();
    }

    if (booking.availablePaymentTerms) {
      const terms = booking.availablePaymentTerms.trim();
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

  const getStatusBgColor = (booking: Booking | null) => {
    if (!booking) return "bg-gray-100";

    const category = getBookingStatusCategory(booking.bookingStatus);
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

  const getBookingTypeBgColor = (type: string) => {
    switch (type) {
      case "Individual":
        return "bg-crimson-red/20";
      case "Group":
        return "bg-blue-500/20";
      default:
        return "bg-muted/20";
    }
  };

  const totalCost = getTotalCost(currentBooking);
  const paid = safeNumber(currentBooking?.paid, 0);
  const remaining = Math.max(0, totalCost - paid);
  const progress = calculatePaymentProgress(currentBooking);

  // Group columns by parentTab
  const groupedColumns = columns.reduce(
    (groups, column) => {
      const parentTab = column.parentTab || "General";
      if (!groups[parentTab]) {
        groups[parentTab] = [];
      }
      groups[parentTab].push(column);
      return groups;
    },
    {} as Record<string, SheetColumn[]>,
  );

  // Sort parentTabs by the order they first appear in the columns
  const sortedParentTabs = Object.keys(groupedColumns).sort((a, b) => {
    const aFirstOrder = Math.min(
      ...groupedColumns[a].map((col) => col.order ?? 999),
    );
    const bFirstOrder = Math.min(
      ...groupedColumns[b].map((col) => col.order ?? 999),
    );
    return aFirstOrder - bFirstOrder;
  });

  // Sort columns within each group by order
  sortedParentTabs.forEach((parentTab) => {
    groupedColumns[parentTab].sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999),
    );
  });

  // Scroll to a specific parent tab
  const scrollToTab = (parentTab: string) => {
    const element = document.getElementById(`tab-${parentTab}`);
    if (element) {
      // Set flag to prevent tracking during programmatic scroll
      isScrollingProgrammatically.current = true;
      setActiveTab(parentTab);

      element.scrollIntoView({ behavior: "smooth", block: "start" });

      // Re-enable tracking after scroll animation completes
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 1000); // Smooth scroll typically takes ~500-800ms
    }
  };

  // Copy email to clipboard
  const copyEmailToClipboard = async () => {
    if (currentBooking?.emailAddress) {
      try {
        await navigator.clipboard.writeText(currentBooking.emailAddress);
        // You could add a toast notification here if desired
      } catch (err) {
        console.error("Failed to copy email:", err);
      }
    }
  };

  // Handle booking deletion
  const handleDeleteBooking = async () => {
    if (!currentBooking?.id) return;

    try {
      setIsDeleting(true);
      await bookingService.deleteBookingWithRowShift(currentBooking.id);

      toast({
        title: "🗑️ Booking Deleted",
        description: "Booking deleted and subsequent rows shifted down",
        variant: "default",
      });

      // Close the modal after successful deletion
      onClose();
    } catch (error) {
      console.error("Failed to delete booking:", error);
      toast({
        title: "❌ Delete Failed",
        description: `Failed to delete booking: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Get icon for parent tab
  const getParentTabIcon = (parentTab: string) => {
    if (parentTab.includes("Identifier") || parentTab.includes("🆔"))
      return FaHashtag;
    if (parentTab.includes("Traveler") || parentTab.includes("👤"))
      return FaUser;
    if (parentTab.includes("Tour") || parentTab.includes("🗺️"))
      return FaMapMarkerAlt;
    if (parentTab.includes("Group") || parentTab.includes("👥")) return FaUser;
    if (parentTab.includes("Email") || parentTab.includes("📧")) return MdEmail;
    if (parentTab.includes("Payment") || parentTab.includes("💰"))
      return FaWallet;
    if (parentTab.includes("Cancellation") || parentTab.includes("❌"))
      return FaTag;
    return HiTrendingUp;
  };

  // Get value for a column from booking data
  const getColumnValue = (column: SheetColumn) => {
    if (!currentBooking) return null;

    const value = (currentBooking as any)[column.id];
    if (value === null || value === undefined) return null;

    // Special handling for tourDate - it's a select type but stores Timestamp
    if (column.id === "tourDate") {
      return safeDate(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    if (column.dataType === "date") {
      return safeDate(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    if (column.dataType === "currency") {
      return formatCurrency(safeNumber(value, 0));
    }

    if (column.dataType === "boolean") {
      return value ? "Yes" : "No";
    }

    // For discount rate, return the value as-is (function already formats it with 'off')
    if (column.id === "discountRate") {
      // If the value is a string (already formatted), return it
      if (typeof value === "string" && value.trim()) {
        return value;
      }
      // If numeric and > 0, format based on discount type
      const numValue = safeNumber(value, 0);
      if (numValue > 0) {
        const discountType = (currentBooking as any).discountType || "";
        if (discountType === "Flat amount") {
          return `£${numValue.toFixed(2)} off`;
        }
        return `${numValue.toFixed(2)}% off`;
      }
      // If 0 or empty and we have event name, the booking needs to be re-saved to recalculate
      if ((currentBooking as any).eventName) {
        return "Not calculated - Edit & Save to recalculate";
      }
      return null;
    }

    const stringValue = String(value).trim();
    return stringValue === "" ? null : stringValue;
  };

  // Memoized column value component for better performance
  const MemoizedColumnValue = memo(({ column }: { column: SheetColumn }) => {
    const value = getColumnValue(column);

    const isLikelyLink = (text: string) => {
      const trimmed = text.trim();
      return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed);
    };

    if (typeof value === "string" && isLikelyLink(value)) {
      const href = value.startsWith("http") ? value : `https://${value}`;

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      );
    }

    return <span>{value || "N/A"}</span>;
  });
  MemoizedColumnValue.displayName = "MemoizedColumnValue";

  // Check if column should be displayed (skip certain columns)
  const shouldDisplayColumn = (column: SheetColumn) => {
    // Skip columns that are not meant to be displayed in detail view
    if (column.columnName.toLowerCase().includes("delete")) return false;
    if (column.columnName.toLowerCase().includes("action")) return false;

    // If showEmptyFields is true, show all columns
    if (showEmptyFields) return true;

    // Skip if value is empty/null/undefined
    const value = getColumnValue(column);
    if (value === null || value === undefined) return false;

    return true;
  };

  // Check if a column is empty (for graying out)
  const isColumnEmpty = (column: SheetColumn) => {
    const value = getColumnValue(column);
    return value === null || value === undefined;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-5xl  bg-background p-0 rounded-xl overflow-hidden">
        {/* Loading Overlay */}
        {isDeleting && (
          <div className="absolute inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crimson-red"></div>
              <p className="text-lg font-semibold text-foreground">
                Deleting...
              </p>
            </div>
          </div>
        )}

        <DialogHeader className="sticky top-0 z-50 bg-background shadow-md border-b border-border/50 pb-2 sm:pb-3 pt-3 sm:pt-6 px-3 sm:px-6">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <DialogTitle className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-gradient-to-br from-crimson-red to-crimson-red/80 rounded-full rounded-br-none shadow-sm">
                <FaUser className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <span className="block text-xs sm:text-base">
                  Booking Details
                </span>
                <span className="text-base sm:text-2xl font-mono font-semibold text-crimson-red block">
                  {currentBooking?.bookingId || "Invalid Booking"}
                </span>
              </div>
            </DialogTitle>
            {/* X button for closing modal, always visible */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 sm:p-2 rounded-full hover:bg-muted focus:outline-none focus:ring-2 focus:ring-crimson-red flex-shrink-0"
            >
              {/* Use FaTimes or MdClose if available, fallback to × */}
              {typeof FaTimes !== "undefined" ? (
                <FaTimes className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
              ) : (
                <span className="text-xl sm:text-2xl">×</span>
              )}
            </button>
            {/* Only show controls if booking is valid */}
            {currentBooking?.bookingId && (
              <>
                {/* Mobile actions (icon-only) */}
                <div className="flex sm:hidden items-center gap-2">
                  <Button
                    variant={showEmptyFields ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setShowEmptyFields(!showEmptyFields)}
                    className="h-8 w-8 p-0"
                    title={
                      showEmptyFields
                        ? "Hide empty fields"
                        : "Show empty fields"
                    }
                  >
                    {showEmptyFields ? (
                      <FaEyeSlash className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FaEye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={() => setIsEditModalOpen(true)}
                    className="h-8 w-8 p-0 bg-crimson-red hover:bg-crimson-red/90 text-white shadow shadow-crimson-red/25"
                    title="Edit booking"
                  >
                    <FaEdit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="h-8 w-8 p-0 text-white shadow shadow-red-600/25"
                    title="Delete booking"
                  >
                    <FaTrash className="h-4 w-4" />
                  </Button>
                </div>

                {/* Desktop actions */}
                <div className="hidden sm:flex items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="flex border border-border rounded-md bg-background shadow-sm">
                    <Button
                      variant={viewMode === "card" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("card")}
                      className={`rounded-r-none border-r border-border transition-colors ${
                        viewMode === "card"
                          ? "bg-crimson-red hover:bg-crimson-red/90 text-white shadow shadow-crimson-red/25"
                          : "hover:bg-crimson-red/10"
                      }`}
                      title="Card view"
                    >
                      <BsGrid3X3Gap className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className={`rounded-l-none transition-colors ${
                        viewMode === "list"
                          ? "bg-crimson-red hover:bg-crimson-red/90 text-white shadow shadow-crimson-red/25"
                          : "hover:bg-crimson-red/10"
                      }`}
                      title="List view"
                    >
                      <BsListUl className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEmptyFields(!showEmptyFields)}
                    className="h-8 px-2 sm:px-3 hover:bg-muted flex items-center gap-2"
                    title={
                      showEmptyFields
                        ? "Hide empty fields"
                        : "Show empty fields"
                    }
                  >
                    {showEmptyFields ? (
                      <>
                        <FaEyeSlash className="h-4 w-4 text-muted-foreground" />
                        <span className="hidden sm:inline text-xs text-muted-foreground">
                          Hide empty fields
                        </span>
                      </>
                    ) : (
                      <>
                        <FaEye className="h-4 w-4 text-muted-foreground" />
                        <span className="hidden sm:inline text-xs text-muted-foreground">
                          Show empty fields
                        </span>
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setIsEditModalOpen(true);
                    }}
                    className="h-8 px-2 sm:px-4 bg-crimson-red hover:bg-crimson-red/90 text-white shadow shadow-crimson-red/25 flex items-center gap-2"
                    title="Edit booking"
                  >
                    <FaEdit className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs font-medium">
                      Edit
                    </span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="h-8 px-2 sm:px-4 bg-red-600 hover:bg-red-700 text-white shadow shadow-red-600/25 flex items-center gap-2"
                    title="Delete booking"
                  >
                    <FaTrash className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs font-medium">
                      Delete
                    </span>
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Only show email and row info if booking is valid */}
          {currentBooking?.bookingId && (
            <div className="mt-1.5 sm:mt-2 ml-10 sm:ml-[56px] space-y-0.5 sm:space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {currentBooking?.emailAddress}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 rounded-full hover:bg-background"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigator.clipboard.writeText(
                      `${process.env.NEXT_PUBLIC_WEBSITE_URL}/booking-status/${currentBooking.access_token}`,
                    );
                    toast({
                      title: "Link copied",
                      description: "Booking status URL copied to clipboard",
                    });
                  }}
                  title="Copy Link"
                >
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </Button>
                {/* Booking Status URL */}
                {currentBooking?.access_token && (
                  <div className="flex items-center gap-2 mt-1 p-1 bg-muted/50 rounded-md border border-border/50 max-w-fit">
                    <a
                      href={`${process.env.NEXT_PUBLIC_WEBSITE_URL}/booking-status/${currentBooking.access_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                      title="View Booking Status"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Booking Status{" "}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <div className="w-px h-3 bg-border mx-1"></div>
                  </div>
                )}
                <button
                  onClick={copyEmailToClipboard}
                  className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
                  title="Copy email"
                ></button>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Row #:{" "}
                <span className="font-mono font-semibold text-crimson-red">
                  {currentBooking?.row || "N/A"}
                </span>
              </p>
            </div>
          )}
        </DialogHeader>

        <div className="flex overflow-hidden max-h-[calc(90vh-120px)]">
          {/* Check if booking is invalid (no bookingId) */}
          {!currentBooking?.bookingId ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <Card className="max-w-md w-full bg-muted/10 border-none">
                <CardContent className="p-6 text-center">
                  <div className="mb-4">
                    <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                      <FaUser className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-red-800 mb-2">
                      Invalid Booking
                    </h3>
                    <p className="text-sm text-red-600 mb-4">
                      This booking appears to be incomplete or invalid. The
                      booking ID is missing.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setIsEditModalOpen(true)}
                      className="flex-1 bg-crimson-red hover:bg-crimson-red/90 text-white"
                    >
                      <FaEdit className="h-4 w-4 mr-2" />
                      Edit Booking
                    </Button>
                    <Button
                      onClick={() => setIsDeleteDialogOpen(true)}
                      variant="destructive"
                      className="flex-1"
                    >
                      <FaTrash className="h-4 w-4 mr-2" />
                      Delete Booking
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              {/* Main Content */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto h-[95%] pl-3 sm:pl-6 pb-3 sm:pb-6 pr-3 sm:pr-0 scrollbar-hide scroll-optimized"
              >
                <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-4">
                  {/* Summary Section */}
                  <div
                    id="tab-Summary"
                    className="scroll-mt-4 pb-3 sm:pb-4 mb-3 sm:mb-4 border-b-2 border-border/30"
                  >
                    <h2 className="text-sm sm:text-lg font-bold text-foreground flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-crimson-red/20 rounded-full rounded-br-none shadow-sm">
                        <HiTrendingUp className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-crimson-red" />
                      </div>
                      <span>Booking Summary</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      {/* Full Name */}
                      <div>
                        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                          Traveler
                        </p>
                        <p className="text-[13px] sm:text-base font-bold text-foreground">
                          {currentBooking?.fullName}
                        </p>
                      </div>

                      {/* Booking Type */}
                      <div>
                        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                          Type
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[11px] sm:text-sm font-medium border-0 text-foreground px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full rounded-br-none ${getBookingTypeBgColor(
                            currentBooking?.bookingType,
                          )}`}
                        >
                          {currentBooking?.bookingType}
                        </Badge>
                      </div>

                      {/* Tour Package */}
                      <div>
                        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                          Tour Package
                        </p>
                        <p className="text-[13px] sm:text-base font-bold text-foreground">
                          {currentBooking?.tourPackageName}
                        </p>
                      </div>

                      {/* Booking Status */}
                      {currentBooking?.bookingStatus && (
                        <div>
                          <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                            Status
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[11px] sm:text-sm font-medium border-0 text-foreground px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full rounded-br-none ${getStatusBgColor(
                              currentBooking,
                            )}`}
                          >
                            {getBookingStatusCategory(
                              currentBooking?.bookingStatus,
                            )}
                          </Badge>
                        </div>
                      )}

                      {/* Dates */}
                      <div>
                        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                          Dates
                        </p>
                        <div className="text-[11px] sm:text-sm space-y-1">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <BsCalendarEvent className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-crimson-red flex-shrink-0" />
                            <span className="font-bold">
                              {safeDate(
                                currentBooking?.reservationDate,
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <FaPlane className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-crimson-red flex-shrink-0" />
                            <span className="font-bold">
                              {safeDate(
                                currentBooking?.tourDate,
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Payment Plan */}
                      <div>
                        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                          Payment Plan
                        </p>
                        <p className="text-[13px] sm:text-base font-bold text-foreground">
                          {currentBooking?.paymentPlan ||
                            currentBooking?.availablePaymentTerms ||
                            "N/A"}
                        </p>
                      </div>

                      {/* Schedule Policy (derived from reservation date) */}
                      {(() => {
                        const policy = getSchedulePolicy(
                          currentBooking?.reservationDate,
                        );
                        if (!policy) return null;
                        return (
                          <div>
                            <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                              Schedule Policy
                            </p>
                            <Badge
                              variant="outline"
                              className={`text-[11px] sm:text-sm font-medium border px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full rounded-br-none ${
                                policy.key === "legacy"
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-gray-200 bg-gray-50 text-gray-600"
                              }`}
                              title={policy.description}
                            >
                              {policy.label}
                            </Badge>
                          </div>
                        );
                      })()}

                      {/* Plan Selected Date */}
                      {currentBooking?.selectedPlanAt && (
                        <div>
                          <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1 uppercase">
                            Plan Selected
                          </p>
                          <div className="text-[11px] sm:text-sm">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <FaClock className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-crimson-red flex-shrink-0" />
                              <span className="font-bold">
                                {safeDate(
                                  currentBooking?.selectedPlanAt,
                                ).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Payment Progress */}
                      <div className="col-span-1 sm:col-span-2">
                        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mb-1.5 sm:mb-2 uppercase">
                          Payment Progress
                        </p>
                        <div className="space-y-1.5 sm:space-y-2">
                          <div className="flex justify-between text-[11px] sm:text-sm">
                            <span className="text-spring-green font-bold">
                              Paid: {formatCurrency(paid)}
                            </span>
                            <span
                              className={`font-bold ${
                                progress === 100
                                  ? "text-spring-green"
                                  : "text-crimson-red"
                              }`}
                            >
                              {progress}%
                            </span>
                          </div>
                          <Progress
                            value={progress}
                            className={`h-2.5 ${
                              progress === 100
                                ? "[&>div]:bg-gradient-to-r [&>div]:from-spring-green [&>div]:to-spring-green/80"
                                : "[&>div]:bg-gradient-to-r [&>div]:from-crimson-red [&>div]:to-crimson-red/80"
                            }`}
                          />
                          {remaining > 0 && (
                            <p className="text-[10px] sm:text-sm text-crimson-red font-bold">
                              Due: {formatCurrency(remaining)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Columns by Parent Tab */}
                  {isLoadingColumns ? (
                    <Card className="bg-background shadow-sm">
                      <CardContent className="p-6 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-crimson-red mx-auto mb-2"></div>
                        <p className="text-xs text-muted-foreground">
                          Loading...
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    sortedParentTabs.map((parentTab) => {
                      const IconComponent = getParentTabIcon(parentTab);
                      const filteredColumns =
                        groupedColumns[parentTab].filter(shouldDisplayColumn);

                      if (filteredColumns.length === 0) return null;

                      return (
                        <Card
                          key={parentTab}
                          id={`tab-${parentTab}`}
                          className="bg-background shadow-sm border border-field-border scroll-mt-4"
                        >
                          <CardHeader className="py-2 sm:py-3 px-3 sm:px-4 bg-crimson-red/10 border-b border-crimson-red/20">
                            <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5 sm:gap-2">
                              <div className="p-0.5 sm:p-1 bg-crimson-red/10 rounded-full rounded-br-none">
                                <IconComponent className="h-3 w-3 sm:h-4 sm:w-4 text-crimson-red" />
                              </div>
                              {parentTab}
                            </CardTitle>
                          </CardHeader>
                          <CardContent
                            className={
                              viewMode === "card"
                                ? "pt-2 sm:pt-3 pb-2 sm:pb-3 px-2 sm:px-3"
                                : "p-0"
                            }
                          >
                            {viewMode === "card" ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                {filteredColumns.map((column) => {
                                  const isEmpty = isColumnEmpty(column);
                                  return (
                                    <div
                                      key={column.id}
                                      className={`flex items-start gap-2 p-2 rounded-lg border transition-all ${
                                        isEmpty
                                          ? "bg-muted/10 border-sunglow-yellow/50 opacity-50"
                                          : column.dataType === "function"
                                            ? "bg-sunglow-yellow/20 border-sunglow-yellow/30"
                                            : "bg-muted/20 border-field-border hover:shadow-sm hover:border-foreground/10"
                                      }`}
                                    >
                                      <div className="flex-shrink-0 mt-0.5">
                                        <div
                                          className={`p-1 rounded-full rounded-br-none ${
                                            column.dataType === "function"
                                              ? "bg-sunglow-yellow"
                                              : "bg-crimson-red/10"
                                          }`}
                                        >
                                          {column.dataType === "function" && (
                                            <FaCode className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />
                                          )}
                                          {column.dataType === "date" && (
                                            <FaCalendarAlt className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                          )}
                                          {column.dataType === "currency" && (
                                            <FaPoundSign className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                          )}
                                          {column.dataType === "boolean" && (
                                            <BsPersonCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                          )}
                                          {column.dataType === "string" &&
                                            column.columnName
                                              .toLowerCase()
                                              .includes("email") && (
                                              <MdEmail className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                            )}
                                          {column.dataType === "string" &&
                                            column.columnName
                                              .toLowerCase()
                                              .includes("name") && (
                                              <FaUser className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                            )}
                                          {![
                                            "date",
                                            "currency",
                                            "boolean",
                                            "function",
                                          ].includes(column.dataType) &&
                                            !column.columnName
                                              .toLowerCase()
                                              .includes("email") &&
                                            !column.columnName
                                              .toLowerCase()
                                              .includes("name") && (
                                              <FaTag className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                            )}
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wide">
                                          {column.columnName}
                                        </p>
                                        <div className="text-[11px] sm:text-xs font-semibold text-foreground break-words break-all whitespace-pre-wrap">
                                          <MemoizedColumnValue
                                            column={column}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="divide-y divide-field-border">
                                {filteredColumns.map((column) => {
                                  const isEmpty = isColumnEmpty(column);
                                  return (
                                    <div
                                      key={column.id}
                                      className={`flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 transition-colors ${
                                        isEmpty ? "opacity-50" : ""
                                      } ${
                                        column.dataType === "function"
                                          ? "bg-sunglow-yellow/20"
                                          : "hover:bg-muted/20"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                        <div className="flex-shrink-0">
                                          <div
                                            className={`p-0.5 sm:p-1 rounded-full rounded-br-none ${
                                              column.dataType === "function"
                                                ? "bg-sunglow-yellow"
                                                : "bg-crimson-red/10"
                                            }`}
                                          >
                                            {column.dataType === "function" && (
                                              <FaCode className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />
                                            )}
                                            {column.dataType === "date" && (
                                              <FaCalendarAlt className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                            )}
                                            {column.dataType === "currency" && (
                                              <FaPoundSign className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                            )}
                                            {column.dataType === "boolean" && (
                                              <BsPersonCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                            )}
                                            {column.dataType === "string" &&
                                              column.columnName
                                                .toLowerCase()
                                                .includes("email") && (
                                                <MdEmail className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                              )}
                                            {column.dataType === "string" &&
                                              column.columnName
                                                .toLowerCase()
                                                .includes("name") && (
                                                <FaUser className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                              )}
                                            {![
                                              "date",
                                              "currency",
                                              "boolean",
                                              "function",
                                            ].includes(column.dataType) &&
                                              !column.columnName
                                                .toLowerCase()
                                                .includes("email") &&
                                              !column.columnName
                                                .toLowerCase()
                                                .includes("name") && (
                                                <FaTag className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-crimson-red" />
                                              )}
                                          </div>
                                        </div>
                                        <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                          {column.columnName}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-[11px] sm:text-sm font-semibold text-foreground break-words break-all whitespace-pre-wrap inline-block max-w-full text-right">
                                          <MemoizedColumnValue
                                            column={column}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Navigation Sidebar */}
              {!isLoadingColumns && sortedParentTabs.length > 0 && (
                <div className="hidden lg:block w-48 border-l border-border/50 p-4 overflow-y-auto scrollbar-hide">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Sections
                  </h3>
                  <nav className="space-y-1">
                    {/* Summary Navigation Button */}
                    <button
                      onClick={() => scrollToTab("Summary")}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                        activeTab === "Summary"
                          ? "bg-crimson-red text-white shadow-sm"
                          : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <HiTrendingUp
                        className={`h-3 w-3 flex-shrink-0 ${
                          activeTab === "Summary"
                            ? "text-white"
                            : "text-crimson-red"
                        }`}
                      />
                      <span className="text-xs font-medium truncate">
                        Summary
                      </span>
                    </button>
                    {sortedParentTabs.map((parentTab) => {
                      const IconComponent = getParentTabIcon(parentTab);
                      const filteredColumns =
                        groupedColumns[parentTab].filter(shouldDisplayColumn);

                      if (filteredColumns.length === 0 && !showEmptyFields)
                        return null;

                      return (
                        <button
                          key={parentTab}
                          onClick={() => scrollToTab(parentTab)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                            activeTab === parentTab
                              ? "bg-crimson-red text-white shadow-sm"
                              : "text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <IconComponent
                            className={`h-3 w-3 flex-shrink-0 ${
                              activeTab === parentTab
                                ? "text-white"
                                : "text-crimson-red"
                            }`}
                          />
                          <span className="text-xs font-medium truncate">
                            {parentTab}
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>

      {/* Edit Booking Modal */}
      <EditBookingModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
        }}
        booking={currentBooking}
        onSave={(updatedBooking) => {
          // Call the parent callback to refresh the booking data
          if (onBookingUpdate) {
            onBookingUpdate(updatedBooking);
          }
          setIsEditModalOpen(false);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this booking? This action cannot
              be undone.
              <br />
              <br />
              <strong>Booking Details:</strong>
              <br />• Row: {currentBooking?.row || "N/A"}
              <br />• Name: {currentBooking?.fullName || "N/A"}
              <br />• Email: {currentBooking?.emailAddress || "N/A"}
              <br />
              <br />
              <span className="text-red-600 font-semibold">
                This will also shift all subsequent rows down by one position.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBooking}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete Booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
