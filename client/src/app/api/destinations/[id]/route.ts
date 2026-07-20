import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { verifyRequestUserId } from "@/lib/firebase-admin-auth";
import { revalidateWww } from "@/lib/revalidate-www";
import { manilaLocalToDate } from "@/lib/manila-time";

const DESTINATIONS_COLLECTION = "destinations";

/**
 * GET /api/destinations/[id] - Get a single destination
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const docRef = doc(db, DESTINATIONS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Destination not found" },
        { status: 404 },
      );
    }

    const destination = { id: docSnap.id, ...docSnap.data() };
    return NextResponse.json({ success: true, destination });
  } catch (error) {
    console.error("Error fetching destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/destinations/[id] - Update a destination (partial)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUserId = await verifyRequestUserId(
      request.headers.get("authorization"),
    );

    if (!currentUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const updates = await request.json();

    const docRef = doc(db, DESTINATIONS_COLLECTION, id);
    const now = Timestamp.now();

    const currentDoc = await getDoc(docRef);
    if (!currentDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Destination not found" },
        { status: 404 },
      );
    }

    const updateData: any = {
      ...updates,
      "metadata.updatedAt": now,
    };

    // Never let the client overwrite server-managed metadata wholesale.
    delete updateData.metadata;

    // Scheduled publish: the form's wall-clock value is interpreted as Asia/
    // Manila time, then persisted as a Timestamp (or cleared). The
    // publishScheduledDestinations cron flips status→"active" once it passes.
    if ("scheduledPublishAt" in updates) {
      const parsed = manilaLocalToDate(updates.scheduledPublishAt);
      updateData.scheduledPublishAt = parsed ? Timestamp.fromDate(parsed) : null;
    }

    await updateDoc(docRef, updateData);

    console.log(`✅ Updated destination ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/destinations/[id] - Delete a destination
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUserId = await verifyRequestUserId(
      request.headers.get("authorization"),
    );

    if (!currentUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const docRef = doc(db, DESTINATIONS_COLLECTION, id);

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Destination not found" },
        { status: 404 },
      );
    }

    await deleteDoc(docRef);

    console.log(`✅ Deleted destination ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
