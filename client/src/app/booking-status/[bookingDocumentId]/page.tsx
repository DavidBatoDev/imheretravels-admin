"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Download,
  Calendar,
  MapPin,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  Phone,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
import { db } from "@/lib/firebase";
import PayNowModal from "@/components/booking-status/PayNowModal";

interface PaymentTokenData {
  token: string;
  expiresAt: any;
  stripePaymentDocId: string;
  status: "pending" | "processing" | "success" | "failed" | "expired";
  paidAt?: any;
  lastAttemptAt?: any;
  errorMessage?: string;
}

interface BookingData {
  bookingDocumentId?: string;
  bookingId: string;
  bookingCode: string;
  tourCode: string;
  emailAddress?: string;
  fullName: string;
  firstName: string;
  travellerInitials: string;
  tourPackageName: string;
  tourDate: any;
  returnDate?: any;
  tourDuration: string;
  formattedDate: string;
  reservationDate: any;
  originalTourCost: number;
  discountedTourCost?: number;
  reservationFee?: number;
  manualCredit?: number;
  creditFrom?: string;
  paid: number;
  remainingBalance: number;
  paymentProgress: number | string;
  paymentPlan?: string;
  bookingStatus: string;
  fullPaymentDueDate?: any;
  fullPaymentAmount?: number;
  fullPaymentDatePaid?: any;
  p1DueDate?: string;
  p1Amount?: number;
  p1DatePaid?: any;
  p2DueDate?: string;
  p2Amount?: number;
  p2DatePaid?: any;
  p3DueDate?: string;
  p3Amount?: number;
  p3DatePaid?: any;
  p4DueDate?: string;
  p4Amount?: number;
  p4DatePaid?: any;
  p1LateFeesPenalty?: number;
  p2LateFeesPenalty?: number;
  p3LateFeesPenalty?: number;
  p4LateFeesPenalty?: number;
  p1LateFeeAppliedAt?: any;
  p2LateFeeAppliedAt?: any;
  p3LateFeeAppliedAt?: any;
  p4LateFeeAppliedAt?: any;
  sentEmailLink?: string;
  eventName?: string;
  discountRate?: number;
  discountType?: string;
  reasonForCancellation?: string | null;
  cancellationEmailSentDate?: any;
  bookingType: string;
  isMainBooker: boolean;
  enablePaymentReminder: boolean;
  paymentTokens?: {
    full_payment?: PaymentTokenData;
    p1?: PaymentTokenData;
    p2?: PaymentTokenData;
    p3?: PaymentTokenData;
    p4?: PaymentTokenData;
  };
  revolutPayments?: {
    [key: string]: {
      revolutPaymentDocId: string;
      status: "pending" | "approved" | "rejected";
      submittedAt?: any;
      approvedAt?: any;
      rejectedAt?: any;
    };
  };
  preDeparturePack?: {
    id: string;
    fileName: string;
    originalName: string;
    fileDownloadURL: string;
    contentType: string;
    size: number;
    uploadedAt: any;
  };
}

