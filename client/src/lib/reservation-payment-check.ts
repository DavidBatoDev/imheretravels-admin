import "server-only";

import type Stripe from "stripe";

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "@/lib/server-firestore";
import { CreateBookingsError } from "@/lib/create-bookings-from-payment";

/**
 * Proves a reservation-fee stripePayments doc was really paid, from Stripe
 * rather than from the doc. The browser can write `payment.status` and
 * `payment.stripeIntentId` itself (until the Phase 0 step 5 routes land), so
 * the public booking-creation routes must not trust either.
 *
 * Checks: the doc's PaymentIntent succeeded, in GBP, for the doc's amount, and
 * no other stripePayments doc claims the same intent (one real payment can't
 * be pointed at several drafts).
 *
 * `markStatus`: when set and the doc is still pending, record that status.
 * Throws CreateBookingsError (404/409/402) on any failure.
 */
export async function assertReservationPaidWithStripe(
  stripe: Stripe,
  paymentDocId: string,
  options: { markStatus?: string } = {},
): Promise<void> {
  const ref = doc(db, "stripePayments", paymentDocId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new CreateBookingsError("Payment record not found", 404);
  }
  const payment = snap.data()?.payment ?? {};
  const intentId: unknown = payment.stripeIntentId;
  if (typeof intentId !== "string" || !intentId.startsWith("pi_")) {
    throw new CreateBookingsError("No card payment has been started for this reservation", 409);
  }

  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.status !== "succeeded") {
    throw new CreateBookingsError(`Payment not completed (Stripe status: ${intent.status})`, 402);
  }
  if (intent.currency !== "gbp") {
    throw new CreateBookingsError("Payment currency does not match", 409);
  }
  const expectedPence = Math.round(Number(payment.amount) * 100);
  if (!Number.isFinite(expectedPence) || expectedPence <= 0 || intent.amount_received !== expectedPence) {
    throw new CreateBookingsError("Paid amount does not match the reservation", 409);
  }

  const claims = await getDocs(
    query(collection(db, "stripePayments"), where("payment.stripeIntentId", "==", intentId)),
  );
  if (claims.docs.some((d) => d.id !== paymentDocId)) {
    throw new CreateBookingsError("This payment is already linked to another reservation", 409);
  }

  const pending = !payment.status || payment.status === "reserve_pending";
  if (options.markStatus && pending) {
    await updateDoc(ref, {
      "payment.status": options.markStatus,
      "timestamps.updatedAt": serverTimestamp(),
    });
  }
}
