import { NextRequest, NextResponse } from "next/server";
import { db, collection, getDocs, query, where, orderBy, limit } from "@/lib/server-firestore";
import { bookingPaymentPlan, toPublicReservation } from "@/lib/public-reservations-server";
import { isReservationFeePayment } from "@/app/reservation-booking-form/utils/paymentLookup";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/reservations/lookup
 * Body: { email, birthdate }
 *
 * "Existing reservation found" at step 1. The browser used to query
 * stripePayments by email alone, which let anyone list another person's
 * reservations and personal details. Now the birthdate entered on the form
 * must match too. A POST body keeps both values out of URLs and access logs.
 *
 * Returns { records } (newest 10 reservation-fee docs), each with
 * `bookingPaymentPlan`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const birthdate = typeof body?.birthdate === "string" ? body.birthdate.trim() : "";
    if (!email || !birthdate) {
      return NextResponse.json({ error: "email and birthdate are required" }, { status: 400 });
    }

    const snap = await getDocs(
      query(
        collection(db, "stripePayments"),
        where("customer.email", "==", email),
        orderBy("timestamps.createdAt", "desc"),
        limit(10),
      ),
    );

    const matching = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as Record<string, any> }))
      .filter(({ data }) => data.customer?.birthdate === birthdate && isReservationFeePayment(data));

    const records = await Promise.all(
      matching.map(async ({ id, data }) =>
        toPublicReservation(id, data, { bookingPaymentPlan: await bookingPaymentPlan(data) }),
      ),
    );

    return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Reservation lookup failed:", error);
    return NextResponse.json({ error: "Failed to check existing reservations" }, { status: 500 });
  }
}