export default function BookingStatusPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingDocumentId = params.bookingDocumentId as string;
  const email = searchParams.get("email");

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState<string | null>(
    null,
  );
  const [paymentMessage, setPaymentMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [paymentTermOptions, setPaymentTermOptions] = useState<
    Array<{
      id: string;
      name: string;
      description?: string;
      paymentPlanType: string;
      monthsRequired?: number;
      monthlyPercentages?: number[];
      color?: string;
    }>
  >([]);
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);
  const [confirmPlanOpen, setConfirmPlanOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{
    id: string;
    label: string;
    description?: string;
    schedule?: Array<{ date: string; amount: number }>;
  } | null>(null);
  const packCacheRef = useRef<{
    bookingDocId: string;
    pack: BookingData["preDeparturePack"] | null;
  } | null>(null);

  // Pay Now Modal state
  const [payNowModalOpen, setPayNowModalOpen] = useState(false);
  const [payNowInstallment, setPayNowInstallment] = useState<{
    id: "full_payment" | "p1" | "p2" | "p3" | "p4";
    amount: number;
  } | null>(null);

  // Check for payment success/cancel messages in URL
  useEffect(() => {
    const paymentSuccess = searchParams.get("payment_success");
    const paymentCancelled = searchParams.get("payment_cancelled");
    const installmentId = searchParams.get("installment");

    if (paymentSuccess === "true" && installmentId) {
      // In development, automatically trigger test confirmation
      const isDevelopment = process.env.NEXT_PUBLIC_ENV === "development";

      if (isDevelopment) {
        console.log(
          "🧪 Development mode: Auto-triggering payment confirmation",
        );
        console.log("📡 Refetching booking to get latest payment tokens...");

        // Refetch booking to get the latest paymentTokens
        const url = email
          ? `/api/public/booking/${bookingDocumentId}?email=${encodeURIComponent(email)}`
          : `/api/public/booking/${bookingDocumentId}`;

        fetch(url)
          .then((res) => res.json())
          .then((result) => {
            if (!result.success) {
              console.error("❌ Failed to refetch booking:", result.error);
              return;
            }

            const freshBooking = result.data;
            console.log(
              "📦 Fresh booking paymentTokens:",
              freshBooking.paymentTokens,
            );
            const stripePaymentDocId =
              freshBooking.paymentTokens?.[
                installmentId as keyof typeof freshBooking.paymentTokens
              ]?.stripePaymentDocId;

            console.log("📝 stripePaymentDocId:", stripePaymentDocId);

            if (stripePaymentDocId) {
              // Automatically confirm the payment in development
              fetch("/api/installments/test-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  stripe_payment_doc_id: stripePaymentDocId,
                }),
              })
                .then((res) => res.json())
                .then((data) => {
                  console.log("✅ Auto-confirmed payment:", data);
                  // Reload to show updated status
                  setTimeout(() => {
                    window.location.href = `/booking-status/${bookingDocumentId}`;
                  }, 1500);
                })
                .catch((error) => {
                  console.error("❌ Auto-confirm failed:", error);
                });
            } else {
              console.error(
                "❌ No stripePaymentDocId found for installment:",
                installmentId,
              );
            }
          })
          .catch((error) => {
            console.error("❌ Failed to refetch booking:", error);
          });
      } else {
        // Only show message in production
        setPaymentMessage({
          type: "success",
          text: `Payment for ${installmentId.toUpperCase()} installment initiated successfully! Please wait while we confirm your payment.`,
        });
        // Clear message after 10 seconds
        setTimeout(() => setPaymentMessage(null), 10000);
      }
    } else if (paymentCancelled === "true" && installmentId) {
      // Reset the processing status when user cancels
      const resetStatus = async () => {
        try {
          await fetch("/api/installments/reset-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: bookingDocumentId,
              installment_id: installmentId,
            }),
          });
          // Reload booking data to show updated status
          window.location.href = `/booking-status/${bookingDocumentId}`;
        } catch (error) {
          console.error("Failed to reset status:", error);
        }
      };

      resetStatus();

      setPaymentMessage({
        type: "error",
        text: `Payment for ${installmentId.toUpperCase()} was cancelled. You can try again anytime.`,
      });
      // Clear message after 10 seconds
      setTimeout(() => setPaymentMessage(null), 10000);
    }
  }, [searchParams, bookingDocumentId, booking]);

  useEffect(() => {
    let didCancel = false;

    const fetchPreDeparturePack = async (
      bookingDocId: string,
    ): Promise<BookingData["preDeparturePack"] | null> => {
      try {
        const confirmedBookingsQuery = query(
          collection(db, "confirmedBookings"),
          where("bookingDocumentId", "==", bookingDocId),
        );
        const confirmedBookingsSnap = await getDocs(confirmedBookingsQuery);

        if (confirmedBookingsSnap.empty) return null;

        const confirmedBooking = confirmedBookingsSnap.docs[0].data();
        if (!confirmedBooking.preDeparturePackId) return null;

        const packRef = doc(
          db,
          "fileObjects",
          confirmedBooking.preDeparturePackId,
        );
        const packSnap = await getDoc(packRef);

        if (!packSnap.exists()) return null;

        const packData = packSnap.data();
        return {
          id: packSnap.id,
          fileName: packData.fileName,
          originalName: packData.originalName,
          fileDownloadURL: packData.fileDownloadURL,
          contentType: packData.contentType,
          size: packData.size,
          uploadedAt: packData.uploadedAt,
        };
      } catch (error) {
        console.error("Error fetching pre-departure pack:", error);
        return null;
      }
    };

    const buildPublicData = (
      bookingData: any,
      preDeparturePack: BookingData["preDeparturePack"] | null,
    ): BookingData => {
      const totalCost =
        (bookingData.isMainBooker && bookingData.discountedTourCost
          ? bookingData.discountedTourCost
          : bookingData.originalTourCost) || 0;
      const paid = bookingData.paid || 0;

      const fallbackProgress =
        totalCost === 0 ? 0 : Math.round((paid / totalCost) * 100);
      const paymentProgressValue =
        typeof bookingData.paymentProgress === "string"
          ? parseFloat(bookingData.paymentProgress.replace(/%/g, "")) ||
            fallbackProgress
          : typeof bookingData.paymentProgress === "number"
            ? bookingData.paymentProgress
            : fallbackProgress;

      return {
        bookingDocumentId: bookingData.bookingDocumentId,
        bookingId: bookingData.bookingId,
        bookingCode: bookingData.bookingCode,
        tourCode: bookingData.tourCode,
        emailAddress: bookingData.emailAddress,
        fullName: bookingData.fullName,
        firstName: bookingData.firstName,
        travellerInitials: bookingData.travellerInitials,
        tourPackageName: bookingData.tourPackageName,
        tourDate: bookingData.tourDate,
        returnDate: bookingData.returnDate,
        tourDuration: bookingData.tourDuration,
        formattedDate: bookingData.formattedDate,
        reservationDate: bookingData.reservationDate,
        originalTourCost: bookingData.originalTourCost,
        discountedTourCost: bookingData.discountedTourCost,
        reservationFee: bookingData.reservationFee,
        manualCredit: bookingData.manualCredit,
        creditFrom: bookingData.creditFrom,
        paid,
        remainingBalance: bookingData.remainingBalance,
        paymentProgress: paymentProgressValue,
        paymentPlan: bookingData.paymentPlan,
        bookingStatus: bookingData.bookingStatus,
        fullPaymentDueDate: bookingData.fullPaymentDueDate,
        fullPaymentAmount: bookingData.fullPaymentAmount,
        fullPaymentDatePaid: bookingData.fullPaymentDatePaid,
        p1DueDate: bookingData.p1DueDate,
        p1Amount: bookingData.p1Amount,
        p1DatePaid: bookingData.p1DatePaid,
        p2DueDate: bookingData.p2DueDate,
        p2Amount: bookingData.p2Amount,
        p2DatePaid: bookingData.p2DatePaid,
        p3DueDate: bookingData.p3DueDate,
        p3Amount: bookingData.p3Amount,
        p3DatePaid: bookingData.p3DatePaid,
        p4DueDate: bookingData.p4DueDate,
        p4Amount: bookingData.p4Amount,
        p4DatePaid: bookingData.p4DatePaid,
        p1LateFeesPenalty: bookingData.p1LateFeesPenalty,
        p1LateFeeAppliedAt: bookingData.p1LateFeeAppliedAt,
        p2LateFeesPenalty: bookingData.p2LateFeesPenalty,
        p2LateFeeAppliedAt: bookingData.p2LateFeeAppliedAt,
        p3LateFeesPenalty: bookingData.p3LateFeesPenalty,
        p3LateFeeAppliedAt: bookingData.p3LateFeeAppliedAt,
        p4LateFeesPenalty: bookingData.p4LateFeesPenalty,
        p4LateFeeAppliedAt: bookingData.p4LateFeeAppliedAt,
        sentEmailLink: bookingData.sentEmailLink,
        eventName: bookingData.eventName,
        discountRate: bookingData.discountRate,
        discountType: bookingData.discountType,
        bookingType: bookingData.bookingType,
        isMainBooker: bookingData.isMainBooker,
        enablePaymentReminder: bookingData.enablePaymentReminder,
        preDeparturePack: preDeparturePack ?? undefined,
        revolutPayments: bookingData.revolutPayments,
        ...(process.env.NEXT_PUBLIC_ENV === "development" && {
          paymentTokens: bookingData.paymentTokens,
        }),
      };
    };

    setLoading(true);
    setError(null);

    const bookingsQuery = query(
      collection(db, "bookings"),
      where("access_token", "==", bookingDocumentId),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        if (didCancel) return;

        if (snapshot.empty) {
          setBooking(null);
          setError("Booking not found");
          setLoading(false);
          return;
        }

        const bookingDoc = snapshot.docs[0];
        const bookingData = {
          id: bookingDoc.id,
          ...bookingDoc.data(),
          bookingDocumentId: bookingDoc.id,
        } as any;

        const requiredFields = [
          "bookingId",
          "fullName",
          "tourPackageName",
          "tourDate",
          "formattedDate",
          "tourDuration",
          "originalTourCost",
          "paid",
          "remainingBalance",
          "bookingType",
        ];
        const hasMissingRequired = requiredFields.some(
          (field) =>
            bookingData[field] === undefined || bookingData[field] === null,
        );

        if (hasMissingRequired) {
          setBooking(null);
          setError(
            "This is an invalid booking. Contact bella@imheretravels.com if this is a mistake.",
          );
          setLoading(false);
          return;
        }

        if (email) {
          const bookingEmail = bookingData.emailAddress?.toLowerCase();
          const providedEmail = email.toLowerCase();
          if (bookingEmail !== providedEmail) {
            setBooking(null);
            setError("Email does not match booking records");
            setLoading(false);
            return;
          }
        }

        const cachedPack =
          packCacheRef.current?.bookingDocId === bookingDoc.id
            ? packCacheRef.current.pack
            : null;

        setBooking(buildPublicData(bookingData, cachedPack));
        setLoading(false);

        if (!cachedPack) {
          void (async () => {
            const pack = await fetchPreDeparturePack(bookingDoc.id);
            if (didCancel) return;
            packCacheRef.current = {
              bookingDocId: bookingDoc.id,
              pack,
            };
            setBooking((prev) =>
              prev ? { ...prev, preDeparturePack: pack ?? undefined } : prev,
            );
          })();
        }
      },
      (err) => {
        console.error("Failed to load booking details:", err);
        setError("Failed to load booking details");
        setLoading(false);
      },
    );

    return () => {
      didCancel = true;
      unsubscribe();
    };
  }, [bookingDocumentId, email]);

  // Fetch payment terms from Firestore (for payment plan options)
  useEffect(() => {
    const q = collection(db, "paymentTerms");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const terms = snap.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name,
              description: data.description,
              paymentPlanType: data.paymentPlanType,
              monthsRequired: data.monthsRequired,
              monthlyPercentages: data.monthlyPercentages,
              color: data.color,
            };
          })
          .sort((a, b) => {
            const order = [
              "p1_single_installment",
              "p2_two_installments",
              "p3_three_installments",
              "p4_four_installments",
            ];
            return (
              order.indexOf(a.paymentPlanType) -
              order.indexOf(b.paymentPlanType)
            );
          });
        setPaymentTermOptions(terms);
      },
      (err) => console.error("paymentTerms snapshot error", err),
    );

    return () => unsub();
  }, []);

  // Handle installment payment
  const handlePayInstallment = async (
    installmentId: "full_payment" | "p1" | "p2" | "p3" | "p4",
  ) => {
    if (!booking) return;

    setPaymentProcessing(installmentId);
    setPaymentMessage(null);

    try {
      const response = await fetch("/api/installments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: bookingDocumentId, // The bookingDocumentId IS the access_token
          installment_id: installmentId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create checkout");
      }

      const { checkout_url } = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = checkout_url;
    } catch (error: any) {
      console.error("Payment error:", error);
      setPaymentMessage({
        type: "error",
        text: error.message || "Failed to initiate payment. Please try again.",
      });
      setPaymentProcessing(null);
    }
  };

  // Open Pay Now modal instead of direct Stripe redirect
  const handleOpenPayNowModal = (
    installmentId: "full_payment" | "p1" | "p2" | "p3" | "p4",
    installmentAmount: number,
  ) => {
    setPayNowInstallment({ id: installmentId, amount: installmentAmount });
    setPayNowModalOpen(true);
  };

  // Handle Stripe checkout from modal
  const handleStripeCheckoutFromModal = () => {
    if (!payNowInstallment) return;
    handlePayInstallment(payNowInstallment.id);
  };

  const handleContactSupport = () => {
    const subject = `Booking Inquiry - ${booking?.bookingId}`;
    const body = `Hello ImHereTravels Team,\n\nI have a question regarding my booking:\n\nBooking ID: ${booking?.bookingId}\nName: ${booking?.fullName}\nTour: ${booking?.tourPackageName}\n\n[Your question here]\n\nThank you!`;
    window.location.href = `mailto:support@imheretravels.com?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const handleSelectPaymentPlan = async (plan: {
    id: string;
    label: string;
  }) => {
    if (!booking?.bookingDocumentId) {
      setPaymentMessage({
        type: "error",
        text: "Unable to load booking information. Please try again or contact support.",
      });
      return;
    }

    setSelectingPlanId(plan.id);
    setPaymentMessage(null);

    try {
      const response = await fetch("/api/stripe-payments/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingDocumentId: booking.bookingDocumentId,
          paymentPlanId: plan.id,
          paymentPlanDetails: {
            id: plan.id,
            label: plan.label,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to select payment plan");
      }

      setPaymentMessage({
        type: "success",
        text: `Successfully selected ${plan.label}. Your payment schedule is now active.`,
      });
    } catch (err: any) {
      console.error("Error selecting payment plan:", err);
      setPaymentMessage({
        type: "error",
        text: err.message || "Failed to select payment plan. Please try again.",
      });
    } finally {
      setSelectingPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-light-grey flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crimson-red mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your booking...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-light-grey">
        <header className="bg-gradient-to-r from-crimson-red to-crimson-red/90 text-white print:bg-crimson-red">
          <div className="container mx-auto px-4 py-6">
            <Image
              src="/logos/Logo_White.svg"
              alt="ImHereTravels"
              width={180}
              height={50}
              className="h-10 w-auto"
            />
          </div>
        </header>
        <div className="container mx-auto px-4 py-16 text-center">
          <AlertCircle className="h-16 w-16 text-crimson-red mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid Booking</h1>
          <p className="text-muted-foreground mb-6">
            {error ||
              "This is an invalid booking. Contact bella@imheretravels.com if this is a mistake."}
          </p>
          <Button
            onClick={() => (window.location.href = "/")}
            className="bg-crimson-red hover:bg-crimson-red/90"
          >
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  const toNumber = (value: unknown, fallback = 0) => {
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[£,\s]/g, "");
      const parsed = Number(cleaned);
      return Number.isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  };

  const originalTourCost = toNumber(booking.originalTourCost);
  const discountedTourCost = toNumber(booking.discountedTourCost, 0);
  const totalCost = discountedTourCost || originalTourCost;
  const paidAmount = toNumber(booking.paid);
  const remainingBalanceAmount = toNumber(booking.remainingBalance);
  const manualCreditAmount = toNumber(booking.manualCredit, 0);
  const creditFromLabel = (booking.creditFrom || "").toString().trim();
  const showManualCreditInTable =
    manualCreditAmount > 0 && creditFromLabel.length > 0;
  const paymentProgressValue =
    typeof booking.paymentProgress === "string"
      ? parseFloat(booking.paymentProgress.replace(/%/g, "")) || 0
      : booking.paymentProgress || 0;

  const getDateFromValue = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^\d{8}$/.test(trimmed)) {
        const year = Number(trimmed.slice(0, 4));
        const monthIndex = Number(trimmed.slice(4, 6)) - 1;
        const day = Number(trimmed.slice(6, 8));
        const parsed = new Date(year, monthIndex, day);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "object") {
      if ("seconds" in value && typeof value.seconds === "number") {
        return new Date(value.seconds * 1000);
      }
      if ("toDate" in value && typeof value.toDate === "function") {
        try {
          const d = value.toDate();
          return d instanceof Date && !isNaN(d.getTime()) ? d : null;
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  const tourDateLabel = (() => {
    const date =
      getDateFromValue(booking.tourDate) ||
      getDateFromValue(booking.formattedDate);
    if (date) return format(date, "MMM dd, yyyy");
    return booking.formattedDate || "---";
  })();

  const calculateDaysBetween = (dateValue: any): number => {
    const tour = getDateFromValue(dateValue);
    if (!tour) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    tour.setHours(0, 0, 0, 0);
    const diffTime = tour.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getAvailablePaymentTerm = () => {
    const tourDateValue = booking.tourDate;
    if (!tourDateValue)
      return { term: "", isLastMinute: false, isInvalid: false };

    const daysBetween = calculateDaysBetween(tourDateValue);

    if (daysBetween < 2) {
      return { term: "invalid", isLastMinute: false, isInvalid: true };
    } else if (daysBetween >= 2 && daysBetween < 30) {
      return { term: "full_payment", isLastMinute: true, isInvalid: false };
    } else {
      const today = new Date();
      const tourDateObj = getDateFromValue(tourDateValue);
      if (!tourDateObj) {
        return { term: "", isLastMinute: false, isInvalid: false };
      }
      const fullPaymentDue = new Date(tourDateObj);
      fullPaymentDue.setDate(fullPaymentDue.getDate() - 30);

      const yearDiff = fullPaymentDue.getFullYear() - today.getFullYear();
      const monthDiff = fullPaymentDue.getMonth() - today.getMonth();
      const monthCount = Math.max(0, yearDiff * 12 + monthDiff);

      if (monthCount >= 4) {
        return { term: "P4", isLastMinute: false, isInvalid: false };
      } else if (monthCount === 3) {
        return { term: "P3", isLastMinute: false, isInvalid: false };
      } else if (monthCount === 2) {
        return { term: "P2", isLastMinute: false, isInvalid: false };
      } else if (monthCount === 1) {
        return { term: "P1", isLastMinute: false, isInvalid: false };
      } else {
        return { term: "full_payment", isLastMinute: true, isInvalid: false };
      }
    }
  };

  const fixTermName = (name: string) =>
    name
      .replace(/Instalment/g, "Installment")
      .replace(/instalments/g, "installments");

  const generatePaymentSchedule = (
    monthsRequired: number,
  ): Array<{ date: string; amount: number }> => {
    const total = totalCost || 0;
    const reservationFee = booking.reservationFee || 0;
    const remainingBalance = Math.max(0, total - reservationFee);
    const monthlyAmount = monthsRequired
      ? remainingBalance / monthsRequired
      : remainingBalance;
    const schedule: Array<{ date: string; amount: number }> = [];

    const today = new Date();
    let nextMonth = today.getMonth() + 1;
    let nextYear = today.getFullYear();
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    }

    for (let i = 0; i < monthsRequired; i++) {
      let paymentMonth = nextMonth + i;
      let paymentYear = nextYear;

      while (paymentMonth > 11) {
        paymentMonth -= 12;
        paymentYear++;
      }

      const dateStr = `${paymentYear}-${String(paymentMonth + 1).padStart(
        2,
        "0",
      )}-02`;

      schedule.push({
        date: dateStr,
        amount:
          i === monthsRequired - 1
            ? remainingBalance - monthlyAmount * (monthsRequired - 1)
            : monthlyAmount,
      });
    }

    return schedule;
  };

  const getFriendlyDescription = (monthsRequired: number) => {
    switch (monthsRequired) {
      case 1:
        return "Ready to pay in full? Pick me.";
      case 2:
        return "Want to split it into two payments? This is it!";
      case 3:
        return "If you like, you can make three equal payments, too!";
      case 4:
        return "Since you're booking early, take advantage of 4 easy payments. No extra charges!";
      default:
        return "";
    }
  };

  const getAvailablePaymentPlans = () => {
    const availablePaymentTerm = getAvailablePaymentTerm();
    if (!availablePaymentTerm.term || availablePaymentTerm.isInvalid) return [];

    if (availablePaymentTerm.isLastMinute) {
      const total = totalCost || 0;
      const reservationFee = booking.reservationFee || 0;
      const remainingBalance = Math.max(0, total - reservationFee);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 2);

      return [
        {
          id: "full_payment",
          type: "full_payment",
          label: "Full Payment Required Within 48hrs",
          description: "Complete payment of remaining balance within 2 days",
          monthsRequired: 1,
          color: "#f59e0b",
          schedule: [
            {
              date: dueDate.toISOString().slice(0, 10),
              amount: remainingBalance,
            },
          ],
        },
      ];
    }

    const termMap: { [key: string]: number } = { P1: 1, P2: 2, P3: 3, P4: 4 };
    const maxMonths = termMap[availablePaymentTerm.term] || 0;

    return paymentTermOptions
      .filter((term) => term.monthsRequired && term.monthsRequired <= maxMonths)
      .map((term) => ({
        id: term.id,
        type: term.paymentPlanType,
        label: fixTermName(term.name),
        description: getFriendlyDescription(term.monthsRequired || 0),
        monthsRequired: term.monthsRequired || 0,
        color: term.color,
        schedule: generatePaymentSchedule(term.monthsRequired || 0),
      }));
  };

  // Build payment terms with status information
  const buildPaymentTerms = () => {
    const terms: any[] = [];

    const toNumber = (value: any): number => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
      }
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[^0-9.-]/g, ""));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const installments = [
      { id: "full_payment", term: "Full Payment", prefix: "fullPayment" },
      { id: "p1", term: "P1", prefix: "p1" },
      { id: "p2", term: "P2", prefix: "p2" },
      { id: "p3", term: "P3", prefix: "p3" },
      { id: "p4", term: "P4", prefix: "p4" },
    ];

    installments.forEach(({ id, term, prefix }) => {
      const dueDate = booking[`${prefix}DueDate` as keyof BookingData];
      const amount = booking[`${prefix}Amount` as keyof BookingData];
      const datePaid = booking[`${prefix}DatePaid` as keyof BookingData];
      const hasPaidDate = !!getDateFromValue(datePaid);
      const lateFeeAppliedAt =
        id === "full_payment"
          ? null
          : booking[`${prefix}LateFeeAppliedAt` as keyof BookingData];

      if (!amount) return; // Skip if installment doesn't exist

      // Get status from paymentTokens (primary) or flat DatePaid (fallback)
      const tokenData =
        booking.paymentTokens?.[id as keyof typeof booking.paymentTokens];

      // Check for Revolut payment status
      const revolutData = booking.revolutPayments?.[id];

      let status = "pending";
      let statusInfo: any = {};

      if (revolutData?.status === "approved") {
        status = "paid";
        statusInfo = {
          paidAt: revolutData.approvedAt || datePaid,
        };
      } else if (tokenData?.status === "success") {
        status = "paid";
        statusInfo = {
          paidAt: tokenData?.paidAt || datePaid,
        };
      } else if (hasPaidDate) {
        // Fallback for admin/manual updates where Date Paid exists without token metadata.
        status = "paid";
        statusInfo = {
          paidAt: datePaid,
        };
      } else if (revolutData?.status === "pending") {
        status = "for_verification";
      } else if (tokenData?.status === "processing") {
        status = "processing";
      } else if (tokenData?.status === "failed") {
        status = "failed";
        statusInfo = {
          errorMessage: tokenData.errorMessage,
        };
      } else if (
        dueDate &&
        !isNaN(new Date(dueDate as any).getTime()) &&
        new Date(dueDate as any) < new Date()
      ) {
        status = "overdue";
      }

      const penalty =
        id === "full_payment"
          ? 0
          : toNumber(booking[`${prefix}LateFeesPenalty` as keyof BookingData]);

      terms.push({
        id,
        term,
        dueDate: dueDate || "",
        amount: toNumber(amount),
        penalty,
        lateFeeAppliedAt,
        status,
        ...statusInfo,
      });
    });

    return terms;
  };

  const paymentTerms = buildPaymentTerms();
  const hasAnyPenalty = paymentTerms.some(
    (term) => Number(term.penalty || 0) > 0,
  );
  const availablePaymentPlans = getAvailablePaymentPlans();

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <header className="bg-white text-gray-900 shadow-md print:shadow-none">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
          <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Image
                src="/logos/Digital_Horizontal_Red.svg"
                alt="ImHereTravels"
                width={200}
                height={50}
                className="h-6 sm:h-8 lg:h-10 w-auto"
              />
            </div>
            <Button
              onClick={() =>
                (window.location.href = "mailto:bella@imheretravels.com")
              }
              variant="default"
              className="bg-crimson-red hover:bg-crimson-red/90 text-white shadow-sm rounded-full px-3 sm:px-6 lg:px-8 py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm lg:text-base font-medium whitespace-nowrap"
            >
              Contact Assistance
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-5xl">
        {/* Payment Success/Error Message */}
        {paymentMessage && (
          <div
            className={`mb-4 sm:mb-6 border-l-4 p-3 sm:p-4 rounded-r-lg ${
              paymentMessage.type === "success"
                ? "bg-green-50 border-green-500"
                : "bg-red-50 border-red-500"
            }`}
          >
            <div className="flex items-start gap-3">
              {paymentMessage.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p
                  className={`text-sm font-medium ${
                    paymentMessage.type === "success"
                      ? "text-green-900"
                      : "text-red-900"
                  }`}
                >
                  {paymentMessage.text}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Notice */}
        {(booking.bookingStatus === "Cancelled" ||
          !!booking.reasonForCancellation) && (
          <div className="mb-4 sm:mb-6 border-l-4 border-crimson-red bg-red-50 p-3 sm:p-4 rounded-r-lg print:border print:border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-crimson-red mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-crimson-red mb-1">
                  Booking Cancelled
                </h3>
                <p className="text-sm text-red-900">
                  This booking has been cancelled. If you believe this is a
                  mistake, please contact our support team.
                </p>
                {booking.reasonForCancellation && (
                  <p className="text-sm text-red-900 mt-2">
                    Reason: {booking.reasonForCancellation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Important Notice */}
        <div className="mb-4 sm:mb-6 bg-amber-50 border-l-4 border-amber-500 p-3 sm:p-4 rounded-r-lg print:border print:border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900 mb-1">
                Important Notice
              </h3>
              <p className="text-sm text-amber-800">
                Due to high customer demand, this booking status page might not
                be updated in real-time. Our ImHereTravels admin team is
                continuously updating booking statuses. Please allow some time
                for recent changes to reflect here. For urgent inquiries,
                contact our support team directly.
              </p>
            </div>
          </div>
        </div>

        {/* Main Layout Grid */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          {/* Left Column - Booking Details */}
          <div className="lg:col-span-2 space-y-6 lg:space-y-8 min-w-0">
            {/* Booking Information */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b-2 border-crimson-red">
                <div>
                  <h2 className="text-lg sm:text-xl font-hk-grotesk font-bold text-gray-900 mb-1">
                    Booking Confirmation
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600">
                    ID:{" "}
                    <span className="font-semibold text-gray-900">
                      {booking.bookingId}
                    </span>
                  </p>
                </div>
                <Badge className="bg-spring-green text-white px-3 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm self-start sm:self-auto">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                  {booking.bookingStatus}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-3 sm:gap-y-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Traveler Name</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {booking.fullName}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Tour Dates
                  </p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {tourDateLabel}
                  </p>
                  <p className="text-xs text-gray-600">
                    {booking.tourDuration}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Tour Package
                  </p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                    {booking.tourPackageName}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Booking Type</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900">
                    {booking.bookingType}
                    {booking.isMainBooker && " (Main Booker)"}
                  </p>
                </div>

                {booking.eventName && (
                  <div className="sm:col-span-2">
                    <Badge className="bg-vivid-orange text-white px-3 py-1 text-xs sm:text-sm">
                      {booking.eventName} -{" "}
                      {booking.discountType?.toLowerCase() === "flat amount" ||
                      booking.discountType?.toLowerCase()?.includes("amount")
                        ? `£${booking.discountRate} OFF`
                        : `${booking.discountRate}% OFF`}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Payment Options (when no payment plan yet) */}
            {!booking.paymentPlan && availablePaymentPlans.length > 0 && (
              <div>
                <h2 className="text-lg sm:text-xl font-hk-grotesk font-bold text-gray-900 mb-4 sm:mb-5 flex items-center gap-2">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-crimson-red" />
                  Payment Options
                </h2>
                <div className="mb-4 sm:mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-amber-900">
                  Choose the plan that fits you best. Once selected, your
                  payment schedule will be created and shown below.
                </div>

                <div className="w-full">
                  <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
                    <table
                      className={`w-full ${hasAnyPenalty ? "min-w-[520px] sm:min-w-[640px]" : "min-w-[420px] sm:min-w-[500px]"}`}
                    >
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Plan
                          </th>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Due Date
                          </th>
                          <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Amount
                          </th>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {availablePaymentPlans.map((plan) =>
                          plan.schedule.map((payment: any, idx: number) => {
                            const dueDate = payment.date
                              ? new Date(`${payment.date}T00:00:00Z`)
                              : null;
                            const rowSpan = plan.schedule.length;

                            return (
                              <tr
                                key={`${plan.id}-${idx}`}
                                className="border-t border-gray-200 hover:bg-gray-50"
                              >
                                {idx === 0 && (
                                  <td
                                    className="py-2 sm:py-3 px-2 sm:px-4 font-semibold text-gray-900 align-middle text-center"
                                    rowSpan={rowSpan}
                                  >
                                    <div className="space-y-1 text-center">
                                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                                        <span
                                          className="inline-flex h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full"
                                          style={{
                                            backgroundColor: plan.color,
                                          }}
                                        />
                                        <span className="text-xs sm:text-sm">
                                          {plan.label}
                                        </span>
                                      </div>
                                      {plan.description && (
                                        <div className="text-[10px] sm:text-xs text-gray-500">
                                          {plan.description}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                )}
                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                                  {dueDate && !isNaN(dueDate.getTime())
                                    ? format(dueDate, "MMM dd, yyyy")
                                    : "---"}
                                </td>
                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-semibold text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                                  £{payment.amount.toFixed(2)}
                                </td>
                                {idx === 0 && (
                                  <td
                                    className="py-2 sm:py-3 px-2 sm:px-4 align-middle text-center"
                                    rowSpan={rowSpan}
                                  >
                                    <Button
                                      onClick={() => {
                                        setPendingPlan(plan);
                                        setConfirmPlanOpen(true);
                                      }}
                                      disabled={
                                        selectingPlanId !== null &&
                                        selectingPlanId !== plan.id
                                      }
                                      size="sm"
                                      className="bg-crimson-red hover:bg-crimson-red/90 text-white text-xs sm:text-sm px-2 sm:px-3"
                                    >
                                      {selectingPlanId === plan.id
                                        ? "Selecting..."
                                        : "Select Plan"}
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            );
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <AlertDialog
              open={confirmPlanOpen}
              onOpenChange={setConfirmPlanOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm payment plan</AlertDialogTitle>
                  <AlertDialogDescription>
                    {pendingPlan
                      ? `You are about to select ${pendingPlan.label}. This will set your payment schedule.`
                      : "Confirm your selected payment plan."}
                  </AlertDialogDescription>
                  {pendingPlan?.schedule?.length ? (
                    <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                      {pendingPlan.schedule.length} payment
                      {pendingPlan.schedule.length !== 1 ? "s" : ""} will be
                      scheduled.
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                    Once you select a plan, it cannot be undone.
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    disabled={selectingPlanId !== null}
                    onClick={() => setPendingPlan(null)}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (!pendingPlan) return;
                      setConfirmPlanOpen(false);
                      handleSelectPaymentPlan(pendingPlan);
                    }}
                    disabled={selectingPlanId !== null || !pendingPlan}
                    className="bg-crimson-red hover:bg-crimson-red/90 text-white"
                  >
                    {selectingPlanId ? "Selecting..." : "Confirm Plan"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Payment Schedule */}
            {booking.paymentPlan && paymentTerms.length > 0 && (
              <div>
                <h2 className="text-lg sm:text-xl font-hk-grotesk font-bold text-gray-900 mb-4 sm:mb-5 flex items-center gap-2">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-crimson-red" />
                  Payment Schedule
                </h2>

                {/* Progress Bar Container */}
                <div className="mb-4 sm:mb-6">
                  {/* Label & Percentage Row */}
                  <div className="flex justify-end mb-1.5">
                    <span className="text-xs sm:text-sm font-bold text-gray-900">
                      {paymentProgressValue}%
                    </span>
                  </div>

                  {/* Bar Track & Fill */}
                  <div className="relative h-3 sm:h-4 w-full rounded-full border border-gray-200 bg-transparent overflow-hidden">
                    <div
                      className="h-full bg-crimson-red transition-all duration-500 rounded-full"
                      style={{ width: `${paymentProgressValue}%` }}
                    />
                  </div>
                </div>

                <div className="w-full">
                  <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
                    <table className="w-full min-w-[420px] sm:min-w-[500px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Term
                          </th>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Due Date
                          </th>
                          <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Amount
                          </th>
                          {hasAnyPenalty && (
                            <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                              Total Amount
                            </th>
                          )}
                          <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Status
                          </th>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                            Paid On
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentTerms.map((term, index) => {
                          const dueDateValue = term.dueDate;
                          const dueDate = dueDateValue
                            ? new Date(dueDateValue)
                            : null;
                          const hasValidDueDate =
                            dueDate instanceof Date &&
                            !isNaN(dueDate.getTime());

                          return (
                            <tr
                              key={index}
                              className="border-t border-gray-200 hover:bg-gray-50"
                            >
                              <td className="py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                                {term.term}
                              </td>
                              <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                                {hasValidDueDate
                                  ? format(dueDate as Date, "MMM dd, yyyy")
                                  : "---"}
                              </td>
                              <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-semibold text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                                £{term.amount.toFixed(2)}
                              </td>
                              {hasAnyPenalty && (
                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-semibold text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span>
                                      £
                                      {(
                                        term.amount + (term.penalty || 0)
                                      ).toFixed(2)}
                                    </span>
                                    {term.penalty > 0 && (
                                      <span className="text-[10px] font-normal text-red-600">
                                        + £{term.penalty.toFixed(2)} late fee
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )}

                              {/* Status Badge */}
                              <td className="py-2 sm:py-3 px-2 sm:px-4 text-center">
                                {term.status === "paid" && (
                                  <Badge className="bg-spring-green text-white text-[10px] sm:text-xs px-2 py-0.5">
                                    <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                    Paid
                                  </Badge>
                                )}
                                {term.status === "processing" && (
                                  <Badge className="bg-blue-500 text-white text-[10px] sm:text-xs px-2 py-0.5">
                                    <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1 animate-spin" />
                                    Processing
                                  </Badge>
                                )}
                                {term.status === "failed" && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] sm:text-xs px-2 py-0.5"
                                    title={
                                      term.errorMessage || "Payment failed"
                                    }
                                  >
                                    <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                    Failed
                                  </Badge>
                                )}
                                {term.status === "overdue" && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] sm:text-xs px-2 py-0.5"
                                  >
                                    <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                    Overdue
                                  </Badge>
                                )}
                                {term.status === "pending" && (
                                  <Badge
                                    variant="outline"
                                    className="border-gray-300 text-gray-700 text-[10px] sm:text-xs px-2 py-0.5"
                                  >
                                    <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                    Pending
                                  </Badge>
                                )}
                                {term.status === "for_verification" && (
                                  <Badge className="bg-amber-500 text-white text-[10px] sm:text-xs px-2 py-0.5">
                                    <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                    For Verification
                                  </Badge>
                                )}
                              </td>

                              {/* Action Column */}
                              <td className="py-2 sm:py-3 px-2 sm:px-4 whitespace-nowrap">
                                {term.status === "paid" && term.paidAt && (
                                  <span className="text-xs sm:text-sm text-gray-500">
                                    {format(
                                      new Date(
                                        term.paidAt.seconds
                                          ? term.paidAt.seconds * 1000
                                          : term.paidAt,
                                      ),
                                      "MMM dd, yyyy",
                                    )}
                                  </span>
                                )}

                                {(() => {
                                  // Find the first unpaid installment
                                  const firstUnpaid = paymentTerms.find(
                                    (t) =>
                                      t.status === "pending" ||
                                      t.status === "overdue" ||
                                      t.status === "failed",
                                  );

                                  // Only show button if this is the first unpaid OR if it's failed
                                  const showButton =
                                    term.status === "failed" ||
                                    (firstUnpaid && firstUnpaid.id === term.id);

                                  if (
                                    (term.status === "pending" ||
                                      term.status === "overdue" ||
                                      term.status === "failed") &&
                                    showButton
                                  ) {
                                    return (
                                      <Button
                                        onClick={() =>
                                          handleOpenPayNowModal(
                                            term.id,
                                            term.amount + (term.penalty || 0),
                                          )
                                        }
                                        disabled={paymentProcessing !== null}
                                        size="sm"
                                        className="bg-crimson-red hover:bg-crimson-red/90 text-white text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                                      >
                                        {paymentProcessing === term.id
                                          ? "Processing..."
                                          : term.status === "failed"
                                            ? "Retry Payment"
                                            : "Pay Now"}
                                      </Button>
                                    );
                                  }

                                  // Show message for locked installments
                                  if (
                                    (term.status === "pending" ||
                                      term.status === "overdue") &&
                                    !showButton &&
                                    firstUnpaid
                                  ) {
                                    return (
                                      <span className="text-xs text-gray-500 italic">
                                        Pay {firstUnpaid.term} first
                                      </span>
                                    );
                                  }

                                  return null;
                                })()}

                                {term.status === "processing" && (
                                  <span className="text-xs sm:text-sm text-blue-600 flex items-center gap-1">
                                    <Clock className="h-3 w-3 animate-spin" />
                                    Processing...
                                  </span>
                                )}

                                {term.status === "for_verification" && (
                                  <span className="text-xs sm:text-sm text-amber-600 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Awaiting Verification
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {showManualCreditInTable && (
                          <tr className="border-t border-amber-200 bg-amber-50/70">
                            <td
                              colSpan={hasAnyPenalty ? 6 : 5}
                              className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm"
                            >
                              <span className="font-semibold text-amber-800">
                                Manual Credit Applied:
                              </span>{" "}
                              <span className="font-bold text-amber-900">
                                {"\u00A3"}
                                {manualCreditAmount.toFixed(2)}
                              </span>{" "}
                              <span className="text-amber-800">
                                (Credit From: {creditFromLabel})
                              </span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Pre-Departure Pack */}
            {booking.preDeparturePack && (
              <>
                <Separator />
                <div>
                  <h2 className="text-lg sm:text-xl font-hk-grotesk font-bold text-gray-900 mb-4 sm:mb-5 flex items-center gap-2">
                    <Download className="h-4 w-4 sm:h-5 sm:w-5 text-crimson-red" />
                    Pre-Departure Pack
                  </h2>

                  <div className="bg-royal-purple/5 border-2 border-royal-purple/20 rounded-lg p-4 sm:p-5">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="bg-royal-purple/10 rounded-lg p-2 sm:p-3">
                        <Download className="h-5 w-5 sm:h-7 sm:w-7 text-royal-purple" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1 break-words">
                          {booking.preDeparturePack.originalName}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 mb-3">
                          {formatFileSize(booking.preDeparturePack.size)} •{" "}
                          {booking.preDeparturePack.contentType}
                        </p>
                        <Button
                          onClick={() =>
                            window.open(
                              booking.preDeparturePack!.fileDownloadURL,
                              "_blank",
                            )
                          }
                          className="bg-royal-purple hover:bg-royal-purple/90 text-white text-xs sm:text-sm px-3 sm:px-4 py-2"
                        >
                          <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                          Download Pack
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Column - Payment Summary & Support */}
          <div className="space-y-6 lg:space-y-8 min-w-0 max-w-full">
            {/* Payment Overview */}
            {booking.paymentPlan && (
              <>
                <div>
                  <h2 className="text-lg sm:text-xl font-hk-grotesk font-bold text-gray-900 mb-4 sm:mb-5 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-crimson-red" />
                    Payment Summary
                  </h2>

                  <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-5">
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border-l-4 border-gray-300 min-w-0 max-w-full overflow-hidden">
                      <p className="text-xs text-gray-500 mb-1">Total Cost</p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">
                        £{totalCost.toFixed(2)}
                      </p>
                      {booking.discountedTourCost && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Was: £{originalTourCost.toFixed(2)}
                        </p>
                      )}
                    </div>

                    <div className="bg-green-50 rounded-lg p-3 sm:p-4 border-l-4 border-spring-green min-w-0 max-w-full overflow-hidden">
                      <p className="text-xs text-gray-600 mb-1">Amount Paid</p>
                      <p className="text-xl sm:text-2xl font-bold text-spring-green">
                        £{paidAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        {paymentProgressValue}% Complete
                      </p>
                    </div>

                    <div className="bg-red-50 rounded-lg p-3 sm:p-4 border-l-4 border-crimson-red min-w-0 max-w-full overflow-hidden">
                      <p className="text-xs text-gray-600 mb-1">Balance Due</p>
                      <p className="text-xl sm:text-2xl font-bold text-crimson-red">
                        £{remainingBalanceAmount.toFixed(2)}
                      </p>
                      {booking.paymentPlan && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {booking.paymentPlan}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Need Assistance */}
            <div>
              <h2 className="text-lg sm:text-xl font-hk-grotesk font-bold text-gray-900 mb-4 sm:mb-5">
                Need Assistance?
              </h2>

              <div className="space-y-3 sm:space-y-4">
                <div className="bg-white border rounded-lg p-3 sm:p-4 flex items-start gap-3 sm:gap-4 min-w-0 max-w-full overflow-hidden">
                  <div className="bg-crimson-red/10 rounded-lg p-2 sm:p-2.5">
                    <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-crimson-red" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Email</p>
                    <a
                      href="mailto:support@imheretravels.com"
                      className="text-xs sm:text-sm font-semibold text-crimson-red hover:underline break-all"
                    >
                      bella@imheretravels.com
                    </a>
                  </div>
                </div>

                <div className="bg-white border rounded-lg p-3 sm:p-4 flex items-start gap-3 sm:gap-4 min-w-0 max-w-full overflow-hidden">
                  <div className="bg-crimson-red/10 rounded-lg p-2 sm:p-2.5">
                    <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-crimson-red" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Phone</p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-900">
                      +63 998 247 6847
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleContactSupport}
                  variant="outline"
                  className="w-full justify-start h-auto py-3 border-2 hover:border-crimson-red hover:bg-crimson-red/5"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  <div className="text-left">
                    <p className="text-xs sm:text-sm font-semibold">
                      Contact Support
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-500">
                      Send us a message
                    </p>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-creative-midnight text-white mt-8 sm:mt-12">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
            <div>
              <Image
                src="/logos/Logo_White.svg"
                alt="ImHereTravels"
                width={140}
                height={40}
                className="h-6 sm:h-8 w-auto mb-2 sm:mb-3"
              />
              <p className="text-xs sm:text-sm text-white/70">
                Creating unforgettable travel experiences since 2020.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm sm:text-base mb-2 sm:mb-3">
                Quick Links
              </h4>
              <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-white/70">
                <li>
                  <a href="/" className="hover:text-white transition-colors">
                    Home
                  </a>
                </li>
                <li>
                  <a
                    href="/tours"
                    className="hover:text-white transition-colors"
                  >
                    Our Tours
                  </a>
                </li>
                <li>
                  <a
                    href="/about"
                    className="hover:text-white transition-colors"
                  >
                    About Us
                  </a>
                </li>
                <li>
                  <a
                    href="/contact"
                    className="hover:text-white transition-colors"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm sm:text-base mb-2 sm:mb-3">
                Follow Us
              </h4>
              <p className="text-xs sm:text-sm text-white/70">
                Stay connected for updates and special offers
              </p>
            </div>
          </div>
          <Separator className="my-4 sm:my-6 bg-white/20" />
          <div className="text-center text-white/50 text-[10px] sm:text-xs">
            <p>
              © {new Date().getFullYear()} ImHereTravels. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Pay Now Modal */}
      {booking && payNowInstallment && (
        <PayNowModal
          open={payNowModalOpen}
          onOpenChange={setPayNowModalOpen}
          bookingId={booking.bookingId}
          installmentTerm={payNowInstallment.id}
          amount={payNowInstallment.amount}
          currency="GBP"
          onStripeCheckout={handleStripeCheckoutFromModal}
          stripeProcessing={paymentProcessing !== null}
        />
      )}
    </div>
  );
}

