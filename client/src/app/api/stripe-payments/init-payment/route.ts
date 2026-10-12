// app/api/stripe-payments/init-payment/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  db,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
  getDocs,
  getDoc,
  limit,
} from "@/lib/server-firestore";
import { StripePaymentDocument } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const {
      email,
      tourPackage,
      tourPackageName,
      amountGBP,
      paymentDocId,
      meta,
      isGuestBooking,
      parentBookingId,
      guestData,
      bookingType,
      numberOfGuests,
    } = await req.json();

    // Validate required fields
    if (!email || !tourPackage) {
      return NextResponse.json(
        {
          error: "Missing required fields: email and tourPackage are required",
        },
        { status: 400 }
      );
    }

    if (!amountGBP || amountGBP <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Convert GBP → pence (Stripe expects smallest currency unit)
    const amountPence = Math.round(amountGBP * 100);

    // 1️⃣ If a paymentDocId was supplied, try to reuse any existing intent attached to that doc
    if (paymentDocId) {
      try {
        const providedDocSnap = await getDoc(
          doc(db, "stripePayments", paymentDocId)
        );
        if (providedDocSnap.exists()) {
          const data = providedDocSnap.data() as any;
          if (data?.payment?.stripeIntentId) {
            try {
              const existingIntent = await stripe.paymentIntents.retrieve(
                data.payment.stripeIntentId
              );
              // Only reuse if the intent is still in a reusable state
              if (
                existingIntent &&
                existingIntent.status !== "succeeded" &&
                existingIntent.status !== "canceled"
              ) {
                console.log(
                  "♻️ Reusing existing payment intent for document:",
                  paymentDocId
                );
                return NextResponse.json({
                  clientSecret: existingIntent.client_secret,
                  paymentDocId,
                  reused: true,
                });
              }
            } catch (err) {
              console.warn(
                "Could not retrieve existing intent, creating new one:",
                err
              );
              // Continue to create new intent
            }
          }
        }
      } catch (err) {
        console.warn(
          "Could not read provided paymentDocId, creating new intent:",
          err
        );
      }
    }

    // 2️⃣ Otherwise, try to reuse an existing pending intent for same email + package
    const paymentsRef = collection(db, "stripePayments");
    const existingQ = query(
      paymentsRef,
      where("customer.email", "==", email),
      where("tour.packageId", "==", tourPackage),
      where("payment.type", "==", "reservationFee"),
      where("payment.status", "in", ["pending", "reserve_pending"]),
      limit(1)
    );

    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      const docSnap = existingSnap.docs[0];
      const data = docSnap.data() as any;
      if (data?.payment?.stripeIntentId) {
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(
            data.payment.stripeIntentId
          );
          if (
            existingIntent &&
            existingIntent.status !== "succeeded" &&
            existingIntent.status !== "canceled"
          ) {
            console.log("♻️ Reusing existing payment intent for email:", email);
            return NextResponse.json({
              clientSecret: existingIntent.client_secret,
              paymentDocId: docSnap.id,
              reused: true,
            });
          }
        } catch (err) {
          console.warn(
            "Could not retrieve existing intent, creating new one:",
            err
          );
        }
      }
    }

    // 3️⃣ Create a new PaymentIntent with descriptive info
    const idempotencyKey = `reservation_${email}_${tourPackage}_${amountPence}_${Date.now()}`;

    console.log("🆕 Creating new payment intent for:", {
      email,
      tourPackage,
      amountGBP,
      amountPence,
      idempotencyKey,
    });

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountPence,
        currency: "gbp",
        receipt_email: email,
        payment_method_types: ["card"],
        description: `Reservation fee for ${tourPackageName || tourPackage}${numberOfGuests && numberOfGuests > 1 ? ` (${numberOfGuests} guests)` : ''}`,
        metadata: {
          ...meta,
          email,
          tourPackageId: tourPackage,
          tourPackageName: tourPackageName || tourPackage,
          type: "reservationFee",
          source: "reservation-form",
          bookingType: bookingType || "Single Booking",
          numberOfGuests: numberOfGuests ? String(numberOfGuests) : "1",
        },
      },
      {
        idempotencyKey,
      }
    );

    console.log("✅ Created new payment intent:", intent.id);

    // 4️⃣ Store/attach in Firestore
    if (paymentDocId) {
      // Attach the intent to the existing placeholder document using updateDoc with dot notation
      const paymentDocRef = doc(db, "stripePayments", paymentDocId);
      await updateDoc(paymentDocRef, {
        "payment.stripeIntentId": intent.id,
        "payment.clientSecret": intent.client_secret,
        "payment.amount": amountGBP,
        "payment.currency": "GBP",
        "timestamps.updatedAt": serverTimestamp(),
      });

      console.log("📝 Updated existing Firestore document:", paymentDocId);

      return NextResponse.json({
        clientSecret: intent.client_secret,
        paymentDocId,
      });
    } else {
      // For guest bookings, fetch the main booker's booking type and groupSize
      let bookingType = "Single Booking";
      let bookingGroupSize = 1;

      if (isGuestBooking && parentBookingId) {
        try {
          const parentPaymentRef = doc(db, "stripePayments", parentBookingId);
          const parentPaymentSnap = await getDoc(parentPaymentRef);

          if (parentPaymentSnap.exists()) {
            const parentData = parentPaymentSnap.data();
            bookingType = parentData?.booking?.type || "Single Booking";
            bookingGroupSize = parentData?.booking?.groupSize || 1;
            console.log(
              "📋 Inherited booking type from main booker:",
              bookingType
            );
            console.log(
              "📋 Inherited group size from main booker:",
              bookingGroupSize
            );
          }
        } catch (error) {
          console.warn(
            "Could not fetch parent booking type, using default:",
            error
          );
        }
      }

      // Create a new Firestore document with nested structure
      const newPaymentDoc: Partial<StripePaymentDocument> = {
        booking: {
          type: bookingType,
          groupSize: bookingGroupSize,
          additionalGuests: [],
          isGuest: isGuestBooking || false,
        },
        customer: {
          email,
          firstName: "",
          lastName: "",
          nationality: "",
          birthdate: "",
        },
        tour: {
          packageId: tourPackage,
          packageName: tourPackageName || tourPackage,
          date: "",
        },
        payment: {
          clientSecret: intent.client_secret || "",
          amount: amountGBP,
          currency: "GBP",
          type: "reservationFee",
          status: "reserve_pending",
        },
        stripeIntentId: intent.id,
        timestamps: {
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        },
      } as any;

      const newDocRef = await addDoc(paymentsRef, newPaymentDoc);

      // Write back the id field on the document
      await setDoc(
        doc(db, "stripePayments", newDocRef.id),
        {
          id: newDocRef.id,
        },
        { merge: true }
      );

      console.log("📝 Created new Firestore document:", newDocRef.id);

      return NextResponse.json({
        clientSecret: intent.client_secret,
        paymentDocId: newDocRef.id,
      });
    }
  } catch (err: any) {
    console.error("❌ Stripe Init Payment Error:", err.message);
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
