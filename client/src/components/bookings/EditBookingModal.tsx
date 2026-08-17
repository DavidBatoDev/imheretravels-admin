"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FaUser,
  FaTimes,
  FaCog,
  FaHashtag,
  FaMapMarkerAlt,
  FaWallet,
  FaTag,
} from "react-icons/fa";
import { BsListUl, BsCalendarEvent } from "react-icons/bs";
import { MdEmail } from "react-icons/md";
import { HiTrendingUp } from "react-icons/hi";
import {
  RefreshCw,
  CalendarIcon,
  HelpCircle,
  Copy,
  Check,
  ExternalLink,
  Lock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDefaultPaymentPlan } from "@/lib/payment-plan-defaults";
import { formatTourDuration } from "@/lib/tour-duration";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { Booking } from "@/types/bookings";
import type { TourPackage, PricingHistoryEntry } from "@/types/tours";
import { SheetColumn, TypeScriptFunction } from "@/types/sheet-management";
import { allBookingSheetColumns } from "@/app/functions/columns";
import { functionMap } from "@/app/functions/columns/functions-index";
import { functionExecutionService } from "@/services/function-execution-service";
import { typescriptFunctionsService } from "@/services/typescript-functions-service";
import { batchedWriter } from "@/services/batched-writer";
import ScheduledEmailService from "@/services/scheduled-email-service";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import { isEqual, debounce } from "lodash";

interface EditBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onSave?: (updatedBooking: Booking) => void;
}

