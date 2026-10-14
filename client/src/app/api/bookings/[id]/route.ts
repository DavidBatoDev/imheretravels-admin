import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { useAuthStore } from "@/store/auth-store";
import { bookingVersionHistoryService } from "@/services/booking-version-history-service";
import { normalizeBookingEmailFields } from "@/lib/email-normalize";

const COLLECTION_NAME = "bookings";

/**
 * GET /api/bookings/[id] - Get a single booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 }
      );
    }

    const booking = { id: docSnap.id, ...docSnap.data() };
    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error("Error fetching booking:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bookings/[id] - Update a booking
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = normalizeBookingEmailFields(await request.json());

    console.log(`🔍 [UPDATE BOOKING API] Called for ${id}, updates:`, Object.keys(updates));

    // Get current booking data for version tracking
    const docRef = doc(db, COLLECTION_NAME, id);
    const currentBookingSnap = await getDoc(docRef);

    if (!currentBookingSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 }
      );
    }

    const currentBookingData = { id, ...currentBookingSnap.data() };

    // Perform the update
    const updatedData = {
      ...updates,
      updatedAt: new Date(),
    };

    await updateDoc(docRef, updatedData);
    console.log(`✅ Updated booking ${id}`);

    // Create version snapshot asynchronously
    createVersionSnapshotAsync(id, currentBookingData, updates, "update");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating booking:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings/[id] - Delete a booking
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get current booking data for version tracking BEFORE deletion
    const docRef = doc(db, COLLECTION_NAME, id);
    const currentBookingSnap = await getDoc(docRef);

    if (!currentBookingSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 }
      );
    }

    const currentBooking = { id, ...currentBookingSnap.data() };

    // Create version snapshot BEFORE deletion
    try {
      const { user, userProfile } = useAuthStore.getState();
      const currentUserId = user?.uid || "system";
      const currentUserName =
        userProfile?.profile?.firstName && userProfile?.profile?.lastName
          ? `${userProfile.profile.firstName} ${userProfile.profile.lastName}`
          : userProfile?.email || user?.email || "System";

      await bookingVersionHistoryService.createVersionSnapshot(
        id,
        currentBooking as any,
        {
          changeType: "delete",
          changeDescription: "Booking deleted",
          userId: currentUserId,
          userName: currentUserName,
        }
      );
      console.log(`📝 Created delete version snapshot for ${id}`);
    } catch (versionError) {
      console.error(
        `⚠️ Failed to create version snapshot, proceeding with deletion:`,
        versionError
      );
    }

    // Clean up associated scheduled payment reminder emails
    await cleanupScheduledEmails(id);

    // Perform the actual deletion
    await deleteDoc(docRef);
    console.log(`✅ Deleted booking ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting booking:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Clean up scheduled payment reminder emails
 */
async function cleanupScheduledEmails(bookingId: string): Promise<void> {
  try {
    console.log(`🧹 Cleaning up scheduled emails for booking ${bookingId}...`);

    const scheduledEmailsRef = collection(db, "scheduledEmails");
    const q = query(
      scheduledEmailsRef,
      where("bookingId", "==", bookingId),
      where("emailType", "==", "payment-reminder")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`No scheduled emails found for booking ${bookingId}`);
      return;
    }

    console.log(
      `Found ${snapshot.docs.length} scheduled emails to delete for booking ${bookingId}`
    );

    // Delete all scheduled emails in a batch
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(
      `✅ Successfully deleted ${snapshot.docs.length} scheduled emails for booking ${bookingId}`
    );
  } catch (error) {
    console.error(
      `⚠️ Error cleaning up scheduled emails for booking ${bookingId}:`,
      error
    );
    // Don't throw - we don't want to fail the booking deletion if cleanup fails
  }
}

/**
 * Helper: Create version snapshot asynchronously
 */
async function createVersionSnapshotAsync(
  bookingId: string,
  currentBooking: Record<string, any>,
  updates: Record<string, any>,
  changeType: "create" | "update" | "delete"
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
      const description = `Updated ${Object.keys(updates).join(", ")}`;

      const versionId =
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

      if (versionId === "__SKIPPED__") {
        console.log(
          `⏭️  [ASYNC] Version snapshot skipped for ${bookingId}: no actual changes`
        );
        return;
      }

      console.log(`✅ [ASYNC] Version snapshot created for ${bookingId}`);
    }
  } catch (error) {
    console.error(
      `❌ [ASYNC] Failed to create version snapshot for ${bookingId}:`,
      error
    );
  }
}
