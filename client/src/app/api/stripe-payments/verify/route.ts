// /api/stripe-payments/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db, collection, query, where, getDocs } from "@/lib/server-firestore";

export async function POST(req: NextRequest) {
  try {
    const { stripeIntentId } = await req.json();

    if (!stripeIntentId) {
      return NextResponse.json(
        { error: "Missing stripeIntentId" },
        { status: 400 }
      );
    }

    // Query Firestore for this payment intent (nested structure)
    const paymentsRef = collection(db, "stripePayments");
    const q = query(
      paymentsRef,
      where("payment.stripeIntentId", "==", stripeIntentId)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return NextResponse.json({ verified: false, status: "not_found" });
    }

    const paymentData = snapshot.docs[0].data();
    const isVerified = paymentData.payment?.status === "succeeded";

    return NextResponse.json({
      verified: isVerified,
      status: paymentData.payment?.status,
      paidAt: paymentData.timestamps?.paidAt || null,
    });
  } catch (err: any) {
    console.error("Verify payment error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
