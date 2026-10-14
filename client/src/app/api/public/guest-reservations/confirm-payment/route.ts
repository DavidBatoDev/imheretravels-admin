import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, doc, getDoc } from "@/lib/server-firestore";
import { CreateBookingsError } from "@/lib/create-bookings-from-payment";
import { assertReservationPaidWithStripe } from "@/lib/reservation-payment-check";
import { guestPaidStatus, loadGuestContext } from "@/lib/guest-reservations-server";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

/**
 * POST /api/public/guest-reservations/confirm-payment
 * Body: { paymentDocId }
 *
 * After the guest's card payment succeeds: check it with Stripe, then record
 * "terms_selected" (parent on an instalment plan) or "reserve_paid". The
 * browser used to write that status itself. Returns { status }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const paymentDocId = typeof body?.paymentDocId === "string" ? body.paymentDocId : "";
    if (!paymentDocId) return NextResponse.json({ error: "paymentDocId is required" }, { status: 400 });

    const snap = await getDoc(doc(db, "stripePayments", paymentDocId));
    const data = snap.exists() ? (snap.data() as Record<string, any>) : null;
    const parentBookingId = data?.guestBooking?.parentBookingId;
    const guestEmail = data?.guestBooking?.guestEmail;
    if (!data?.booking?.isGuest || !parentBookingId || !guestEmail) {
      return NextResponse.json({ error: "Guest reservation not found" }, { status: 404 });
    }

    const context = await loadGuestContext(parentBookingId, guestEmail);
    const parentPlan = context.ok ? context.context.parentBooking.paymentPlan : undefined;
    const status = guestPaidStatus(parentPlan);

    await assertReservationPaidWithStripe(stripe, paymentDocId, { markStatus: status });
    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof CreateBookingsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Confirm guest payment failed:", err);
    return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
  }
}
