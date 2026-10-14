import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import Stripe from "stripe";
import crypto from "crypto";
import { isValidEmail, normalizeEmail } from "@/lib/email-normalize";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

type InstallmentId = "full_payment" | "p1" | "p2" | "p3" | "p4";

interface InstallmentFieldMap {
  dueDate: string;
  amount: string;
  datePaid: string;
}

const INSTALLMENT_FIELD_MAP: Record<InstallmentId, InstallmentFieldMap> = {
  full_payment: {
    dueDate: "fullPaymentDueDate",
    amount: "fullPaymentAmount",
    datePaid: "fullPaymentDatePaid",
  },
  p1: { dueDate: "p1DueDate", amount: "p1Amount", datePaid: "p1DatePaid" },
  p2: { dueDate: "p2DueDate", amount: "p2Amount", datePaid: "p2DatePaid" },
  p3: { dueDate: "p3DueDate", amount: "p3Amount", datePaid: "p3DatePaid" },
  p4: { dueDate: "p4DueDate", amount: "p4Amount", datePaid: "p4DatePaid" },
};

// Maps each installment term to its late fee penalty field in the booking document
const INSTALLMENT_PENALTY_FIELD: Record<InstallmentId, string | null> = {
  full_payment: null,
  p1: "p1LateFeesPenalty",
  p2: "p2LateFeesPenalty",
  p3: "p3LateFeesPenalty",
  p4: "p4LateFeesPenalty",
};

