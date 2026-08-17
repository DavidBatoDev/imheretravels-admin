"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Timestamp } from "firebase/firestore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmedBooking } from "@/types/pre-departure-pack";
import { getDoc, doc } from "firebase/firestore";
import {
  updateConfirmedBookingStatus,
  deleteConfirmedBooking,
} from "@/services/confirmed-bookings-service";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useToast } from "@/hooks/use-toast";
import {
  ExternalLink,
  Calendar,
  Package,
  FileText,
  Mail,
  User,
  Euro,
  Clock,
  Hash,
  List,
  Grid,
  Check,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatTourDuration } from "@/lib/tour-duration";

interface ConfirmedBookingModalProps {
  booking: ConfirmedBooking | null;
  open: boolean;
  onClose: () => void;
}

export default function ConfirmedBookingModal({
  booking,
  open,
  onClose,
}: ConfirmedBookingModalProps) {
  const [bookingData, setBookingData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [activeTab, setActiveTab] = useState<string>("Summary");
  const [isSending, setIsSending] = useState(false);
  const [markAsSentDialogOpen, setMarkAsSentDialogOpen] = useState(false);
  const [sentEmailLink, setSentEmailLink] = useState("");
  const [sentAtDate, setSentAtDate] = useState("");
  const [sentAtTime, setSentAtTime] = useState("");
  const [marking, setMarking] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unmarking, setUnmarking] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (booking && open) {
      loadBookingData();
    }
  }, [booking, open]);

  const loadBookingData = async () => {
    if (!booking) return;

    setLoading(true);
    try {
      const bookingDoc = await getDoc(
        doc(db, "bookings", booking.bookingDocumentId)
      );
      if (bookingDoc.exists()) {
        setBookingData({ id: bookingDoc.id, ...bookingDoc.data() });
      }
    } catch (error) {
      console.error("Error loading booking data:", error);
    } finally {
      setLoading(false);
    }
  };

  const safeDate = (value: any): Date => {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (value?.toDate) return value.toDate();
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const formatDate = (value: any) => {
    const date = safeDate(value);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (value: any) => {
    const date = safeDate(value);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const safeNumber = (value: any, fallback = 0) => {
    const n = Number(value);
    return isNaN(n) ? fallback : n;
  };

  const formatCurrency = (amount: any) => {
    const num = safeNumber(amount, 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(num);
  };

  const getTotalCost = () => {
    if (!bookingData) return 0;
    const original = safeNumber(bookingData.originalTourCost, 0);
    const discounted = safeNumber(bookingData.discountedTourCost, 0);
    if (discounted > 0) return discounted;
    return original;
  };

  // Track active section on scroll
  useEffect(() => {
    if (!open || loading) return;

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
  }, [open, loading, activeTab]);

  const scrollToTab = (id: string) => {
    const element = document.getElementById(`tab-${id}`);
    if (element) {
      // Set flag to prevent tracking during programmatic scroll
      isScrollingProgrammatically.current = true;
      setActiveTab(id);

      element.scrollIntoView({ behavior: "smooth", block: "start" });

      // Re-enable tracking after scroll animation completes
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 1000); // Smooth scroll typically takes ~500-800ms
    }
  };

  const handleSendEmail = async () => {
    if (!booking?.id) return;

    try {
      setIsSending(true);

      const sendEmail = httpsCallable(
        functions,
        "sendBookingConfirmationEmail"
      );

      const result = await sendEmail({ confirmedBookingId: booking.id });
      const data = result.data as {
        success: boolean;
        messageId?: string;
        sentEmailLink?: string;
      };

      if (data.success) {
        // Update local booking state
        if (booking) {
          booking.status = "sent";
          // Ensure we don't assign `null` to a field that expects `string | undefined`.
          booking.sentEmailLink = data.sentEmailLink ?? undefined;
          booking.sentAt = new Date() as any;
        }

        toast({
          title: "✅ Email Sent",
          description: "Booking confirmation email has been sent successfully",
          variant: "default",
        });

        // Reload booking data to reflect changes
        await loadBookingData();
      }
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "❌ Failed to Send Email",
        description:
          error.message || "An error occurred while sending the email",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkAsSent = () => {
    // Set default date/time to now in PH timezone
    const now = new Date();
    const phTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Manila" })
    );

    const year = phTime.getFullYear();
    const month = String(phTime.getMonth() + 1).padStart(2, "0");
    const day = String(phTime.getDate()).padStart(2, "0");
    setSentAtDate(`${year}-${month}-${day}`);

    const hours = String(phTime.getHours()).padStart(2, "0");
    const minutes = String(phTime.getMinutes()).padStart(2, "0");
    setSentAtTime(`${hours}:${minutes}`);

    setSentEmailLink("");
    setMarkAsSentDialogOpen(true);
  };

  const handleConfirmMarkAsSent = async () => {
    if (!booking?.id) return;

    setMarking(true);
    try {
      // Combine date and time
      const sentAtDateTime = new Date(`${sentAtDate}T${sentAtTime}`);

      await updateConfirmedBookingStatus(booking.id, {
        status: "sent",
        sentEmailLink: sentEmailLink || undefined,
        sentAt: sentAtDateTime,
      });

      // Update local booking state
      if (booking) {
        booking.status = "sent";
        booking.sentEmailLink = sentEmailLink || undefined;
        booking.sentAt = Timestamp.fromDate(sentAtDateTime) as any;
      }

      toast({
        title: "✅ Marked as Sent",
        description: "Booking has been marked as sent",
        variant: "default",
      });

      setMarkAsSentDialogOpen(false);
      setSentEmailLink("");

      // Reload booking data to reflect changes
      await loadBookingData();
    } catch (error: any) {
      console.error("Error marking as sent:", error);
      toast({
        title: "❌ Failed to Mark as Sent",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setMarking(false);
    }
  };

  const handleDeleteBooking = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!booking?.id) return;

    setDeleting(true);
    try {
      await deleteConfirmedBooking(booking.id);

      toast({
        title: "✅ Deleted",
        description: "Confirmed booking has been deleted successfully",
        variant: "default",
      });

      setDeleteDialogOpen(false);
      onClose(); // Close the modal after deletion
    } catch (error: any) {
      console.error("Error deleting booking:", error);
      toast({
        title: "❌ Failed to Delete",
        description:
          error.message || "An error occurred while deleting the booking",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleUnmarkAsSent = async () => {
    if (!booking?.id) return;

    setUnmarking(true);
    try {
      await updateConfirmedBookingStatus(booking.id, {
        status: "created",
      });

      // Update local booking state
      if (booking) {
        booking.status = "created";
        booking.sentEmailLink = undefined;
        booking.sentAt = undefined;
      }

      toast({
        title: "✅ Unmarked",
        description: "Booking has been unmarked as sent",
        variant: "default",
      });

      // Reload booking data to reflect changes
      await loadBookingData();
    } catch (error: any) {
      console.error("Error unmarking as sent:", error);
      toast({
        title: "❌ Failed",
        description: error.message || "An error occurred while unmarking",
        variant: "destructive",
      });
    } finally {
      setUnmarking(false);
    }
  };

  // Calculate values after all hooks
  if (!booking) return null;

  const paid = safeNumber(bookingData?.paid, 0);
  const totalCost = getTotalCost();
  const remaining = Math.max(0, totalCost - paid);
  const progress = (() => {
    const stored = (bookingData as any)?.paymentProgress;
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
  })();

  // Determine payment plan
  const paymentPlan = bookingData?.paymentPlan || "";
  const selectedTerms: string[] = [];

  if (paymentPlan.includes("Full Payment")) {
    selectedTerms.push("Full Payment");
  } else if (paymentPlan.includes("P1")) {
    selectedTerms.push("P1");
  } else if (paymentPlan.includes("P2")) {
    selectedTerms.push("P1", "P2");
  } else if (paymentPlan.includes("P3")) {
    selectedTerms.push("P1", "P2", "P3");
  } else if (paymentPlan.includes("P4")) {
    selectedTerms.push("P1", "P2", "P3", "P4");
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] bg-background p-0 rounded-full overflow-hidden">
        <DialogHeader className="sticky top-0 z-50 bg-background shadow-md border-b border-border/50 pb-3 pt-6 px-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-crimson-red to-crimson-red/80 rounded-full rounded-br-none shadow-sm">
                <Hash className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="block text-base">Confirmed Booking</span>
                <span className="text-2xl font-mono font-semibold text-crimson-red block">
                  {booking.bookingReference}
                </span>
              </div>
            </DialogTitle>
            <div className="flex items-center gap-2">
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
                  <Grid className="h-4 w-4" />
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
                  <List className="h-4 w-4" />
                </Button>
              </div>
              <Badge
                variant={booking.status === "sent" ? "default" : "secondary"}
                className="rounded-full"
              >
                {booking.status}
              </Badge>
            </div>
          </div>
          <div className="mt-2 ml-[56px] space-y-1">
            <p className="text-xs text-muted-foreground">
              Booking ID: {booking.bookingId}
            </p>
            {bookingData?.emailAddress && (
              <p className="text-xs text-muted-foreground">
                {bookingData.emailAddress}
              </p>
            )}
          </div>
        </DialogHeader>

        <div className="flex overflow-hidden max-h-[calc(90vh-120px)]">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto h-[95%] pl-6 pb-6 scrollbar-hide scroll-optimized"
          >
            <div className="space-y-4 pt-4">
              {/* Summary */}
              <div
                id="tab-Summary"
                className="scroll-mt-4 pb-4 mb-4 border-b-2 border-border/30"
              >
                <h2 className="text-lg font-bold text-foreground flex items-center gap-3 mb-4">
                  <div className="p-2 bg-crimson-red/20 rounded-full rounded-br-none shadow-sm">
                    <User className="h-5 w-5 text-crimson-red" />
                  </div>
                  <span>Booking Summary</span>
                </h2>
                {loading || !bookingData ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase">
                        Traveler
                      </p>
                      <p className="text-sm font-bold ">
                        {bookingData.fullName || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase">
                        Tour Package
                      </p>
                      <p className="text-sm font-bold ">
                        {booking.tourPackageName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase">
                        Tour Date
                      </p>
                      <p className="text-sm font-bold ">
                        {formatDate(booking.tourDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase">
                        Payment Plan
                      </p>
                      <p className="text-sm font-bold ">
                        {paymentPlan || "N/A"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase">
                        Payment Progress
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
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
                          <p className="text-xs text-crimson-red font-bold">
                            Due: {formatCurrency(remaining)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sections */}
              {loading ? (
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">
                    Loading details...
                  </p>
                </Card>
              ) : !bookingData ? (
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">
                    Booking data not found
                  </p>
                </Card>
              ) : (
                <>
                  {/* Customer */}
                  <Card
                    id="tab-Customer"
                    className="bg-background shadow-sm border border-border/50 scroll-mt-4"
                  >
                    <div className="p-3 bg-crimson-red/10 border-b border-crimson-red/20 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-crimson-red" />
                      <h3 className="text-sm font-bold">
                        Customer Information
                      </h3>
                    </div>
                    <div className={viewMode === "card" ? "p-3" : "p-0"}>
                      {viewMode === "card" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="p-2 rounded-lg bg-muted/20">
                            <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                              Full Name
                            </p>
                            <p className="text-xs font-semibold">
                              {bookingData.fullName || "N/A"}
                            </p>
                          </div>
                          <div className="p-2 rounded-lg bg-muted/20">
                            <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                              Email
                            </p>
                            <p className="text-xs font-semibold break-words">
                              {bookingData.emailAddress || "N/A"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                            <p className="text-xs text-muted-foreground uppercase">
                              Full Name
                            </p>
                            <p className="text-xs font-semibold">
                              {bookingData.fullName || "N/A"}
                            </p>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                            <p className="text-xs text-muted-foreground uppercase">
                              Email
                            </p>
                            <p className="text-xs font-semibold break-words">
                              {bookingData.emailAddress || "N/A"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Tour */}
                  <Card
                    id="tab-Tour"
                    className="bg-background shadow-sm border border-border/50 scroll-mt-4"
                  >
                    <div className="p-3 bg-crimson-red/10 border-b border-crimson-red/20 flex items-center gap-2">
                      <Package className="h-4 w-4 text-crimson-red" />
                      <h3 className="text-sm font-bold">Tour Information</h3>
                    </div>
                    <div className={viewMode === "card" ? "p-3" : "p-0"}>
                      {viewMode === "card" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="p-2 rounded-lg bg-muted/20">
                            <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                              Tour Package
                            </p>
                            <p className="text-xs font-semibold">
                              {booking.tourPackageName}
                            </p>
                          </div>
                          <div className="p-2 rounded-lg bg-muted/20">
                            <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                              Tour Date
                            </p>
                            <p className="text-xs font-semibold">
                              {formatDate(booking.tourDate)}
                            </p>
                          </div>
                          {bookingData.returnDate && (
                            <div className="p-2 rounded-lg bg-muted/20">
                              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                                Return Date
                              </p>
                              <p className="text-xs font-semibold">
                                {formatDate(bookingData.returnDate)}
                              </p>
                            </div>
                          )}
                          {bookingData.tourDuration && (
                            <div className="p-2 rounded-lg bg-muted/20">
                              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                                Duration
                              </p>
                              <p className="text-xs font-semibold">
                                {formatTourDuration(bookingData.tourDuration)}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                            <p className="text-xs text-muted-foreground uppercase">
                              Tour Package
                            </p>
                            <p className="text-xs font-semibold">
                              {booking.tourPackageName}
                            </p>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                            <p className="text-xs text-muted-foreground uppercase">
                              Tour Date
                            </p>
                            <p className="text-xs font-semibold">
                              {formatDate(booking.tourDate)}
                            </p>
                          </div>
                          {bookingData.returnDate && (
                            <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                              <p className="text-xs text-muted-foreground uppercase">
                                Return Date
                              </p>
                              <p className="text-xs font-semibold">
                                {formatDate(bookingData.returnDate)}
                              </p>
                            </div>
                          )}
                          {bookingData.tourDuration && (
                            <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                              <p className="text-xs text-muted-foreground uppercase">
                                Duration
                              </p>
                              <p className="text-xs font-semibold">
                                {formatTourDuration(bookingData.tourDuration)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Pre-departure Pack */}
                  {booking.preDeparturePackName && (
                    <Card
                      id="tab-PreDeparture"
                      className="bg-background shadow-sm border border-border/50 scroll-mt-4"
                    >
                      <div className="p-3 bg-crimson-red/10 border-b border-crimson-red/20 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-crimson-red" />
                        <h3 className="text-sm font-bold">
                          Pre-departure Pack
                        </h3>
                      </div>
                      <div className={viewMode === "card" ? "p-3" : "p-0"}>
                        {viewMode === "card" ? (
                          <div className="p-2 rounded-lg bg-muted/20">
                            <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                              Pack Name
                            </p>
                            <p className="text-xs font-semibold">
                              {booking.preDeparturePackName}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Attached to confirmation email
                            </p>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/50">
                            <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                              <p className="text-xs text-muted-foreground uppercase">
                                Pack Name
                              </p>
                              <p className="text-xs font-semibold">
                                {booking.preDeparturePackName}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* Payment Summary */}
                  <Card
                    id="tab-Payment"
                    className="bg-background shadow-sm border border-border/50 scroll-mt-4"
                  >
                    <div className="p-3 bg-crimson-red/10 border-b border-crimson-red/20 flex items-center gap-2">
                      <Euro className="h-4 w-4 text-crimson-red" />
                      <h3 className="text-sm font-bold">Payment Summary</h3>
                    </div>
                    <div className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 font-medium">
                                Payment Term
                              </th>
                              <th className="text-left p-2 font-medium">
                                Amount
                              </th>
                              <th className="text-left p-2 font-medium">
                                Due Date
                              </th>
                              <th className="text-left p-2 font-medium">
                                Date Paid
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentPlan.includes("Full Payment") && (
                              <tr className="border-t">
                                <td className="p-2 font-medium">
                                  Full Payment
                                </td>
                                <td className="p-2">
                                  {formatCurrency(
                                    bookingData.fullPaymentAmount
                                  )}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.fullPaymentDueDate)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.fullPaymentDatePaid)}
                                </td>
                              </tr>
                            )}
                            {selectedTerms.includes("P1") && (
                              <tr className="border-t">
                                <td className="p-2 font-medium">P1</td>
                                <td className="p-2">
                                  {formatCurrency(bookingData.p1Amount)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p1DueDate)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p1DatePaid)}
                                </td>
                              </tr>
                            )}
                            {selectedTerms.includes("P2") && (
                              <tr className="border-t">
                                <td className="p-2 font-medium">P2</td>
                                <td className="p-2">
                                  {formatCurrency(bookingData.p2Amount)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p2DueDate)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p2DatePaid)}
                                </td>
                              </tr>
                            )}
                            {selectedTerms.includes("P3") && (
                              <tr className="border-t">
                                <td className="p-2 font-medium">P3</td>
                                <td className="p-2">
                                  {formatCurrency(bookingData.p3Amount)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p3DueDate)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p3DatePaid)}
                                </td>
                              </tr>
                            )}
                            {selectedTerms.includes("P4") && (
                              <tr className="border-t">
                                <td className="p-2 font-medium">P4</td>
                                <td className="p-2">
                                  {formatCurrency(bookingData.p4Amount)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p4DueDate)}
                                </td>
                                <td className="p-2">
                                  {formatDate(bookingData.p4DatePaid)}
                                </td>
                              </tr>
                            )}
                            <tr className="border-t bg-muted/30">
                              <td colSpan={3} className="p-2 font-semibold">
                                Total Paid
                              </td>
                              <td className="p-2 font-semibold">
                                {formatCurrency(bookingData.paid)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Card>

                  {/* Email Status */}
                  <Card
                    id="tab-EmailStatus"
                    className="bg-background shadow-sm border border-border/50 scroll-mt-4"
                  >
                    <div className="p-3 bg-crimson-red/10 border-b border-crimson-red/20 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-crimson-red" />
                      <h3 className="text-sm font-bold">
                        Confirmation Email Status
                      </h3>
                    </div>
                    <div className={viewMode === "card" ? "p-3" : "p-0"}>
                      {viewMode === "card" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="p-2 rounded-lg bg-muted/20">
                            <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                              Created
                            </p>
                            <p className="text-xs font-semibold">
                              {formatDateTime(booking.createdAt)}
                            </p>
                          </div>
                          {booking.sentAt && (
                            <div className="p-2 rounded-lg bg-muted/20">
                              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">
                                Sent
                              </p>
                              <p className="text-xs font-semibold">
                                {formatDateTime(booking.sentAt)}
                              </p>
                            </div>
                          )}
                          {booking.sentEmailLink && (
                            <div className="col-span-1 md:col-span-2">
                              <Button
                                variant="outline"
                                className="w-full text-xs"
                                onClick={() =>
                                  window.open(booking.sentEmailLink!, "_blank")
                                }
                              >
                                <ExternalLink className="mr-2 h-3 w-3" /> View
                                in Gmail
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                            <p className="text-xs text-muted-foreground uppercase">
                              Created
                            </p>
                            <p className="text-xs font-semibold">
                              {formatDateTime(booking.createdAt)}
                            </p>
                          </div>
                          {booking.sentAt && (
                            <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20">
                              <p className="text-xs text-muted-foreground uppercase">
                                Sent
                              </p>
                              <p className="text-xs font-semibold">
                                {formatDateTime(booking.sentAt)}
                              </p>
                            </div>
                          )}
                          {booking.sentEmailLink && (
                            <div className="px-4 py-2">
                              <Button
                                variant="outline"
                                className="w-full text-xs"
                                onClick={() =>
                                  window.open(booking.sentEmailLink!, "_blank")
                                }
                              >
                                <ExternalLink className="mr-2 h-3 w-3" /> View
                                in Gmail
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                </>
              )}
            </div>
          </div>
          {/* Sidebar Navigation */}
          <div className="w-48 border-l border-border/50 p-4 overflow-y-auto scrollbar-hide">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sections
            </h3>
            <nav className="space-y-1">
              {[
                "Summary",
                "Customer",
                "Tour",
                "PreDeparture",
                "Payment",
                "EmailStatus",
              ]
                .filter(
                  (s) => s !== "PreDeparture" || booking.preDeparturePackName
                )
                .map((section) => {
                  const labelMap: Record<string, string> = {
                    Summary: "Summary",
                    Customer: "Customer",
                    Tour: "Tour",
                    PreDeparture: "Pre-Departure",
                    Payment: "Payment",
                    EmailStatus: "Email Status",
                  };
                  const IconMap: Record<string, any> = {
                    Summary: User,
                    Customer: Mail,
                    Tour: Package,
                    PreDeparture: FileText,
                    Payment: Euro,
                    EmailStatus: Clock,
                  };
                  const Icon = IconMap[section];
                  return (
                    <button
                      key={section}
                      onClick={() => scrollToTab(section)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                        activeTab === section
                          ? "bg-crimson-red text-white shadow-sm"
                          : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon
                        className={`h-3 w-3 flex-shrink-0 ${
                          activeTab === section
                            ? "text-white"
                            : "text-crimson-red"
                        }`}
                      />
                      <span className="text-xs font-medium truncate">
                        {labelMap[section]}
                      </span>
                    </button>
                  );
                })}
            </nav>
            {/* Action Buttons */}
            {booking.status === "created" && (
              <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                <Button
                  onClick={handleSendEmail}
                  disabled={isSending}
                  className="w-full bg-gradient-to-r from-crimson-red to-crimson-red/80 hover:from-crimson-red/90 hover:to-crimson-red/70 text-white shadow-lg"
                >
                  {isSending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleMarkAsSent}
                  disabled={isSending || marking}
                  variant="outline"
                  className="w-full border-crimson-red/30 hover:bg-crimson-red/10 hover:border-crimson-red"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark as Sent
                </Button>
              </div>
            )}

            {/* Unmark as Sent Button */}
            {booking.status === "sent" && !booking.sentEmailLink && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <Button
                  onClick={handleUnmarkAsSent}
                  disabled={unmarking}
                  variant="outline"
                  className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:border-amber-500"
                >
                  {unmarking ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      Unmarking...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Unmark as Sent
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Delete Button */}
            <div
              className={`${
                booking.status === "created" ||
                (booking.status === "sent" && !booking.sentEmailLink)
                  ? ""
                  : "mt-4 pt-4 border-t border-border/50"
              }`}
            >
              <Button
                onClick={handleDeleteBooking}
                disabled={isSending || marking || deleting || unmarking}
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Booking
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Mark as Sent Dialog */}
      <Dialog
        open={markAsSentDialogOpen}
        onOpenChange={setMarkAsSentDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Sent</DialogTitle>
            <DialogDescription>
              Mark this confirmed booking as sent
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sent-email-link">
                Sent Email Link (Optional)
              </Label>
              <Input
                id="sent-email-link"
                type="text"
                value={sentEmailLink}
                onChange={(e) => setSentEmailLink(e.target.value)}
                placeholder="https://mail.google.com/mail/u/0/#sent/..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="sent-at-date">Sent Date</Label>
              <Input
                id="sent-at-date"
                type="date"
                value={sentAtDate}
                onChange={(e) => setSentAtDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="sent-at-time">Sent Time (PH)</Label>
              <Input
                id="sent-at-time"
                type="time"
                value={sentAtTime}
                onChange={(e) => setSentAtTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMarkAsSentDialogOpen(false)}
              disabled={marking}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmMarkAsSent} disabled={marking}>
              {marking ? "Marking..." : "Mark as Sent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Confirmed Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this confirmed booking?
            </DialogDescription>
          </DialogHeader>
          {booking && (
            <div className="py-4">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Reference:</span>{" "}
                  {booking.bookingReference}
                </p>
                <p>
                  <span className="font-semibold">Booking ID:</span>{" "}
                  {booking.bookingId}
                </p>
                <p>
                  <span className="font-semibold">Tour Package:</span>{" "}
                  {booking.tourPackageName}
                </p>
              </div>
              <p className="mt-4 text-sm text-destructive font-medium">
                This action cannot be undone.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
