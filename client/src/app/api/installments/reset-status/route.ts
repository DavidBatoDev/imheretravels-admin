import { NextRequest, NextResponse } from "next/server";
import {
  db,
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  updateDoc,
} from "@/lib/server-firestore";

export async function POST(req: NextRequest) {
  try {
    const { access_token, installment_id } = await req.json();

    if (!access_token || !installment_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`🔄 Resetting status for installment: ${installment_id}`);

    // Get booking by access_token
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("access_token", "==", access_token),
      limit(1)
    );
    const bookingsSnap = await getDocs(bookingsQuery);

    if (bookingsSnap.empty) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 403 }
      );
    }

    const bookingDoc = bookingsSnap.docs[0];
    const booking = bookingDoc.data();

    // Only reset if status is "processing" (not if it's "success")
    const currentStatus = booking.paymentTokens?.[installment_id]?.status;

    if (currentStatus === "processing") {
      await updateDoc(doc(db, "bookings", bookingDoc.id), {
        [`paymentTokens.${installment_id}.status`]: "pending",
      });

      console.log(`✅ Reset ${installment_id} status from processing to pending`);

      return NextResponse.json({
        success: true,
        message: "Status reset successfully",
      });
    } else {
      console.log(`⏭️ Skipping reset - status is ${currentStatus}`);
      return NextResponse.json({
        success: true,
        message: "No reset needed",
      });
    }
  } catch (error: any) {
    console.error("❌ Reset status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset status" },
      { status: 500 }
    );
  }
}
