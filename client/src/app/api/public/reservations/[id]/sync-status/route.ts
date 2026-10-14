import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, doc, getDoc, updateDoc, serverTimestamp } from "@/lib/server-firestore";
import { CreateBookingsError } from "@/lib/create-bookings-from-payment";
import { assertReservationPaidWithStripe } from "@/lib/reservation-payment-check";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

/**
 * POST /api/public/reservations/{id}/sync-status
 *
 * Makes a reservation-fee doc's status match Stripe. Replaces the browser
 * writing "reserve_pending" itself when it found a stale "paid" status:
 * - "reserve_paid" with no booking yet, but the intent didn't succeed →
 *   back to "reserve_pending";
 * - still pending, but Stripe has the money → "reserve_paid" (after the full
 *   payment check).
 * Returns { status }.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ref = doc(db, "stripePayments", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

    const data = snap.data() as Record<string, any>;
    const status: string = data.payment?.status || data.status || "";
    const intentId = data.payment?.stripeIntentId;
    const hasBooking = !!data.booking?.documentId && data.booking.documentId !== "PENDING";
    // Guest docs follow the parent's plan (see guest-reservations); leave them.
    if (data.payment?.type !== "reservationFee" || data.booking?.isGuest || hasBooking || typeof intentId !== "string") {
      return NextResponse.json({ status });
    }

    const intent = await stripe.paymentIntents.retrieve(intentId);

    if (status === "reserve_paid" && intent.status !== "succeeded") {
      await updateDoc(ref, {
        "payment.status": "reserve_pending",
        "timestamps.updatedAt": serverTimestamp(),
      });
      return NextResponse.json({ status: "reserve_pending" });
    }

    if ((status === "reserve_pending" || status === "pending" || !status) && intent.status === "succeeded") {
      try {
        await assertReservationPaidWithStripe(stripe, id, { markStatus: "reserve_paid" });
        return NextResponse.json({ status: "reserve_paid" });
      } catch (err) {
        if (err instanceof CreateBookingsError) {
          console.warn(`sync-status: ${id} not marked paid: ${err.message}`);
          return NextResponse.json({ status });
        }
        throw err;
      }
    }

    return NextResponse.json({ status });
  } catch (error) {
    console.error("Sync reservation status failed:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
