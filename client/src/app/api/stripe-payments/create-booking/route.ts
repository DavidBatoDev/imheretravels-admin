// /api/stripe-payments/create-booking/route.ts
// Creates a booking document after a Step 2 reservation-fee payment.
// Called by the frontend after Stripe payment confirmation as an alternative
// to the webhook-based flow (or as a fallback when webhooks fail).
//
// Both this endpoint and the Stripe webhook delegate to
// createBookingsForReservationPayment so the two flows stay in sync.

import { NextRequest, NextResponse } from "next/server";
import {
  createBookingsForReservationPayment,
  CreateBookingsError,
} from "@/lib/create-bookings-from-payment";
import Stripe from "stripe";
import { assertReservationPaidWithStripe } from "@/lib/reservation-payment-check";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export async function POST(req: NextRequest) {
  try {
    const { paymentDocId } = await req.json();

    if (!paymentDocId) {
      return NextResponse.json(
        { error: "Missing required field: paymentDocId" },
        { status: 400 },
      );
    }

    // Public route: prove the payment with Stripe instead of trusting the
    // browser-writable payment.status, then record reserve_paid ourselves.
    await assertReservationPaidWithStripe(stripe, paymentDocId, {
      markStatus: "reserve_paid",
    });

    const result = await createBookingsForReservationPayment({
      paymentDocId,
      creationLock: "api",
    });

    if (result.alreadyExists) {
      return NextResponse.json({
        success: true,
        bookingDocumentId: result.bookingDocumentId,
        bookingId: result.bookingId,
        message: "Booking already exists",
        alreadyExists: true,
      });
    }

    // Notify staff only from the run that created the bookings (the webhook
    // does the same), never from the browser.
    try {
      const { createReservationPaymentNotification } = await import("@/lib/notification-server");
      await createReservationPaymentNotification({
        bookingId: result.bookingIds[0],
        bookingDocumentId: result.bookingDocumentIds[0],
        travelerName: `${result.mainBooker.firstName} ${result.mainBooker.lastName}`,
        tourPackageName: result.tourPackageName,
        amount: result.reservationFeeTotal,
        currency: "EUR",
      });
    } catch (notificationError) {
      console.error("❌ Failed to create notification:", notificationError);
    }

    return NextResponse.json({
      success: true,
      bookingDocumentId: result.bookingDocumentIds[0],
      bookingId: result.bookingIds[0],
      bookingDocumentIds: result.bookingDocumentIds,
      bookingIds: result.bookingIds,
      totalBookingsCreated: result.bookingIds.length,
      message: `${result.bookingIds.length} booking(s) created successfully`,
    });
  } catch (err: any) {
    console.error("❌ Create Booking Error:", err.message);
    console.error("Error details:", err);

    if (err instanceof CreateBookingsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      {
        error: err.message ?? "Failed to create booking",
        details: process.env.NODE_ENV === "development" ? err.stack : undefined,
      },
      { status: 500 },
    );
  }
}

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
