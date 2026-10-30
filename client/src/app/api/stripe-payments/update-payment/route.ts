// app/api/stripe-payments/update-payment/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/firebase";
import {
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";

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

    // Validate required fields
    if (!paymentDocId || !amountGBP) {
      return NextResponse.json(
        {
          error: "Missing required fields: paymentDocId and amountGBP are required",
        },
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

    // Sale payments are priced by init-payment from the hold; never from the client.
    if (paymentData?.sale?.holdId) {
      return NextResponse.json(
        { error: "Sale reservation fees are set by the server", cannotUpdate: true },
        { status: 400 }
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
    const amountPence = Math.round(amountGBP * 100);

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
      "payment.amount": amountGBP,
      "booking.type": bookingType || "Single Booking",
      "booking.groupSize": numberOfGuests || 1,
      "timestamps.updatedAt": serverTimestamp(),
    });

    console.log("✅ Updated payment intent:", updatedIntent.id);

    return NextResponse.json({
      success: true,
      paymentIntentId: updatedIntent.id,
      amount: amountGBP,
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
