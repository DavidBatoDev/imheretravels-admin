import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import crypto from "crypto";
import { useAuthStore } from "@/store/auth-store";
import { bookingVersionHistoryService } from "@/services/booking-version-history-service";
import { normalizeBookingEmailFields } from "@/lib/email-normalize";

const COLLECTION_NAME = "bookings";

/**
 * Generate a secure, unguessable access token
 */
function generateAccessToken(): string {
  return crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * POST /api/bookings/[id]/create-or-update - Create or update a complete booking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bookingData = normalizeBookingEmailFields(await request.json());

    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      // Create new document
      const access_token = generateAccessToken();

      const priceSnapshotMetadata = {
        lockPricing: bookingData.lockPricing ?? false,
      };

      const newBookingData = {
        ...bookingData,
        id,
        access_token,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...priceSnapshotMetadata,
      };

      await setDoc(docRef, newBookingData);
      console.log(`✅ Created new booking ${id}`);

      // Create version snapshot
      createVersionSnapshotAsync(
        id,
        null,
        newBookingData,
        "create",
        "Created complete booking"
      );

      return NextResponse.json({ success: true });
    }

    // Get current booking data for version tracking
    const currentBookingData = { id, ...docSnap.data() };

    // Update existing document
    const updateData = {
      ...bookingData,
      updatedAt: new Date(),
    };

    await updateDoc(docRef, updateData);
    console.log(`✅ Updated existing booking ${id}`);

    // Create version snapshot
    createVersionSnapshotAsync(
      id,
      currentBookingData,
      updateData,
      "update",
      "Updated complete booking"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error creating/updating booking:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create/update booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Create version snapshot asynchronously
 */
async function createVersionSnapshotAsync(
  bookingId: string,
  currentBooking: Record<string, any> | null,
  bookingData: Record<string, any>,
  changeType: "create" | "update",
  customDescription: string
): Promise<void> {
  try {
    const { user, userProfile } = useAuthStore.getState();
    const currentUserId = user?.uid || "system";
    const currentUserName =
      userProfile?.profile?.firstName && userProfile?.profile?.lastName
        ? `${userProfile.profile.firstName} ${userProfile.profile.lastName}`
        : userProfile?.email || user?.email || "System";

    // For update operations, get the current state from database
    const docRef = doc(db, COLLECTION_NAME, bookingId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const finalBookingData = { id: bookingId, ...docSnap.data() };

      await bookingVersionHistoryService.createVersionSnapshot(
        bookingId,
        finalBookingData as any,
        {
          changeType,
          changeDescription: customDescription,
          userId: currentUserId,
          userName: currentUserName,
        }
      );

      console.log(`✅ [ASYNC] Version snapshot created for ${bookingId}`);
    }
  } catch (error) {
    console.error(
      `❌ [ASYNC] Failed to create version snapshot for ${bookingId}:`,
      error
    );
  }
}