export async function POST(req: NextRequest) {
  try {
    const { access_token, installment_id } = await req.json();

    // Validate inputs
    if (!access_token || !installment_id) {
      return NextResponse.json(
        { error: "Missing access_token or installment_id" },
        { status: 400 },
      );
    }

    if (!INSTALLMENT_FIELD_MAP[installment_id as InstallmentId]) {
      return NextResponse.json(
        { error: "Invalid installment_id" },
        { status: 400 },
      );
    }

    console.log(
      `🔍 Creating checkout for installment: ${installment_id}, access_token: ${access_token.substring(0, 10)}...`,
    );

    // 1. Validate access_token and get booking
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("access_token", "==", access_token),
      limit(1),
    );
    const bookingsSnap = await getDocs(bookingsQuery);

    if (bookingsSnap.empty) {
      console.log("❌ Invalid access token");
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 403 },
      );
    }

    const bookingDoc = bookingsSnap.docs[0];
    const booking = { id: bookingDoc.id, ...bookingDoc.data() } as any;

    console.log(`✅ Found booking: ${booking.bookingId}`);

    // Support both email field names for backward compatibility. Normalise
    // before use: Stripe rejects addresses with stray whitespace, which admins
    // can paste into the sheet without noticing.
    const rawEmail = booking.emailAddress || booking.email;
    const customerEmail =
      normalizeEmail(booking.emailAddress) || normalizeEmail(booking.email);
    console.log(`📧 Customer email:`, JSON.stringify(rawEmail));

    // Validate email exists and is valid before writing anything or calling
    // Stripe, so a bad address doesn't leave a pending stripePayments doc.
    if (!isValidEmail(customerEmail)) {
      console.log(
        `❌ Invalid or missing email address on booking ${booking.bookingId}: ${JSON.stringify(rawEmail)}`,
      );
      return NextResponse.json(
        {
          error:
            "We couldn't start your payment because the email address on your booking looks invalid. Please contact us so we can correct it.",
        },
        { status: 400 },
      );
    }

    // 2. Get installment details from flat fields
    const fields = INSTALLMENT_FIELD_MAP[installment_id as InstallmentId];
    const dueDate = booking[fields.dueDate];
    const amount = booking[fields.amount];
    const datePaid = booking[fields.datePaid];

    // Read late fee penalty server-side from Firestore (client cannot inflate the charge)
    const penaltyField = INSTALLMENT_PENALTY_FIELD[installment_id as InstallmentId];
    const lateFeesPenalty = penaltyField ? Number(booking[penaltyField] || 0) : 0;
    const totalAmount = Number(amount) + lateFeesPenalty;

    // 3. Validate installment exists
    if (!dueDate || !amount) {
      console.log(`❌ Installment ${installment_id} not found in booking`);
      return NextResponse.json(
        { error: "Installment not found for this booking" },
        { status: 404 },
      );
    }

    console.log(
      `📅 Installment details: Due ${dueDate}, Base: £${amount}` +
        (lateFeesPenalty > 0 ? `, Late Fee: £${lateFeesPenalty}, Total: £${totalAmount}` : ""),
    );

    // 4. Check if already paid (check both sources)
    const tokenStatus = booking.paymentTokens?.[installment_id]?.status;
    if (datePaid || tokenStatus === "success") {
      console.log(`❌ Installment ${installment_id} already paid`);
      return NextResponse.json(
        { error: "Installment already paid" },
        { status: 400 },
      );
    }

    // 5. Check if payment is currently processing
    if (tokenStatus === "processing") {
      console.log(
        `⏳ Payment for ${installment_id} is currently being processed`,
      );
      return NextResponse.json(
        {
          error: "Payment is currently being processed. Please wait.",
        },
        { status: 409 },
      );
    }

    // 6. Generate payment_token (short-lived, one-time)
    const payment_token = crypto.randomBytes(32).toString("base64url");
    const payment_token_expires_at = Timestamp.fromMillis(
      Date.now() + 24 * 60 * 60 * 1000,
    ); // 24 hours

    console.log(
      `🔐 Generated payment token: ${payment_token.substring(0, 10)}...`,
    );

    // 7. Fetch tour package ID from tourPackages collection
    let tourPackageId = "";
    try {
      const tourPackagesQuery = query(
        collection(db, "tourPackages"),
        where("name", "==", booking.tourPackageName),
        limit(1),
      );
      const tourPackagesSnap = await getDocs(tourPackagesQuery);

      if (!tourPackagesSnap.empty) {
        tourPackageId = tourPackagesSnap.docs[0].id;
        console.log(`📦 Found tour package ID: ${tourPackageId}`);
      } else {
        console.log(
          `⚠️ Tour package not found for: ${booking.tourPackageName}`,
        );
      }
    } catch (error) {
      console.error("❌ Error fetching tour package:", error);
    }

    // 8. Cleanup: Cancel any existing pending payments for this installment
    // This prevents "stale" documents from accumulating if the user tries to pay multiple times
    try {
      const stalePaymentsQuery = query(
        collection(db, "stripePayments"),
        where("booking.documentId", "==", booking.id),
        where("payment.installmentTerm", "==", installment_id),
        where("payment.status", "==", "installment_pending"),
      );

      const stalePaymentsSnap = await getDocs(stalePaymentsQuery);

      if (!stalePaymentsSnap.empty) {
        console.log(
          `🧹 Found ${stalePaymentsSnap.size} stale payment(s) to cleanup...`,
        );

        const cleanupPromises = stalePaymentsSnap.docs.map(async (docSnap) => {
          await updateDoc(doc(db, "stripePayments", docSnap.id), {
            "payment.status": "cancelled",
            cancellationReason: "abandoned_for_new_attempt",
            "timestamps.updatedAt": serverTimestamp(),
          });
          console.log(`❌ Cancelled stale payment document: ${docSnap.id}`);
        });

        await Promise.all(cleanupPromises);
      }
    } catch (error) {
      console.warn("⚠️ Error cleaning up stale payments:", error);
      // Non-blocking error, continue with new payment creation
    }

    // 8. Create stripePayments document with full booking context
    const stripePaymentDoc = await addDoc(collection(db, "stripePayments"), {
      // Booking reference
      bookingDocumentId: booking.id,

      // Payment token for security
      payment_token: payment_token,
      payment_token_expires_at: payment_token_expires_at,

      // Customer information
      customer: {
        firstName: booking.firstName || "",
        lastName: booking.lastName || "",
        email: customerEmail,
        // Add additional fields if available in booking
        ...(booking.birthdate && { birthdate: booking.birthdate }),
        ...(booking.nationality && { nationality: booking.nationality }),
        ...(booking.whatsAppNumber && {
          whatsAppNumber: booking.whatsAppNumber,
        }),
      },

      // Booking details
      booking: {
        id: booking.bookingId,
        documentId: booking.id,
        type: booking.bookingType || "Single Booking",
        groupSize: 1, // Can be enhanced based on booking type
        ...(booking.groupId && { groupId: booking.groupId }),
      },

      // Tour information
      tour: {
        packageName: booking.tourPackageName,
        packageId: tourPackageId,
        date: booking.tourDate
          ? typeof booking.tourDate === "string"
            ? booking.tourDate
            : booking.tourDate.toDate
              ? booking.tourDate.toDate().toISOString().split("T")[0]
              : new Date(booking.tourDate.seconds * 1000)
                  .toISOString()
                  .split("T")[0]
          : "",
        ...(booking.returnDate && {
          returnDate:
            typeof booking.returnDate === "string"
              ? booking.returnDate
              : booking.returnDate.toDate
                ? booking.returnDate.toDate().toISOString().split("T")[0]
                : new Date(booking.returnDate).toISOString().split("T")[0],
        }),
        ...(booking.tourDuration && { duration: booking.tourDuration }),
      },

      // Payment details
      payment: {
        type: "installment",
        installmentTerm: installment_id,
        amount: totalAmount,
        baseAmount: amount,
        lateFeeAmount: lateFeesPenalty,
        currency: "GBP",
        status: "installment_pending",
      },

      // Payment plan context
      paymentPlan: {
        condition: booking.paymentCondition || "",
        plan: booking.paymentPlan || "",
        totalCost: booking.discountedTourCost || booking.originalTourCost || 0,
        paid: booking.paid || 0,
        remainingBalance: booking.remainingBalance || 0,
      },

      // Timestamps
      timestamps: {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });

    console.log(`📝 Created stripePayments document: ${stripePaymentDoc.id}`);

    // 8. Update booking.paymentTokens with nested object
    await updateDoc(doc(db, "bookings", booking.id), {
      [`paymentTokens.${installment_id}`]: {
        token: payment_token,
        expiresAt: payment_token_expires_at,
        stripePaymentDocId: stripePaymentDoc.id,
        status: "pending",
        lastAttemptAt: serverTimestamp(),
      },
    });

    console.log(`✅ Updated booking with payment token`);

    // 9. Create Stripe Checkout Session
    const installmentDisplayName =
      installment_id === "full_payment"
        ? "Full Payment"
        : installment_id.toUpperCase();

    // Use environment variable for base URL (works in both dev and production)
    const baseUrl =
      process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3000";

    console.log(`🌐 Using base URL: ${baseUrl}`);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "revolut_pay"],
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name:
                lateFeesPenalty > 0
                  ? `${booking.tourPackageName} - ${installmentDisplayName} (inc. late fee)`
                  : `${booking.tourPackageName} - ${installmentDisplayName}`,
              description:
                lateFeesPenalty > 0
                  ? `Booking ID: ${booking.bookingId} | Base: £${Number(amount).toFixed(2)} | Late Fee: £${lateFeesPenalty.toFixed(2)}`
                  : `Booking ID: ${booking.bookingId}`,
            },
            unit_amount: Math.round(totalAmount * 100), // Convert to pence (base + late fee)
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        description: `Installment ${installmentDisplayName} for ${booking.tourPackageName}`,
        metadata: {
          payment_token: payment_token,
          installment_id: installment_id,
          booking_document_id: booking.id,
          stripe_payment_doc_id: stripePaymentDoc.id,
          booking_id: booking.bookingId,
          tour_name: booking.tourPackageName,
          late_fee_amount: lateFeesPenalty.toString(),
        },
      },
      success_url: `${baseUrl}/booking-status/${access_token}?payment_success=true&installment=${installment_id}`,
      cancel_url: `${baseUrl}/booking-status/${access_token}?payment_cancelled=true&installment=${installment_id}`,
      metadata: {
        payment_token: payment_token,
        installment_id: installment_id,
        booking_document_id: booking.id,
        stripe_payment_doc_id: stripePaymentDoc.id,
      },
    });

    console.log(`💳 Created Stripe Checkout session: ${session.id}`);

    // 10. Update stripePayments with checkout session ID
    await updateDoc(doc(db, "stripePayments", stripePaymentDoc.id), {
      "payment.checkoutSessionId": session.id,
    });

    console.log(`✅ Payment session ready. Redirecting to Stripe...`);

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
    });
  } catch (error: any) {
    console.error("❌ Create checkout error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to create checkout session",
      },
      { status: 500 },
    );
  }
}
