// /api/stripe-payments/create-guest-booking/route.ts
// This API creates a guest booking document after successful payment.
// It uses the same createBookingData function as the main booking.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
} from "firebase/firestore";
import {
  validateGuestInvitation,
  checkDuplicateGuestBooking,
} from "@/lib/guest-booking-utils";
import {
  createBookingData,
  normalizeTourDateToUTCPlus8Nine,
  type BookingCreationInput,
} from "@/lib/booking-calculations";

/**
 * Generate a unique booking ID in format "YYMM-XXXX"
 * where XXXX is a zero-padded sequential number for the tour package
 */
function generateBookingId(
  tourDate: Date,
  existingCountForTour: number,
): string {
  const year = tourDate.getFullYear().toString().slice(-2);
  const month = String(tourDate.getMonth() + 1).padStart(2, "0");
  const sequence = String(existingCountForTour + 1).padStart(4, "0");
  return `${year}${month}-${sequence}`;
}

/**
 * Generate Group/Duo Booking Member ID (standalone version, no allRows needed).
 */
function generateGroupMemberIdFunction(
  bookingType: string,
  tourName: string,
  firstName: string,
  lastName: string,
  email: string,
  isActive: boolean,
): string {
  // Only Duo or Group bookings apply
  if (!(bookingType === "Duo Booking" || bookingType === "Group Booking")) {
    return "";
  }

  // Only generate ID if isActive is explicitly true
  if (isActive !== true) return "";

  const initials =
    (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase();
  const idPrefix = bookingType === "Duo Booking" ? "DB" : "GB";

  // Hash based on email + traveller identity
  const identity = `${bookingType}|${tourName}|${firstName}|${lastName}|${email}`;
  let hashNum = 0;
  for (let i = 0; i < identity.length; i++) {
    hashNum += identity.charCodeAt(i) * (i + 1);
  }
  const hashTag = String(Math.abs(hashNum) % 10000).padStart(4, "0");

  // Fake member number: derive from hash as a stable 001–999
  const memberNumber = String((Math.abs(hashNum) % 999) + 1).padStart(3, "0");

  return `${idPrefix}-${initials}-${hashTag}-${memberNumber}`;
}

/**
 * Convert various date formats to Date object
 */
function toDate(input: unknown): Date | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string" && input.trim() === "") return null;

  try {
    // Firestore Timestamp with toDate method
    if (
      typeof input === "object" &&
      input !== null &&
      "toDate" in (input as any) &&
      typeof (input as any).toDate === "function"
    ) {
      return (input as any).toDate();
    }

    // Firestore Timestamp-like object with seconds
    if (
      typeof input === "object" &&
      input !== null &&
      "seconds" in (input as any) &&
      typeof (input as any).seconds === "number"
    ) {
      const s = (input as any).seconds as number;
      const ns =
        typeof (input as any).nanoseconds === "number"
          ? (input as any).nanoseconds
          : 0;
      return new Date(s * 1000 + Math.floor(ns / 1e6));
    }

    // Already a Date
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

    // Milliseconds timestamp
    if (typeof input === "number") {
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    }

    // String formats
    if (typeof input === "string") {
      const raw = input.trim();

      // dd/mm/yyyy
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("/").map(Number);
        return new Date(yyyy, mm - 1, dd);
      }

      // yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yyyy, mm, dd] = raw.split("-").map(Number);
        return new Date(yyyy, mm - 1, dd);
      }

      // ISO string or natural language
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get total bookings count to determine the next row number
 */
async function getTotalBookingsCount(): Promise<number> {
  try {
    const bookingsRef = collection(db, "bookings");
    const snapshot = await getDocs(bookingsRef);

    const existingRows = new Set<number>();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.row && typeof data.row === "number") {
        existingRows.add(data.row);
      }
    });

    if (existingRows.size === 0) return 0;

    let nextRow = 1;
    while (existingRows.has(nextRow)) {
      nextRow++;
    }

    return nextRow - 1;
  } catch (error) {
    console.error("Error getting next row number:", error);
    return 0;
  }
}

/**
 * Fetch tour package data by ID
 */