export default function EditBookingModal({
  isOpen,
  onClose,
  booking,
  onSave,
}: EditBookingModalProps) {
  const [columns, setColumns] = useState<SheetColumn[]>([]);
  const [availableFunctions, setAvailableFunctions] = useState<
    TypeScriptFunction[]
  >([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("");
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, string[]>
  >({});

  // Debug: Log when dynamicOptions changes
  useEffect(() => {
    console.log("🔄 [DYNAMIC OPTIONS STATE CHANGED]:", dynamicOptions);
  }, [dynamicOptions]);

  // Form state
  const [formData, setFormData] = useState<Partial<Booking>>({});
  const [computingFields, setComputingFields] = useState<Set<string>>(
    new Set(),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Local editing state - tracks which fields are currently being edited (local first pattern)
  const [activeEditingFields, setActiveEditingFields] = useState<Set<string>>(
    new Set(),
  );
  const [localFieldValues, setLocalFieldValues] = useState<Record<string, any>>(
    {},
  );
  // Track pending changes that haven't been saved to Firebase yet
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  // Track original values when editing starts to detect actual changes
  const [originalValues, setOriginalValues] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Loading state for email generation and sending
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailGenerationProgress, setEmailGenerationProgress] = useState<{
    type: "reservation" | "cancellation" | null;
    bookingId: string | null;
    action: "generating" | "sending" | "deleting" | null;
  }>({ type: null, bookingId: null, action: null });

  // Track previous values for detecting changes
  const prevGenerateEmailDraft = React.useRef<boolean | undefined>(undefined);
  const prevGenerateCancellationDraft = React.useRef<boolean | undefined>(
    undefined,
  );
  const prevSendEmail = React.useRef<boolean | undefined>(undefined);
  const prevSendCancellationEmail = React.useRef<boolean | undefined>(
    undefined,
  );
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const cancellationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const sendEmailTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const sendCancellationEmailTimeoutRef = React.useRef<NodeJS.Timeout | null>(
    null,
  );

  // Loading state for cleaning scheduled emails
  const [isCleaningScheduledEmails, setIsCleaningScheduledEmails] =
    useState(false);

  // Confirmation modals
  const [showSendEmailConfirmation, setShowSendEmailConfirmation] =
    useState(false);
  const [showPaymentReminderConfirmation, setShowPaymentReminderConfirmation] =
    useState(false);

  // Price history state
  const [tourPackageData, setTourPackageData] = useState<TourPackage | null>(
    null,
  );
  const [showPricingVersionDialog, setShowPricingVersionDialog] =
    useState(false);
  const [selectedPricingVersion, setSelectedPricingVersion] = useState<
    number | null
  >(null);
  const [isLoadingPriceHistory, setIsLoadingPriceHistory] = useState(false);

  const { toast } = useToast();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = React.useRef(false);

  // Debounce timer for function execution
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const skipInitialEventNameDependentsRef = React.useRef(true);
  const hasUserChangedTourDetailsRef = React.useRef(false);
  const hasUserChangedEventNameRef = React.useRef(false);

  const getDateKey = useCallback((dateValue: any): string | null => {
    if (!dateValue) return null;
    if (typeof dateValue === "string") {
      return dateValue.split("T")[0] || dateValue;
    }
    if (dateValue?.toDate) {
      return dateValue.toDate().toISOString().split("T")[0];
    }
    if (dateValue?.seconds) {
      return new Date(dateValue.seconds * 1000).toISOString().split("T")[0];
    }
    return new Date(dateValue).toISOString().split("T")[0];
  }, []);

  const formatDateLabel = useCallback((dateValue: string): string => {
    if (!dateValue) return "";
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }, []);

  const pricingVersionOptions = useMemo(() => {
    if (!tourPackageData)
      return [] as Array<{
        version: number;
        pricing: TourPackage["pricing"];
        travelDates?: PricingHistoryEntry["travelDates"];
        effectiveDate?: PricingHistoryEntry["effectiveDate"];
        isCurrent: boolean;
      }>;

    const currentVersion = tourPackageData.currentVersion || 1;
    // Include all travel dates to show current pricing, not just custom ones
    const currentTravelDates = tourPackageData.travelDates
      ?.map((td: any) => ({
        date: getDateKey(td.startDate) || "",
        customOriginal: td.customOriginal,
        customDiscounted: td.customDiscounted,
        customDeposit: td.customDeposit,
      }))
      .filter((td: any) => td.date) as PricingHistoryEntry["travelDates"];

    const history = tourPackageData.pricingHistory || [];
    const historyOptions = history
      .slice()
      .sort((a, b) => b.version - a.version)
      .map((entry) => ({
        version: entry.version,
        pricing: entry.pricing,
        travelDates: entry.travelDates,
        effectiveDate: entry.effectiveDate,
        isCurrent: false,
      }));

    return [
      {
        version: currentVersion,
        pricing: tourPackageData.pricing,
        travelDates: currentTravelDates?.length
          ? currentTravelDates
          : undefined,
        effectiveDate: undefined,
        isCurrent: true,
      },
      ...historyOptions,
    ];
  }, [tourPackageData, getDateKey]);

  // Real-time Firebase listener for booking updates (like BookingsDataGrid)
  useEffect(() => {
    if (!booking?.id || !isOpen) return;

    console.log(
      "🔍 [EDIT BOOKING MODAL] Setting up real-time booking listener for:",
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
            "📄 [EDIT BOOKING MODAL] Real-time booking update received",
          );

          // Update form data with real-time changes (LOCAL FIRST pattern like BookingsDataGrid)
          setFormData((prevFormData) => {
            const updatedData = { ...prevFormData };

            // Update all fields from Firebase, but be smart about it
            Object.keys(updatedBooking).forEach((key) => {
              const firebaseValue = updatedBooking[key as keyof Booking];
              const formValue = prevFormData[key as keyof Booking];

              // Find the column for this field
              const column = columns.find((col) => col.id === key);

              // LOCAL FIRST: Skip updating if user is actively editing this field
              if (activeEditingFields.has(key)) {
                console.log(
                  `🚫 [EDIT BOOKING MODAL] Skipping Firebase update for actively edited field: ${key}`,
                );
                return;
              }

              // Always update function fields since they're computed externally
              if (column?.dataType === "function") {
                updatedData[key as keyof Booking] = firebaseValue;
              }
              // For other fields, only update if they're different (deep comparison)
              // This prevents overwriting user input while they're typing
              else if (!isEqual(firebaseValue, formValue)) {
                updatedData[key as keyof Booking] = firebaseValue;
              }
            });

            return updatedData;
          });
        }
      },
      (error) => {
        console.error(
          "🚨 [EDIT BOOKING MODAL] Real-time listener error:",
          error,
        );
      },
    );

    return () => {
      console.log(
        "🧹 [EDIT BOOKING MODAL] Cleaning up real-time booking listener",
      );
      unsubscribe();
    };
  }, [booking?.id, isOpen, columns]);

  // Watch for generateEmailDraft changes and show progress modal
  useEffect(() => {
    if (!booking?.id || !isOpen) {
      prevGenerateEmailDraft.current = undefined;
      return;
    }

    const currentValue = formData.generateEmailDraft;
    const previousValue = prevGenerateEmailDraft.current;
    const emailDraftLink = formData.emailDraftLink;

    console.log("🔍 [GENERATE EMAIL DRAFT WATCHER]", {
      currentValue,
      previousValue,
      emailDraftLink,
      hasChanged: previousValue !== undefined && currentValue !== previousValue,
    });

    // Detect change from false to true (toggled ON)
    if (previousValue === false && currentValue === true) {
      console.log(
        "✅ [GENERATE EMAIL DRAFT] Toggled ON - showing generating modal",
      );

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsGeneratingEmail(true);
      setEmailGenerationProgress({
        type: "reservation",
        bookingId: booking.id,
        action: "generating",
      });

      // Set timeout to hide modal after 30 seconds
      timeoutRef.current = setTimeout(() => {
        console.log("⏱️ [GENERATE EMAIL DRAFT] Timeout reached - hiding modal");
        setIsGeneratingEmail(false);
        setEmailGenerationProgress({
          type: null,
          bookingId: null,
          action: null,
        });
      }, 30000);
    }

    // Detect change from true to false (toggled OFF)
    if (previousValue === true && currentValue === false) {
      console.log(
        "🗑️ [GENERATE EMAIL DRAFT] Toggled OFF - showing deleting modal",
      );

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsGeneratingEmail(true);
      setEmailGenerationProgress({
        type: "reservation",
        bookingId: booking.id,
        action: "deleting",
      });

      // Set timeout to hide modal after 30 seconds
      timeoutRef.current = setTimeout(() => {
        console.log("⏱️ [GENERATE EMAIL DRAFT] Timeout reached - hiding modal");
        setIsGeneratingEmail(false);
        setEmailGenerationProgress({
          type: null,
          bookingId: null,
          action: null,
        });
      }, 30000);
    }

    // If generateEmailDraft is true and we now have email draft link, hide modal
    if (
      currentValue === true &&
      emailDraftLink &&
      emailGenerationProgress.action === "generating"
    ) {
      console.log(
        "✅ [GENERATE EMAIL DRAFT] Draft link received - hiding modal",
      );

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsGeneratingEmail(false);
      setEmailGenerationProgress({
        type: null,
        bookingId: null,
        action: null,
      });
    }

    // If generateEmailDraft is false and draft link is cleared, hide modal
    if (
      currentValue === false &&
      !emailDraftLink &&
      emailGenerationProgress.action === "deleting"
    ) {
      console.log(
        "✅ [GENERATE EMAIL DRAFT] Draft link cleared - hiding modal",
      );

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsGeneratingEmail(false);
      setEmailGenerationProgress({
        type: null,
        bookingId: null,
        action: null,
      });
    }

    // Update previous value
    prevGenerateEmailDraft.current = currentValue;

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    formData.generateEmailDraft,
    formData.emailDraftLink,
    booking?.id,
    isOpen,
  ]);

  // Watch for generateCancellationDraft changes and show progress modal
  useEffect(() => {
    if (!booking?.id || !isOpen) {
      prevGenerateCancellationDraft.current = undefined;
      return;
    }

    const currentValue = formData.generateCancellationDraft;
    const previousValue = prevGenerateCancellationDraft.current;
    const cancellationDraftLink = formData.cancellationEmailDraftLink;

    console.log("🔍 [GENERATE CANCELLATION DRAFT WATCHER]", {
      currentValue,
      previousValue,
      cancellationDraftLink,
      hasChanged: previousValue !== undefined && currentValue !== previousValue,
    });

    // Detect change from false to true (toggled ON)
    if (previousValue === false && currentValue === true) {
      console.log(
        "✅ [GENERATE CANCELLATION DRAFT] Toggled ON - showing generating modal",
      );

      // Clear any existing timeout
      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }

      setIsGeneratingEmail(true);
      setEmailGenerationProgress({
        type: "cancellation",
        bookingId: booking.id,
        action: "generating",
      });

      // Set timeout to hide modal after 30 seconds
      cancellationTimeoutRef.current = setTimeout(() => {
        console.log(
          "⏱️ [GENERATE CANCELLATION DRAFT] Timeout reached - hiding modal",
        );
        setIsGeneratingEmail(false);
        setEmailGenerationProgress({
          type: null,
          bookingId: null,
          action: null,
        });
      }, 30000);
    }

    // Detect change from true to false (toggled OFF)
    if (previousValue === true && currentValue === false) {
      console.log(
        "🗑️ [GENERATE CANCELLATION DRAFT] Toggled OFF - showing deleting modal",
      );

      // Clear any existing timeout
      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }

      setIsGeneratingEmail(true);
      setEmailGenerationProgress({
        type: "cancellation",
        bookingId: booking.id,
        action: "deleting",
      });

      // Set timeout to hide modal after 30 seconds
      cancellationTimeoutRef.current = setTimeout(() => {
        console.log(
          "⏱️ [GENERATE CANCELLATION DRAFT] Timeout reached - hiding modal",
        );
        setIsGeneratingEmail(false);
        setEmailGenerationProgress({
          type: null,
          bookingId: null,
          action: null,
        });
      }, 30000);
    }

    // If generateCancellationDraft is true and we now have draft link, hide modal
    if (
      currentValue === true &&
      cancellationDraftLink &&
      emailGenerationProgress.action === "generating"
    ) {
      console.log(
        "✅ [GENERATE CANCELLATION DRAFT] Draft link received - hiding modal",
      );

      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }

      setIsGeneratingEmail(false);
      setEmailGenerationProgress({
        type: null,
        bookingId: null,
        action: null,
      });
    }

    // If generateCancellationDraft is false and draft link is cleared, hide modal
    if (
      currentValue === false &&
      !cancellationDraftLink &&
      emailGenerationProgress.action === "deleting"
    ) {
      console.log(
        "✅ [GENERATE CANCELLATION DRAFT] Draft link cleared - hiding modal",
      );

      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }

      setIsGeneratingEmail(false);
      setEmailGenerationProgress({
        type: null,
        bookingId: null,
        action: null,
      });
    }

    // Update previous value
    prevGenerateCancellationDraft.current = currentValue;

    // Cleanup timeout on unmount
    return () => {
      if (cancellationTimeoutRef.current) {
        clearTimeout(cancellationTimeoutRef.current);
      }
    };
  }, [
    formData.generateCancellationDraft,
    formData.cancellationEmailDraftLink,
    booking?.id,
    isOpen,
  ]);

  // Watch for sendEmail changes and show progress modal
  useEffect(() => {
    if (!booking?.id || !isOpen) {
      prevSendEmail.current = undefined;
      return;
    }

    const currentValue = formData.sendEmail;
    const previousValue = prevSendEmail.current;
    const sentEmailLink = formData.sentEmailLink;

    console.log("🔍 [SEND EMAIL WATCHER]", {
      currentValue,
      previousValue,
      sentEmailLink,
      hasChanged: previousValue !== undefined && currentValue !== previousValue,
    });

    // Detect change from false to true (toggled ON)
    if (previousValue === false && currentValue === true) {
      console.log("✅ [SEND EMAIL] Toggled ON - showing sending modal");

      // Clear any existing timeout
      if (sendEmailTimeoutRef.current) {
        clearTimeout(sendEmailTimeoutRef.current);
      }

      setIsGeneratingEmail(true);
      setEmailGenerationProgress({
        type: "reservation",
        bookingId: booking.id,
        action: "sending",
      });

      // Set timeout to hide modal after 30 seconds
      sendEmailTimeoutRef.current = setTimeout(() => {
        console.log("⏱️ [SEND EMAIL] Timeout reached - hiding modal");
        setIsGeneratingEmail(false);
        setEmailGenerationProgress({
          type: null,
          bookingId: null,
          action: null,
        });
      }, 30000);
    }

    // If sendEmail is true and we now have sent email link, hide modal
    if (
      currentValue === true &&
      sentEmailLink &&
      emailGenerationProgress.action === "sending"
    ) {
      console.log("✅ [SEND EMAIL] Sent email link received - hiding modal");

      if (sendEmailTimeoutRef.current) {
        clearTimeout(sendEmailTimeoutRef.current);
      }

      setIsGeneratingEmail(false);
      setEmailGenerationProgress({
        type: null,
        bookingId: null,
        action: null,
      });
    }

    // Update previous value
    prevSendEmail.current = currentValue;

    // Cleanup timeout on unmount
    return () => {
      if (sendEmailTimeoutRef.current) {
        clearTimeout(sendEmailTimeoutRef.current);
      }
    };
  }, [formData.sendEmail, formData.sentEmailLink, booking?.id, isOpen]);

  // Watch for sendCancellationEmail changes and show progress modal
  useEffect(() => {
    if (!booking?.id || !isOpen) {
      prevSendCancellationEmail.current = undefined;
      return;
    }

    const currentValue = formData.sendCancellationEmail;
    const previousValue = prevSendCancellationEmail.current;
    const sentCancellationEmailLink = formData.sentCancellationEmailLink;

    console.log("🔍 [SEND CANCELLATION EMAIL WATCHER]", {
      currentValue,
      previousValue,
      sentCancellationEmailLink,
      hasChanged: previousValue !== undefined && currentValue !== previousValue,
    });

    // Detect change from false to true (toggled ON)
    if (previousValue === false && currentValue === true) {
      console.log(
        "✅ [SEND CANCELLATION EMAIL] Toggled ON - showing sending modal",
      );

      // Clear any existing timeout
      if (sendCancellationEmailTimeoutRef.current) {
        clearTimeout(sendCancellationEmailTimeoutRef.current);
      }

      setIsGeneratingEmail(true);
      setEmailGenerationProgress({
        type: "cancellation",
        bookingId: booking.id,
        action: "sending",
      });

      // Set timeout to hide modal after 30 seconds
      sendCancellationEmailTimeoutRef.current = setTimeout(() => {
        console.log(
          "⏱️ [SEND CANCELLATION EMAIL] Timeout reached - hiding modal",
        );
        setIsGeneratingEmail(false);
        setEmailGenerationProgress({
          type: null,
          bookingId: null,
          action: null,
        });
      }, 30000);
    }

    // If sendCancellationEmail is true and we now have sent email link, hide modal
    if (
      currentValue === true &&
      sentCancellationEmailLink &&
      emailGenerationProgress.action === "sending"
    ) {
      console.log(
        "✅ [SEND CANCELLATION EMAIL] Sent email link received - hiding modal",
      );

      if (sendCancellationEmailTimeoutRef.current) {
        clearTimeout(sendCancellationEmailTimeoutRef.current);
      }

      setIsGeneratingEmail(false);
      setEmailGenerationProgress({
        type: null,
        bookingId: null,
        action: null,
      });
    }

    // Update previous value
    prevSendCancellationEmail.current = currentValue;

    // Cleanup timeout on unmount
    return () => {
      if (sendCancellationEmailTimeoutRef.current) {
        clearTimeout(sendCancellationEmailTimeoutRef.current);
      }
    };
  }, [
    formData.sendCancellationEmail,
    formData.sentCancellationEmailLink,
    booking?.id,
    isOpen,
  ]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (booking && isOpen) {
      skipInitialEventNameDependentsRef.current = true;
      hasUserChangedTourDetailsRef.current = false;
      hasUserChangedEventNameRef.current = false;
      setFormData({ ...booking });
      setFieldErrors({});
    }
  }, [booking, isOpen]);

  // Auto-default paymentPlan = "Full Payment" on modal open when the booking is
  // already in a Last Minute state with an empty plan. The transition watcher
  // below only fires on changes, so this covers the initial-load case.
  useEffect(() => {
    if (!isOpen || !booking) return;
    const autoDefault = getDefaultPaymentPlan(
      String((booking as any).availablePaymentTerms || ""),
      (booking as any).paymentPlan,
    );
    if (autoDefault && autoDefault !== (booking as any).paymentPlan) {
      setFormData((prev: any) => ({ ...prev, paymentPlan: autoDefault }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, booking?.id]);

  // Optimized function to reload Event Name options based on Tour Package and Date
  const reloadEventNameOptions = useCallback(
    async (currentTourPackageName: string, currentTourDate: any) => {
      // If missing required fields, clear options and return empty
      if (!currentTourPackageName || !currentTourDate) {
        setDynamicOptions((prev) => ({
          ...prev,
          eventName: [""],
        }));
        return;
      }

      console.log("🔄 [DISCOUNT LOGIC] Reloading Event Name options...", {
        package: currentTourPackageName,
        date: currentTourDate,
      });

      try {
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");

        // Query active discount events
        const discountEventsRef = collection(db, "discountEvents");
        const activeEventsQuery = query(
          discountEventsRef,
          where("active", "==", true),
        );

        const snapshot = await getDocs(activeEventsQuery);

        // Helper for date normalization (Local Time) to match tourDate
        const toLocalISODate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };

        // Normalize current tour date
        let normalizedTourDate = "";
        const tourDateValue = currentTourDate;

        if (typeof tourDateValue === "string") {
          if (tourDateValue.includes("/")) {
            const parts = tourDateValue.split("/");
            if (parts.length === 3) {
              const [month, day, year] = parts;
              normalizedTourDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
            } else normalizedTourDate = tourDateValue;
          } else normalizedTourDate = tourDateValue; // Assume YYYY-MM-DD
        } else if (tourDateValue instanceof Date) {
          normalizedTourDate = toLocalISODate(tourDateValue);
        } else if (
          tourDateValue &&
          typeof tourDateValue === "object" &&
          "toDate" in tourDateValue
        ) {
          // Firestore Timestamp
          normalizedTourDate = toLocalISODate(tourDateValue.toDate());
        }

        const cleanString = (str: string) => str?.trim().toLowerCase() || "";
        const targetPackageName = cleanString(currentTourPackageName);

        const validEventNames: string[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const items = data.items || [];

          // Check if this event has a matching item config
          const hasMatch = items.some((item: any) => {
            // 1. Package Name Match
            if (cleanString(item.tourPackageName) !== targetPackageName)
              return false;

            // 2. Date Match
            const dateDiscounts = item.dateDiscounts || [];
            return dateDiscounts.some((dd: any) => {
              let ddStr = "";
              if (dd.date && typeof dd.date.toDate === "function")
                ddStr = toLocalISODate(dd.date.toDate());
              else if (dd.date instanceof Date) ddStr = toLocalISODate(dd.date);
              else if (typeof dd.date === "string") ddStr = dd.date;

              return ddStr === normalizedTourDate;
            });
          });

          if (hasMatch) {
            validEventNames.push(data.name);
          }
        });

        console.log("✅ [DISCOUNT LOGIC] Found valid events:", validEventNames);

        // Update options
        setDynamicOptions((prev) => ({
          ...prev,
          eventName:
            validEventNames.length > 0 ? ["", ...validEventNames] : [""],
        }));

        return validEventNames;
      } catch (error) {
        console.error("🚨 [DISCOUNT LOGIC] Error loading events:", error);
        setDynamicOptions((prev) => ({
          ...prev,
          eventName: [""],
        }));
        return [];
      }
    },
    [],
  );

  // Auto-detect/Clear Event Name when dependencies change
  useEffect(() => {
    if (!isOpen) return;

    const runLogic = async () => {
      const pkg = formData.tourPackageName;
      const date = formData.tourDate;
      const currentEvent = formData.eventName;

      // Reload options
      // We await this to get the new valid list
      let validEvents: string[] = [];
      if (pkg && date) {
        // We need to call the function we just defined.
        // Since it's async, we can get the result.
        // However, reloadEventNameOptions updates state, so we should be careful.
        // Modified reloadEventNameOptions to return the list.
        validEvents = (await reloadEventNameOptions(pkg, date)) || [];
      } else {
        // If missing dependencies, options are empty
        setDynamicOptions((prev) => ({ ...prev, eventName: [""] }));
      }

      // Logic to Clear or Auto-Set Event Name
      if (validEvents.length === 0) {
        if (currentEvent) {
          // Only clear if the user actively changed tour details (preserve history)
          if (hasUserChangedTourDetailsRef.current) {
            console.log(
              "🧹 [DISCOUNT LOGIC] Clearing Event Name (no valid events)",
            );
            setFormData((prev) => ({ ...prev, eventName: "" }));
            // Ensure dependent fields (discount, type) are also cleared via their own watchers or side-effects
            // Explicitly triggering update might be needed if they don't watch 'eventName' directly
            hasUserChangedEventNameRef.current = true; // Signal that this is a "user-like" change to trigger dependents
          } else {
            console.log(
              "🛡️ [DISCOUNT LOGIC] Preserving historical inactive event:",
              currentEvent,
            );
          }
        }
      } else {
        // If current event is invalid, clear it
        if (currentEvent && !validEvents.includes(currentEvent)) {
          // Only clear if the user actively changed tour details (preserve history)
          if (hasUserChangedTourDetailsRef.current) {
            console.log(
              "🧹 [DISCOUNT LOGIC] Clearing invalid Event Name due to context change:",
              currentEvent,
            );
            setFormData((prev) => ({ ...prev, eventName: "" }));
            hasUserChangedEventNameRef.current = true;
          } else {
            console.log(
              "🛡️ [DISCOUNT LOGIC] Preserving historical inactive event:",
              currentEvent,
            );
          }
        }
      }
    };

    // Debounce slightly to allow typing/updates to settle
    const timer = setTimeout(runLogic, 300);
    return () => clearTimeout(timer);
  }, [
    formData.tourPackageName,
    formData.tourDate,
    isOpen,
    reloadEventNameOptions,
  ]);

  // Trigger dependent functions when eventName changes (including clearing it)
  useEffect(() => {
    if (!booking?.id || !isOpen) return;

    if (skipInitialEventNameDependentsRef.current) {
      skipInitialEventNameDependentsRef.current = false;
      return;
    }

    if (
      !hasUserChangedEventNameRef.current &&
      !hasUserChangedTourDetailsRef.current
    ) {
      return;
    }

    const eventName = formData.eventName;
    console.log("🔄 [EVENT NAME CHANGED] New value:", eventName);

    // Trigger dependents whenever eventName changes (whether empty or set)
    console.log("📌 [EVENT NAME] Auto-triggering dependent functions...");
    executeDirectDependents("eventName", formData).then((finalData) => {
      if (finalData) {
        console.log("📌 [EVENT NAME] Dependent functions completed");
        setFormData(finalData);
      }
    });
    hasUserChangedEventNameRef.current = false;
    hasUserChangedTourDetailsRef.current = false;
  }, [formData.eventName, booking?.id, isOpen]);

  // Load coded booking sheet columns and functions
  useEffect(() => {
    if (!isOpen) return;

    console.log(
      "🔍 [EDIT BOOKING MODAL] Loading coded columns and functions...",
    );
    setIsLoadingColumns(true);

    // Convert BookingSheetColumn[] to SheetColumn[] and inject function implementations
    const codedColumns: SheetColumn[] = allBookingSheetColumns.map(
      (col): SheetColumn => {
        const columnData = col.data;

        // Log select columns to check loadOptions
        if (columnData.dataType === "select" && columnData.id === "eventName") {
          console.log(
            "🔍 [EDIT BOOKING MODAL] Event Name column data:",
            columnData,
          );
          console.log(
            "🔍 [EDIT BOOKING MODAL] Has loadOptions?",
            !!columnData.loadOptions,
          );
        }

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
      `✅ [EDIT BOOKING MODAL] Loaded ${codedColumns.length} coded columns`,
    );
    setColumns(codedColumns);
    setIsLoadingColumns(false);

    // Load available functions
    const loadFunctions = async () => {
      try {
        const functions = await typescriptFunctionsService.getAllFunctions();
        setAvailableFunctions(functions);
      } catch (error) {
        console.error("Failed to load functions:", error);
      }
    };

    loadFunctions();

    return () => {
      console.log("🧹 [EDIT BOOKING MODAL] Cleaning up subscriptions");

      // Clean up debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isOpen]);

  // Load dynamic options for select columns AFTER formData is ready
  useEffect(() => {
    if (
      !isOpen ||
      columns.length === 0 ||
      !formData ||
      Object.keys(formData).length === 0
    ) {
      return;
    }

    const loadDynamicOptions = async () => {
      console.log(
        "🔄 [EDIT BOOKING MODAL] Loading dynamic options with formData context:",
        { availablePaymentTerms: formData.availablePaymentTerms },
      );

      const optionsMap: Record<string, string[]> = {};

      for (const col of columns) {
        if (col.dataType === "select" && col.loadOptions) {
          try {
            console.log(
              `🔄 [EDIT BOOKING MODAL] Loading options for ${col.columnName}...`,
            );
            // Pass formData as context for context-aware options
            const options = await col.loadOptions({ formData });
            console.log(
              `✅ [EDIT BOOKING MODAL] Loaded ${options.length} options for ${col.columnName}:`,
              options,
            );
            optionsMap[col.id] = options;
          } catch (error) {
            console.error(
              `Failed to load options for ${col.columnName}:`,
              error,
            );
            optionsMap[col.id] = col.options || [];
          }
        }
      }

      console.log(
        "📦 [EDIT BOOKING MODAL] All dynamic options loaded:",
        optionsMap,
      );
      setDynamicOptions(optionsMap);
    };

    loadDynamicOptions();
  }, [isOpen, columns, formData.id]); // Only re-run when modal opens or when we get a new booking (formData.id changes)

  // Load tour package data for price history
  useEffect(() => {
    if (!isOpen || !formData.tourPackageName) {
      setTourPackageData(null);
      return;
    }

    const loadTourPackage = async () => {
      setIsLoadingPriceHistory(true);
      try {
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");

        const tourPackagesRef = collection(db, "tourPackages");
        const q = query(
          tourPackagesRef,
          where("name", "==", formData.tourPackageName),
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const packageData = snapshot.docs[0].data() as TourPackage;
          setTourPackageData(packageData);
          console.log(
            "✅ [PRICE HISTORY] Loaded tour package:",
            packageData.name,
          );
        } else {
          setTourPackageData(null);
          console.log("⚠️ [PRICE HISTORY] Tour package not found");
        }
      } catch (error) {
        console.error("❌ [PRICE HISTORY] Error loading tour package:", error);
        setTourPackageData(null);
      } finally {
        setIsLoadingPriceHistory(false);
      }
    };

    loadTourPackage();
  }, [isOpen, formData.tourPackageName]);

  // Track previous tourPackageName to detect changes
  const prevTourPackageNameForVersionRef = React.useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!booking?.id || !formData.tourPackageName || !tourPackageData) {
      prevTourPackageNameForVersionRef.current = undefined;
      return;
    }

    const currentVersion = tourPackageData.currentVersion;
    if (!currentVersion) return;

    // CRITICAL: Ensure tourPackageData matches the current tourPackageName
    // to avoid using stale data when switching packages
    if (tourPackageData.name !== formData.tourPackageName) {
      return;
    }

    const currentPkgName = formData.tourPackageName;
    const prevPkgName = prevTourPackageNameForVersionRef.current;

    // Update to current version when:
    // 1. No pricing version is set yet (new booking)
    // 2. Tour package name has changed (switching to different tour)
    const shouldUpdate =
      !formData.tourPackagePricingVersion ||
      (prevPkgName !== undefined && currentPkgName !== prevPkgName);

    if (shouldUpdate) {
      console.log("📦 [PRICING VERSION] Updating to current version:", {
        package: currentPkgName,
        version: currentVersion,
        reason: !formData.tourPackagePricingVersion
          ? "no version set"
          : "package changed",
      });

      batchedWriter.queueFieldUpdate(
        booking.id,
        "tourPackagePricingVersion",
        currentVersion,
      );
      setFormData((prev) => ({
        ...prev,
        tourPackagePricingVersion: currentVersion,
      }));
      setIsSaving(true);
      debouncedSaveIndicator();
    }

    prevTourPackageNameForVersionRef.current = currentPkgName;
  }, [
    booking?.id,
    formData.tourPackageName,
    formData.tourPackagePricingVersion,
    tourPackageData,
  ]);

  // Build dependency graph: source columnId -> list of function columns depending on it
  const dependencyGraph = useMemo(() => {
    const map = new Map<string, SheetColumn[]>();
    columns.forEach((col) => {
      if (col.dataType === "function" && Array.isArray(col.arguments)) {
        col.arguments.forEach((arg) => {
          if (arg.columnReference) {
            // Skip "ID" and "Row" references since they're not column dependencies
            if (arg.columnReference !== "ID" && arg.columnReference !== "Row") {
              // Find the column ID for the referenced column name
              const refCol = columns.find(
                (c) => c.columnName === arg.columnReference,
              );
              if (refCol && refCol.id !== col.id) {
                const list = map.get(refCol.id) || [];
                list.push(col);
                map.set(refCol.id, list);
              }
            }
          }
          if (Array.isArray(arg.columnReferences)) {
            arg.columnReferences.forEach((ref) => {
              if (!ref) return;
              // Skip "ID" and "Row" references since they're not column dependencies
              if (ref !== "ID" && ref !== "Row") {
                // Find the column ID for the referenced column name
                const refCol = columns.find((c) => c.columnName === ref);
                if (refCol && refCol.id !== col.id) {
                  const list = map.get(refCol.id) || [];
                  list.push(col);
                  map.set(refCol.id, list);
                }
              }
            });
          }
        });
      }
    });
    return map;
  }, [columns]);

  // Optimized function to reload ONLY Payment Plan options when Available Payment Terms changes
  const reloadPaymentPlanOptions = useCallback(
    async (availablePaymentTerms: string) => {
      const paymentPlanColumn = columns.find((col) => col.id === "paymentPlan");

      if (!paymentPlanColumn || !paymentPlanColumn.loadOptions) {
        return;
      }

      try {
        console.log(
          "🔄 [EDIT BOOKING MODAL] Reloading Payment Plan options for:",
          availablePaymentTerms,
        );

        // Pass formData context to loadOptions
        const options = await paymentPlanColumn.loadOptions({
          formData: { availablePaymentTerms },
        });

        console.log(
          "✅ [EDIT BOOKING MODAL] Payment Plan options updated:",
          options,
        );

        // Update only the paymentPlan options, keep others unchanged
        setDynamicOptions((prev) => ({
          ...prev,
          paymentPlan: options,
        }));
      } catch (error) {
        console.error("Failed to reload Payment Plan options:", error);
        setDynamicOptions((prev) => ({
          ...prev,
          paymentPlan: paymentPlanColumn.options || [],
        }));
      }
    },
    [columns],
  );

  // Optimized function to reload ONLY Tour Date options when Tour Package Name changes
  const reloadTourDateOptions = useCallback(
    async (tourPackageName: string) => {
      const tourDateColumn = columns.find((col) => col.id === "tourDate");

      if (!tourDateColumn || !tourDateColumn.loadOptions) {
        return;
      }

      try {
        console.log(
          "🔄 [EDIT BOOKING MODAL] Reloading Tour Date options for:",
          tourPackageName,
        );

        // Pass formData context to loadOptions
        const options = await tourDateColumn.loadOptions({
          formData: { tourPackageName },
        });

        console.log(
          "✅ [EDIT BOOKING MODAL] Tour Date options updated:",
          options,
        );

        // Update only the tourDate options, keep others unchanged
        setDynamicOptions((prev) => ({
          ...prev,
          tourDate: options,
        }));
      } catch (error) {
        console.error("Failed to reload Tour Date options:", error);
        setDynamicOptions((prev) => ({
          ...prev,
          tourDate: tourDateColumn.options || [],
        }));
      }
    },
    [columns],
  );

  // STRICT DEPENDENCY: When Tour Package changes, Clear Tour Date & Reload Options
  // Use a ref to track previous package name to avoid loops
  const prevTourPackageRef = React.useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      prevTourPackageRef.current = undefined;
      return;
    }

    const currentPkg = formData.tourPackageName;
    const prevPkg = prevTourPackageRef.current;

    if (prevPkg !== undefined && currentPkg !== prevPkg) {
      console.log(
        "🔄 [DEPENDENCY] Tour Package changed. Clearing Tour Date & Reloading Options.",
      );

      // 1. Clear Tour Date
      setFormData((prev) => ({ ...prev, tourDate: null }));

      // 2. Reload Tour Date options
      reloadTourDateOptions(currentPkg || "");
    }

    // Initialize ref on first open if needed, or just update it
    prevTourPackageRef.current = currentPkg;
  }, [formData.tourPackageName, isOpen, reloadTourDateOptions]);

  // Reactive tracking: reload Payment Plan options when Available Payment Terms changes
  const previousAvailablePaymentTerms = React.useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const currentValue = formData.availablePaymentTerms;
    const previousValue = previousAvailablePaymentTerms.current;

    // Only reload if the value actually changed and isn't the initial undefined
    if (previousValue !== undefined && currentValue !== previousValue) {
      console.log("📊 [EDIT BOOKING MODAL] Available Payment Terms changed:", {
        from: previousValue,
        to: currentValue,
      });
      reloadPaymentPlanOptions(String(currentValue || ""));

      const autoDefault = getDefaultPaymentPlan(
        String(currentValue || ""),
        formData.paymentPlan,
      );
      if (autoDefault && autoDefault !== formData.paymentPlan) {
        setFormData((prev: any) => ({ ...prev, paymentPlan: autoDefault }));
      }
    }

    // Update the ref for next comparison
    previousAvailablePaymentTerms.current = currentValue;
  }, [formData.availablePaymentTerms, reloadPaymentPlanOptions]);

  // Set first tab as active on load
  useEffect(() => {
    if (!booking || !isOpen || !columns.length) return;

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
  }, [isOpen, columns, booking, activeTab]);

  // Safe date conversion for Firebase Timestamps
  const safeDate = (value: any): Date => {
    if (value instanceof Date) return value;
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

  // Scroll to a specific parent tab
  const scrollToTab = (parentTab: string) => {
    const element = document.getElementById(`edit-tab-${parentTab}`);
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

  // Debounced scroll handler for better performance
  const debouncedScrollHandler = useCallback(
    debounce(() => {
      // Handle any scroll-related updates here if needed
    }, 16), // ~60fps
    [],
  );

  // Debounced save indicator handler
  const debouncedSaveIndicator = useCallback(
    debounce(() => {
      setIsSaving(false);
      setLastSaved(new Date());
    }, 1000), // Show "saving" for 1 second after last change
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
        scrollContainerRef.current.querySelectorAll('[id^="edit-tab-"]');
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
          mostVisibleSection = section.id.replace("edit-tab-", "");
          maxVisibleArea = 1000; // Force this to be selected
          return;
        }

        // If at the top, select the first section
        if (isAtTop && index === 0) {
          mostVisibleSection = section.id.replace("edit-tab-", "");
          maxVisibleArea = 1000; // Force this to be selected
          return;
        }

        // Calculate visible area of the section relative to scroll container
        const visibleTop = Math.max(rect.top, containerRect.top + headerHeight);
        const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        if (visibleHeight > maxVisibleArea) {
          maxVisibleArea = visibleHeight;
          mostVisibleSection = section.id.replace("edit-tab-", "");
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

  // Handle send email confirmation
  const handleSendEmailConfirm = () => {
    if (!booking?.id) return;

    setShowSendEmailConfirmation(false);

    // Proceed with sending
    batchedWriter.queueFieldUpdate(booking.id, "sendEmail", true);
    setFormData((prev) => ({ ...prev, sendEmail: true }));
    setIsSaving(true);
    debouncedSaveIndicator();
  };

  const handleSendEmailCancel = () => {
    setShowSendEmailConfirmation(false);
  };

  const handlePaymentReminderConfirm = () => {
    if (!booking?.id) return;

    setShowPaymentReminderConfirmation(false);

    batchedWriter.queueFieldUpdate(booking.id, "enablePaymentReminder", true);
    setFormData((prev) => ({ ...prev, enablePaymentReminder: true }));
    setIsSaving(true);
    debouncedSaveIndicator();
  };

  const handlePaymentReminderCancel = () => {
    setShowPaymentReminderConfirmation(false);
  };

  // Handle unlocking pricing and recalculating from current tour package
  const handleUnlockAndRecalculate = async () => {
    if (!booking?.id || !tourPackageData) return;

    try {
      // Unlock pricing
      await batchedWriter.queueFieldUpdate(booking.id, "lockPricing", false);
      await batchedWriter.queueFieldUpdate(
        booking.id,
        "priceSource",
        "recalculated",
      );

      // Update local state
      setFormData((prev) => ({
        ...prev,
        lockPricing: false,
        priceSource: "recalculated" as "snapshot" | "manual" | "recalculated",
      }));

      // Force recalculation of price columns by invalidating them
      const priceColumns = columns.filter((col) =>
        ["originalTourCost", "discountedTourCost", "reservationFee"].includes(
          col.id,
        ),
      );

      for (const col of priceColumns) {
        if (booking.id && col.function) {
          functionExecutionService.invalidateForRowColumn(booking.id, col.id);
          functionExecutionService.markForRecomputation(booking.id, col.id);
        }
      }

      // Execute price columns to get new values
      let updatedData: Partial<Booking> = {
        ...formData,
        lockPricing: false,
        priceSource: "recalculated" as "snapshot" | "manual" | "recalculated",
      };
      for (const col of priceColumns) {
        const result = await executeFunction(col, updatedData);
        if (result !== undefined) {
          updatedData = { ...updatedData, [col.id]: result };
        }
      }

      setFormData(updatedData);
      setShowPricingVersionDialog(false);

      toast({
        title: "Pricing Updated",
        description:
          "Booking prices have been recalculated from current tour package pricing.",
      });
    } catch (error) {
      console.error("Error unlocking pricing:", error);
      toast({
        title: "Error",
        description: "Failed to update pricing. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePricingLockToggle = useCallback(
    async (checked: boolean) => {
      if (!booking?.id) return;

      batchedWriter.queueFieldUpdate(booking.id, "lockPricing", checked);
      batchedWriter.queueFieldUpdate(
        booking.id,
        "priceSource",
        checked ? "snapshot" : "recalculated",
      );

      if (checked && tourPackageData?.currentVersion) {
        batchedWriter.queueFieldUpdate(
          booking.id,
          "tourPackagePricingVersion",
          tourPackageData.currentVersion,
        );
      }

      if (checked && !formData.priceSnapshotDate) {
        batchedWriter.queueFieldUpdate(
          booking.id,
          "priceSnapshotDate",
          serverTimestamp(),
        );
      }

      setFormData((prev) => ({
        ...prev,
        lockPricing: checked,
        priceSource: checked
          ? ("snapshot" as "snapshot" | "manual" | "recalculated")
          : ("recalculated" as "snapshot" | "manual" | "recalculated"),
      }));

      setIsSaving(true);
      debouncedSaveIndicator();
    },
    [booking?.id, formData.priceSnapshotDate, tourPackageData],
  );

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

  // Execute single function and return result
  const executeFunction = React.useCallback(
    async (
      funcCol: SheetColumn,
      currentData: Partial<Booking>,
    ): Promise<any> => {
      if (!funcCol.function || funcCol.dataType !== "function") return;

      // Check if this is an email generation or sending function
      const isEmailGenerationFunction =
        funcCol.function === "generateGmailDraftFunction" ||
        funcCol.function === "generateCancellationGmailDraftFunction";

      const isEmailSendingFunction =
        funcCol.function === "sendEmailDraftOnceFunction" ||
        funcCol.function === "sendCancellationEmailDraftOnceFunction";

      const isEmailFunction =
        isEmailGenerationFunction || isEmailSendingFunction;

      if (isEmailFunction) {
        // Show loading modal for email generation or sending
        setIsGeneratingEmail(true);

        let emailType: "reservation" | "cancellation" = "reservation";
        if (
          funcCol.function === "generateCancellationGmailDraftFunction" ||
          funcCol.function === "sendCancellationEmailDraftOnceFunction"
        ) {
          emailType = "cancellation";
        }

        // Determine if we're toggling off (deleting draft)
        let action: "generating" | "sending" | "deleting" = "generating";
        if (isEmailSendingFunction) {
          action = "sending";
        } else if (isEmailGenerationFunction) {
          // Check if toggling off by looking at the current value in formData
          const generateField =
            emailType === "reservation"
              ? "generateEmailDraft"
              : "generateCancellationDraft";
          const currentValue =
            currentData[generateField as keyof typeof currentData];
          const isTogglingOff = currentValue === false;
          action = isTogglingOff ? "deleting" : "generating";
        }

        setEmailGenerationProgress({
          type: emailType,
          bookingId: currentData.id || null,
          action: action,
        });
      }

      try {
        setComputingFields((prev) => new Set([...prev, funcCol.id]));

        // Build arguments and execute function
        const args = functionExecutionService.buildArgs(
          funcCol,
          currentData as any,
          columns,
        );

        // Use longer timeout for email-sending and email-generating functions (30 seconds)
        // Regular functions timeout after 10 seconds
        const isEmailFunction =
          funcCol.function === "sendEmailDraftOnceFunction" ||
          funcCol.function === "sendReservationEmailDraftOnceFunction" ||
          funcCol.function === "sendCancellationEmailDraftOnceFunction" ||
          funcCol.function === "generateGmailDraftFunction" ||
          funcCol.function === "generateCancellationGmailDraftFunction";
        const timeout = isEmailFunction ? 30000 : 10000;

        const result = await functionExecutionService.executeFunction(
          funcCol.function,
          args,
          timeout,
        );

        console.log(
          `[EXECUTE FUNCTION] ${funcCol.function} completed with result:`,
          {
            success: result.success,
            result: result.result,
            executionTime: result.executionTime,
          },
        );

        if (result.success) {
          return result.result;
        }
        return undefined;
      } catch (error) {
        console.error(`Error executing function ${funcCol.columnName}:`, error);
        return undefined;
      } finally {
        setComputingFields((prev) => {
          const newSet = new Set(prev);
          newSet.delete(funcCol.id);
          return newSet;
        });

        if (isEmailFunction) {
          // Hide loading modal after function completes
          setIsGeneratingEmail(false);
          setEmailGenerationProgress({
            type: null,
            bookingId: null,
            action: null,
          });
        }
      }
    },
    [columns],
  );

  // Immediate function execution with parallel direct dependents (like BookingsDataGrid)
  const executeDirectDependents = React.useCallback(
    async (changedColumnId: string, currentData: Partial<Booking>) => {
      try {
        // Find function columns that depend on the changed field
        const directDependents = dependencyGraph.get(changedColumnId) || [];

        console.log(`🔍 Execute dependents for ${changedColumnId}:`, {
          dependentsCount: directDependents.length,
          dependents: directDependents.map((d) => d.id),
          currentData: {
            [changedColumnId]: currentData[changedColumnId as keyof Booking],
            emailDraftLink: currentData.emailDraftLink,
            cancellationEmailDraftLink: currentData.cancellationEmailDraftLink,
          },
        });

        if (directDependents.length === 0) return currentData;

        let updatedData = { ...currentData };

        // Execute all direct dependents in parallel for speed (like BookingsDataGrid)
        const results = await Promise.all(
          directDependents.map(async (funcCol) => {
            if (funcCol.function && funcCol.dataType === "function") {
              try {
                const result = await executeFunction(funcCol, updatedData);
                return { columnId: funcCol.id, result };
              } catch (error) {
                console.error(
                  `Error executing function ${funcCol.columnName}:`,
                  error,
                );
                return { columnId: funcCol.id, result: undefined };
              }
            }
            return { columnId: funcCol.id, result: undefined };
          }),
        );

        // Apply results and queue Firebase updates
        let hasChanges = false;
        for (const { columnId, result } of results) {
          if (result !== undefined) {
            const oldValue = updatedData[columnId as keyof Booking];
            if (oldValue !== result) {
              updatedData[columnId as keyof Booking] = result;
              hasChanges = true;

              // Queue the computed result to Firebase
              if (booking?.id) {
                batchedWriter.queueFieldUpdate(booking.id, columnId, result);
              }
            }
          }
        }

        // If any results changed, recursively compute their dependents
        if (hasChanges) {
          for (const { columnId, result } of results) {
            if (result !== undefined) {
              const oldValue = currentData[columnId as keyof Booking];
              if (oldValue !== result) {
                updatedData = await executeDirectDependents(
                  columnId,
                  updatedData,
                );
              }
            }
          }
        }

        return updatedData;
      } catch (error) {
        console.error(`Error in direct dependents execution:`, error);
        return currentData;
      }
    },
    [dependencyGraph, executeFunction, booking?.id],
  );

  // Handle applying a selected pricing version
  const handleApplyPricingVersion = useCallback(async () => {
    if (!booking?.id || !tourPackageData || !selectedPricingVersion) return;

    const selectedOption = pricingVersionOptions.find(
      (option) => option.version === selectedPricingVersion,
    );

    if (!selectedOption) return;

    let originalTourCost = selectedOption.pricing.original;
    let discountedTourCost = selectedOption.pricing.discounted ?? undefined;
    let reservationFee = selectedOption.pricing.deposit;

    const bookingDateKey = getDateKey(formData.tourDate);
    if (bookingDateKey && selectedOption.travelDates?.length) {
      const matchingDate = selectedOption.travelDates.find((td) => {
        const entryKey = td.date?.split("T")[0];
        return entryKey === bookingDateKey;
      });

      if (matchingDate) {
        if (matchingDate.customOriginal !== undefined) {
          originalTourCost = matchingDate.customOriginal;
        }
        if (
          matchingDate.customDiscounted !== undefined &&
          matchingDate.customDiscounted !== null
        ) {
          discountedTourCost = matchingDate.customDiscounted;
        }
        if (matchingDate.customDeposit !== undefined) {
          reservationFee = matchingDate.customDeposit;
        }
      }
    }

    batchedWriter.queueFieldUpdate(booking.id, "lockPricing", true);
    batchedWriter.queueFieldUpdate(booking.id, "priceSource", "snapshot");
    batchedWriter.queueFieldUpdate(
      booking.id,
      "tourPackagePricingVersion",
      selectedPricingVersion,
    );
    batchedWriter.queueFieldUpdate(
      booking.id,
      "priceSnapshotDate",
      serverTimestamp(),
    );
    batchedWriter.queueFieldUpdate(
      booking.id,
      "originalTourCost",
      originalTourCost,
    );
    if (discountedTourCost !== undefined) {
      batchedWriter.queueFieldUpdate(
        booking.id,
        "discountedTourCost",
        discountedTourCost,
      );
    }
    batchedWriter.queueFieldUpdate(
      booking.id,
      "reservationFee",
      reservationFee,
    );

    const updatedFormData: Partial<Booking> = {
      ...formData,
      lockPricing: true,
      priceSource: "snapshot" as "snapshot" | "manual" | "recalculated",
      tourPackagePricingVersion: selectedPricingVersion,
      originalTourCost,
      discountedTourCost,
      reservationFee,
    };

    setFormData(updatedFormData);

    // Recalculate dependent functions (payment amounts, balances, etc.)
    // Execute dependents for each changed pricing field
    let finalData: Partial<Booking> = updatedFormData;
    for (const fieldId of [
      "originalTourCost",
      "discountedTourCost",
      "reservationFee",
    ]) {
      finalData = await executeDirectDependents(fieldId, finalData);
    }

    if (finalData !== updatedFormData) {
      setFormData(finalData);
    }

    setIsSaving(true);
    debouncedSaveIndicator();
    setShowPricingVersionDialog(false);

    toast({
      title: "Pricing Version Applied",
      description: `Booking updated to pricing version ${selectedPricingVersion}.`,
    });
  }, [
    booking?.id,
    tourPackageData,
    selectedPricingVersion,
    pricingVersionOptions,
    formData,
    getDateKey,
    toast,
    executeDirectDependents,
  ]);

  // Reactive tracking: reload Tour Date options when Tour Package Name changes
  const previousTourPackageName = React.useRef<string | undefined>(undefined);
  const isInitialMount = React.useRef(true);

  useEffect(() => {
    const currentValue = formData.tourPackageName;
    const previousValue = previousTourPackageName.current;

    // On initial mount, just set the ref without triggering reload
    if (isInitialMount.current) {
      previousTourPackageName.current = currentValue;
      isInitialMount.current = false;
      return;
    }

    // Skip if the user hasn't actively changed tour details (prevents overwriting historical data on load)
    if (!hasUserChangedTourDetailsRef.current && currentValue) {
      previousTourPackageName.current = currentValue;
      return;
    }

    // Reload if the value changed and currentValue is not undefined/empty
    if (currentValue !== previousValue && currentValue) {
      console.log("📊 [EDIT BOOKING MODAL] Tour Package Name changed:", {
        from: previousValue,
        to: currentValue,
      });

      // Clear existing tourDate value both locally and in Firebase (only if changing from one package to another)
      if (formData.tourDate && previousValue !== undefined) {
        console.log(
          "🧹 [EDIT BOOKING MODAL] Clearing tourDate due to package change",
        );

        // Create updated data with cleared tourDate
        const updatedData = {
          ...formData,
          tourPackageName: currentValue,
          tourDate: undefined,
        };

        // Update local form state
        setFormData(updatedData);

        // Update Firebase immediately (not using batched writer to ensure it clears before listener restores it)
        if (booking?.id) {
          const bookingRef = doc(db, "bookings", booking.id);
          updateDoc(bookingRef, {
            tourDate: deleteField(),
          }).catch((error) => {
            console.error("Failed to clear tourDate:", error);
          });
        }

        // Trigger recalculation of ALL dependent fields (both tourPackageName and tourDate dependents)
        // This ensures Return Date and other calculated fields are recalculated
        executeDirectDependents("tourPackageName", updatedData).then(
          async (intermediateData) => {
            const finalData = intermediateData || updatedData;
            // Also recalculate tourDate dependents to clear Return Date and other dependent fields
            const fullData = await executeDirectDependents(
              "tourDate",
              finalData,
            );
            if (fullData) {
              setFormData(fullData);
            }
          },
        );
      } else {
        // If no tourDate to clear, just recalculate tourPackageName dependents
        const updatedData = {
          ...formData,
          tourPackageName: currentValue,
        };
        executeDirectDependents("tourPackageName", updatedData).then(
          (finalData) => {
            if (finalData) {
              setFormData(finalData);
            }
          },
        );
      }

      // Reload tour date options for the new package
      reloadTourDateOptions(String(currentValue));
    }

    // Update the ref for next comparison
    previousTourPackageName.current = currentValue;
  }, [
    formData.tourPackageName,
    formData.tourDate,
    booking?.id,
    reloadTourDateOptions,
    executeDirectDependents,
  ]);

  // Debounced wrapper to avoid excessive calls while maintaining responsiveness
  const debouncedExecuteFunctions = React.useCallback(
    (changedColumnId: string, currentData: Partial<Booking>) => {
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer for function execution (100ms for better responsiveness)
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const updatedData = await executeDirectDependents(
            changedColumnId,
            currentData,
          );

          // Update form data with all computed results
          setFormData(updatedData);
        } catch (error) {
          console.error(`Error in function execution:`, error);
        }
      }, 100); // Reduced to 100ms for better responsiveness like BookingsDataGrid
    },
    [executeDirectDependents],
  );

  const handleFieldChange = useCallback(
    (columnId: string, value: any) => {
      if (columnId === "tourPackageName" || columnId === "tourDate") {
        hasUserChangedTourDetailsRef.current = true;
      }

      if (columnId === "eventName") {
        hasUserChangedEventNameRef.current = true;
      }
      // LOCAL FIRST: Update all state in one batch to minimize re-renders
      // Only update if these haven't been set yet (first keystroke)
      setActiveEditingFields((prev) => {
        if (prev.has(columnId)) return prev;
        const newSet = new Set(prev);
        newSet.add(columnId);
        return newSet;
      });

      // Always update local values on keystroke - this is fine for performance
      setLocalFieldValues((prev) => {
        if (prev[columnId] === value) return prev;
        return { ...prev, [columnId]: value };
      });

      // Store the original value the first time we start editing this field
      setOriginalValues((prev) => {
        if (columnId in prev) return prev;
        return { ...prev, [columnId]: formData[columnId as keyof Booking] };
      });

      // Store pending change (will be saved on blur)
      setPendingChanges((prev) => {
        if (prev[columnId] === value) return prev;
        return { ...prev, [columnId]: value };
      });

      // Clear error for this field if it exists (only runs once)
      if (fieldErrors[columnId]) {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[columnId];
          return newErrors;
        });
      }
    },
    [formData, fieldErrors],
  );

  // Get form value for a column (LOCAL FIRST pattern) - memoized for performance
  const getFormValue = useCallback(
    (column: SheetColumn): any => {
      // For function fields: ONLY use formData (Firebase source of truth), ignore local edits
      if (column.dataType === "function") {
        return formData[column.id as keyof Booking] || "";
      }

      // For editable fields: LOCAL FIRST - If user is actively editing this field, use local value
      if (activeEditingFields.has(column.id) && column.id in localFieldValues) {
        return localFieldValues[column.id];
      }

      // Otherwise use formData (which gets updated by Firebase)
      return formData[column.id as keyof Booking] || "";
    },
    [activeEditingFields, localFieldValues, formData],
  );

  // Handle when user finishes editing a field (LOCAL FIRST pattern)
  const handleFieldBlur = useCallback(
    (columnId: string) => {
      console.log(
        `📝 [EDIT BOOKING MODAL] Field editing finished: ${columnId}`,
      );

      // Get pending change value
      const pendingValue = pendingChanges[columnId];
      const originalValue = originalValues[columnId];

      // Only save to Firebase if the value has actually changed from original
      if (pendingValue !== undefined && pendingValue !== originalValue) {
        console.log(
          `💾 [EDIT BOOKING MODAL] Saving to Firebase: ${columnId} = ${pendingValue}`,
        );

        // Show saving indicator
        setIsSaving(true);
        debouncedSaveIndicator();

        // Queue update to Firebase for persistence
        if (booking?.id) {
          batchedWriter.queueFieldUpdate(booking.id, columnId, pendingValue);
        }

        // Create updated data with the new value
        const updatedData = {
          ...formData,
          [columnId]: pendingValue,
        };

        // Update formData with the new value for display
        setFormData(updatedData);

        // Execute dependent functions immediately using the updated data
        // No debounce here - execute immediately on blur for better UX
        executeDirectDependents(columnId, updatedData).then((finalData) => {
          if (finalData) {
            setFormData(finalData);
          }
        });
      }

      // Remove from pending changes
      setPendingChanges((prev) => {
        const newPending = { ...prev };
        delete newPending[columnId];
        return newPending;
      });

      // Remove from original values
      setOriginalValues((prev) => {
        const newOriginal = { ...prev };
        delete newOriginal[columnId];
        return newOriginal;
      });

      // Remove from active editing set immediately (no timeout)
      setActiveEditingFields((prev) => {
        const newSet = new Set(prev);
        newSet.delete(columnId);
        return newSet;
      });
      setLocalFieldValues((prev) => {
        const newValues = { ...prev };
        delete newValues[columnId];
        return newValues;
      });
    },
    [
      pendingChanges,
      originalValues,
      formData,
      booking?.id,
      debouncedSaveIndicator,
      executeDirectDependents,
    ],
  );

  // Handle key events during editing
  const handleFieldKeyDown = useCallback(
    (e: React.KeyboardEvent, columnId: string) => {
      // Find the column to check its type
      const column = columns.find((col) => col.id === columnId);

      if (e.key === "Enter") {
        // For date inputs, open the date picker instead of closing
        if (column?.dataType === "date") {
          const target = e.target as HTMLInputElement;
          if (target.showPicker && typeof target.showPicker === "function") {
            e.preventDefault();
            try {
              target.showPicker();
            } catch (error) {
              // Fallback: just focus the input if showPicker fails
              target.focus();
            }
          }
          return;
        }

        // For other inputs, prevent default and close
        e.preventDefault();

        // User is done editing this field - save changes on blur
        handleFieldBlur(columnId);

        // Remove focus from the input by blurring the active element
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
      if (e.key === "Tab") {
        // Allow Tab to navigate naturally to next input
        // Just save the current field on blur (which will trigger automatically)
        // Don't prevent default - let browser handle Tab navigation
      }
      if (e.key === "Escape") {
        // Prevent default to avoid unwanted behavior
        e.preventDefault();

        // User cancelled editing - discard pending changes and revert to original value
        console.log(
          `🚫 [EDIT BOOKING MODAL] Discarding changes for: ${columnId}`,
        );

        // Get the original value before editing started
        const originalValue =
          originalValues[columnId] ?? formData[columnId as keyof Booking];

        // Remove from pending changes without saving
        setPendingChanges((prev) => {
          const newPending = { ...prev };
          delete newPending[columnId];
          return newPending;
        });

        // Remove from original values
        setOriginalValues((prev) => {
          const newOriginal = { ...prev };
          delete newOriginal[columnId];
          return newOriginal;
        });

        // Remove from active editing fields
        setActiveEditingFields((prev) => {
          const newSet = new Set(prev);
          newSet.delete(columnId);
          return newSet;
        });

        // Remove from local field values
        setLocalFieldValues((prev) => {
          const newValues = { ...prev };
          delete newValues[columnId];
          return newValues;
        });

        // Revert to original value
        setFormData((prev) => ({ ...prev, [columnId]: originalValue }));

        // Remove focus from the input
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    },
    [handleFieldBlur, formData, originalValues],
  );

  // Check if column should be displayed
  const shouldDisplayColumn = (column: SheetColumn) => {
    // Skip columns that are not meant to be displayed in edit view
    if (column.columnName.toLowerCase().includes("delete")) return false;
    if (column.columnName.toLowerCase().includes("action")) return false;

    // Always show all fields in edit mode (including empty ones)
    return true;
  };

  // Render form field based on column type - memoized to prevent unnecessary re-renders
  const renderFormField = useCallback(
    (column: SheetColumn) => {
      const value = getFormValue(column);
      const isComputing = computingFields.has(column.id);
      const error = fieldErrors[column.id];
      const isFunction = column.dataType === "function";
      // Disable function columns, and also disable tourPackageName/tourDate when booking is locked
      const isLocked = formData.lockPricing === true;
      const isPricingField =
        column.id === "tourPackageName" || column.id === "tourDate";
      const isReadOnly = isFunction || (isLocked && isPricingField);

      const baseClasses = cn(
        "w-full text-[11px] sm:text-xs",
        error && "border-red-500",
        isReadOnly && "bg-muted cursor-not-allowed",
      );

      const fieldId = `field-${column.id}`;

      switch (column.dataType) {
        case "boolean":
          // Check if this is the "Send Email?" field and prevent toggling if no draft link exists
          const isSendEmailField =
            column.id === "sendEmail" || column.id === "sendCancellationEmail";
          const hasDraftLink = isSendEmailField
            ? column.id === "sendEmail"
              ? Boolean(formData.emailDraftLink)
              : Boolean(formData.cancellationEmailDraftLink)
            : true;

          return (
            <div className="flex items-center space-x-2">
              <Switch
                id={fieldId}
                checked={Boolean(value)}
                onCheckedChange={(checked) => {
                  // Use startTransition to prevent flushSync errors on mobile
                  startTransition(() => {
                    console.log(
                      `🔘 Boolean field toggled: ${column.id} = ${checked}`,
                    );
                    console.log(`📊 Current formData for draft link:`, {
                      emailDraftLink: formData.emailDraftLink,
                      cancellationEmailDraftLink:
                        formData.cancellationEmailDraftLink,
                    });

                    // Prevent toggling on if it's a send email field and there's no draft link
                    if (isSendEmailField && checked && !hasDraftLink) {
                      toast({
                        title: "Cannot Send Email",
                        description:
                          column.id === "sendEmail"
                            ? "Please generate an email draft first before sending."
                            : "Please generate a cancellation email draft first before sending.",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Show confirmation modal for sendEmail
                    if (column.id === "sendEmail" && checked) {
                      setShowSendEmailConfirmation(true);
                      return; // Don't proceed until user confirms
                    }

                    // Prevent toggling "Enable Payment Reminder" on if payment plan or payment method is missing
                    const isEnablePaymentReminderField =
                      column.id === "enablePaymentReminder";
                    if (isEnablePaymentReminderField && checked) {
                      const paymentPlan = String(formData.paymentPlan || "");
                      const hasPaymentPlan = Boolean(formData.paymentPlan);
                      const hasPaymentMethod = Boolean(formData.paymentMethod);

                      if (paymentPlan.toLowerCase() === "full payment") {
                        toast({
                          title: "Payment Reminder Not Required",
                          description:
                            "Full Payment plan does not require payment reminders.",
                        });
                        return;
                      }

                      if (!hasPaymentPlan || !hasPaymentMethod) {
                        toast({
                          title: "Cannot Enable Payment Reminder",
                          description:
                            "Please set Payment Plan and Payment Method before enabling payment reminders.",
                          variant: "destructive",
                        });
                        return;
                      }

                      setShowPaymentReminderConfirmation(true);
                      return;
                    }

                    // Prevent toggling "Generate Email Draft" on if payment plan or payment method exists
                    const isGenerateEmailDraftField =
                      column.id === "generateEmailDraft";
                    if (isGenerateEmailDraftField && checked) {
                      const hasPaymentPlan = Boolean(formData.paymentPlan);
                      const hasPaymentMethod = Boolean(formData.paymentMethod);

                      if (hasPaymentPlan || hasPaymentMethod) {
                        toast({
                          title: "Cannot Generate Reservation Email",
                          description:
                            "Payment Plan and Payment Method must be empty for reservation emails. Please clear them first.",
                          variant: "destructive",
                        });
                        return;
                      }
                    }

                    // Check if this is enablePaymentReminder being toggled OFF
                    const isEnablePaymentReminder =
                      column.id === "enablePaymentReminder";
                    const wasEnabled = Boolean(formData[column.id]);

                    if (
                      isEnablePaymentReminder &&
                      wasEnabled &&
                      !checked &&
                      booking?.id
                    ) {
                      // Toggle OFF: Clean up scheduled emails first
                      setIsCleaningScheduledEmails(true);

                      ScheduledEmailService.deletePaymentReminders(booking.id)
                        .then(() => {
                          // Now update the field
                          batchedWriter.queueFieldUpdate(
                            booking.id,
                            column.id,
                            checked,
                          );
                          setFormData((prev) => ({
                            ...prev,
                            [column.id]: checked,
                          }));
                          setIsSaving(true);
                          debouncedSaveIndicator();

                          toast({
                            title: "Payment Reminders Disabled",
                            description:
                              "All scheduled payment reminder emails have been deleted.",
                          });
                        })
                        .catch((error) => {
                          console.error(
                            "Error cleaning scheduled emails:",
                            error,
                          );
                          toast({
                            title: "Error",
                            description:
                              "Failed to clean up scheduled emails. Please try again.",
                            variant: "destructive",
                          });
                        })
                        .finally(() => {
                          setIsCleaningScheduledEmails(false);
                        });

                      return; // Don't continue with normal flow
                    }

                    // For switches, commit immediately to Firebase (discrete choice)
                    if (booking?.id) {
                      batchedWriter.queueFieldUpdate(
                        booking.id,
                        column.id,
                        checked,
                      );
                    }
                    setFormData((prev) => ({ ...prev, [column.id]: checked }));
                    setIsSaving(true);
                    debouncedSaveIndicator();

                    // Mark this boolean field as computing to prevent rapid toggling
                    setComputingFields((prev) => new Set([...prev, column.id]));

                    // For email-related fields, invalidate cache to force fresh execution
                    if (
                      column.id === "generateEmailDraft" ||
                      column.id === "generateCancellationDraft" ||
                      column.id === "sendEmail" ||
                      column.id === "sendCancellationEmail"
                    ) {
                      // Find the dependent function column and invalidate by function name
                      const dependents = dependencyGraph.get(column.id) || [];
                      dependents.forEach((dep) => {
                        if (dep.function) {
                          console.log(
                            `🗑️ Invalidating cache for function: ${dep.function}`,
                          );
                          functionExecutionService.invalidate(dep.function);
                        }
                      });
                    }

                    // Execute dependent functions immediately
                    executeDirectDependents(column.id, {
                      ...formData,
                      [column.id]: checked,
                    })
                      .then((finalData) => {
                        console.log(
                          `✅ Dependents completed for ${column.id}`,
                          {
                            finalData,
                            emailDraftLink: finalData?.emailDraftLink,
                            cancellationEmailDraftLink:
                              finalData?.cancellationEmailDraftLink,
                          },
                        );
                        if (finalData) {
                          // Force update formData with final results to prevent stale values
                          setFormData(finalData);
                        }
                      })
                      .finally(() => {
                        // Remove boolean field from computing state
                        setComputingFields((prev) => {
                          const newSet = new Set(prev);
                          newSet.delete(column.id);
                          return newSet;
                        });
                      });
                  });
                }}
                disabled={isReadOnly || isComputing}
              />
              <Label htmlFor={fieldId} className="text-xs font-medium">
                {value ? "Yes" : "No"}
              </Label>
            </div>
          );

        case "date":
          return (
            <Input
              id={fieldId}
              type="date"
              value={(() => {
                if (value) {
                  try {
                    let date: Date | null = null;
                    if (
                      value &&
                      typeof value === "object" &&
                      "toDate" in value &&
                      typeof (value as any).toDate === "function"
                    ) {
                      date = (value as any).toDate();
                    } else if (
                      value &&
                      typeof value === "object" &&
                      "seconds" in value &&
                      typeof (value as any).seconds === "number"
                    ) {
                      date = new Date((value as any).seconds * 1000);
                    } else if (typeof value === "number") {
                      if (value > 1000000000000) {
                        date = new Date(value);
                      } else {
                        date = new Date(value * 1000);
                      }
                    } else if (typeof value === "string") {
                      const numericValue = parseFloat(value);
                      if (!isNaN(numericValue)) {
                        if (numericValue > 1000000000000) {
                          date = new Date(numericValue);
                        } else {
                          date = new Date(numericValue * 1000);
                        }
                      } else {
                        date = new Date(value);
                      }
                    } else if (value instanceof Date) {
                      date = value;
                    }
                    if (date && !isNaN(date.getTime())) {
                      return date.toISOString().split("T")[0];
                    }
                  } catch (error) {
                    console.error("Date conversion error:", error);
                  }
                }
                return "";
              })()}
              onChange={(e) => {
                const dateValue = e.target.value
                  ? new Date(e.target.value)
                  : null;

                hasUserChangedTourDetailsRef.current = true;

                // For date picker, commit immediately to Firebase
                if (booking?.id) {
                  batchedWriter.queueFieldUpdate(
                    booking.id,
                    column.id,
                    dateValue,
                  );
                }
                setFormData((prev) => ({ ...prev, [column.id]: dateValue }));
                setIsSaving(true);
                debouncedSaveIndicator();

                // Execute dependent functions immediately
                executeDirectDependents(column.id, {
                  ...formData,
                  [column.id]: dateValue,
                }).then((finalData) => {
                  if (finalData) {
                    setFormData(finalData);
                  }
                });
              }}
              onKeyDown={(e) => handleFieldKeyDown(e, column.id)}
              className={cn(
                baseClasses,
                "text-xs [&::-webkit-calendar-picker-indicator]:text-xs",
              )}
              disabled={isReadOnly || isComputing}
              autoComplete="off"
            />
          );

        case "select":
          // Calculate options inline (lightweight operation, no need for useMemo)
          const options = dynamicOptions[column.id] || column.options || [];

          // Special handling for tourDate - display as dd/mm/yyyy
          let displayValue: string;
          if (column.id === "tourDate" && value) {
            // Import the formatTimestampToMonthDayYear helper
            const {
              formatTimestampToMonthDayYear,
            } = require("@/lib/booking-calculations");
            displayValue =
              formatTimestampToMonthDayYear(value) || String(value || "");
          } else {
            displayValue = String(value || "");
          }

          const currentValue = displayValue;
          const hasCurrentValue = currentValue && currentValue !== "";
          const currentValueInOptions = options.includes(currentValue);
          const hasEmptyOption = options.includes("");

          // Build final options list
          const selectOptions = [...options];

          // Add current value if it's not in options and not empty
          if (hasCurrentValue && !currentValueInOptions) {
            selectOptions.unshift(currentValue);
          }

          // Add placeholder option if no value selected AND no empty option exists
          if (!hasCurrentValue && !hasEmptyOption) {
            selectOptions.unshift("");
          }

          // Special wrapper for tourDate with date picker
          if (column.id === "tourDate") {
            // Convert Timestamp to local date string for native date input (avoid timezone shift)
            let dateInputValue = "";
            if (value && typeof value === "object" && "toDate" in value) {
              const date = value.toDate();
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              dateInputValue = `${year}-${month}-${day}`;
            }

            return (
              <div className="flex items-center gap-2">
                <select
                  id={fieldId}
                  value={currentValue}
                  onChange={async (e) => {
                    const newValue = e.target.value;

                    // Special handling for tourDate - convert Month Day Year back to Timestamp
                    let valueToSave = newValue;
                    if (newValue) {
                      const {
                        parseMonthDayYear,
                      } = require("@/lib/booking-calculations");
                      const { Timestamp } = await import("firebase/firestore");

                      // Convert "Month Day Year" string to Date
                      const dateObj = parseMonthDayYear(newValue);
                      if (dateObj) {
                        // Set time to 9:00 AM UTC+8
                        dateObj.setHours(9, 0, 0, 0);

                        // Validate that this date exists in the tour package's travelDates
                        const tourPackageName = formData.tourPackageName;
                        if (tourPackageName) {
                          const { collection, getDocs, query, where } =
                            await import("firebase/firestore");
                          const { db } = await import("@/lib/firebase");

                          const tourPackagesRef = collection(
                            db,
                            "tourPackages",
                          );
                          const q = query(
                            tourPackagesRef,
                            where("name", "==", tourPackageName),
                          );
                          const snapshot = await getDocs(q);

                          if (!snapshot.empty) {
                            const tourData = snapshot.docs[0].data();
                            const travelDates = tourData.travelDates || [];
                            const {
                              formatTimestampToMonthDayYear,
                            } = require("@/lib/booking-calculations");

                            // Check if selected date exists in travelDates
                            const dateExists = travelDates.some((td: any) => {
                              return (
                                formatTimestampToMonthDayYear(td.startDate) ===
                                newValue
                              );
                            });

                            if (!dateExists) {
                              console.warn(
                                `Selected date ${newValue} does not exist in tour package travelDates`,
                              );
                            }
                          }
                        }

                        // Convert to Firebase Timestamp
                        valueToSave = Timestamp.fromDate(dateObj) as any;
                      } else {
                        console.error("Failed to parse date:", newValue);
                        valueToSave = newValue;
                      }
                    }

                    // For select, commit immediately to Firebase (discrete choice)
                    if (booking?.id) {
                      batchedWriter.queueFieldUpdate(
                        booking.id,
                        column.id,
                        valueToSave,
                      );
                    }

                    // Auto-lock pricing when tourDate is selected (only if tourPackageName exists)
                    if (
                      column.id === "tourDate" &&
                      valueToSave &&
                      formData.tourPackageName
                    ) {
                      if (booking?.id) {
                        batchedWriter.queueFieldUpdate(
                          booking.id,
                          "lockPricing",
                          true,
                        );
                        batchedWriter.queueFieldUpdate(
                          booking.id,
                          "priceSource",
                          "snapshot",
                        );
                        if (tourPackageData?.currentVersion) {
                          batchedWriter.queueFieldUpdate(
                            booking.id,
                            "tourPackagePricingVersion",
                            tourPackageData.currentVersion,
                          );
                        }
                        if (!formData.priceSnapshotDate) {
                          batchedWriter.queueFieldUpdate(
                            booking.id,
                            "priceSnapshotDate",
                            serverTimestamp(),
                          );
                        }
                      }

                      setFormData((prev) => ({
                        ...prev,
                        [column.id]: valueToSave,
                        lockPricing: true,
                        priceSource: "snapshot" as
                          | "snapshot"
                          | "manual"
                          | "recalculated",
                        tourPackagePricingVersion:
                          tourPackageData?.currentVersion ??
                          prev.tourPackagePricingVersion,
                      }));
                    } else {
                      setFormData((prev) => ({
                        ...prev,
                        [column.id]: valueToSave,
                      }));
                    }

                    // Special handling: reload eventName options when tourDate changes
                    if (
                      column.id === "tourDate" &&
                      valueToSave &&
                      formData.tourPackageName
                    ) {
                      reloadEventNameOptions(
                        formData.tourPackageName,
                        valueToSave,
                      );
                    }

                    setIsSaving(true);
                    debouncedSaveIndicator();

                    // Execute dependent functions immediately
                    executeDirectDependents(column.id, {
                      ...formData,
                      [column.id]: valueToSave,
                    }).then((finalData) => {
                      if (finalData) {
                        setFormData(finalData);
                      }
                    });
                  }}
                  className={cn(
                    "flex h-10 w-full bg-gray-200 items-center justify-between rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer pr-10",
                    error && "border-red-500",
                    isReadOnly && "opacity-50",
                  )}
                  disabled={isReadOnly || isComputing}
                >
                  {selectOptions.map((option, index) => (
                    <option
                      key={option || `placeholder-${column.id}-${index}`}
                      value={option}
                    >
                      {option || `Select ${column.columnName}`}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground font-medium">
                  OR
                </span>
                <Input
                  type="date"
                  value={dateInputValue}
                  onChange={async (e) => {
                    const selectedDate = e.target.value;
                    if (!selectedDate) return;

                    const { Timestamp } = await import("firebase/firestore");
                    const dateObj = new Date(selectedDate);
                    // Set time to 9:00 AM UTC+8
                    dateObj.setHours(9, 0, 0, 0);
                    const valueToSave = Timestamp.fromDate(dateObj) as any;

                    // For date picker, commit immediately to Firebase
                    if (booking?.id) {
                      batchedWriter.queueFieldUpdate(
                        booking.id,
                        column.id,
                        valueToSave,
                      );
                    }
                    setFormData((prev) => ({
                      ...prev,
                      [column.id]: valueToSave,
                    }));
                    setIsSaving(true);
                    debouncedSaveIndicator();

                    // Execute dependent functions immediately
                    executeDirectDependents(column.id, {
                      ...formData,
                      [column.id]: valueToSave,
                    }).then((finalData) => {
                      if (finalData) {
                        setFormData(finalData);
                      }
                    });
                  }}
                  className={cn(
                    "h-10 w-auto flex-shrink-0",
                    error && "border-red-500",
                  )}
                  disabled={isReadOnly || isComputing}
                />
              </div>
            );
          }

          // Regular select for other columns
          return (
            <select
              id={fieldId}
              value={currentValue}
              onChange={async (e) => {
                const newValue = e.target.value;

                // Special handling for tourDate - convert dd/mm/yyyy back to Timestamp
                let valueToSave = newValue;
                if (column.id === "tourDate" && newValue) {
                  const { toDate } = require("@/lib/booking-calculations");
                  const { Timestamp } = await import("firebase/firestore");

                  // Convert dd/mm/yyyy string to Date
                  const dateObj = toDate(newValue);
                  if (dateObj) {
                    // Validate that this date exists in the tour package's travelDates
                    const tourPackageName = formData.tourPackageName;
                    if (tourPackageName) {
                      const { collection, getDocs, query, where } =
                        await import("firebase/firestore");
                      const { db } = await import("@/lib/firebase");

                      const tourPackagesRef = collection(db, "tourPackages");
                      const q = query(
                        tourPackagesRef,
                        where("name", "==", tourPackageName),
                      );
                      const snapshot = await getDocs(q);

                      if (!snapshot.empty) {
                        const tourData = snapshot.docs[0].data();
                        const travelDates = tourData.travelDates || [];
                        const {
                          formatTimestampToDDMMYYYY,
                        } = require("@/lib/booking-calculations");

                        // Check if selected date exists in travelDates
                        const dateExists = travelDates.some((td: any) => {
                          return (
                            formatTimestampToDDMMYYYY(td.startDate) === newValue
                          );
                        });

                        if (!dateExists) {
                          console.warn(
                            `Selected date ${newValue} does not exist in tour package travelDates`,
                          );
                        }
                      }
                    }

                    // Convert to Firebase Timestamp
                    valueToSave = Timestamp.fromDate(dateObj) as any;
                  } else {
                    console.error("Failed to parse date:", newValue);
                    valueToSave = newValue;
                  }
                }

                // For select, commit immediately to Firebase (discrete choice)
                if (booking?.id) {
                  batchedWriter.queueFieldUpdate(
                    booking.id,
                    column.id,
                    valueToSave,
                  );
                }
                setFormData((prev) => ({
                  ...prev,
                  [column.id]: valueToSave,
                }));

                // Special handling: reload dependent options when tourPackageName changes
                if (column.id === "tourPackageName" && valueToSave) {
                  // Reload tourDate options
                  reloadTourDateOptions(valueToSave);
                }

                setIsSaving(true);
                debouncedSaveIndicator();

                // Execute dependent functions immediately
                executeDirectDependents(column.id, {
                  ...formData,
                  [column.id]: valueToSave,
                }).then((finalData) => {
                  if (finalData) {
                    setFormData(finalData);
                  }
                });
              }}
              className={cn(
                "flex h-10 w-full bg-gray-200 items-center justify-between rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer pr-10",
                error && "border-red-500",
                isReadOnly && "opacity-50",
              )}
              disabled={isReadOnly || isComputing}
            >
              {selectOptions.map((option, index) => (
                <option
                  key={option || `placeholder-${column.id}-${index}`}
                  value={option}
                >
                  {option || `Select ${column.columnName}`}
                </option>
              ))}
            </select>
          );

        case "number":
        case "currency":
          return (
            <Input
              id={fieldId}
              type="number"
              step={column.dataType === "currency" ? "0.01" : "any"}
              value={String(value || "")}
              onChange={(e) =>
                handleFieldChange(column.id, Number(e.target.value) || 0)
              }
              onBlur={() => handleFieldBlur(column.id)}
              onKeyDown={(e) => handleFieldKeyDown(e, column.id)}
              className={baseClasses}
              disabled={isReadOnly || isComputing}
              placeholder={`Enter ${column.columnName}`}
              autoComplete="off"
            />
          );

        case "function":
          return (
            <div className="flex items-start gap-2">
              <Textarea
                id={fieldId}
                value={String(value || "")}
                className={cn(
                  "w-full font-mono bg-background text-[11px] sm:text-xs resize-y min-h-[2.5rem]",
                  error && "border-red-500",
                  isComputing && "opacity-50",
                )}
                disabled={true}
                placeholder={isComputing ? "Computing..." : ""}
                autoComplete="off"
                rows={1}
              />
              {isComputing && (
                <RefreshCw className="h-4 w-4 animate-spin text-royal-purple" />
              )}
              {!isComputing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  tabIndex={-1}
                  onClick={async () => {
                    if (!booking?.id) return;
                    setComputingFields((prev) => new Set([...prev, column.id]));
                    try {
                      // First, recompute this specific function column
                      const result = await executeFunction(column, formData);

                      if (result !== undefined) {
                        // Update form data with the computed result
                        const updatedData = {
                          ...formData,
                          [column.id]: result,
                        };

                        // Queue Firebase update
                        batchedWriter.queueFieldUpdate(
                          booking.id,
                          column.id,
                          result,
                        );

                        // Then compute dependent functions
                        const finalData = await executeDirectDependents(
                          column.id,
                          updatedData,
                        );

                        if (finalData) {
                          setFormData(finalData);
                        }
                      }
                    } catch (error) {
                      console.error(
                        `Error recomputing ${column.columnName}:`,
                        error,
                      );
                      toast({
                        title: "Recomputation Failed",
                        description: `Failed to recompute ${column.columnName}`,
                        variant: "destructive",
                      });
                    } finally {
                      setComputingFields((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(column.id);
                        return newSet;
                      });
                    }
                  }}
                  className="hidden sm:flex h-7 w-7 p-0"
                >
                  <RefreshCw className="h-3 w-3 text-royal-purple" />
                </Button>
              )}
            </div>
          );

        case "email":
          return (
            <Input
              id={fieldId}
              type="email"
              value={String(value || "")}
              onChange={(e) => handleFieldChange(column.id, e.target.value)}
              onBlur={() => handleFieldBlur(column.id)}
              onKeyDown={(e) => handleFieldKeyDown(e, column.id)}
              className={baseClasses}
              disabled={isReadOnly || isComputing}
              placeholder={`Enter ${column.columnName}`}
              autoComplete="off"
            />
          );

        default: // string and others
          const isLinkField = column.id.endsWith("Link");
          const linkValue = isLinkField ? String(value || "") : "";

          return column.columnName.toLowerCase().includes("description") ||
            column.columnName.toLowerCase().includes("reason") ||
            column.columnName.toLowerCase().includes("notes") ? (
            <Textarea
              id={fieldId}
              value={String(value || "")}
              onChange={(e) => handleFieldChange(column.id, e.target.value)}
              onBlur={() => handleFieldBlur(column.id)}
              onKeyDown={(e) => handleFieldKeyDown(e, column.id)}
              className={baseClasses}
              disabled={isReadOnly || isComputing}
              placeholder={`Enter ${column.columnName}`}
              rows={3}
              autoComplete="off"
            />
          ) : isLinkField ? (
            <div className="flex items-center gap-2">
              <Input
                id={fieldId}
                value={String(value || "")}
                onChange={(e) => handleFieldChange(column.id, e.target.value)}
                onBlur={() => handleFieldBlur(column.id)}
                onKeyDown={(e) => handleFieldKeyDown(e, column.id)}
                className={baseClasses}
                disabled={isReadOnly || isComputing}
                placeholder={`Enter ${column.columnName}`}
                autoComplete="off"
              />
              {linkValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  tabIndex={-1}
                  onClick={() => {
                    if (linkValue) {
                      window.open(linkValue, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className="h-7 w-7 p-0 flex-shrink-0"
                  title="Open link in new tab"
                >
                  <svg
                    className="h-3 w-3 text-royal-purple"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </Button>
              )}
            </div>
          ) : (
            <Input
              id={fieldId}
              value={String(value || "")}
              onChange={(e) => handleFieldChange(column.id, e.target.value)}
              onBlur={() => handleFieldBlur(column.id)}
              onKeyDown={(e) => handleFieldKeyDown(e, column.id)}
              className={baseClasses}
              disabled={isReadOnly || isComputing}
              placeholder={`Enter ${column.columnName}`}
              autoComplete="off"
            />
          );
      }
    },
    [
      getFormValue,
      computingFields,
      fieldErrors,
      handleFieldChange,
      handleFieldBlur,
      handleFieldKeyDown,
      booking?.id,
      formData,
      setIsSaving,
      debouncedSaveIndicator,
      executeDirectDependents,
      executeFunction,
      toast,
      batchedWriter,
      dynamicOptions, // Add dynamicOptions to dependencies so select fields re-render when options load
    ],
  );

  // Handle close with computation check
  const handleClose = React.useCallback(() => {
    if (computingFields.size > 0) {
      toast({
        title: "Please Wait",
        description: `Please wait for ${computingFields.size} computation(s) to complete before closing.`,
        variant: "default",
      });
      return;
    }

    // Check if there are unsaved changes (active edits or pending changes)
    const hasActiveEdits = activeEditingFields.size > 0;
    const hasPendingChanges = Object.keys(pendingChanges).length > 0;

    if (hasActiveEdits || hasPendingChanges) {
      // Show confirmation alert
      const confirmed = window.confirm(
        "You have unsaved changes. Do you want to save them before closing?",
      );

      if (confirmed) {
        // Save pending changes before closing
        if (hasPendingChanges && booking?.id) {
          console.log(
            "💾 [EDIT BOOKING MODAL] Saving pending changes before close",
          );
          Object.entries(pendingChanges).forEach(([columnId, value]) => {
            batchedWriter.queueFieldUpdate(booking.id, columnId, value);
          });
        }
        // Close modal (will save changes)
      } else {
        // Discard changes and close
        console.log("🚫 [EDIT BOOKING MODAL] Discarding changes and closing");

        // Clear all local editing state
        setPendingChanges({});
        setOriginalValues({});
        setActiveEditingFields(new Set());
        setLocalFieldValues({});
      }
    }

    // Clear any pending debounced executions
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    onClose();
  }, [
    computingFields.size,
    activeEditingFields.size,
    pendingChanges,
    booking?.id,
    onClose,
    toast,
  ]);

  if (!booking) return null;

  // Group columns by parentTab
  const groupedColumns = columns.reduce(
    (groups, column) => {
      if (!shouldDisplayColumn(column)) return groups;

      const parentTab = column.parentTab || "General";
      if (!groups[parentTab]) {
        groups[parentTab] = [];
      }
      groups[parentTab].push(column);
      return groups;
    },
    {} as Record<string, SheetColumn[]>,
  );

  // Sort columns within each group by order
  Object.keys(groupedColumns).forEach((tab) => {
    groupedColumns[tab].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  });

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

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (showSendEmailConfirmation || showPaymentReminderConfirmation)
            return;
          if (!open) handleClose();
        }}
        modal={true}
      >
        <DialogContent
          className={cn(
            "w-[calc(100%-1rem)] sm:w-full max-w-5xl max-h-[90vh] min-h-[90vh] bg-background p-0 rounded-xl sm:rounded-2xl overflow-hidden",
            (showSendEmailConfirmation || showPaymentReminderConfirmation) &&
              "pointer-events-none",
          )}
          onOpenAutoFocus={(e) => {
            // Prevent dialog from auto-focusing on open
            e.preventDefault();
          }}
        >
          <form
            autoComplete="off"
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                // Get all focusable inputs within the form (including selects, switches, and combobox triggers)
                const focusableElements = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    'input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), button[role="switch"]:not([disabled]):not([tabindex="-1"]), button[role="combobox"]:not([disabled]):not([tabindex="-1"])',
                  ),
                );

                if (focusableElements.length === 0) return;

                const currentIndex = focusableElements.indexOf(
                  document.activeElement as HTMLElement,
                );

                if (currentIndex === -1) return;

                e.preventDefault();
                e.stopPropagation();

                let nextIndex;
                if (e.shiftKey) {
                  // Shift+Tab: go backwards
                  nextIndex = currentIndex - 1;
                  if (nextIndex < 0) {
                    nextIndex = focusableElements.length - 1;
                  }
                } else {
                  // Tab: go forwards
                  nextIndex = currentIndex + 1;
                  if (nextIndex >= focusableElements.length) {
                    nextIndex = 0;
                  }
                }

                focusableElements[nextIndex]?.focus();
              }
            }}
            className="h-full flex flex-col"
            tabIndex={-1}
          >
            <DialogHeader
              className="sticky top-0 z-50 bg-background shadow-md border-b border-border/50 pb-2 sm:pb-3 pt-3 sm:pt-6 px-3 sm:px-6"
              tabIndex={-1}
            >
              <div className="flex items-start sm:items-center justify-between gap-2">
                <DialogTitle className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-gradient-to-br from-crimson-red to-crimson-red/80 rounded-full rounded-br-none shadow-sm">
                    <FaCog className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <span className="block text-sm sm:text-base">
                      Edit Booking
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-2xl font-mono font-semibold text-crimson-red block">
                        {booking.bookingId}
                      </span>
                      {booking.row && (
                        <span
                          className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200"
                          title="Spreadsheet Row Number"
                        >
                          Row {booking.row}
                        </span>
                      )}
                    </div>

                    {/* Live Saving Indicator */}
                    <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-xs">
                      {isSaving ? (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          <span>Saving...</span>
                        </div>
                      ) : lastSaved ? (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span>Saved {lastSaved.toLocaleTimeString()}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <span>Auto-save enabled</span>
                        </div>
                      )}

                      {/* Booking Status URL */}
                      {booking?.access_token && (
                        <>
                          <div className="w-px h-3 bg-border mx-1"></div>
                          <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-md border border-border/50">
                            <a
                              href={`${process.env.NEXT_PUBLIC_WEBSITE_URL}/booking-status/${booking.access_token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                              title="View Booking Status"
                            >
                              View Booking Status{" "}
                              <ExternalLink className="h-2 w-2" />
                            </a>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-4 w-4 rounded-full hover:bg-background"
                              onClick={(e) => {
                                e.preventDefault();
                                navigator.clipboard.writeText(
                                  `${process.env.NEXT_PUBLIC_WEBSITE_URL}/booking-status/${booking.access_token}`,
                                );
                                toast({
                                  title: "Copied!",
                                  description: "Link copied to clipboard",
                                  duration: 2000,
                                });
                              }}
                              title="Copy Link"
                            >
                              <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </DialogTitle>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Mobile close */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className={cn(
                      "sm:hidden h-8 w-8 p-0 hover:bg-gray-100",
                      computingFields.size > 0 &&
                        "opacity-50 cursor-not-allowed",
                    )}
                    disabled={computingFields.size > 0}
                    title={
                      computingFields.size > 0
                        ? `Please wait for ${computingFields.size} computation(s) to complete`
                        : "Close"
                    }
                  >
                    {computingFields.size > 0 ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-royal-purple" />
                    ) : (
                      <FaTimes className="h-4 w-4" />
                    )}
                  </Button>

                  {/* Close Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    className={cn(
                      "hidden sm:flex h-8 w-8 p-0 hover:bg-gray-100",
                      computingFields.size > 0 &&
                        "opacity-50 cursor-not-allowed",
                    )}
                    disabled={computingFields.size > 0}
                    title={
                      computingFields.size > 0
                        ? `Please wait for ${computingFields.size} computation(s) to complete`
                        : "Close"
                    }
                  >
                    {computingFields.size > 0 ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-royal-purple" />
                    ) : (
                      <FaTimes className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Mobile Sections Nav */}
              {!isLoadingColumns && sortedParentTabs.length > 0 && (
                <div className="sm:hidden mt-2 -mb-1">
                  <div className="flex flex-wrap gap-1">
                    {sortedParentTabs.map((parentTab) => {
                      const IconComponent = getParentTabIcon(parentTab);
                      return (
                        <button
                          key={parentTab}
                          onClick={() => scrollToTab(parentTab)}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                            activeTab === parentTab
                              ? "bg-crimson-red text-white"
                              : "bg-muted/50 text-foreground hover:bg-muted"
                          }`}
                        >
                          <IconComponent
                            className={`h-2.5 w-2.5 flex-shrink-0 ${
                              activeTab === parentTab
                                ? "text-white"
                                : "text-crimson-red"
                            }`}
                          />
                          <span>{parentTab}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </DialogHeader>

            <div
              className="flex overflow-hidden max-h-[calc(90vh-120px)]"
              tabIndex={-1}
            >
              {/* Main Content */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto h-[95%] pt-3 pl-3 sm:pl-6 pr-3 sm:pr-0 pb-3 sm:pb-6 scrollbar-hide scroll-optimized"
                tabIndex={-1}
              >
                {isLoadingColumns ? (
                  <Card className="bg-background shadow-sm border border-border/50">
                    <CardContent className="p-6 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-crimson-red mx-auto mb-2"></div>
                      <p className="text-xs text-muted-foreground">
                        Loading...
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4 sm:space-y-6" tabIndex={-1}>
                    {sortedParentTabs.map((parentTab) => {
                      const IconComponent = getParentTabIcon(parentTab);
                      const filteredColumns =
                        groupedColumns[parentTab].filter(shouldDisplayColumn);

                      if (filteredColumns.length === 0) return null;

                      return (
                        <Card
                          key={parentTab}
                          id={`edit-tab-${parentTab}`}
                          className="bg-background shadow-sm border border-border/50 dark:border-border/20 scroll-mt-4"
                          tabIndex={-1}
                        >
                          <CardHeader
                            className="py-2 sm:py-2.5 px-2.5 sm:px-4 bg-crimson-red/10 border-b border-crimson-red/20 dark:border-b dark:border-border/20"
                            tabIndex={-1}
                          >
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-[12px] sm:text-sm font-bold text-foreground flex items-center gap-1.5 sm:gap-2">
                                <div className="p-1 bg-crimson-red/10 rounded-full rounded-br-none">
                                  <IconComponent className="h-3 w-3 sm:h-4 sm:w-4 text-crimson-red" />
                                </div>
                                {parentTab}
                              </CardTitle>

                              {/* Price History Controls - Show only for Payment Setting or Tour Details tabs */}
                              {(parentTab.includes("Payment Setting") ||
                                parentTab.includes("💰") ||
                                parentTab.includes("Tour Details") ||
                                parentTab.includes("🗺️")) &&
                                formData.tourPackageName && (
                                  <div className="flex items-center gap-2">
                                    {/* Pricing Lock Toggle */}
                                    <div className="flex items-center gap-1 px-2 py-1 bg-muted/40 rounded-md border border-border">
                                      <Lock className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground font-medium">
                                        Lock Edits
                                      </span>
                                      <Switch
                                        checked={!!formData.lockPricing}
                                        onCheckedChange={
                                          handlePricingLockToggle
                                        }
                                      />
                                    </div>

                                    {/* Price Source Badge */}
                                    {formData.lockPricing ? (
                                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600">
                                        <Lock className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                        <span className="text-[10px] text-gray-700 dark:text-gray-300 font-medium">
                                          Historical Price
                                        </span>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <HelpCircle className="h-3 w-3 text-gray-500 cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="bottom"
                                              className="max-w-xs"
                                            >
                                              <p className="text-xs">
                                                Locked at{" "}
                                                {formData.priceSnapshotDate
                                                  ?.toDate
                                                  ? formData.priceSnapshotDate
                                                      .toDate()
                                                      .toLocaleDateString()
                                                  : "N/A"}
                                                . Prices won't change when tour
                                                package is updated.
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                    ) : null}

                                    {/* Pricing Version Selector Button */}
                                    {tourPackageData && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedPricingVersion(
                                            formData.tourPackagePricingVersion ||
                                              tourPackageData.currentVersion ||
                                              1,
                                          );
                                          setShowPricingVersionDialog(true);
                                        }}
                                        className="h-7 text-[10px] gap-1"
                                      >
                                        <RefreshCw className="h-3 w-3" />
                                        Version{" "}
                                        {formData.tourPackagePricingVersion ||
                                          tourPackageData.currentVersion ||
                                          "-"}
                                        {formData.tourPackagePricingVersion &&
                                        tourPackageData.currentVersion &&
                                        formData.tourPackagePricingVersion ===
                                          tourPackageData.currentVersion
                                          ? " (Current)"
                                          : ""}
                                      </Button>
                                    )}
                                  </div>
                                )}
                            </div>
                          </CardHeader>
                          <CardContent className="p-0" tabIndex={-1}>
                            <div className="border border-field-border">
                              {filteredColumns.map((column) => {
                                const error = fieldErrors[column.id];
                                const isFunction =
                                  column.dataType === "function";

                                return (
                                  <div
                                    key={column.id}
                                    className={cn(
                                      "flex items-center justify-between border border-field-border transition-colors",
                                      error && "bg-red-50/50",
                                      isFunction
                                        ? "bg-sunglow-yellow/20 hover:bg-sunglow-yellow/30 border-sunglow-yellow/30 dark:border-sunglow-yellow/40"
                                        : "hover:bg-muted/10",
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 w-[40%] px-2.5 sm:px-3 py-1.5 sm:py-2 border-r border-field-border">
                                      <Label
                                        htmlFor={`field-${column.id}`}
                                        className="text-[11px] sm:text-xs font-medium"
                                      >
                                        {column.columnName}
                                      </Label>
                                      {column.id === "tourDate" && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="right"
                                              className="max-w-xs"
                                            >
                                              <p className="text-xs">
                                                To be able to see the dates
                                                explicitly in the dropdown, edit
                                                the tour dates in the Tour
                                                Packages page
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {column.id ===
                                        "reasonForCancellation" && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="right"
                                              className="max-w-xs"
                                            >
                                              <p className="text-xs">
                                                Select the reason for
                                                cancellation. Options starting
                                                with "Guest -" indicate
                                                guest-initiated cancellations,
                                                while "IHT -" indicates we
                                                cancelled the tour. The prefix
                                                determines refund eligibility -
                                                only IHT cancellations can
                                                refund the Reservation Fee.
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {column.id ===
                                        "supplierCostsCommitted" && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="right"
                                              className="max-w-xs"
                                            >
                                              <p className="text-xs">
                                                Enter any non-refundable costs
                                                we've already paid to suppliers
                                                (hotels, guides, etc.). These
                                                costs will be deducted from the
                                                guest's refund amount. Leave at
                                                0 if no costs were committed.
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {column.id === "isNoShow" && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="right"
                                              className="max-w-xs"
                                            >
                                              <p className="text-xs">
                                                Check this box if the guest
                                                failed to show up for the tour
                                                without prior notice. No-shows
                                                are not eligible for any
                                                refunds.
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                    <div className="w-[60%] px-2.5 sm:px-3 py-1.5 sm:py-2">
                                      <div className="space-y-1.5 sm:space-y-2">
                                        {renderFormField(column)}
                                        {error && (
                                          <p className="text-[11px] sm:text-xs text-red-600">
                                            {error}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Navigation Sidebar */}
              {!isLoadingColumns && sortedParentTabs.length > 0 && (
                <div
                  className="hidden lg:block w-48 border-l border-border/50 p-4"
                  tabIndex={-1}
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Sections
                  </h3>
                  <nav className="space-y-1">
                    {sortedParentTabs.map((parentTab) => {
                      const IconComponent = getParentTabIcon(parentTab);
                      const filteredColumns =
                        groupedColumns[parentTab].filter(shouldDisplayColumn);

                      if (filteredColumns.length === 0) return null;

                      return (
                        <button
                          key={parentTab}
                          onClick={() => scrollToTab(parentTab)}
                          tabIndex={-1}
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
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Loading Modal for Cleaning Scheduled Emails */}
      {isCleaningScheduledEmails && (
        <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-red-600/20">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Clearing Payment Reminders
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Removing all scheduled reminder emails...
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-md p-3">
                <p>• Deleting scheduled payment reminder emails</p>
                <p>• Clearing P1-P4 scheduled email links</p>
                <p>• Updating booking settings</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal for Email Generation */}
      {isGeneratingEmail && (
        <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-royal-purple/20">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-royal-purple/20 border-t-royal-purple"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <MdEmail className="h-5 w-5 text-royal-purple" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {emailGenerationProgress.action === "generating"
                      ? "Generating Email Draft"
                      : emailGenerationProgress.action === "deleting"
                        ? "Deleting Email Draft"
                        : "Sending Email"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {emailGenerationProgress.action === "generating"
                      ? emailGenerationProgress.type === "reservation"
                        ? "Creating reservation email draft in Gmail..."
                        : "Creating cancellation email draft in Gmail..."
                      : emailGenerationProgress.action === "deleting"
                        ? emailGenerationProgress.type === "reservation"
                          ? "Deleting reservation email draft if it exists..."
                          : "Deleting cancellation email draft if it exists..."
                        : emailGenerationProgress.type === "reservation"
                          ? "Sending reservation email to customer..."
                          : "Sending cancellation email to customer..."}
                  </p>
                </div>
              </div>
              {emailGenerationProgress.bookingId && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Booking ID:</span>
                    <span className="font-mono text-foreground font-medium">
                      {emailGenerationProgress.bookingId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Email Type:</span>
                    <span className="font-medium text-foreground capitalize">
                      {emailGenerationProgress.type}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-center text-muted-foreground flex items-center justify-center gap-2">
                      <span className="inline-block animate-pulse">⏳</span>
                      This may take a few moments...
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={showSendEmailConfirmation}
        onOpenChange={(open) => {
          if (!open) handleSendEmailCancel();
        }}
        modal={true}
      >
        <DialogContent
          hideClose
          className="max-w-2xl w-[calc(100%-2rem)] sm:w-full z-[100000]"
        >
          <DialogTitle className="sr-only">Confirm Send Email</DialogTitle>
          <div className="flex flex-col space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-royal-purple/10 rounded-lg">
                  <MdEmail className="h-6 w-6 text-royal-purple" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Confirm Send Email
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Please review the booking details before sending
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSendEmailCancel}
                className="h-8 w-8"
              >
                <FaTimes className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Traveler Name
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.fullName || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Booking ID
                  </p>
                  <p className="font-mono font-semibold text-foreground">
                    {formData.bookingId || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tour Name
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.tourPackageName || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Booking Type
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.bookingType || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tour Date
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.tourDate
                      ? (() => {
                          const dateVal = formData.tourDate as any;
                          const date = dateVal?.toDate
                            ? dateVal.toDate()
                            : new Date(dateVal);
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          });
                        })()
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Return Date
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.returnDate
                      ? (() => {
                          const dateVal = formData.returnDate as any;
                          const date = dateVal?.toDate
                            ? dateVal.toDate()
                            : new Date(dateVal);
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          });
                        })()
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tour Duration
                  </p>
                  <p className="font-semibold text-foreground">
                    {formatTourDuration(formData.tourDuration) || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Reservation Fee
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.reservationFee
                      ? `£${Number(formData.reservationFee).toFixed(2)}`
                      : "N/A"}
                  </p>
                </div>
              </div>

              {(formData.p1Amount ||
                formData.fullPaymentAmount ||
                formData.p2Amount ||
                formData.p3Amount ||
                formData.p4Amount) && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">
                      Payment Terms
                    </p>
                  </div>
                  <div className="p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 font-semibold text-foreground">
                            Payment Terms
                          </th>
                          <th className="text-left py-2 px-2 font-semibold text-foreground">
                            Amount
                          </th>
                          <th className="text-left py-2 px-2 font-semibold text-foreground">
                            Due Date(s)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.p1Amount && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground">
                              P1 – Full payment
                            </td>
                            <td className="py-2 px-2 text-foreground font-mono">
                              £{Number(formData.p1Amount).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-foreground">
                              {formData.p1DueDate || "N/A"}
                            </td>
                          </tr>
                        )}
                        {formData.fullPaymentAmount && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground">
                              Full Payment (Last Minute)
                            </td>
                            <td className="py-2 px-2 text-foreground font-mono">
                              £{Number(formData.fullPaymentAmount).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-foreground">
                              {formData.fullPaymentDueDate
                                ? typeof formData.fullPaymentDueDate ===
                                  "string"
                                  ? formData.fullPaymentDueDate
                                  : formData.fullPaymentDueDate instanceof Date
                                    ? formData.fullPaymentDueDate.toLocaleDateString(
                                        "en-US",
                                        {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        },
                                      )
                                    : "N/A"
                                : "N/A"}
                            </td>
                          </tr>
                        )}
                        {formData.p2Amount && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground">
                              P2 – Two payments
                            </td>
                            <td className="py-2 px-2 text-foreground font-mono">
                              £{Number(formData.p2Amount).toFixed(2)} /month
                            </td>
                            <td className="py-2 px-2 text-foreground">
                              {formData.p2DueDate || "N/A"}
                            </td>
                          </tr>
                        )}
                        {formData.p3Amount && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground">
                              P3 – Three payments
                            </td>
                            <td className="py-2 px-2 text-foreground font-mono">
                              £{Number(formData.p3Amount).toFixed(2)} /month
                            </td>
                            <td className="py-2 px-2 text-foreground">
                              {formData.p3DueDate || "N/A"}
                            </td>
                          </tr>
                        )}
                        {formData.p4Amount && (
                          <tr className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground">
                              P4 – Four payments
                            </td>
                            <td className="py-2 px-2 text-foreground font-mono">
                              £{Number(formData.p4Amount).toFixed(2)} /month
                            </td>
                            <td className="py-2 px-2 text-foreground">
                              {formData.p4DueDate || "N/A"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={handleSendEmailCancel}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmailConfirm}
                className="px-6 bg-royal-purple hover:bg-royal-purple/90 text-white"
              >
                <MdEmail className="h-4 w-4 mr-2" />
                Confirm & Send Email
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPaymentReminderConfirmation}
        onOpenChange={(open) => {
          if (!open) handlePaymentReminderCancel();
        }}
        modal={true}
      >
        <DialogContent
          hideClose
          className="max-w-2xl w-[calc(100%-2rem)] sm:w-full z-[100000]"
        >
          <div className="flex flex-col space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-royal-purple/10 rounded-lg">
                  <FaWallet className="h-6 w-6 text-royal-purple" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Confirm Enable Payment Reminder
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Please review the payment reminder details
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePaymentReminderCancel}
                className="h-8 w-8"
              >
                <FaTimes className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tour</p>
                  <p className="font-semibold text-foreground">
                    {formData.tourPackageName || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Payment Plan
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.paymentPlan || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Payment Method
                  </p>
                  <p className="font-semibold text-foreground">
                    {formData.paymentMethod || "N/A"}
                  </p>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">
                    Payment Terms
                  </p>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 font-semibold text-foreground">
                          Payment Term
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-foreground">
                          Amount
                        </th>
                        <th className="text-left py-2 px-2 font-semibold text-foreground">
                          Due Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.p1Amount && (
                        <tr className="border-b border-border/50">
                          <td className="py-2 px-2 text-foreground">P1</td>
                          <td className="py-2 px-2 text-foreground font-mono">
                            £{Number(formData.p1Amount).toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-foreground">
                            {String(formData.p1DueDate || "N/A")}
                          </td>
                        </tr>
                      )}
                      {formData.p2Amount && (
                        <tr className="border-b border-border/50">
                          <td className="py-2 px-2 text-foreground">P2</td>
                          <td className="py-2 px-2 text-foreground font-mono">
                            £{Number(formData.p2Amount).toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-foreground">
                            {String(formData.p2DueDate || "N/A")}
                          </td>
                        </tr>
                      )}
                      {formData.p3Amount && (
                        <tr className="border-b border-border/50">
                          <td className="py-2 px-2 text-foreground">P3</td>
                          <td className="py-2 px-2 text-foreground font-mono">
                            £{Number(formData.p3Amount).toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-foreground">
                            {String(formData.p3DueDate || "N/A")}
                          </td>
                        </tr>
                      )}
                      {formData.p4Amount && (
                        <tr className="border-b border-border/50">
                          <td className="py-2 px-2 text-foreground">P4</td>
                          <td className="py-2 px-2 text-foreground font-mono">
                            £{Number(formData.p4Amount).toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-foreground">
                            {String(formData.p4DueDate || "N/A")}
                          </td>
                        </tr>
                      )}
                      {(formData.p1Amount ||
                        formData.p2Amount ||
                        formData.p3Amount ||
                        formData.p4Amount) && (
                        <tr className="border-t">
                          <td className="py-2 px-2 text-foreground font-semibold">
                            Total
                          </td>
                          <td className="py-2 px-2 text-foreground font-mono font-semibold">
                            £{Number(formData.remainingBalance || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-foreground"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={handlePaymentReminderCancel}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePaymentReminderConfirm}
                className="px-6 bg-royal-purple hover:bg-royal-purple/90 text-white"
              >
                <FaWallet className="h-4 w-4 mr-2" />
                Confirm & Enable
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pricing Version Selection Dialog */}
      <Dialog
        open={showPricingVersionDialog}
        onOpenChange={setShowPricingVersionDialog}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Select Pricing Version
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which tour package pricing version to apply to this
              booking. The selected version will lock pricing for future
              changes.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 max-h-72 overflow-y-auto">
              {pricingVersionOptions.map((option) => (
                <button
                  key={`pricing-version-${option.version}`}
                  type="button"
                  onClick={() => setSelectedPricingVersion(option.version)}
                  className={cn(
                    "w-full text-left border rounded-md p-3 transition-colors",
                    selectedPricingVersion === option.version
                      ? "border-royal-purple bg-royal-purple/10"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          Version {option.version}
                        </span>
                        {option.isCurrent && (
                          <Badge variant="outline">Current</Badge>
                        )}
                      </div>
                      {option.travelDates?.length ? (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {option.travelDates.map((travelDate) => (
                            <div
                              key={`${option.version}-${travelDate.date}`}
                              className="flex items-center gap-x-3 text-left"
                            >
                              <span className="font-medium text-foreground min-w-[90px]">
                                {formatDateLabel(travelDate.date)}
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                £
                                {(typeof travelDate.customOriginal === "number"
                                  ? travelDate.customOriginal
                                  : option.pricing?.original
                                )?.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                ResFee £
                                {(typeof travelDate.customDeposit === "number"
                                  ? travelDate.customDeposit
                                  : option.pricing?.deposit
                                )?.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Badge
                      className={cn(
                        "bg-royal-purple",
                        selectedPricingVersion === option.version
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    >
                      Selected
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowPricingVersionDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApplyPricingVersion}
                className="bg-royal-purple hover:bg-royal-purple/90"
                disabled={!selectedPricingVersion}
              >
                Apply Version
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
