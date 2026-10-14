import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  writeBatch,
  doc,
} from "firebase/firestore";
import crypto from "crypto";
import { useAuthStore } from "@/store/auth-store";
import { bookingVersionHistoryService } from "@/services/booking-version-history-service";
import { normalizeBookingEmailFields } from "@/lib/email-normalize";

const COLLECTION_NAME = "bookings";

/**
 * Generate a secure, unguessable access token using crypto.randomBytes
 * Uses 32 bytes of cryptographically secure random data encoded as URL-safe base64
 * This provides 256 bits of entropy, making it practically impossible to guess
 *
 * @returns {string} A secure access token (43 characters, URL-safe)
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
 * GET /api/bookings - Get all bookings
 */
export async function GET() {
  try {
    const querySnapshot = await getDocs(
      query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"))
    );

    const bookings = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch bookings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bookings - Create a new booking
 */
export async function POST(request: NextRequest) {
  try {
    const bookingData = normalizeBookingEmailFields(await request.json());

    // Generate access token for new booking
    const access_token = generateAccessToken();

    const priceSnapshotMetadata = {
      lockPricing: bookingData.lockPricing ?? false,
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...bookingData,
      access_token,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...priceSnapshotMetadata,
    });

    console.log(`✅ Created booking with ID: ${docRef.id}`);

    // Create version snapshot if this is not an empty placeholder booking
    const isEmptyPlaceholder = Object.keys(bookingData).length === 0;
    const needsIdField = !bookingData.hasOwnProperty("id");

    if (!isEmptyPlaceholder && !needsIdField) {
      // Create version snapshot asynchronously (fire-and-forget)
      createVersionSnapshotAsync(docRef.id, bookingData);
    }

    return NextResponse.json({
      success: true,
      bookingId: docRef.id,
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings - Delete all bookings (admin operation)
 */
export async function DELETE() {
  try {
    const bookingsCollection = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(bookingsCollection);

    const BATCH_SIZE = 400;
    const docs = snapshot.docs;
    const totalCount = docs.length;

    // Create bulk delete version snapshot before deletion
    if (totalCount > 0) {
      const affectedBookingIds = docs.map((doc) => doc.id);

      // Get current user info
      const { user, userProfile } = useAuthStore.getState();
      const currentUserId = user?.uid || "system";
      const currentUserName =
        userProfile?.profile?.firstName && userProfile?.profile?.lastName
          ? `${userProfile.profile.firstName} ${userProfile.profile.lastName}`
          : userProfile?.email || user?.email || "System";

      // Create bulk delete snapshot asynchronously
      createBulkDeleteSnapshotAsync({
        operationType: "delete",
        operationDescription: `Bulk delete of all ${totalCount} bookings`,
        affectedBookingIds,
        userId: currentUserId,
        userName: currentUserName,
        totalCount,
      });
    }

    // Perform the actual deletion
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const slice = docs.slice(i, i + BATCH_SIZE);
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    console.log(`✅ Deleted all ${totalCount} bookings in batches`);

    return NextResponse.json({
      success: true,
      count: totalCount,
    });
  } catch (error) {
    console.error("Error deleting all bookings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete all bookings",
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
  bookingData: Record<string, any>
): Promise<void> {
  try {
    const { user, userProfile } = useAuthStore.getState();
    const currentUserId = user?.uid || "system";
    const currentUserName =
      userProfile?.profile?.firstName && userProfile?.profile?.lastName
        ? `${userProfile.profile.firstName} ${userProfile.profile.lastName}`
        : userProfile?.email || user?.email || "System";

    await bookingVersionHistoryService.createVersionSnapshot(
      bookingId,
      bookingData as any,
      {
        changeType: "create",
        changeDescription: "Initial booking creation",
        userId: currentUserId,
        userName: currentUserName,
      }
    );

    console.log(`✅ [ASYNC] Version snapshot created for ${bookingId}`);
  } catch (error) {
    console.error(
      `❌ [ASYNC] Failed to create version snapshot for ${bookingId}:`,
      error
    );
  }
}

/**
 * Helper: Create bulk delete snapshot asynchronously
 */
async function createBulkDeleteSnapshotAsync(options: {
  operationType: "delete" | "import" | "update";
  operationDescription: string;
  affectedBookingIds: string[];
  userId: string;
  userName?: string;
  totalCount: number;
  successCount?: number;
  failureCount?: number;
}): Promise<void> {
  try {
    await bookingVersionHistoryService.createBulkOperationSnapshot({
      operationType: options.operationType,
      operationDescription: options.operationDescription,
      affectedBookingIds: options.affectedBookingIds,
      userId: options.userId,
      userName: options.userName,
      totalCount: options.totalCount,
      successCount: options.successCount || options.totalCount,
      failureCount: options.failureCount || 0,
    });

    console.log(
      `✅ [BULK ASYNC] Bulk operation snapshot created for ${options.operationType}`
    );
  } catch (error) {
    console.error(
      `❌ [BULK ASYNC] Failed to create bulk operation snapshot:`,
      error
    );
  }
}
