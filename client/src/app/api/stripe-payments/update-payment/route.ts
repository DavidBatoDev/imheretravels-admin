// app/api/stripe-payments/update-payment/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  db,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "@/lib/server-firestore";
import { priceReservation } from "@/lib/reservation-pricing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const {
      paymentDocId,
      amountGBP,
      bookingType,
      numberOfGuests,
      tourPackageName,
    } = await req.json();

    // Validate required fields. amountGBP is only logged: the charge is
    // priced on the server from the draft's tour and date.
    if (!paymentDocId) {
      return NextResponse.json(
        { error: "Missing required field: paymentDocId" },
        { status: 400 }
      );
    }

    // Get the payment document to retrieve the payment intent ID
    const paymentDocRef = doc(db, "stripePayments", paymentDocId);
    const paymentDocSnap = await getDoc(paymentDocRef);

    if (!paymentDocSnap.exists()) {
      return NextResponse.json(
        { error: "Payment document not found" },
        { status: 404 }
      );
    }

    const paymentData = paymentDocSnap.data();
    const stripeIntentId = paymentData?.payment?.stripeIntentId;

    const paymentStatus = paymentData?.payment?.status;
    if (
      paymentData?.booking?.isGuest ||
      (paymentStatus && paymentStatus !== "reserve_pending" && paymentStatus !== "pending")
    ) {
      return NextResponse.json(
        { error: "This reservation can no longer be changed", cannotUpdate: true },
        { status: 400 }
      );
    }

    const tourPackageSnap = paymentData?.tour?.packageId
      ? await getDoc(doc(db, "tourPackages", paymentData.tour.packageId))
      : null;
    const price = priceReservation(
      tourPackageSnap?.exists() ? tourPackageSnap.data() : undefined,
      paymentData?.tour?.date,
      bookingType || paymentData?.booking?.type || "Single Booking",
      Number(numberOfGuests ?? paymentData?.booking?.groupSize ?? 1),
    );
    if (!price.ok) {
      return NextResponse.json({ error: price.error }, { status: 400 });
    }
    if (amountGBP !== undefined && Number(amountGBP) !== price.amount) {
      console.warn(
        `update-payment: browser sent £${amountGBP}, server price is £${price.amount} (${paymentDocId})`,
      );
    }

    if (!stripeIntentId) {
      return NextResponse.json(
        {
          error: "No payment intent associated with this document",
          cannotUpdate: true,
        },
        { status: 400 }
      );
    }

    // Retrieve the existing payment intent
    const existingIntent = await stripe.paymentIntents.retrieve(stripeIntentId);

    // Check if payment intent can be updated (not in terminal state)
    if (
      existingIntent.status === "succeeded" ||
      existingIntent.status === "canceled"
    ) {
      return NextResponse.json(
        {
          error: `Cannot update payment intent in ${existingIntent.status} state`,
          cannotUpdate: true,
        },
        { status: 400 }
      );
    }

    // Convert GBP → pence (Stripe expects smallest currency unit)
    const amountPence = Math.round(price.amount * 100);

    console.log("🔄 Updating payment intent:", {
      paymentIntentId: stripeIntentId,
      oldAmount: existingIntent.amount,
      newAmount: amountPence,
      bookingType,
      numberOfGuests,
    });

    // Update the payment intent
    const updatedIntent = await stripe.paymentIntents.update(stripeIntentId, {
      amount: amountPence,
      payment_method_types: ["card"],
      description: `Reservation fee for ${tourPackageName || "tour"}${numberOfGuests && numberOfGuests > 1 ? ` (${numberOfGuests} guests)` : ""}`,
      metadata: {
        ...existingIntent.metadata,
        bookingType: bookingType || "Single Booking",
        numberOfGuests: numberOfGuests ? String(numberOfGuests) : "1",
        updatedAt: new Date().toISOString(),
      },
    });

    // Update Firestore document
    await updateDoc(paymentDocRef, {
      "payment.amount": price.amount,
      "booking.type": bookingType || paymentData?.booking?.type || "Single Booking",
      "booking.groupSize": price.travellers,
      ...(price.originalPrice ? { "payment.originalPrice": price.originalPrice } : {}),
      "timestamps.updatedAt": serverTimestamp(),
    });

    console.log("✅ Updated payment intent:", updatedIntent.id);

    return NextResponse.json({
      success: true,
      paymentIntentId: updatedIntent.id,
      amount: price.amount,
      message: "Payment intent updated successfully",
    });
  } catch (err: any) {
    console.error("❌ Stripe Update Payment Error:", err.message);
    console.error("Error details:", err);

    return NextResponse.json(
      {
        error: err.message ?? "Stripe error",
        details: process.env.NODE_ENV === "development" ? err.stack : undefined,
      },
      { status: 400 }
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
