import { NextRequest, NextResponse } from "next/server";
import { db, doc, getDoc, updateDoc, serverTimestamp } from "@/lib/server-firestore";
import Stripe from "stripe";
import { requireStaff } from "@/lib/require-staff";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover"
});

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    const { paymentDocId } = await req.json();

    // Validate required fields
    if (!paymentDocId) {
      return NextResponse.json(
        { error: "Missing required field: paymentDocId" },
        { status: 400 }
      );
    }

    console.log("🔄 Processing refund for payment:", paymentDocId);

    // Fetch the stripePayments document
    const paymentDocRef = doc(db, "stripePayments", paymentDocId);
    const paymentDocSnap = await getDoc(paymentDocRef);

    if (!paymentDocSnap.exists()) {
      return NextResponse.json(
        { error: "Payment document not found" },
        { status: 404 }
      );
    }

    const paymentData = paymentDocSnap.data();
    const stripeIntentId = paymentData.payment?.stripeIntentId;
    const currentStatus = paymentData.payment?.status;

    // Validate payment exists and has a Stripe intent ID
    if (!stripeIntentId) {
      return NextResponse.json(
        { error: "No Stripe payment intent found for this payment" },
        { status: 400 }
      );
    }

    // Check if already refunded
    if (currentStatus === "refunded") {
      return NextResponse.json(
        { error: "This payment has already been refunded" },
        { status: 400 }
      );
    }

    // Validate payment is in a refundable state
    const refundableStatuses = ["succeeded", "reserve_paid", "reservation_paid", "terms_selected"];
    if (!refundableStatuses.includes(currentStatus)) {
      return NextResponse.json(
        { 
          error: `Payment cannot be refunded. Current status: ${currentStatus}`,
          currentStatus 
        },
        { status: 400 }
      );
    }

    console.log("💳 Creating refund in Stripe for intent:", stripeIntentId);

    // Create refund in Stripe
    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create({
        payment_intent: stripeIntentId,
        reason: "requested_by_customer",
      });
      
      console.log("✅ Stripe refund created:", refund.id);
    } catch (stripeError: any) {
      console.error("❌ Stripe refund error:", stripeError);
      return NextResponse.json(
        { 
          error: "Failed to process refund with Stripe",
          details: stripeError.message 
        },
        { status: 500 }
      );
    }

    // Update stripePayments document
    await updateDoc(paymentDocRef, {
      "payment.status": "refunded",
      "payment.refundDetails": {
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
      },
      "timestamps.refundedAt": serverTimestamp(),
      "timestamps.updatedAt": serverTimestamp(),
    });

    console.log("✅ Payment document updated with refund status");

    // Update related booking documents
    const bookingDocumentIds = paymentData.bookingDocumentIds || [];
    
    if (bookingDocumentIds.length > 0) {
      console.log(`📝 Updating ${bookingDocumentIds.length} booking document(s)`);
      
      for (const bookingDocId of bookingDocumentIds) {
        try {
          const bookingDocRef = doc(db, "bookings", bookingDocId);
          await updateDoc(bookingDocRef, {
            status: "refunded",
            refundedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          console.log(`✅ Booking ${bookingDocId} updated to refunded status`);
        } catch (bookingError) {
          console.error(`⚠️ Failed to update booking ${bookingDocId}:`, bookingError);
          // Continue with other bookings even if one fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      paymentIntentId: stripeIntentId,
      amount: refund.amount / 100, // Convert from cents
      currency: refund.currency,
      status: refund.status,
      message: "Refund processed successfully",
    });
  } catch (err: any) {
    console.error("❌ Refund Error:", err.message);
    console.error("Error details:", err);

    return NextResponse.json(
      {
        error: err.message ?? "Failed to process refund",
        details: process.env.NODE_ENV === "development" ? err.stack : undefined,
      },
      { status: 500 }
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
