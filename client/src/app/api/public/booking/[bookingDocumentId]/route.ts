import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "@/lib/server-firestore";
import {
  buildPublicBookingView,
  hasRequiredPublicBookingFields,
  timestampsToWire,
  type PublicPreDeparturePack,
} from "@/lib/public-booking-view";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/booking/{access_token}[?email=]
 *
 * The booking-status page's only data source (it used to read Firestore from
 * the browser). Holding the booking's `access_token` is the authorisation;
 * `?email=` must match when given. Returns an allowlisted projection, with
 * Timestamps tagged for `timestampsFromWire`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingDocumentId: string }> },
) {
  try {
    const email = new URL(request.url).searchParams.get("email");
    const { bookingDocumentId: accessToken } = await params;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "Access token is required" },
        { status: 400 },
      );
    }

    const bookingsSnap = await getDocs(
      query(collection(db, "bookings"), where("access_token", "==", accessToken), limit(1)),
    );
    if (bookingsSnap.empty) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    const bookingDoc = bookingsSnap.docs[0];
    const bookingData = bookingDoc.data() as Record<string, any>;

    if (!hasRequiredPublicBookingFields(bookingData)) {
      return NextResponse.json(
        {
          success: false,
          error: "This is an invalid booking. Contact bella@imheretravels.com if this is a mistake.",
        },
        { status: 422 },
      );
    }

    if (email && bookingData.emailAddress?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: "Email does not match booking records" },
        { status: 403 },
      );
    }

    const view = buildPublicBookingView(
      bookingDoc.id,
      bookingData,
      await findPreDeparturePack(bookingDoc.id),
      { includePaymentTokens: process.env.NEXT_PUBLIC_ENV === "development" },
    );

    return NextResponse.json(
      { success: true, data: timestampsToWire(view) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching booking:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch booking details" },
      { status: 500 },
    );
  }
}

async function findPreDeparturePack(bookingDocId: string): Promise<PublicPreDeparturePack | null> {
  try {
    const confirmed = await getDocs(
      query(collection(db, "confirmedBookings"), where("bookingDocumentId", "==", bookingDocId)),
    );
    const packId = confirmed.empty ? null : confirmed.docs[0].data()?.preDeparturePackId;
    if (!packId) return null;

    const packSnap = await getDoc(doc(db, "fileObjects", packId));
    if (!packSnap.exists()) return null;

    const pack = packSnap.data()!;
    return {
      id: packSnap.id,
      fileName: pack.fileName,
      originalName: pack.originalName,
      fileDownloadURL: pack.fileDownloadURL,
      contentType: pack.contentType,
      size: pack.size,
      uploadedAt: pack.uploadedAt,
    };
  } catch (error) {
    console.error("Error fetching pre-departure pack:", error);
    return null;
  }
}