async function getTourPackageData(tourPackageId: string) {
  try {
    const tourPackageDoc = await getDoc(doc(db, "tourPackages", tourPackageId));
    if (tourPackageDoc.exists()) {
      return { id: tourPackageDoc.id, ...tourPackageDoc.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching tour package:", error);
    return null;
  }
}

/**
 * Get count of existing bookings for the same tour package (for unique counter)
 */
async function getExistingBookingsCountForTourPackage(
  tourPackageName: string,
): Promise<number> {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(
      bookingsRef,
      where("tourPackageName", "==", tourPackageName),
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error("Error counting bookings for tour package:", error);
    return 0;
  }
}

/**
 * Calculate return date from tour start date and duration
 */
function calculateReturnDate(
  tourDate: unknown,
  durationDays: string | number | null | undefined,
): string {
  const start = toDate(tourDate);
  if (!start || isNaN(start.getTime())) return "";

  // Extract number from string like "13 Days", "8D", or just number
  let days: number;
  if (typeof durationDays === "number") {
    days = durationDays;
  } else if (typeof durationDays === "string") {
    const match = durationDays.match(/\d+/);
    days = match ? parseInt(match[0], 10) : NaN;
  } else {
    return "";
  }

  if (!days || isNaN(days)) return "";

  // Add (days - 1) to get return date (duration includes first day)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  end.setDate(end.getDate() + days - 1);

  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(req: NextRequest) {
  try {
    const { paymentDocId, parentBookingId, guestEmail, guestData } =
      await req.json();

    // Validation
    if (!paymentDocId || !parentBookingId || !guestEmail || !guestData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    console.log("📝 Creating guest booking for parent:", parentBookingId);
    console.log("📝 Guest email:", guestEmail);

    // 1. Fetch the guest's payment document
    const paymentDocRef = doc(db, "stripePayments", paymentDocId);
    const paymentDocSnap = await getDoc(paymentDocRef);

    if (!paymentDocSnap.exists()) {
      return NextResponse.json(
        { error: "Payment document not found" },
        { status: 404 },
      );
    }

    const paymentData = paymentDocSnap.data();

    // Check if booking already exists
    if (
      paymentData.booking?.documentId &&
      paymentData.booking.documentId !== "" &&
      paymentData.booking.documentId !== "PENDING"
    ) {
      console.log("✅ Booking already exists:", paymentData.booking.documentId);
      return NextResponse.json({
        success: true,
        bookingDocumentId: paymentData.booking.documentId,
        bookingId: paymentData.booking.id,
        message: "Booking already exists",
        alreadyExists: true,
      });
    }

    // 2. Validate the guest invitation
    const validationResult = await validateGuestInvitation(
      parentBookingId,
      guestEmail,
    );

    if (!validationResult.isValid) {
      return NextResponse.json(
        { error: validationResult.error || "Invalid invitation" },
        { status: 400 },
      );
    }

    const parentBooking = validationResult.parentBooking!;

    // 3. Check for duplicate booking
    const isDuplicate = await checkDuplicateGuestBooking(
      parentBooking.groupId,
      guestEmail,
    );

    if (isDuplicate) {
      return NextResponse.json(
        { error: "You have already made a booking for this group" },
        { status: 400 },
      );
    }

    // 4. Fetch the parent booking document to inherit all relevant fields
    let parentBookingPaymentPlan = "";
    let parentBookingPaymentMethod = "Stripe";
    let parentBookingTourDate: any = null;
    let parentBookingReturnDate = "";
    let parentBookingGroupId = "";
    let parentBookingPaymentCondition = "";
    let parentBookingAvailablePaymentTerms = "";
    let parentBookingEligible2ndOfMonths: any = "";
    let parentBookingP1Amount: any = "";
    let parentBookingP1DueDate = "";
    let parentBookingP2Amount: any = "";
    let parentBookingP2DueDate = "";
    let parentBookingP3Amount: any = "";
    let parentBookingP3DueDate = "";
    let parentBookingP4Amount: any = "";
    let parentBookingP4DueDate = "";
    let parentBookingFullPaymentAmount: any = "";
    let parentBookingFullPaymentDueDate = "";

    try {
      const parentPaymentRef = doc(db, "stripePayments", parentBookingId);
      const parentPaymentSnap = await getDoc(parentPaymentRef);

      if (parentPaymentSnap.exists()) {
        const parentPaymentData = parentPaymentSnap.data();
        const parentBookingDocId = parentPaymentData?.booking?.documentId;

        if (parentBookingDocId) {
          const parentBookingRef = doc(db, "bookings", parentBookingDocId);
          const parentBookingSnap = await getDoc(parentBookingRef);

          if (parentBookingSnap.exists()) {
            const parentBookingData = parentBookingSnap.data();

            // Inherit payment-related fields
            parentBookingPaymentPlan = parentBookingData?.paymentPlan || "";
            parentBookingPaymentMethod =
              parentBookingData?.paymentMethod || "Stripe";
            parentBookingPaymentCondition =
              parentBookingData?.paymentCondition || "";
            parentBookingAvailablePaymentTerms =
              parentBookingData?.availablePaymentTerms || "";
            parentBookingEligible2ndOfMonths =
              parentBookingData?.eligible2ndofmonths || "";

            // Inherit date fields
            parentBookingTourDate = parentBookingData?.tourDate;
            parentBookingReturnDate = parentBookingData?.returnDate || "";

            // Inherit group ID
            parentBookingGroupId = parentBookingData?.groupId || "";

            // Inherit payment amounts and due dates
            parentBookingP1Amount = parentBookingData?.p1Amount || "";
            parentBookingP1DueDate = parentBookingData?.p1DueDate || "";
            parentBookingP2Amount = parentBookingData?.p2Amount || "";
            parentBookingP2DueDate = parentBookingData?.p2DueDate || "";
            parentBookingP3Amount = parentBookingData?.p3Amount || "";
            parentBookingP3DueDate = parentBookingData?.p3DueDate || "";
            parentBookingP4Amount = parentBookingData?.p4Amount || "";
            parentBookingP4DueDate = parentBookingData?.p4DueDate || "";
            parentBookingFullPaymentAmount =
              parentBookingData?.fullPaymentAmount || "";
            parentBookingFullPaymentDueDate =
              parentBookingData?.fullPaymentDueDate || "";

            console.log("📋 Inherited from parent booking:", {
              paymentPlan: parentBookingPaymentPlan,
              paymentMethod: parentBookingPaymentMethod,
              groupId: parentBookingGroupId,
              tourDate: parentBookingTourDate,
              returnDate: parentBookingReturnDate,
              p1Amount: parentBookingP1Amount,
              p1DueDate: parentBookingP1DueDate,
              p2Amount: parentBookingP2Amount,
              p2DueDate: parentBookingP2DueDate,
            });
          }
        }
      }
    } catch (error) {
      console.warn("Could not fetch parent booking data:", error);
    }

    // 5. Fetch tour package data
    const tourPackage = await getTourPackageData(paymentData.tour?.packageId);
    const tourCode = (tourPackage as any)?.tourCode || "XXX";
    const originalTourCost = (tourPackage as any)?.pricing?.original || 0;
    const discountedTourCost =
      (tourPackage as any)?.pricing?.discounted || null;
    const tourDuration = (tourPackage as any)?.duration || null;

    // 6. Get existing bookings count for unique counter (per tour package)
    const existingCountForTourPackage =
      await getExistingBookingsCountForTourPackage(
        paymentData.tour?.packageName || (tourPackage as any)?.name || "",
      );

    // 7. Get total bookings count for global row number
    const totalBookingsCount = await getTotalBookingsCount();

    // 8. Use parent booking's tour date if available, otherwise parse from payment data
    const tourDateParsed = parentBookingTourDate
      ? toDate(parentBookingTourDate)
      : toDate(paymentData.tour?.date);

    console.log("📅 Parent booking tour date:", parentBookingTourDate);
    console.log("📅 Payment data tour date:", paymentData.tour?.date);
    console.log("📅 Using tour date:", tourDateParsed);

    const normalizedTourDate =
      normalizeTourDateToUTCPlus8Nine(tourDateParsed) || tourDateParsed;

    // Use parent's return date if available, otherwise calculate
    const calculatedReturnDate =
      parentBookingReturnDate ||
      calculateReturnDate(
        parentBookingTourDate || paymentData.tour?.date,
        tourDuration,
      );
    console.log("📅 Using return date:", calculatedReturnDate);

    // 9. Create booking input using the same function as main booking
    const bookingInput: BookingCreationInput = {
      email: guestData.email || guestEmail,
      firstName: guestData.firstName,
      lastName: guestData.lastName,
      bookingType: paymentData.booking?.type || "Single Booking",
      tourPackageName:
        paymentData.tour?.packageName || (tourPackage as any)?.name || "",
      tourCode,
      // Durable link to the tour; name and code are snapshots that go stale on
      // a rename.
      tourId: (tourPackage as any)?.id ?? paymentData.tour?.packageId ?? "",
      tourDate: normalizedTourDate || "", // Use inherited tour date from parent
      returnDate: calculatedReturnDate || "", // Use inherited or calculated return date
      tourDuration,
      reservationFee: paymentData.payment?.amount || 250,
      paidAmount: paymentData.payment?.amount || 250,
      originalTourCost,
      discountedTourCost,
      paymentMethod: (parentBookingPaymentMethod || "Stripe") as
        | "Revolut"
        | "Stripe", // Inherit from parent
      groupId: parentBookingGroupId || parentBooking.groupId, // Use inherited group ID from parent booking
      isMainBooking: false, // Guest is NOT the main booker
      existingBookingsCount: existingCountForTourPackage,
      totalBookingsCount: totalBookingsCount,
    };

    // 10. Create the booking data using the standard function
    const bookingData = (await createBookingData(bookingInput)) as any;

    // Inherit all payment-related fields from parent booking
    if (parentBookingPaymentPlan) {
      bookingData.paymentPlan = parentBookingPaymentPlan;
    }
    if (parentBookingPaymentCondition) {
      bookingData.paymentCondition = parentBookingPaymentCondition;
    }
    if (parentBookingAvailablePaymentTerms) {
      bookingData.availablePaymentTerms = parentBookingAvailablePaymentTerms;
    }
    if (parentBookingEligible2ndOfMonths) {
      bookingData.eligible2ndofmonths = parentBookingEligible2ndOfMonths;
    }

    // Inherit payment amounts and due dates
    bookingData.p1Amount = parentBookingP1Amount;
    bookingData.p1DueDate = parentBookingP1DueDate;
    bookingData.p2Amount = parentBookingP2Amount;
    bookingData.p2DueDate = parentBookingP2DueDate;
    bookingData.p3Amount = parentBookingP3Amount;
    bookingData.p3DueDate = parentBookingP3DueDate;
    bookingData.p4Amount = parentBookingP4Amount;
    bookingData.p4DueDate = parentBookingP4DueDate;
    bookingData.fullPaymentAmount = parentBookingFullPaymentAmount;
    bookingData.fullPaymentDueDate = parentBookingFullPaymentDueDate;

    console.log("📋 Applied inherited fields to guest booking:", {
      paymentPlan: bookingData.paymentPlan,
      paymentCondition: bookingData.paymentCondition,
      p1Amount: bookingData.p1Amount,
      p2Amount: bookingData.p2Amount,
    });

    // 11. Set isMainBooker to false for guest bookings
    const isGroupBooking =
      paymentData.booking?.type === "Duo Booking" ||
      paymentData.booking?.type === "Group Booking";

    if (isGroupBooking) {
      bookingData.isMainBooker = false; // Guest is never the main booker

      // Inherit the groupId from the main booker
      // Guests don't need their own groupIdGroupIdGenerator
      bookingData.groupId = parentBookingGroupId || parentBooking.groupId;

      console.log("📝 Creating guest booking with ID:", bookingData.bookingId);
      console.log("📝 isMainBooker:", bookingData.isMainBooker);
      console.log(
        "📝 groupIdGroupIdGenerator:",
        bookingData.groupIdGroupIdGenerator,
      );
      console.log("📝 groupId:", bookingData.groupId);
    } else {
      console.log("📝 Creating guest booking with ID:", bookingData.bookingId);
    }

    // 12. Calculate bookingStatus and paymentProgress
    // Guest has just paid the reservation fee (not P1 yet)
    let bookingStatus = "";
    let paymentProgress = "0%";

    if (parentBookingPaymentPlan) {
      // Guest just paid reservation fee, no installments paid yet
      const plan = parentBookingPaymentPlan.toUpperCase();

      if (plan === "FULL PAYMENT") {
        bookingStatus = "Waiting for Full Payment";
      } else if (plan === "P1") {
        bookingStatus = "Installment 0/1";
      } else if (plan === "P2") {
        bookingStatus = "Installment 0/2";
      } else if (plan === "P3") {
        bookingStatus = "Installment 0/3";
      } else if (plan === "P4") {
        bookingStatus = "Installment 0/4";
      }
    }

    // 13. Convert dates to Firestore Timestamps for storage (normalized to 9:00 AM UTC+8)
    const tourDateTimestamp = normalizedTourDate
      ? Timestamp.fromDate(normalizedTourDate)
      : null;
    const reservationDateTimestamp = Timestamp.now();

    // 14. Add to bookings collection with proper Timestamps
    const bookingsRef = collection(db, "bookings");
    const newBookingRef = await addDoc(bookingsRef, {
      ...bookingData,
      emailAddress: guestEmail || "", // Add for compatibility with Firebase Functions
      // Override dates
      tourDate: tourDateTimestamp,
      returnDate: calculatedReturnDate,
      reservationDate: reservationDateTimestamp,
      // Guest-specific fields
      nationality: guestData.nationality,
      birthdate: guestData.birthdate,
      phoneNumber: guestData.phoneNumber,
      dietaryRestrictions: guestData.dietaryRestrictions,
      // Calculated fields
      bookingStatus: bookingStatus,
      paymentProgress: paymentProgress,
      // Note: p1DatePaid is not set yet, only reservation fee has been paid
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("✅ Guest booking created with ID:", newBookingRef.id);
    console.log("📊 Booking Status:", bookingStatus);
    console.log("📊 Payment Progress:", paymentProgress);

    // 15. Update guest's payment document with booking reference
    await updateDoc(paymentDocRef, {
      "booking.documentId": newBookingRef.id,
      "booking.id": bookingData.bookingId,
      "timestamps.updatedAt": serverTimestamp(),
    });

    console.log("✅ Guest payment document updated");

    // 16. Update parent booking's invitation status to "accepted"
    const parentPaymentRef = doc(db, "stripePayments", parentBookingId);
    const parentPaymentSnap = await getDoc(parentPaymentRef);

    if (parentPaymentSnap.exists()) {
      const parentPaymentData = parentPaymentSnap.data();
      const guestInvitations = parentPaymentData.guestInvitations || [];

      // Find and update the invitation status
      const updatedInvitations = guestInvitations.map((inv: any) => {
        if (inv.email.toLowerCase() === guestEmail.toLowerCase()) {
          return {
            ...inv,
            status: "accepted",
            acceptedAt: Timestamp.now(),
            guestBookingId: newBookingRef.id,
          };
        }
        return inv;
      });

      await updateDoc(parentPaymentRef, {
        guestInvitations: updatedInvitations,
        "timestamps.updatedAt": serverTimestamp(),
      });

      console.log("✅ Parent booking invitation status updated to 'accepted'");
    }

    // 16. Return success response
    return NextResponse.json({
      success: true,
      bookingDocumentId: newBookingRef.id,
      bookingId: bookingData.bookingId,
      message: "Guest booking created successfully",
    });
  } catch (err: any) {
    console.error("❌ Create Guest Booking Error:", err.message);
    console.error("Error details:", err);

    return NextResponse.json(
      {
        error: err.message ?? "Failed to create guest booking",
        details: process.env.NODE_ENV === "development" ? err.stack : undefined,
      },
      { status: 500 },
    );
  }
}

// Add OPTIONS handler for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
