import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { useAuthStore } from "@/store/auth-store";
import { bookingVersionHistoryService } from "@/services/booking-version-history-service";
import { normalizeBookingFieldValue } from "@/lib/email-normalize";

const COLLECTION_NAME = "bookings";

/**
 * PATCH /api/bookings/[id]/field - Update a single field in a booking
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { fieldPath, value: rawValue } = await request.json();
    const value = normalizeBookingFieldValue(fieldPath, rawValue);

    if (!fieldPath) {
      return NextResponse.json(
        { success: false, error: "fieldPath is required" },
        { status: 400 }
      );
    }

    console.log(
      `🔍 [UPDATE FIELD API] Called for ${id}, field: ${fieldPath}, value:`,
      value
    );

    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      // Create the document if it doesn't exist
      const newBookingData = {
        id,
        [fieldPath]: value,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(docRef, newBookingData);
      console.log(`✅ Created and updated field ${fieldPath} in new booking ${id}`);

      // Create version snapshot for new booking creation
      createVersionSnapshotAsync(
        id,
        null,
        newBookingData,
        "create",
        `Created booking with field ${fieldPath}`
      );

      return NextResponse.json({ success: true });
    }

    // Get current booking data for version tracking
    const currentBookingData = { id, ...docSnap.data() };

    // Update existing document
    const updateData = {
      [fieldPath]: value,
      updatedAt: new Date(),
    };

    await updateDoc(docRef, updateData);
    console.log(`✅ Updated field ${fieldPath} in existing booking ${id}`);

    // Create version snapshot for field update
    createVersionSnapshotAsync(
      id,
      currentBookingData,
      updateData,
      "update",
      `Updated field ${fieldPath}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating booking field:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update booking field",
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
  updates: Record<string, any>,
  changeType: "create" | "update",
  customDescription?: string
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
      const bookingData = { id: bookingId, ...docSnap.data() };
      const description =
        customDescription || `Updated field ${Object.keys(updates).join(", ")}`;

      await bookingVersionHistoryService.createVersionSnapshot(
        bookingId,
        bookingData as any,
        {
          changeType,
          changeDescription: description,
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
