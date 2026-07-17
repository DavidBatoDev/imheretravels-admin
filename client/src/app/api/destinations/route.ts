import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { verifyRequestUserId } from "@/lib/firebase-admin-auth";
import { revalidateWww } from "@/lib/revalidate-www";

const DESTINATIONS_COLLECTION = "destinations";

/**
 * POST /api/destinations - Create a new destination
 */
export async function POST(request: NextRequest) {
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

    const destinationData = await request.json();

    const now = Timestamp.now();

    const destination: any = {
      ...destinationData,
      // Default the relational classification field so it always exists.
      tourSlugs: Array.isArray(destinationData.tourSlugs)
        ? destinationData.tourSlugs
        : [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        createdBy: currentUserId,
      },
    };

    const docRef = await addDoc(
      collection(db, DESTINATIONS_COLLECTION),
      destination,
    );

    console.log(`✅ Created destination with ID: ${docRef.id}`);

    await revalidateWww();

    return NextResponse.json({ success: true, destinationId: docRef.id });
  } catch (error) {
    console.error("Error creating destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/destinations - Get all destinations with optional search/status filter
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const querySnapshot = await getDocs(
      collection(db, DESTINATIONS_COLLECTION),
    );
    const destinations: any[] = [];
    querySnapshot.forEach((doc) => {
      destinations.push({ id: doc.id, ...doc.data() });
    });

    let filtered = destinations;

    if (status) {
      filtered = filtered.filter((d) => d.status === status);
    }

    // Firestore has no full-text search; filter by name/region/slug client-side.
    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name?.toLowerCase().includes(term) ||
          d.region?.toLowerCase().includes(term) ||
          d.slug?.toLowerCase().includes(term),
      );
    }

    console.log(`✅ Found ${filtered.length} destinations`);

    return NextResponse.json({
      success: true,
      destinations: filtered,
      count: filtered.length,
    });
  } catch (error) {
    console.error("Error getting destinations:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch destinations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
