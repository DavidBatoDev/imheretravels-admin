import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  db,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  collection,
  serverTimestamp,
} from "@/lib/server-firestore";
import { loadGuestContext } from "@/lib/guest-reservations-server";
import { timestampsToWire } from "@/lib/public-booking-view";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

const text = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * GET /api/public/guest-reservations?parent={stripePayments id}&email={guest}
 *
 * Everything the invitation page shows: the checked invitation, the parent
 * booking (without other guests' details), the cover image and the fee.
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const parent = params.get("parent") || "";
    const email = params.get("email") || "";
    if (!parent || !email) {
      return NextResponse.json({ error: "Invalid invitation link. Missing required parameters." }, { status: 400 });
    }

    const result = await loadGuestContext(parent, email);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });

    return NextResponse.json(
      { context: timestampsToWire(result.context) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Load guest invitation failed:", error);
    return NextResponse.json({ error: "Error validating invitation" }, { status: 500 });
  }
}

/**
 * POST /api/public/guest-reservations
 * Body: { parentBookingId, guestEmail, paymentDocId?, customer: { firstName, lastName, birthdate, nationality } }
 *
 * Creates the guest's draft, or re-submits it while unpaid. Tour, group,
 * fee and plan are copied from the parent on the server. Returns { id, amount }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parentBookingId = text(body?.parentBookingId, 128);
    const guestEmail = text(body?.guestEmail, 254);
    const paymentDocId = text(body?.paymentDocId, 128);
    const customer = {
      email: guestEmail,
      firstName: text(body?.customer?.firstName),
      lastName: text(body?.customer?.lastName),
      birthdate: text(body?.customer?.birthdate, 60),
      nationality: text(body?.customer?.nationality, 60),
    };
    if (!parentBookingId || !guestEmail || !customer.firstName || !customer.lastName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await loadGuestContext(parentBookingId, guestEmail);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
    const { parentBooking, depositAmount, parentPaymentPlanDetails, parentSelectedPaymentPlan } = result.context;
    if (!(depositAmount > 0)) {
      return NextResponse.json(
        { error: "We couldn't load the reservation fee for this group. Please contact us." },
        { status: 409 },
      );
    }

    const fields = {
      customer,
      booking: {
        type: parentBooking.bookingType || "Single Booking",
        groupSize: parentBooking.groupSize || 1,
        isGuest: true,
        id: "PENDING",
        documentId: "",
      },
      tour: {
        packageId: parentBooking.tourPackageId || "",
        packageName: parentBooking.tourName || "",
        date: parentBooking.tourDate || "",
      },
      payment: {
        amount: depositAmount,
        currency: "GBP",
        status: "reserve_pending",
        type: "reservationFee",
        ...(parentPaymentPlanDetails ? { paymentPlanDetails: parentPaymentPlanDetails } : {}),
        ...(parentSelectedPaymentPlan ? { selectedPaymentPlan: parentSelectedPaymentPlan } : {}),
      },
      guestBooking: { parentBookingId, guestEmail },
    };

    if (paymentDocId) {
      const ref = doc(db, "stripePayments", paymentDocId);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data() as Record<string, any>) : null;
      const sameGuest =
        existing?.booking?.isGuest &&
        existing.guestBooking?.parentBookingId === parentBookingId &&
        existing.guestBooking?.guestEmail === guestEmail;
      const status = existing?.payment?.status;
      if (!sameGuest || (status && status !== "reserve_pending")) {
        return NextResponse.json({ error: "This reservation can no longer be changed" }, { status: 409 });
      }
      const intentId = existing.payment?.stripeIntentId;
      if (typeof intentId === "string" && intentId.startsWith("pi_")) {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (intent.status === "succeeded" || intent.status === "processing") {
          return NextResponse.json({ error: "This reservation is already paid" }, { status: 409 });
        }
      }
      await updateDoc(ref, { ...fields, "timestamps.updatedAt": serverTimestamp() });
      return NextResponse.json({ id: paymentDocId, amount: depositAmount });
    }

    const ref = await addDoc(collection(db, "stripePayments"), {
      ...fields,
      timestamps: { createdAt: serverTimestamp() },
    });
    await updateDoc(ref, { id: ref.id });
    return NextResponse.json({ id: ref.id, amount: depositAmount });
  } catch (error) {
    console.error("Save guest reservation failed:", error);
    return NextResponse.json({ error: "Unable to save payment record" }, { status: 500 });
  }
}
