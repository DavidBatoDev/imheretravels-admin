import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { verifyRequestUserId } from "@/lib/firebase-admin-auth";
import { revalidateWww } from "@/lib/revalidate-www";

const TOURS_COLLECTION = "tourPackages";

/** Convert a Firestore Timestamp (any serialization) to an ISO date string. */
function timestampToIso(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v; // already an ISO string
  if (typeof v.toDate === "function") return v.toDate().toISOString().split("T")[0];
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000).toISOString().split("T")[0];
  if (typeof v._seconds === "number") return new Date(v._seconds * 1000).toISOString().split("T")[0];
  return "";
}

/**
 * Convert string dates to Firestore Timestamps for travelDates
 */
function convertTravelDatesToTimestamps(travelDates: any[]): any[] {
  return travelDates
    // Drop incomplete rows so a blank date can never crash Timestamp.fromDate.
    .filter((td) => td?.startDate && td?.endDate)
    .map((td) => {
    // Spread the incoming date first so any extra fields carried through (e.g.
    // legacy currentBookings/maxCapacity) are preserved, then override the
    // date strings with real Firestore Timestamps.
    const converted: any = {
      ...td,
      startDate: Timestamp.fromDate(new Date(td.startDate)),
      endDate: Timestamp.fromDate(new Date(td.endDate)),
      isAvailable: td.isAvailable,
    };

    // Include optional fields if they exist
    if (td.tourDays !== undefined && td.tourDays !== null) {
      converted.tourDays = td.tourDays;
    }
    if (td.hasCustomPricing !== undefined) {
      converted.hasCustomPricing = td.hasCustomPricing;
    }
    if (td.customOriginal !== undefined && td.customOriginal !== null) {
      converted.customOriginal = td.customOriginal;
    }
    if (td.customDiscounted !== undefined && td.customDiscounted !== null) {
      converted.customDiscounted = td.customDiscounted;
    }
    if (td.customDeposit !== undefined && td.customDeposit !== null) {
      converted.customDeposit = td.customDeposit;
    }
    if (td.hasCustomOriginal !== undefined) {
      converted.hasCustomOriginal = td.hasCustomOriginal;
    }
    if (td.hasCustomDiscounted !== undefined) {
      converted.hasCustomDiscounted = td.hasCustomDiscounted;
    }
    if (td.hasCustomDeposit !== undefined) {
      converted.hasCustomDeposit = td.hasCustomDeposit;
    }

    return converted;
  });
}

/**
 * GET /api/tours/[id] - Get a single tour
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const docRef = doc(db, TOURS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Tour not found" },
        { status: 404 },
      );
    }

    const data = docSnap.data()!;
    // Convert Firestore Timestamps in travelDates to ISO date strings so the
    // client always receives plain strings regardless of SDK serialization format.
    if (Array.isArray(data.travelDates)) {
      data.travelDates = data.travelDates.map((td: any) => ({
        ...td,
        startDate: timestampToIso(td.startDate),
        endDate: timestampToIso(td.endDate),
      }));
    }
    const tour = { id: docSnap.id, ...data };
    return NextResponse.json({ success: true, tour });
  } catch (error) {
    console.error("Error fetching tour:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch tour",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/tours/[id] - Update a tour
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

    console.log(`Updating tour ${id} with user ID:`, currentUserId);

    const docRef = doc(db, TOURS_COLLECTION, id);
    const now = Timestamp.now();

    // Get current tour data to check for changes
    const currentDoc = await getDoc(docRef);
    if (!currentDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Tour not found" },
        { status: 404 },
      );
    }

    const currentData = currentDoc.data();

    const updateData: any = {
      ...updates,
      "metadata.updatedAt": now,
    };

    // Protect server-managed pricing fields from being overwritten
    delete updateData.pricingHistory;
    delete updateData.currentVersion;

    // Merge `details` instead of replacing it. Firestore's updateDoc replaces a
    // nested object wholesale, so sending a `details` object that's missing any
    // stored sub-field (e.g. a field not present in the form's schema) would
    // silently delete it. Shallow-merging the incoming details over the stored
    // details guarantees unknown/unsent sub-fields are always preserved.
    if (updates.details) {
      updateData.details = {
        ...(currentData.details ?? {}),
        ...updates.details,
      };
    }

    // Convert travelDates if they're being updated
    if (updates.travelDates) {
      updateData.travelDates = convertTravelDatesToTimestamps(
        updates.travelDates,
      );
    }

    // Reconcile previousSlugs (old slugs that redirect to the current slug on www).
    // Honour any manual edits/toggles the form sent, then auto-record the prior
    // slug whenever the slug changes on this save.
    type PrevSlug = { slug: string; redirect: boolean };
    const manualPrev: PrevSlug[] = Array.isArray(updates.previousSlugs)
      ? updates.previousSlugs
      : Array.isArray(currentData.previousSlugs)
        ? currentData.previousSlugs
        : [];
    const newSlug = updates.slug ?? currentData.slug;
    const bySlug = new Map<string, PrevSlug>();
    for (const e of manualPrev) {
      if (e && typeof e.slug === "string" && e.slug && e.slug !== newSlug) {
        bySlug.set(e.slug, { slug: e.slug, redirect: e.redirect !== false });
      }
    }
    // Auto-record the prior slug on rename. Redirect on by default; never clobber
    // an existing entry the admin may have already toggled off.
    if (
      updates.slug &&
      currentData.slug &&
      updates.slug !== currentData.slug &&
      !bySlug.has(currentData.slug)
    ) {
      bySlug.set(currentData.slug, { slug: currentData.slug, redirect: true });
    }
    updateData.previousSlugs = Array.from(bySlug.values());

    // Scheduled publish: persist as a Timestamp (or clear it). The
    // publishScheduledTours cron flips status→"active" once this time passes.
    if ("scheduledPublishAt" in updates) {
      const raw = updates.scheduledPublishAt;
      if (raw) {
        const parsed = new Date(raw);
        updateData.scheduledPublishAt = isNaN(parsed.getTime())
          ? null
          : Timestamp.fromDate(parsed);
      } else {
        updateData.scheduledPublishAt = null;
      }
    }

    // Handle media updates properly
    if (updates.media) {
      updateData.media = {
        coverImage:
          updates.media.coverImage || currentData.media?.coverImage || "",
        gallery: updates.media.gallery || currentData.media?.gallery || [],
      };
    }

    await updateDoc(docRef, updateData);

    console.log(`✅ Updated tour ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating tour:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update tour",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/tours/[id] - Delete a tour
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const docRef = doc(db, TOURS_COLLECTION, id);

    // Check if tour exists
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Tour not found" },
        { status: 404 },
      );
    }

    await deleteDoc(docRef);

    console.log(`✅ Deleted tour ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tour:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete tour",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
