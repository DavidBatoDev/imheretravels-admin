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
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import {
  createConfirmedBooking,
  getConfirmedBookingByBookingId,
} from "@/services/confirmed-bookings-service";
import {
  findPackByTourPackageName,
  getAllPreDeparturePacks,
} from "@/services/pre-departure-pack-service";
import { getBookingsOnce } from "@/hooks/use-bookings-store";
import type { PreDeparturePack } from "@/types/pre-departure-pack";

interface AddConfirmedBookingModalProps {
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
  returnDate: any;
  paid: number;
  originalTourCost: number;
  discountedTourCost: number;
  useDiscountedTourCost?: boolean;
  paymentPlan?: string;
  isValid: boolean;
  validationErrors: string[];
  alreadyConfirmed: boolean;
  hasPreDeparturePack: boolean;
}

export default function AddConfirmedBookingModal({
  open,
  onClose,
}: AddConfirmedBookingModalProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [bookings, setBookings] = useState<BookingWithValidation[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<
    BookingWithValidation[]
  >([]);
  const [onlyCompletePayments, setOnlyCompletePayments] = useState(false);
  const [onlyWithPack, setOnlyWithPack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithValidation | null>(null);

  useEffect(() => {
    if (open) {
      loadBookings();
    } else {
      // Reset on close
      setSearchTerm("");
      setSelectedBooking(null);
    }
  }, [open]);

  useEffect(() => {
    // Filter bookings based on search term and optional 'only complete payments'
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

    if (onlyCompletePayments) {
      results = results.filter((b) => {
        const rawTotal =
          b.discountedTourCost && b.discountedTourCost > 0
            ? b.discountedTourCost
            : b.originalTourCost;
        const total = Number(rawTotal);
        const paid = Number(b.paid || 0);
        if (!isFinite(total)) return false;
        return paid >= total;
      });
    }

    if (onlyWithPack) {
      results = results.filter((b) => !!b.hasPreDeparturePack);
    }

    setFilteredBookings(results);
  }, [searchTerm, bookings, onlyCompletePayments]);

  const validateBooking = async (
    booking: any,
    packAvailabilityMap?: Map<string, boolean>,
    confirmedBookingIds?: Set<string>,
  ): Promise<BookingWithValidation> => {
    const errors: string[] = [];
    let isValid = true;

    // Required fields validation
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

    // Payment validation
    const rawTotalCost =
      booking.discountedTourCost && booking.discountedTourCost > 0
        ? booking.discountedTourCost
        : booking.originalTourCost;

    const totalCost = Number(rawTotalCost);
    const paid = Number(booking.paid || 0);

    if (!isFinite(totalCost)) {
      errors.push(`Invalid total cost (${String(rawTotalCost)})`);
      isValid = false;
    } else if (paid < totalCost) {
      errors.push(
        `Payment incomplete (${paid.toFixed(2)} / ${totalCost.toFixed(2)})`,
      );
      isValid = false;
    }

    // Check if already confirmed
    let alreadyConfirmed = false;
    try {
      const existing = confirmedBookingIds
        ? confirmedBookingIds.has(booking.id)
        : await getConfirmedBookingByBookingId(booking.id);
      if (existing) {
        alreadyConfirmed = true;
        errors.push("Already has confirmed booking");
        isValid = false;
      }
    } catch (error) {
      console.error("Error checking existing confirmed booking:", error);
    }

    // Check if tour package has pre-departure pack
    let hasPreDeparturePack = false;
    try {
      const normalizedTourName = String(booking.tourPackageName || "")
        .toLowerCase()
        .trim();

      if (packAvailabilityMap && packAvailabilityMap.has(normalizedTourName)) {
        hasPreDeparturePack = !!packAvailabilityMap.get(normalizedTourName);
      } else {
        const pack = await findPackByTourPackageName(booking.tourPackageName);
        hasPreDeparturePack = !!pack;
      }
    } catch (error) {
      console.error("Error checking pre-departure pack:", error);
    }

    return {
      id: booking.id,
      bookingId: booking.bookingId || "",
      fullName: booking.fullName || "",
      emailAddress: booking.emailAddress || "",
      tourPackageName: booking.tourPackageName || "",
      tourDate: booking.tourDate,
      returnDate: booking.returnDate,
      paid: paid,
      originalTourCost: booking.originalTourCost || 0,
      discountedTourCost: booking.discountedTourCost || 0,
      useDiscountedTourCost: booking.useDiscountedTourCost || false,
      paymentPlan: booking.paymentPlan || "",
      isValid,
      validationErrors: errors,
      alreadyConfirmed,
      hasPreDeparturePack,
    };
  };

  const loadBookings = async () => {
    setLoading(true);
    try {
      // Fetch everything once and join in memory (instead of one
      // confirmed-booking query + one pack lookup per booking).
      const [bookingsData, confirmedSnapshot, packs] = await Promise.all([
        getBookingsOnce(),
        // On failure, fall back to per-booking lookups (as before).
        getDocs(collection(db, "confirmedBookings")).catch((error) => {
          console.error("Error loading confirmedBookings:", error);
          return null;
        }),
        // On failure, fall back to per-tour lookups (as before).
        getAllPreDeparturePacks().catch((error): PreDeparturePack[] | null => {
          console.error("Error loading pre-departure packs:", error);
          return null;
        }),
      ]);

      const confirmedBookingIds = confirmedSnapshot
        ? new Set<string>(
            confirmedSnapshot.docs
              .map((doc) => doc.data().bookingDocumentId)
              .filter((id): id is string => typeof id === "string"),
          )
        : undefined;

      const packAvailabilityMap = new Map<string, boolean>();
      if (!packs) {
        // Bulk load failed: look up each unique tour once (previous behavior).
        const uniqueTourNames = Array.from(
          new Set(
            bookingsData
              .map((b: any) => String(b.tourPackageName || "").trim())
              .filter((name: string) => name.length > 0),
          ),
        );
        const entries = await Promise.all(
          uniqueTourNames.map(async (tourName) => {
            try {
              const pack = await findPackByTourPackageName(tourName);
              return [tourName.toLowerCase().trim(), !!pack] as const;
            } catch {
              return [tourName.toLowerCase().trim(), false] as const;
            }
          }),
        );
        entries.forEach(([key, value]) => packAvailabilityMap.set(key, value));
      } else {
        packs.forEach((pack) =>
          (pack.tourPackages || []).forEach((tp) =>
            packAvailabilityMap.set(
              String(tp.tourPackageName || "").toLowerCase().trim(),
              true,
            ),
          ),
        );
        bookingsData.forEach((b: any) => {
          const key = String(b.tourPackageName || "").toLowerCase().trim();
          if (key && !packAvailabilityMap.has(key)) {
            packAvailabilityMap.set(key, false);
          }
        });
      }

      // Validate each booking
      const validatedBookings = await Promise.all(
        bookingsData.map((b) =>
          validateBooking(b, packAvailabilityMap, confirmedBookingIds),
        ),
      );

      // Sort: valid bookings first, then by booking ID
      validatedBookings.sort((a, b) => {
        if (a.isValid !== b.isValid) {
          return a.isValid ? -1 : 1;
        }
        return b.bookingId.localeCompare(a.bookingId);
      });

      setBookings(validatedBookings);
      setFilteredBookings(validatedBookings);
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
      // Get pre-departure pack
      const pack = await findPackByTourPackageName(
        selectedBooking.tourPackageName,
      );

      const tourDate = selectedBooking.tourDate?.toDate
        ? selectedBooking.tourDate.toDate()
        : new Date(selectedBooking.tourDate);

      await createConfirmedBooking(
        selectedBooking.id,
        selectedBooking.bookingId,
        selectedBooking.tourPackageName,
        Timestamp.fromDate(tourDate),
        pack?.id || null,
        pack?.fileName || null,
        "created",
      );

      toast({
        title: "✅ Success",
        description: "Confirmed booking created successfully",
        variant: "default",
      });

      onClose();
    } catch (error: any) {
      console.error("Error creating confirmed booking:", error);
      toast({
        title: "❌ Failed",
        description: error.message || "Failed to create confirmed booking",
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
      // Get pre-departure pack
      const pack = await findPackByTourPackageName(
        selectedBooking.tourPackageName,
      );

      const tourDate = selectedBooking.tourDate?.toDate
        ? selectedBooking.tourDate.toDate()
        : new Date(selectedBooking.tourDate);

      // Create confirmed booking
      const confirmedBookingId = await createConfirmedBooking(
        selectedBooking.id,
        selectedBooking.bookingId,
        selectedBooking.tourPackageName,
        Timestamp.fromDate(tourDate),
        pack?.id || null,
        pack?.fileName || null,
        "created",
      );

      // Send email
      const sendEmail = httpsCallable(
        functions,
        "sendBookingConfirmationEmail",
      );
      const result = await sendEmail({ confirmedBookingId });
      const data = result.data as {
        success: boolean;
        messageId?: string;
        sentEmailLink?: string;
      };

      if (data.success) {
        toast({
          title: "✅ Success",
          description: "Confirmed booking created and email sent successfully",
          variant: "default",
        });
      } else {
        toast({
          title: "⚠️ Partial Success",
          description: "Confirmed booking created but email failed to send",
          variant: "default",
        });
      }

      onClose();
    } catch (error: any) {
      console.error("Error creating confirmed booking:", error);
      toast({
        title: "❌ Failed",
        description: error.message || "Failed to create confirmed booking",
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
          <DialogTitle>Add Confirmed Booking</DialogTitle>
          <DialogDescription>
            Select a booking to create a confirmed booking record. Only bookings
            with 100% payment and required fields can be selected.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative flex items-center gap-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <div className="flex-1 relative">
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

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyCompletePayments}
                onChange={(e) => setOnlyCompletePayments(e.target.checked)}
                className="h-4 w-4"
              />
              Only complete payments
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyWithPack}
                onChange={(e) => setOnlyWithPack(e.target.checked)}
                className="h-4 w-4"
              />
              Has Pack
            </label>
          </div>
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
                        {booking.hasPreDeparturePack && (
                          <Badge variant="secondary" className="text-xs">
                            Has Pack
                          </Badge>
                        )}
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
                      <p className="text-xs text-muted-foreground">Payment</p>
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
