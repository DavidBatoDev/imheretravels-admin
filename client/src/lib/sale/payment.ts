import "server-only";

import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import { SaleError, linkPaymentToHold, requireActiveHold } from "./holds";
import { parseHoldParam, toMs } from "./store";

const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

/** Same date key the reservation form uses for travel dates (UTC ISO day). */
function dateKey(v: unknown): string | null {
  const ms = toMs(v);
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10);
}

/**
 * Reservation fee for a held party, priced on the server: the tour deposit
 * (or the chosen date's custom deposit, as the form shows it) × party size.
 * The amount the browser sends is never trusted for a sale.
 */
async function reservationFeeFor(tourPackageId: string, tourDate: string | undefined, partySize: number) {
  const tour = await adminDb().collection("tourPackages").doc(tourPackageId).get();
  if (!tour.exists) throw new SaleError(404, "tour_not_found");
  const pricing = tour.get("pricing") ?? {};
  const dates: { startDate: unknown; customDeposit?: number | null; hasCustomDeposit?: boolean; isAvailable?: boolean }[] =
    tour.get("travelDates") ?? [];
  const date = tourDate ? dates.find((d) => d.isAvailable !== false && dateKey(d.startDate) === tourDate) : undefined;
  if (tourDate && !date) throw new SaleError(409, "tour_date_unavailable");
  const perPerson =
    date?.hasCustomDeposit === true && typeof date.customDeposit === "number"
      ? date.customDeposit
      : (pricing.deposit ?? 250);
  return Math.round(perPerson * partySize * 100) / 100;
}

/**
 * init-payment for a Black Friday hold: validates the hold, prices the fee,
 * creates (or reuses/updates) the PaymentIntent with the hold in its
 * metadata, and stamps the sale snapshot on the stripePayments doc so the
 * webhook can mark the slots sold and price each traveller's booking.
 */
export async function initSaleReservationPayment(opts: {
  holdParam: string;
  paymentDocId: string | undefined;
  email: string;
}): Promise<{ clientSecret: string; paymentDocId: string; amountGBP: number }> {
  const parsed = parseHoldParam(opts.holdParam);
  if (!parsed) throw new SaleError(404, "hold_not_found");
  if (!opts.paymentDocId) throw new SaleError(400, "missing_payment_doc");

  const hold = await requireActiveHold(parsed.holdId, parsed.token);
  const docRef = adminDb().collection("stripePayments").doc(opts.paymentDocId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new SaleError(404, "payment_doc_not_found");
  const data = docSnap.data()!;
  if (data.tour?.packageId !== hold.tourPackageId) throw new SaleError(409, "hold_tour_mismatch");
  if (data.payment?.status && !["reserve_pending", "pending"].includes(data.payment.status)) {
    throw new SaleError(409, "payment_already_completed");
  }
  if (data.sale?.holdId && data.sale.holdId !== parsed.holdId && data.payment?.stripeIntentId) {
    // The doc belonged to an earlier hold of this customer: its intent is stale.
    await stripe().paymentIntents.cancel(data.payment.stripeIntentId).catch(() => {});
  }

  const amountGBP = await reservationFeeFor(hold.tourPackageId, data.tour?.date || undefined, hold.partySize);
  const amountPence = Math.round(amountGBP * 100);

  let intent: Stripe.PaymentIntent | null = null;
  const existingId: string | undefined = data.sale?.holdId === parsed.holdId ? data.payment?.stripeIntentId : undefined;
  if (existingId) {
    const existing = await stripe().paymentIntents.retrieve(existingId).catch(() => null);
    if (existing && !["succeeded", "canceled"].includes(existing.status)) {
      intent =
        existing.amount === amountPence
          ? existing
          : await stripe().paymentIntents.update(existing.id, { amount: amountPence });
    }
  }

  if (!intent) {
    intent = await stripe().paymentIntents.create(
      {
        amount: amountPence,
        currency: "gbp",
        receipt_email: opts.email || undefined,
        payment_method_types: ["card"],
        description: `Reservation fee · ${hold.saleName} · ${hold.tourName} (${hold.partySize} ${hold.partySize === 1 ? "slot" : "slots"})`,
        metadata: {
          email: opts.email,
          tourPackageId: hold.tourPackageId,
          tourPackageName: hold.tourName,
          type: "reservationFee",
          source: "sale-hold",
          numberOfGuests: String(hold.partySize),
          saleId: hold.saleId,
          holdId: parsed.holdId,
          slotIndexes: hold.slotIndexes.join(","),
        },
      },
      { idempotencyKey: `sale_${parsed.holdId}_${opts.paymentDocId}_${amountPence}` },
    );
  }

  const originalPrice = hold.slots[0]?.originalPrice ?? 0;
  await docRef.update({
    "payment.stripeIntentId": intent.id,
    "payment.clientSecret": intent.client_secret,
    "payment.amount": amountGBP,
    "payment.currency": "GBP",
    ...(originalPrice ? { "payment.originalPrice": originalPrice } : {}),
    sale: {
      saleId: hold.saleId,
      saleName: hold.saleName,
      holdId: parsed.holdId,
      slotIndexes: hold.slotIndexes,
      // Slot prices in ladder order; traveller i (0 = main booker) pays slots[i].
      slots: [...hold.slots].sort((a, b) => a.index - b.index),
    },
    "timestamps.updatedAt": FieldValue.serverTimestamp(),
  });
  await linkPaymentToHold(parsed.holdId, parsed.token, opts.paymentDocId, intent.id);

  return { clientSecret: intent.client_secret!, paymentDocId: opts.paymentDocId, amountGBP };
}

/**
 * Webhook side: a sale payment succeeded but its slots went to someone else
 * (the hold ran out completely). Refund it and leave a trail for staff.
 */
export async function refundSaleConflict(paymentDocId: string, intentId: string, holdId: string) {
  let refundId: string | null = null;
  try {
    const refund = await stripe().refunds.create(
      { payment_intent: intentId, reason: "requested_by_customer", metadata: { holdId, reason: "sale_slot_conflict" } },
      { idempotencyKey: `sale_conflict_refund_${intentId}` },
    );
    refundId = refund.id;
  } catch (e) {
    console.error(`[sale] refund for conflicting payment ${intentId} failed`, e);
  }
  await adminDb()
    .collection("stripePayments")
    .doc(paymentDocId)
    .update({
      "sale.conflict": true,
      "sale.conflictRefundId": refundId,
      "sale.conflictAt": FieldValue.serverTimestamp(),
      "payment.status": refundId ? "refunded" : "sale_conflict",
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });
  return refundId;
}
