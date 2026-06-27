import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  DocumentSnapshot,
} from "firebase/firestore";
import { verifyRequestUserId } from "@/lib/firebase-admin-auth";
import { revalidateWww } from "@/lib/revalidate-www";
import { manilaLocalToDate } from "@/lib/manila-time";

const TOURS_COLLECTION = "tourPackages";

/**
 * Convert string dates to Firestore Timestamps for travelDates
 */
function convertTravelDatesToTimestamps(travelDates: any[]): any[] {
  return travelDates
    // Drop incomplete rows so a blank date can never crash Timestamp.fromDate.
    .filter((td) => td?.startDate && td?.endDate)
    .map((td) => {
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
 * POST /api/tours - Create a new tour
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

    const tourData = await request.json();

    console.log("Creating tour with user ID:", currentUserId);

    const now = Timestamp.now();

    // Convert travelDates from string dates to Timestamps
    const convertedTravelDates = convertTravelDatesToTimestamps(
      tourData.travelDates ?? [],
    );

    // Snapshot travel-date pricing for the initial history entry
    const initialHistoryTravelDates = convertedTravelDates.map((td: any) => {
      const entry: any = {
        date: td.startDate.toDate().toISOString(),
      };
      if (td.customOriginal !== undefined && td.customOriginal !== null) {
        entry.customOriginal = td.customOriginal;
      }
      if (td.customDiscounted !== undefined && td.customDiscounted !== null) {
        entry.customDiscounted = td.customDiscounted;
      }
      if (td.customDeposit !== undefined && td.customDeposit !== null) {
        entry.customDeposit = td.customDeposit;
      }
      return entry;
    });

    const initialHistoryEntry: any = {
      version: 1,
      effectiveDate: now,
      pricing: tourData.pricing,
      changedBy: currentUserId,
      reason: "Initial tour package creation",
    };
    if (initialHistoryTravelDates.length > 0) {
      initialHistoryEntry.travelDates = initialHistoryTravelDates;
    }

    // Normalize scheduled publish time: the form's wall-clock value is Asia/
    // Manila time. Store a Timestamp or drop it entirely (never persist an empty
    // string). The publishScheduledTours cron relies on this being a Timestamp.
    const parsedScheduledPublish = manilaLocalToDate(tourData.scheduledPublishAt);
    const scheduledPublishAt = parsedScheduledPublish
      ? Timestamp.fromDate(parsedScheduledPublish)
      : undefined;
    delete tourData.scheduledPublishAt;

    const tourPackage = {
      ...tourData,
      ...(scheduledPublishAt ? { scheduledPublishAt } : {}),
      travelDates: convertedTravelDates,
      media: {
        coverImage: tourData.media?.coverImage || "",
        gallery: tourData.media?.gallery || [],
      },
      currentVersion: 1,
      pricingHistory: [initialHistoryEntry],
      metadata: {
        createdAt: now,
        updatedAt: now,
        createdBy: currentUserId,
        bookingsCount: 0,
      },
    };

    const docRef = await addDoc(collection(db, TOURS_COLLECTION), tourPackage);

    console.log(`✅ Created tour with ID: ${docRef.id}`);

    await revalidateWww();

    return NextResponse.json({ success: true, tourId: docRef.id });
  } catch (error) {
    console.error("Error creating tour:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create tour",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/tours - Get all tours with optional filters, sorting, and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const status = searchParams.get("status");
    const priceMin = searchParams.get("priceMin");
    const priceMax = searchParams.get("priceMax");
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as
      | "asc"
      | "desc";
    const pageLimit = parseInt(searchParams.get("limit") || "10");
    const lastDocId = searchParams.get("lastDocId");

    console.log("GET /api/tours called with params:", {
      status,
      priceMin,
      priceMax,
      search,
      sortBy,
      sortOrder,
      pageLimit,
      lastDocId,
    });

    // Build query
    let q = query(collection(db, TOURS_COLLECTION));

    // Apply filters
    if (status) {
      q = query(q, where("status", "==", status));
    }

    if (priceMin) {
      q = query(q, where("pricing.original", ">=", parseFloat(priceMin)));
    }

    if (priceMax) {
      q = query(q, where("pricing.original", "<=", parseFloat(priceMax)));
    }

    // Apply sorting
    const sortField = sortBy === "createdAt" ? "metadata.createdAt" : sortBy;
    q = query(q, orderBy(sortField, sortOrder));

    // Apply pagination
    q = query(q, limit(pageLimit));

    // Get all documents for pagination handling (simplified for now)
    const querySnapshot = await getDocs(q);
    const tours: any[] = [];

    querySnapshot.forEach((doc) => {
      tours.push({ id: doc.id, ...doc.data() });
    });

    // Apply text search client-side (Firestore doesn't support full-text search)
    let filteredTours = tours;
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredTours = tours.filter(
        (tour) =>
          tour.name?.toLowerCase().includes(searchTerm) ||
          tour.description?.toLowerCase().includes(searchTerm) ||
          tour.destinations?.some((d: string) =>
            d.toLowerCase().includes(searchTerm),
          ),
      );
    }

    console.log(`✅ Found ${filteredTours.length} tours`);

    return NextResponse.json({
      success: true,
      tours: filteredTours,
      count: filteredTours.length,
    });
  } catch (error) {
    console.error("Error getting tours:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch tours",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
