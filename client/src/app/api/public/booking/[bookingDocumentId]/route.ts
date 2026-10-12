import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "@/lib/server-firestore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingDocumentId: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const { bookingDocumentId } = await params;

    console.log("Fetching booking with access token:", bookingDocumentId);

    // Validate access token
    if (!bookingDocumentId) {
      return NextResponse.json(
        { success: false, error: "Access token is required" },
        { status: 400 },
      );
    }

    // Fetch booking by access_token
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("access_token", "==", bookingDocumentId),
      limit(1),
    );
    const bookingsSnap = await getDocs(bookingsQuery);

    if (bookingsSnap.empty) {
      console.log("Booking not found with access token:", bookingDocumentId);
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 },
      );
    }

    const bookingDoc = bookingsSnap.docs[0];
    const bookingData = {
      id: bookingDoc.id,
      ...bookingDoc.data(),
    } as any;

    console.log("Booking found:", bookingData.id);

    // Email verification is optional now since access token provides security
    // But we still support it for backward compatibility
    if (email) {
      const bookingEmail = bookingData.emailAddress?.toLowerCase();
      const providedEmail = email.toLowerCase();

      console.log(
        "Verifying email - Booking:",
        bookingEmail,
        "Provided:",
        providedEmail,
      );

      if (bookingEmail !== providedEmail) {
        console.log("Email mismatch");
        return NextResponse.json(
          { success: false, error: "Email does not match booking records" },
          { status: 403 },
        );
      }
    }

    // Fetch pre-departure pack if exists
    let preDeparturePack: any = null;
    try {
      const confirmedBookingsQuery = query(
        collection(db, "confirmedBookings"),
        where("bookingDocumentId", "==", bookingDoc.id),
      );
      const confirmedBookingsSnap = await getDocs(confirmedBookingsQuery);

      if (!confirmedBookingsSnap.empty) {
        const confirmedBooking = confirmedBookingsSnap.docs[0].data();

        if (confirmedBooking.preDeparturePackId) {
          const packRef = doc(
            db,
            "fileObjects",
            confirmedBooking.preDeparturePackId,
          );
          const packSnap = await getDoc(packRef);

          if (packSnap.exists()) {
            const packData = packSnap.data();
            preDeparturePack = {
              id: packSnap.id,
              fileName: packData.fileName,
              originalName: packData.originalName,
              fileDownloadURL: packData.fileDownloadURL,
              contentType: packData.contentType,
              size: packData.size,
              uploadedAt: packData.uploadedAt,
            };
          }
        }
      }
    } catch (error) {
      console.error("Error fetching pre-departure pack:", error);
      // Continue without pack if there's an error
    }

    console.log("Returning booking data, has pack:", !!preDeparturePack);

    // Filter data for public access (exclude sensitive information)
    const publicData = {
      // Identifiers
      bookingId: bookingData.bookingId,
      bookingCode: bookingData.bookingCode,
      tourCode: bookingData.tourCode,

      // Personal Info (limited)
      fullName: bookingData.fullName,
      firstName: bookingData.firstName,
      travellerInitials: bookingData.travellerInitials,

      // Tour Details
      tourPackageName: bookingData.tourPackageName,
      tourDate: bookingData.tourDate,
      returnDate: bookingData.returnDate,
      tourDuration: bookingData.tourDuration,
      formattedDate: bookingData.formattedDate,
      reservationDate: bookingData.reservationDate,

      // Pricing
      originalTourCost: bookingData.originalTourCost,
      discountedTourCost: bookingData.discountedTourCost,
      reservationFee: bookingData.reservationFee,
      paid: bookingData.paid,
      remainingBalance: bookingData.remainingBalance,
      paymentProgress: (() => {
        const totalCost =
          (bookingData.isMainBooker && bookingData.discountedTourCost
            ? bookingData.discountedTourCost
            : bookingData.originalTourCost) || 0;
        const paid = bookingData.paid || 0;

        if (totalCost === 0) return 0;
        return Math.round((paid / totalCost) * 100);
      })(),

      // Payment Plan
      paymentPlan: bookingData.paymentPlan,
      bookingStatus: bookingData.bookingStatus,

      // Payment Terms
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

      // Late Fee Fields
      p1LateFeesPenalty: bookingData.p1LateFeesPenalty,
      p1LateFeeAppliedAt: bookingData.p1LateFeeAppliedAt,
      p2LateFeesPenalty: bookingData.p2LateFeesPenalty,
      p2LateFeeAppliedAt: bookingData.p2LateFeeAppliedAt,
      p3LateFeesPenalty: bookingData.p3LateFeesPenalty,
      p3LateFeeAppliedAt: bookingData.p3LateFeeAppliedAt,
      p4LateFeesPenalty: bookingData.p4LateFeesPenalty,
      p4LateFeeAppliedAt: bookingData.p4LateFeeAppliedAt,

      // Email Links (for viewing confirmation)
      sentEmailLink: bookingData.sentEmailLink,

      // Discount Info
      eventName: bookingData.eventName,
      discountRate: bookingData.discountRate,

      // Group Booking Info
      bookingType: bookingData.bookingType,
      isMainBooker: bookingData.isMainBooker,

      // Payment Reminders
      enablePaymentReminder: bookingData.enablePaymentReminder,

      // Pre-Departure Pack
      preDeparturePack,

      // Payment Tokens (only in development for auto-confirm)
      ...(process.env.NEXT_PUBLIC_ENV === "development" && {
        paymentTokens: bookingData.paymentTokens,
      }),
    };

    return NextResponse.json({ success: true, data: publicData });
  } catch (error) {
    console.error("Error fetching booking:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch booking details" },
      { status: 500 },
    );
  }
}
