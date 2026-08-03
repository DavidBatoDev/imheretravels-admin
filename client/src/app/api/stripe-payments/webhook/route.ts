// /api/stripe-payments/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { createBookingsForReservationPayment } from "@/lib/create-bookings-from-payment";
import {
  getCreditOrder,
  getPaymentPlanTerms,
} from "@/app/functions/columns/payment-calculation-helpers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: null as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("⚠️ Webhook signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Handle the event
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      console.log("✅ PaymentIntent succeeded:", paymentIntent.id);

      // Update Firestore payment record
      const paymentsRef = collection(db, "stripePayments");
      const q = query(
        paymentsRef,
        where("payment.stripeIntentId", "==", paymentIntent.id),
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const paymentDoc = snapshot.docs[0];
        const paymentData = paymentDoc.data();

        // Check if this is a reservation fee payment (Step 2)
        if (
          paymentData.payment?.type === "reservationFee" &&
          paymentData.payment?.status !== "reserve_paid"
        ) {
          console.log(
            "🎯 Processing reservation fee payment - creating booking",
          );

          // Mark the payment as reserve_paid first so the shared helper's
          // status precondition is satisfied. This also ensures any concurrent
          // client-side call to /api/stripe-payments/create-booking sees the
          // correct status.
          await updateDoc(doc(db, "stripePayments", paymentDoc.id), {
            "payment.status": "reserve_paid",
            "timestamps.paidAt": new Date().toISOString(),
            "timestamps.updatedAt": serverTimestamp(),
          });

          try {
            const result = await createBookingsForReservationPayment({
              paymentDocId: paymentDoc.id,
              creationLock: "webhook",
            });

            if (!result.alreadyExists) {
              console.log(
                `✅ Created ${result.bookingIds.length} booking(s) via webhook`,
              );

              // Notify only for the main booker
              try {
                const { createReservationPaymentNotification } =
                  await import("@/utils/notification-service");
                await createReservationPaymentNotification({
                  bookingId: result.bookingIds[0],
                  bookingDocumentId: result.bookingDocumentIds[0],
                  travelerName: `${result.mainBooker.firstName} ${result.mainBooker.lastName}`,
                  tourPackageName: result.tourPackageName,
                  amount: result.reservationFeeTotal,
                  currency: "EUR",
                });
                console.log("✅ Notification created successfully");
              } catch (notificationError) {
                console.error(
                  "❌ Failed to create notification:",
                  notificationError,
                );
                // Don't block the webhook
              }
            } else {
              console.log(
                "✅ Booking already existed for this payment, skipping creation",
              );
            }
          } catch (bookingError: any) {
            console.error(
              "❌ Failed to create booking from webhook:",
              bookingError,
            );
            // Don't throw — Stripe will retry the webhook, and the
            // /api/stripe-payments/create-booking fallback can also recover.
          }
        } else {
          // For other payment types or already processed, just update status
          await updateDoc(doc(db, "stripePayments", paymentDoc.id), {
            "payment.status": "succeeded",
            "timestamps.paidAt": new Date().toISOString(),
          });
          console.log("✅ Firestore payment record updated to succeeded");
        }
      }
    }

    // Handle Stripe Checkout session completion (for installment payments)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // For delayed/async payment methods (e.g. Revolut Pay, enabled on this
      // checkout), `completed` fires as soon as the customer finishes the
      // Checkout flow, but `payment_status` can still be "unpaid" — actual
      // settlement is reported later via checkout.session.async_payment_succeeded
      // / async_payment_failed. Marking the installment paid here regardless of
      // payment_status previously let a session that later failed leave the
      // booking permanently showing "paid" with no real charge behind it.
      if (session.payment_status !== "paid") {
        console.log(
          `⏳ Checkout session ${session.id} completed but payment_status is "${session.payment_status}" — awaiting async confirmation, not marking paid yet.`,
        );

        // Surface this on the booking-status page: the UI already renders a
        // "Processing" badge for paymentTokens.{id}.status === "processing",
        // but nothing previously set that state, so a customer paying via an
        // async method (e.g. Revolut Pay) saw no difference between "not yet
        // attempted" and "submitted, awaiting confirmation" until the async
        // event eventually landed.
        const { installment_id, booking_document_id, stripe_payment_doc_id } =
          session.metadata || {};
        if (installment_id && booking_document_id) {
          await updateDoc(doc(db, "bookings", booking_document_id), {
            [`paymentTokens.${installment_id}.status`]: "processing",
          });
        }
        if (stripe_payment_doc_id) {
          await updateDoc(doc(db, "stripePayments", stripe_payment_doc_id), {
            "payment.status": "installment_processing",
            "timestamps.updatedAt": serverTimestamp(),
          });
        }

        return NextResponse.json({ received: true });
      }

      await handleInstallmentCheckoutPaid(session);
    }

    // Async payment methods (e.g. Revolut Pay) report final settlement here,
    // after `checkout.session.completed` already fired with payment_status
    // "unpaid".
    if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleInstallmentCheckoutPaid(session);
    }

    // Handle failed checkout sessions (for installment payments)
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { installment_id, booking_document_id } = session.metadata || {};

      if (installment_id && booking_document_id) {
        console.log(`❌ Payment failed for installment ${installment_id}`);

        await updateDoc(doc(db, "bookings", booking_document_id), {
          [`paymentTokens.${installment_id}.status`]: "failed",
          [`paymentTokens.${installment_id}.errorMessage`]: "Payment failed",
        });
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("❌ PaymentIntent failed:", paymentIntent.id);

      const paymentsRef = collection(db, "stripePayments");
      const q = query(
        paymentsRef,
        where("payment.stripeIntentId", "==", paymentIntent.id),
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const paymentDoc = snapshot.docs[0];
        await updateDoc(doc(db, "stripePayments", paymentDoc.id), {
          "payment.status": "failed",
          "timestamps.failedAt": new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handleInstallmentCheckoutPaid(session: Stripe.Checkout.Session) {
  const {
    payment_token,
    installment_id,
    booking_document_id,
    stripe_payment_doc_id,
  } = session.metadata || {};

  console.log(`💳 Checkout session completed: ${session.id}`);
  console.log(`📦 Metadata:`, {
    payment_token: payment_token?.substring(0, 10),
    installment_id,
    booking_document_id,
  });

  if (
    !payment_token ||
    !installment_id ||
    !booking_document_id ||
    !stripe_payment_doc_id
  ) {
    console.log("⚠️ Missing metadata for installment payment, skipping...");
    return NextResponse.json({ received: true });
  }

  try {
    // 1. Validate payment_token
    const stripePaymentDoc = await getDoc(
      doc(db, "stripePayments", stripe_payment_doc_id),
    );

    if (!stripePaymentDoc.exists()) {
      console.error("❌ Invalid payment document");
      return NextResponse.json({ received: true });
    }

    const paymentData = stripePaymentDoc.data();

    // Security: Verify payment_token matches
    if (paymentData.payment_token !== payment_token) {
      console.error("❌ Payment token mismatch - potential fraud");
      await updateDoc(doc(db, "bookings", booking_document_id), {
        [`paymentTokens.${installment_id}.status`]: "failed",
        [`paymentTokens.${installment_id}.errorMessage`]:
          "Security validation failed",
      });
      return NextResponse.json({ received: true });
    }

    // Check token hasn't expired
    if (paymentData.payment_token_expires_at?.toMillis() < Date.now()) {
      console.error("❌ Payment token expired");
      await updateDoc(doc(db, "bookings", booking_document_id), {
        [`paymentTokens.${installment_id}.status`]: "expired",
        [`paymentTokens.${installment_id}.errorMessage`]:
          "Payment token expired",
      });
      return NextResponse.json({ received: true });
    }

    // Verify this is actually an installment payment
    if (paymentData.payment?.type !== "installment") {
      console.log(
        `⚠️ Payment doc type is '${paymentData.payment?.type}', expected 'installment'. Skipping installment processing.`,
      );
      return NextResponse.json({ received: true });
    }

    // 2. Update stripePayments document
    await updateDoc(doc(db, "stripePayments", stripe_payment_doc_id), {
      "payment.status": "installment_paid",
      "timestamps.updatedAt": serverTimestamp(),
      "timestamps.paidAt": serverTimestamp(),
    });

    // 3. Get booking data
    const bookingRef = doc(db, "bookings", booking_document_id);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      console.error("❌ Booking not found");
      return NextResponse.json({ received: true });
    }

    const booking = bookingSnap.data();

    const priceSnapshotUpdates: Record<string, any> = {};
    if (!booking.priceSnapshotDate) {
      priceSnapshotUpdates.priceSnapshotDate = serverTimestamp();
    }
    if (!booking.priceSource) {
      priceSnapshotUpdates.priceSource = "snapshot";
    }
    if (booking.lockPricing === undefined) {
      priceSnapshotUpdates.lockPricing = true;
    }

    // 4. Recalculate everything from scratch to prevent double-counting
    const baseCost =
      booking.discountedTourCost || booking.originalTourCost || 0;
    // Late fees increase total amount owed (mirrors remaining-balance.ts rule)
    const allAppliedLateFees = ["p1", "p2", "p3", "p4"].reduce(
      (sum: number, id: string) =>
        sum + (Number(booking[`${id}LateFeesPenalty`]) || 0),
      0,
    );
    // Manual credit reduces the total amount the customer owes immediately —
    // mirrors remaining-balance.ts, which nets it out unconditionally rather
    // than only once the credited term is paid. Gating this on payment status
    // would contradict the (already-discounted) term amount shown on the
    // customer's own Payment Schedule, and would leave remainingBalance stuck
    // above zero — exactly the "stuck on Pending" bug this fixes.
    const creditPlan = (booking.paymentPlan || "").trim();
    const isFullPaymentPlan = creditPlan === "Full Payment";
    const manualCreditAmt = Number(booking.manualCredit) || 0;
    const creditOrder = getCreditOrder(booking.creditFrom, manualCreditAmt);
    const planTermsForCredit = getPaymentPlanTerms(creditPlan);
    const creditValidForPlan = isFullPaymentPlan
      ? manualCreditAmt > 0
      : creditOrder === 0 || (creditOrder >= 1 && creditOrder <= planTermsForCredit);
    const appliedManualCredit = creditValidForPlan ? manualCreditAmt : 0;
    const totalCost = baseCost + allAppliedLateFees - appliedManualCredit;

    // Start with reservation fee
    let calculatedPaid = booking.reservationFee || 0;

    let installmentsPaidCount = 0;
    let totalInstallments = 0;
    let newBookingStatus = "";

    // Handle FULL PAYMENT separately
    if (installment_id === "full_payment") {
      const isCurrentPayment = installment_id === "full_payment";
      const isAlreadyPaid =
        booking.fullPaymentDatePaid ||
        booking.paymentTokens?.full_payment?.status === "success";

      // fullPaymentAmount is expected to equal what Stripe actually charged
      // for this checkout, but it can drift if the booking's cost/credit
      // fields were edited between checkout creation and payment. Use the
      // real charged amount from the stripePayments doc as ground truth.
      const actualAmount = isCurrentPayment
        ? Number(paymentData.payment?.amount) || booking.fullPaymentAmount || 0
        : booking.fullPaymentAmount || 0;

      if (isCurrentPayment || isAlreadyPaid) {
        calculatedPaid += actualAmount;
      }

      const newRemainingBalance = totalCost - calculatedPaid;
      const newPaymentProgress = isCurrentPayment || isAlreadyPaid ? 100 : 0;

      // For full payment, status should be "Booking Confirmed" or "Waiting for Full Payment"
      if (newRemainingBalance <= 0.01) {
        // Allow small floating point differences
        newBookingStatus = "Booking Confirmed";
      } else {
        newBookingStatus = "Waiting for Full Payment";
      }

      // Calculate paid terms (full payment only; reservation fee excluded)
      const paidTerms = isCurrentPayment || isAlreadyPaid ? actualAmount : 0;

      // 5. Map installment_id to flat field names
      const datePaidFieldMap: Record<string, string> = {
        full_payment: "fullPaymentDatePaid",
        p1: "p1DatePaid",
        p2: "p2DatePaid",
        p3: "p3DatePaid",
        p4: "p4DatePaid",
      };

      const datePaidField = datePaidFieldMap[installment_id];
      const paidTimestamp = serverTimestamp();

      const lastPaidDate = new Date();
      const formatDate = (d: Date): string =>
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

      const bookingStatusWithDate =
        newRemainingBalance <= 0.01
          ? `Booking Confirmed — ${formatDate(lastPaidDate)}`
          : newBookingStatus;

      // 6. Update booking with SUCCESS status and recalculated totals
      await updateDoc(bookingRef, {
        // Update nested paymentTokens object
        [`paymentTokens.${installment_id}.status`]: "success",
        [`paymentTokens.${installment_id}.paidAt`]: paidTimestamp,
        [`paymentTokens.${installment_id}.token`]: null, // Invalidate token

        // Update flat field for backward compatibility
        [datePaidField]: paidTimestamp,
        // Self-heal the stored amount to what Stripe actually charged, in
        // case it drifted from the booking's cost/credit fields since checkout.
        fullPaymentAmount: actualAmount,

        // Update totals with recalculated values
        paid: calculatedPaid,
        paidTerms: paidTerms,
        remainingBalance: newRemainingBalance,
        paymentProgress: `${newPaymentProgress}%`,
        bookingStatus: bookingStatusWithDate,
      });

      console.log(
        `✅ Full payment paid successfully for booking ${booking_document_id}`,
      );
      console.log(
        `💰 New totals: Paid ${calculatedPaid}, PaidTerms ${paidTerms}, Remaining ${newRemainingBalance}, Progress ${newPaymentProgress}%`,
      );

      return NextResponse.json({ received: true });
    }

    // Handle INSTALLMENT PAYMENTS (P1, P2, P3, P4)
    const installments = ["p1", "p2", "p3", "p4"];
    totalInstallments = installments.filter(
      (id: string) => booking[`${id}Amount`] > 0,
    ).length;

    // The current installment's amount is expected to equal what Stripe
    // actually charged, but it can drift if the booking's cost/credit fields
    // were edited between checkout creation and payment. Use the real
    // charged amount from the stripePayments doc as ground truth, and
    // self-heal the stored field to match (see update below).
    const actualCurrentAmount =
      Number(paymentData.payment?.amount) ||
      booking[`${installment_id}Amount`] ||
      0;

    installments.forEach((id: string) => {
      const isCurrentPayment = id === installment_id;
      const isAlreadyPaid =
        booking[`${id}DatePaid`] ||
        booking.paymentTokens?.[id]?.status === "success";

      if (isCurrentPayment || isAlreadyPaid) {
        const amount = isCurrentPayment
          ? actualCurrentAmount
          : booking[`${id}Amount`] || 0;
        calculatedPaid += amount;
        // Mirror paid.ts: late fee is counted as paid when its installment is paid
        calculatedPaid += Number(booking[`${id}LateFeesPenalty`] || 0);
        installmentsPaidCount++;
      }
    });

    const newRemainingBalance = totalCost - calculatedPaid;
    const paidFlags = {
      p1: Boolean(
        booking.p1DatePaid ||
        booking.paymentTokens?.p1?.status === "success" ||
        installment_id === "p1",
      ),
      p2: Boolean(
        booking.p2DatePaid ||
        booking.paymentTokens?.p2?.status === "success" ||
        installment_id === "p2",
      ),
      p3: Boolean(
        booking.p3DatePaid ||
        booking.paymentTokens?.p3?.status === "success" ||
        installment_id === "p3",
      ),
      p4: Boolean(
        booking.p4DatePaid ||
        booking.paymentTokens?.p4?.status === "success" ||
        installment_id === "p4",
      ),
    };

    const plan = (booking.paymentPlan || "").trim();
    const planTerms = plan.match(/P(\d)/)
      ? parseInt(plan.match(/P(\d)/)![1], 10)
      : 0;

    const newPaymentProgress =
      plan === "P1"
        ? paidFlags.p1
          ? 100
          : 0
        : plan === "P2"
          ? Math.round(
              ((Number(paidFlags.p1) + Number(paidFlags.p2)) / 2) * 100,
            )
          : plan === "P3"
            ? Math.round(
                ((Number(paidFlags.p1) +
                  Number(paidFlags.p2) +
                  Number(paidFlags.p3)) /
                  3) *
                  100,
              )
            : plan === "P4"
              ? Math.round(
                  ((Number(paidFlags.p1) +
                    Number(paidFlags.p2) +
                    Number(paidFlags.p3) +
                    Number(paidFlags.p4)) /
                    4) *
                    100,
                )
              : 0;

    // Determine new booking status string for installments
    if (newRemainingBalance <= 0.01) {
      // Allow small floating point differences
      newBookingStatus = "Booking Confirmed";
    } else {
      newBookingStatus = `Installment ${installmentsPaidCount}/${totalInstallments}`;
    }

    // Calculate paid terms (sum of all paid installments; exclude reservation fee)
    let paidTerms = 0;
    installments.forEach((id) => {
      const isPaid =
        booking[`${id}DatePaid`] ||
        booking.paymentTokens?.[id]?.status === "success" ||
        id === installment_id;
      if (isPaid) {
        paidTerms += id === installment_id
          ? actualCurrentAmount
          : booking[`${id}Amount`] || 0;
        paidTerms += Number(booking[`${id}LateFeesPenalty`] || 0);
      }
    });

    // 5. Map installment_id to flat field names
    const datePaidFieldMap: Record<string, string> = {
      full_payment: "fullPaymentDatePaid",
      p1: "p1DatePaid",
      p2: "p2DatePaid",
      p3: "p3DatePaid",
      p4: "p4DatePaid",
    };

    const datePaidField = datePaidFieldMap[installment_id];
    const paidTimestamp = serverTimestamp();
    const lastPaidDate = new Date();
    const formatDate = (d: Date): string =>
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    const bookingStatusWithDate =
      newRemainingBalance <= 0.01
        ? `Booking Confirmed — ${formatDate(lastPaidDate)}`
        : planTerms > 0
          ? `Installment ${installmentsPaidCount}/${totalInstallments} — last paid ${formatDate(lastPaidDate)}`
          : newBookingStatus;

    // 6. Update booking with SUCCESS status and recalculated totals
    await updateDoc(bookingRef, {
      // Update nested paymentTokens object
      [`paymentTokens.${installment_id}.status`]: "success",
      [`paymentTokens.${installment_id}.paidAt`]: paidTimestamp,
      [`paymentTokens.${installment_id}.token`]: null, // Invalidate token

      // Update flat field for backward compatibility
      [datePaidField]: paidTimestamp,
      [`${installment_id}ScheduledReminderDate`]: "",
      // Self-heal the stored amount to what Stripe actually charged, in case
      // it drifted from the booking's cost/credit fields since checkout.
      [`${installment_id}Amount`]: actualCurrentAmount,

      // Update totals with recalculated values
      paid: calculatedPaid,
      paidTerms: paidTerms,
      remainingBalance: newRemainingBalance,
      paymentProgress: `${newPaymentProgress}%`,
      bookingStatus: bookingStatusWithDate,
      ...priceSnapshotUpdates,
    });

    console.log(
      `✅ Installment ${installment_id} paid successfully for booking ${booking_document_id}`,
    );
    console.log(
      `💰 New totals: Paid ${calculatedPaid}, PaidTerms ${paidTerms}, Remaining ${newRemainingBalance}, Progress ${newPaymentProgress}%`,
    );
  } catch (error: any) {
    console.error("❌ Webhook processing error:", error);

    // Mark payment as failed
    try {
      await updateDoc(doc(db, "bookings", booking_document_id), {
        [`paymentTokens.${installment_id}.status`]: "failed",
        [`paymentTokens.${installment_id}.errorMessage`]: error.message,
      });
    } catch (updateError) {
      console.error("❌ Failed to update error status:", updateError);
    }
  }
}
