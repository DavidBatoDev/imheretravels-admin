"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, AlertCircle, CheckCircle2, X, Mail } from "lucide-react";
import { collection, getDocs, query, doc, getDoc } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import {
  createGuestInvitation,
  getGuestInvitationByBookingId,
} from "@/services/guest-invitations-service";
import { Timestamp } from "firebase/firestore";

interface AddGuestInvitationModalProps {
  open: boolean;
  onClose: () => void;
}

interface BookingWithValidation {
  id: string;
  bookingId: string;
  fullName: string;
  emailAddress: string;
  tourPackageName: string;
  tourDate: any;
  paid: number;
  originalTourCost: number;
  discountedTourCost: number;
  paymentProgress: string | number;
  computedProgress: number;
  isValid: boolean;
  validationErrors: string[];
  alreadyInvited: boolean;
}

export default function AddGuestInvitationModal({
  open,
  onClose,
}: AddGuestInvitationModalProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [bookings, setBookings] = useState<BookingWithValidation[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<
    BookingWithValidation[]
  >([]);
  const [onlyAt50Percent, setOnlyAt50Percent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithValidation | null>(null);

  useEffect(() => {
    if (open) {
      loadBookings();
    } else {
      setSearchTerm("");
      setSelectedBooking(null);
    }
  }, [open]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    let results = bookings;

    if (term) {
      results = results.filter(
        (b) =>
          b.bookingId.toLowerCase().includes(term) ||
          b.fullName.toLowerCase().includes(term) ||
          b.emailAddress.toLowerCase().includes(term) ||
          b.tourPackageName.toLowerCase().includes(term),
      );
    }

    if (onlyAt50Percent) {
      results = results.filter((b) => b.computedProgress >= 50);
    }

    setFilteredBookings(results);
  }, [searchTerm, bookings, onlyAt50Percent]);

  const computePaymentProgress = (booking: any): number => {
    // Use stored paymentProgress field first
    const stored = booking.paymentProgress;
    if (stored !== undefined && stored !== null) {
      if (typeof stored === "string") {
        const parsed = parseInt(stored.replace("%", ""));
        if (!isNaN(parsed)) return parsed;
      }
      if (typeof stored === "number") return Math.min(Math.max(stored, 0), 100);
    }
    // Fallback: calculate from paid vs total cost
    const rawTotal =
      booking.discountedTourCost && booking.discountedTourCost > 0
        ? booking.discountedTourCost
        : booking.originalTourCost;
    const total = Number(rawTotal);
    const paid = Number(booking.paid || 0);
    if (!isFinite(total) || total === 0) return 0;
    return Math.round((paid / total) * 100);
  };

  const validateBooking = async (
    booking: any,
  ): Promise<BookingWithValidation> => {
    const errors: string[] = [];
    let isValid = true;

    if (!booking.fullName || booking.fullName.trim() === "") {
      errors.push("Missing customer name");
      isValid = false;
    }

    if (!booking.emailAddress || booking.emailAddress.trim() === "") {
      errors.push("Missing email address");
      isValid = false;
    }

    if (!booking.tourPackageName || booking.tourPackageName.trim() === "") {
      errors.push("Missing tour package");
      isValid = false;
    }

    if (!booking.tourDate) {
      errors.push("Missing tour date");
      isValid = false;
    }

    const computedProgress = computePaymentProgress(booking);

    // Check if already has a guest invitation
    let alreadyInvited = false;
    try {
      const existing = await getGuestInvitationByBookingId(booking.id);
      if (existing) {
        alreadyInvited = true;
        errors.push("Already has a guest invitation");
        isValid = false;
      }
    } catch (error) {
      console.error("Error checking existing guest invitation:", error);
    }

    const paid = Number(booking.paid || 0);

    return {
      id: booking.id,
      bookingId: booking.bookingId || "",
      fullName: booking.fullName || "",
      emailAddress: booking.emailAddress || "",
      tourPackageName: booking.tourPackageName || "",
      tourDate: booking.tourDate,
      paid,
      originalTourCost: booking.originalTourCost || 0,
      discountedTourCost: booking.discountedTourCost || 0,
      paymentProgress: booking.paymentProgress || 0,
      computedProgress,
      isValid,
      validationErrors: errors,
      alreadyInvited,
    };
  };

  const loadBookings = async () => {
    setLoading(true);
    try {
      const bookingsQuery = query(collection(db, "bookings"));
      const snapshot = await getDocs(bookingsQuery);

      const bookingsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const validatedBookings = await Promise.all(
        bookingsData.map((b) => validateBooking(b)),
      );

      // Sort: valid first, then by payment progress desc, then by bookingId
      validatedBookings.sort((a, b) => {
        if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
        if (b.computedProgress !== a.computedProgress)
          return b.computedProgress - a.computedProgress;
        return b.bookingId.localeCompare(a.bookingId);
      });

      setBookings(validatedBookings);
      setFilteredBookings(
        onlyAt50Percent
          ? validatedBookings.filter((b) => b.computedProgress >= 50)
          : validatedBookings,
      );
    } catch (error) {
      console.error("Error loading bookings:", error);
      toast({
        title: "Error",
        description: "Failed to load bookings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOnly = async () => {
    if (!selectedBooking || !selectedBooking.isValid) return;

    setCreating(true);
    try {
      const tourDate = selectedBooking.tourDate?.toDate
        ? selectedBooking.tourDate.toDate()
        : new Date(selectedBooking.tourDate);

      await createGuestInvitation(
        selectedBooking.id,
        selectedBooking.bookingId,
        selectedBooking.tourPackageName,
        Timestamp.fromDate(tourDate),
        selectedBooking.emailAddress,
        selectedBooking.fullName,
        "created",
      );

      toast({
        title: "✅ Success",
        description: "Guest invitation created successfully",
        variant: "default",
      });

      onClose();
    } catch (error: any) {
      console.error("Error creating guest invitation:", error);
      toast({
        title: "❌ Failed",
        description: error.message || "Failed to create guest invitation",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateAndSendEmail = async () => {
    if (!selectedBooking || !selectedBooking.isValid) return;

    setSendingEmail(true);
    try {
      const tourDate = selectedBooking.tourDate?.toDate
        ? selectedBooking.tourDate.toDate()
        : new Date(selectedBooking.tourDate);

      // Create guest invitation
      const guestInvitationId = await createGuestInvitation(
        selectedBooking.id,
        selectedBooking.bookingId,
        selectedBooking.tourPackageName,
        Timestamp.fromDate(tourDate),
        selectedBooking.emailAddress,
        selectedBooking.fullName,
        "created",
      );

      // Send email via cloud function
      const sendInvitation = httpsCallable(
        functions,
        "sendGuestInvitationEmails",
      );
      const result = await sendInvitation({ guestInvitationId });
      const data = result.data as {
        success: boolean;
        messageId?: string;
        sentEmailLink?: string;
      };

      if (data.success) {
        toast({
          title: "✅ Success",
          description: "Guest invitation created and email sent successfully",
          variant: "default",
        });
      } else {
        toast({
          title: "⚠️ Partial Success",
          description: "Guest invitation created but email failed to send",
          variant: "default",
        });
      }

      onClose();
    } catch (error: any) {
      console.error("Error creating guest invitation:", error);
      toast({
        title: "❌ Failed",
        description: error.message || "Failed to create guest invitation",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const formatDate = (value: any) => {
    if (!value) return "N/A";
    const date = value?.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Guest Invitation</DialogTitle>
          <DialogDescription>
            Select a booking to create a guest invitation. All bookings can be
            selected regardless of payment progress.
          </DialogDescription>
        </DialogHeader>

        {/* Search & Filters */}
        <div className="relative flex items-center gap-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <div className="flex-1 relative">
            <Input
              placeholder="Search across all fields..."
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

          <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlyAt50Percent}
              onChange={(e) => setOnlyAt50Percent(e.target.checked)}
              className="h-4 w-4"
            />
            Only 50%+ progress
          </label>
        </div>

        {/* Bookings List */}
        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading bookings...
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchTerm
                ? "No bookings match your search"
                : onlyAt50Percent
                  ? "No bookings at 50% or higher payment progress"
                  : "No bookings found"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredBookings.map((booking) => (
                <button
                  key={booking.id}
                  onClick={() => setSelectedBooking(booking)}
                  disabled={!booking.isValid}
                  className={`w-full p-4 text-left transition-colors ${
                    selectedBooking?.id === booking.id
                      ? "bg-primary/10 border-l-4 border-primary"
                      : booking.isValid
                        ? "hover:bg-muted/50"
                        : "opacity-50 cursor-not-allowed bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-semibold text-sm">
                          {booking.bookingId}
                        </span>
                        {booking.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                      </div>
                      <p className="font-medium truncate">{booking.fullName}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {booking.emailAddress}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {booking.tourPackageName}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(booking.tourDate)}
                        </span>
                        <Badge
                          variant={
                            booking.computedProgress === 50
                              ? "secondary"
                              : "outline"
                          }
                          className={`text-xs ${
                            booking.computedProgress === 50
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : ""
                          }`}
                        >
                          {booking.computedProgress}% paid
                        </Badge>
                      </div>
                      {!booking.isValid &&
                        booking.validationErrors.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {booking.validationErrors.map((error, idx) => (
                              <p
                                key={idx}
                                className="text-xs text-destructive flex items-center gap-1"
                              >
                                <X className="h-3 w-3" />
                                {error}
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="font-semibold">
                        £{booking.paid.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={creating || sendingEmail}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleCreateOnly}
            disabled={
              !selectedBooking ||
              !selectedBooking.isValid ||
              creating ||
              sendingEmail
            }
          >
            {creating ? "Creating..." : "Create Only"}
          </Button>
          <Button
            onClick={handleCreateAndSendEmail}
            disabled={
              !selectedBooking ||
              !selectedBooking.isValid ||
              creating ||
              sendingEmail
            }
            className="bg-gradient-to-r from-crimson-red to-crimson-red/80 hover:from-crimson-red/90 hover:to-crimson-red/70"
          >
            {sendingEmail ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Create & Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
