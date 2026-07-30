import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * TEST ENDPOINT - Manually trigger installment payment confirmation
 * Use this in development when Stripe webhooks don't reach localhost
 *
 * POST /api/installments/test-confirm
 * Body: { checkout_session_id: "cs_test_..." } OR { stripe_payment_doc_id: "EVMHhG..." }
 */
export async function POST(req: NextRequest) {
  // Server-side guard: NODE_ENV is set by the Next.js build/runtime itself and
  // cannot be influenced by NEXT_PUBLIC_* env vars or client requests, unlike
  // the client-side NEXT_PUBLIC_ENV check that previously gated this route.
  // This endpoint marks installments paid with no Stripe verification at all,
  // so it must never be reachable on a deployed (production or preview) build.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "This test-only endpoint is disabled outside local development" },
      { status: 403 },
    );
  }

  // Second, independent guard: this must never run against the production
  // Firebase project, even from a local `next dev` server (which always has
  // NODE_ENV=development) — a dev machine pointed at prod via .env.local has
  // hit this route before and force-marked real bookings paid with no charge.
  if (process.env.FIREBASE_PROJECT_ID === "imheretravels-a3f81") {
    return NextResponse.json(
      { error: "This test-only endpoint is disabled against the production Firebase project" },
      { status: 403 },
    );
  }

  try {
    const { checkout_session_id, stripe_payment_doc_id } = await req.json();

    if (!checkout_session_id && !stripe_payment_doc_id) {
      return NextResponse.json(
        { error: "Missing checkout_session_id or stripe_payment_doc_id" },
        { status: 400 },
      );
    }

    console.log(`🧪 TEST: Manually confirming payment`);

    let paymentDoc;
    let paymentData;

    // Method 1: Find by stripePaymentDocId (direct)
    if (stripe_payment_doc_id) {
      console.log(`📝 Looking up by document ID: ${stripe_payment_doc_id}`);
      const docRef = doc(db, "stripePayments", stripe_payment_doc_id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return NextResponse.json(
          { error: "Payment document not found" },
          { status: 404 },
        );
      }

      paymentDoc = { id: docSnap.id };
      paymentData = docSnap.data();
    }
    // Method 2: Find by checkoutSessionId (query)
    else if (checkout_session_id) {
      console.log(`📝 Looking up by checkout session: ${checkout_session_id}`);
      const { collection, query, where, getDocs } =
        await import("firebase/firestore");

      const paymentsQuery = query(
        collection(db, "stripePayments"),
        where("payment.checkoutSessionId", "==", checkout_session_id),
      );
      const paymentsSnap = await getDocs(paymentsQuery);

      if (paymentsSnap.empty) {
        return NextResponse.json(
          { error: "Payment session not found" },
          { status: 404 },
        );
      }

      paymentDoc = { id: paymentsSnap.docs[0].id };
      paymentData = paymentsSnap.docs[0].data();
    }

    console.log(`📝 Found payment document:`, paymentDoc.id);
    console.log(`📦 Metadata:`, {
      installmentId: paymentData.payment?.installmentTerm,
      bookingId: paymentData.bookingDocumentId,
      amount: paymentData.payment?.amount,
    });

    // 2. Update stripePayments document
    await updateDoc(doc(db, "stripePayments", paymentDoc.id), {
      "payment.status": "installment_paid",
      "timestamps.updatedAt": serverTimestamp(),
      "timestamps.paidAt": serverTimestamp(),
    });

    console.log(`✅ Updated stripePayments to installment_paid`);

    // 3. Get booking data
    const bookingRef = doc(db, "bookings", paymentData.bookingDocumentId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingSnap.data();
    const installmentId = paymentData.payment?.installmentTerm;

    // 4. Recalculate everything from scratch to prevent double-counting
    const baseCost =
      booking.discountedTourCost || booking.originalTourCost || 0;
    // Late fees increase total amount owed (mirrors remaining-balance.ts rule)
    const allAppliedLateFees = ["p1", "p2", "p3", "p4"].reduce(
      (sum: number, id: string) =>
        sum + (Number(booking[`${id}LateFeesPenalty`]) || 0),
      0,
    );
    const totalCost = baseCost + allAppliedLateFees;

    // Start with reservation fee
    let calculatedPaid = booking.reservationFee || 0;

    let installmentsPaidCount = 0;
    let totalInstallments = 0;
    let newBookingStatus = "";

    // Handle FULL PAYMENT separately
    if (installmentId === "full_payment") {
      const isCurrentPayment = installmentId === "full_payment";
      const isAlreadyPaid =
        booking.fullPaymentDatePaid ||
        booking.paymentTokens?.full_payment?.status === "success";

      if (isCurrentPayment || isAlreadyPaid) {
        const amount = booking.fullPaymentAmount || 0;
        calculatedPaid += amount;
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
      const paidTerms =
        isCurrentPayment || isAlreadyPaid ? booking.fullPaymentAmount || 0 : 0;

      // 5. Map installment_id to flat field names
      const datePaidFieldMap: Record<string, string> = {
        full_payment: "fullPaymentDatePaid",
        p1: "p1DatePaid",
        p2: "p2DatePaid",
        p3: "p3DatePaid",
        p4: "p4DatePaid",
      };

      const datePaidField = datePaidFieldMap[installmentId];
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
        [`paymentTokens.${installmentId}.status`]: "success",
        [`paymentTokens.${installmentId}.paidAt`]: paidTimestamp,
        [`paymentTokens.${installmentId}.token`]: null, // Invalidate token

        // Update flat field for backward compatibility
        [datePaidField]: paidTimestamp,

        // Update totals with recalculated values
        paid: calculatedPaid,
        paidTerms: paidTerms,
        remainingBalance: newRemainingBalance,
        paymentProgress: `${newPaymentProgress}%`,
        bookingStatus: bookingStatusWithDate,
      });

      console.log(`✅ Full payment marked as paid`);
      console.log(
        `💰 New totals: Paid ${calculatedPaid}, Remaining ${newRemainingBalance}, Progress ${newPaymentProgress}%`,
      );

      return NextResponse.json({
        success: true,
        message: "Full payment confirmed successfully",
        data: {
          installmentId,
          bookingId: booking.bookingId,
          amountPaid: paymentData.payment?.amount,
          newPaid: calculatedPaid,
          newPaidTerms: paidTerms,
          newRemainingBalance,
          newPaymentProgress: `${newPaymentProgress}%`,
          bookingStatus: bookingStatusWithDate,
        },
      });
    }

    // Handle INSTALLMENT PAYMENTS (P1, P2, P3, P4)
    const installments = ["p1", "p2", "p3", "p4"];
    totalInstallments = installments.filter(
      (id) => booking[`${id}Amount`] > 0,
    ).length;

    installments.forEach((id) => {
      const isCurrentPayment = id === installmentId;
      const isAlreadyPaid =
        booking[`${id}DatePaid`] ||
        booking.paymentTokens?.[id]?.status === "success";

      if (isCurrentPayment || isAlreadyPaid) {
        const amount = booking[`${id}Amount`] || 0;
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
        installmentId === "p1",
      ),
      p2: Boolean(
        booking.p2DatePaid ||
        booking.paymentTokens?.p2?.status === "success" ||
        installmentId === "p2",
      ),
      p3: Boolean(
        booking.p3DatePaid ||
        booking.paymentTokens?.p3?.status === "success" ||
        installmentId === "p3",
      ),
      p4: Boolean(
        booking.p4DatePaid ||
        booking.paymentTokens?.p4?.status === "success" ||
        installmentId === "p4",
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

    // Calculate paid terms (sum of all paid installments)
    let paidTerms = 0;
    installments.forEach((id) => {
      const isPaid =
        booking[`${id}DatePaid`] ||
        booking.paymentTokens?.[id]?.status === "success" ||
        id === installmentId;
      if (isPaid) {
        paidTerms += booking[`${id}Amount`] || 0;
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

    const datePaidField = datePaidFieldMap[installmentId];
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
      [`paymentTokens.${installmentId}.status`]: "success",
      [`paymentTokens.${installmentId}.paidAt`]: paidTimestamp,
      [`paymentTokens.${installmentId}.token`]: null, // Invalidate token

      // Update flat field for backward compatibility
      [datePaidField]: paidTimestamp,
      [`${installmentId}ScheduledReminderDate`]: "",

      // Update totals with recalculated values
      paid: calculatedPaid,
      paidTerms: paidTerms,
      remainingBalance: newRemainingBalance,
      paymentProgress: `${newPaymentProgress}%`,
      bookingStatus: bookingStatusWithDate,
    });

    console.log(`✅ Installment ${installmentId} marked as paid`);
    console.log(
      `💰 New totals: Paid ${calculatedPaid}, PaidTerms ${paidTerms}, Remaining ${newRemainingBalance}, Progress ${newPaymentProgress}%`,
    );

    return NextResponse.json({
      success: true,
      message: "Payment confirmed successfully",
      data: {
        installmentId,
        bookingId: booking.bookingId,
        amountPaid: paymentData.payment?.amount,
        newPaid: calculatedPaid,
        newPaidTerms: paidTerms,
        newRemainingBalance,
        newPaymentProgress: `${newPaymentProgress}%`,
        bookingStatus: bookingStatusWithDate,
      },
    });
  } catch (error: any) {
    console.error("❌ Test confirm error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to confirm payment" },
      { status: 500 },
    );
  }
}
