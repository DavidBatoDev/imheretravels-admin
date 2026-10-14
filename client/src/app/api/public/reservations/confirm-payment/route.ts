import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, doc, getDoc, getDocs, collection, query, where, limit } from "@/lib/server-firestore";
import { CreateBookingsError } from "@/lib/create-bookings-from-payment";
import { assertReservationPaidWithStripe } from "@/lib/reservation-payment-check";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

/**
 * POST /api/public/reservations/confirm-payment
 * Body: { paymentIntentId, paymentDocId? }
 *
 * Called by the form after Stripe's confirmPayment succeeds. It used to write
 * "reserve_paid" and the intent id onto the doc from the browser. Now the
 * server checks with Stripe and records the status itself. The intent must
 * be the one init-payment attached to the doc. Main-booker reservations
 * only; guests use the guest-reservations route.
 *
 * Returns { paymentDocId, status: "reserve_paid" }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const paymentIntentId = typeof body?.paymentIntentId === "string" ? body.paymentIntentId : "";
    let paymentDocId = typeof body?.paymentDocId === "string" ? body.paymentDocId : "";
    if (!paymentIntentId.startsWith("pi_")) {
      return NextResponse.json({ error: "paymentIntentId is required" }, { status: 400 });
    }

    if (!paymentDocId) {
      const found = await getDocs(
        query(
          collection(db, "stripePayments"),
          where("payment.stripeIntentId", "==", paymentIntentId),
          limit(1),
        ),
      );
      if (found.empty) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      paymentDocId = found.docs[0].id;
    }

    const snap = await getDoc(doc(db, "stripePayments", paymentDocId));
    if (!snap.exists()) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    const data = snap.data() as Record<string, any>;
    if (data.booking?.isGuest) {
      return NextResponse.json({ error: "Use the guest reservation route" }, { status: 400 });
    }
    if (data.payment?.stripeIntentId !== paymentIntentId) {
      return NextResponse.json({ error: "This payment does not belong to the reservation" }, { status: 409 });
    }

    await assertReservationPaidWithStripe(stripe, paymentDocId, { markStatus: "reserve_paid" });
    return NextResponse.json({ paymentDocId, status: "reserve_paid" });
  } catch (err) {
    if (err instanceof CreateBookingsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Confirm reservation payment failed:", err);
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }
}
