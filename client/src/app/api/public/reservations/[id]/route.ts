import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "@/lib/server-firestore";
import {
  bookingPaymentPlan,
  draftDocFields,
  isEditableDraft,
  priceDraft,
  readDraftInput,
  toPublicReservation,
} from "@/lib/public-reservations-server";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

/**
 * The doc can still say "pending" for a few seconds after Stripe took the
 * money (the webhook hasn't landed yet). Overwriting or deleting it then
 * would orphan a real payment, so ask Stripe.
 */
async function hasSucceededPayment(data: Record<string, any>): Promise<boolean> {
  const intentId = data.payment?.stripeIntentId;
  if (typeof intentId !== "string" || !intentId.startsWith("pi_")) return false;
  const intent = await stripe.paymentIntents.retrieve(intentId);
  return intent.status === "succeeded" || intent.status === "processing";
}

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Reservation not found" }, { status: 404 });

async function load(id: string) {
  if (!id || id.length > 128 || id.includes("/")) return null;
  const ref = doc(db, "stripePayments", id);
  const snap = await getDoc(ref);
  return snap.exists() ? { ref, data: snap.data() as Record<string, any> } : null;
}

/**
 * GET /api/public/reservations/{id}: the reservation as the form needs it
 * (session restore, guest-detail restore, waiting for the webhook's booking).
 * Adds `bookingPaymentPlan` (the linked booking's plan, if any).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const found = await load((await params).id);
    if (!found) return notFound();
    return NextResponse.json(
      {
        reservation: toPublicReservation(found.ref.id, found.data, {
          bookingPaymentPlan: await bookingPaymentPlan(found.data),
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Get reservation failed:", error);
    return NextResponse.json({ error: "Failed to load reservation" }, { status: 500 });
  }
}

/**
 * PATCH /api/public/reservations/{id}: re-submit step 1 on an unpaid draft.
 * Same whole-map replace the browser did (so a stale intent is dropped and
 * init-payment starts a fresh one), re-priced on the server.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const found = await load((await params).id);
    if (!found) return notFound();
    if (!isEditableDraft(found.data) || found.data.booking?.isGuest || (await hasSucceededPayment(found.data))) {
      return NextResponse.json({ error: "This reservation can no longer be changed" }, { status: 409 });
    }

    const parsed = readDraftInput(await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const price = await priceDraft(parsed.input);
    if (!price.ok) return NextResponse.json({ error: price.error }, { status: 400 });

    await updateDoc(found.ref, {
      ...draftDocFields(parsed.input, price),
      "timestamps.updatedAt": serverTimestamp(),
    });
    return NextResponse.json({ id: found.ref.id, amount: price.amount });
  } catch (error) {
    console.error("Update reservation draft failed:", error);
    return NextResponse.json({ error: "Unable to update payment record" }, { status: 500 });
  }
}

/** DELETE /api/public/reservations/{id}: discard an unpaid draft ("Discard This"). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const found = await load((await params).id);
    if (!found) return notFound();
    if (!isEditableDraft(found.data) || (await hasSucceededPayment(found.data))) {
      return NextResponse.json({ error: "Paid reservations can't be discarded" }, { status: 409 });
    }
    await deleteDoc(found.ref);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Discard reservation failed:", error);
    return NextResponse.json({ error: "Failed to discard reservation" }, { status: 500 });
  }
}
