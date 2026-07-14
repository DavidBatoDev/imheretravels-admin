import { Timestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { TourPackage, TourFilters } from "@/types/tours";
import {
  deleteMultipleFiles,
  extractFilePathFromUrl,
  STORAGE_BUCKET,
} from "@/utils/file-upload";

const API_BASE = "/api/tours";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to manage tours");
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

// ============================================================================
// FORM DATA TYPES (what the form actually sends)
// ============================================================================

interface TourFormDataWithStringDates {
  name: string;
  slug: string;
  url?: string;
  tourCode: string;
  description: string;
  duration: string;
  cardHeaderTitle: string;
  cardSubHeader: string;
  travelDates: {
    startDate: string;
    endDate: string;
    isAvailable: boolean;
  }[];
  pricing: {
    original: number;
    discounted?: number | null;
    deposit: number;
    currency: "USD" | "EUR" | "GBP";
  };
  details: {
    highlights: string[];
    itinerary: {
      day: number;
      title: string;
      description: string;
    }[];
    requirements: string[];
  };
  media?: {
    coverImage?: string;
    gallery?: string[];
  };
  status: "active" | "draft" | "archived";
  isHosted?: boolean;
  brochureLink?: string;
  stripePaymentLink?: string;
  preDeparturePack?: string;
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function createTour(
  tourData: TourFormDataWithStringDates,
): Promise<string> {
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(tourData),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to create tour");
    }

    console.log(`✅ Created tour with ID: ${data.tourId}`);
    return data.tourId;
  } catch (error) {
    console.error("Error creating tour:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to create tour",
    );
  }
}

/**
 * Duplicate an existing tour package as a fresh DRAFT.
 *
 * Reads the source tour, then POSTs a clean copy through `createTour` — which
 * reseeds server-managed state (metadata/bookingsCount, pricingHistory,
 * currentVersion). The copy gets a unique name/slug/tourCode so it never
 * collides with the original (slug uniqueness also dodges every tour's
 * `previousSlugs`, which drive www redirects). Unique/stateful fields
 * (stripePaymentLink, bookingSlug, url, scheduledPublishAt, previousSlugs, seo,
 * comingSoon) are intentionally NOT carried over.
 *
 * @returns the new tour's id.
 */
export async function duplicateTour(id: string): Promise<string> {
  const source = await getTourById(id);
  if (!source) {
    throw new Error("Tour to duplicate was not found");
  }

  const all = await getAllTours();
  const names = new Set(all.map((t) => t.name));
  const slugs = new Set(
    all.flatMap((t) => [
      t.slug,
      ...((t.previousSlugs ?? []).map((p) => p.slug) ?? []),
    ]),
  );
  const codes = new Set(all.map((t) => t.tourCode));

  // "{name} (Copy)", then "(Copy 2)", "(Copy 3)"… until unused.
  let name = `${source.name} (Copy)`;
  for (let n = 2; names.has(name); n++) {
    name = `${source.name} (Copy ${n})`;
  }

  // Derive the slug from the chosen name, then suffix -2, -3… until unused
  // (also avoiding any tour's previousSlugs).
  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  for (let n = 2; slugs.has(slug); n++) {
    slug = `${baseSlug}-${n}`;
  }

  // "{code}-COPY", then "-COPY-2"… until unused.
  let tourCode = `${source.tourCode}-COPY`;
  for (let n = 2; codes.has(tourCode); n++) {
    tourCode = `${source.tourCode}-COPY-${n}`;
  }

  // Build a clean payload. `travelDates` come back from getTourById as ISO
  // strings (POST-ready) with any per-date custom pricing preserved.
  const payload: TourFormDataWithStringDates = {
    name,
    slug,
    tourCode,
    description: source.description,
    duration: source.duration,
    cardHeaderTitle: source.cardHeaderTitle,
    cardSubHeader: source.cardSubHeader,
    travelDates: source.travelDates as any,
    pricing: source.pricing,
    details: source.details as any,
    media: source.media,
    status: "draft",
  };

  // Carry over optional presentation fields only when present (no collision risk).
  if (source.destinations) (payload as any).destinations = source.destinations;
  if (source.isHosted !== undefined) payload.isHosted = source.isHosted;
  if (source.brochureLink) payload.brochureLink = source.brochureLink;
  if (source.preDeparturePack) payload.preDeparturePack = source.preDeparturePack;
  if (source.depositNote) (payload as any).depositNote = source.depositNote;
  if (source.footnote) (payload as any).footnote = source.footnote;

  return createTour(payload);
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

export async function getTours(
  filters?: TourFilters,
  sortBy: string = "createdAt",
  sortOrder: "asc" | "desc" = "desc",
  pageLimit: number = 10,
): Promise<{ tours: TourPackage[]; lastDoc: any | null }> {
  try {
    const params = new URLSearchParams();

    // Add filters to query params
    if (filters?.status) params.append("status", filters.status);
    if (filters?.priceRange?.min)
      params.append("priceMin", filters.priceRange.min.toString());
    if (filters?.priceRange?.max)
      params.append("priceMax", filters.priceRange.max.toString());
    if (filters?.search) params.append("search", filters.search);

    // Add sorting and pagination
    params.append("sortBy", sortBy);
    params.append("sortOrder", sortOrder);
    params.append("limit", pageLimit.toString());

    const response = await fetch(`${API_BASE}?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch tours");
    }

    return { tours: data.tours, lastDoc: null };
  } catch (error) {
    console.error("Error getting tours:", error);
    throw new Error("Failed to fetch tours");
  }
}

export async function getTourById(id: string): Promise<TourPackage | null> {
  try {
    const response = await fetch(`${API_BASE}/${id}`);

    if (response.status === 404) {
      return null;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch tour");
    }

    return data.tour;
  } catch (error) {
    console.error("Error getting tour:", error);
    throw new Error("Failed to fetch tour");
  }
}

export async function getAllTours(): Promise<TourPackage[]> {
  try {
    const response = await fetch(`${API_BASE}?limit=1000`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch all tours");
    }

    return data.tours;
  } catch (error) {
    console.error("Error getting all tours:", error);
    throw new Error("Failed to fetch all tours");
  }
}

export async function getAllTourPackages(): Promise<void> {
  try {
    console.log("🏖️ Fetching all tour packages...");

    const tours = await getAllTours();

    console.log(`📊 Found ${tours.length} tour packages`);
    console.log("=".repeat(60));

    // Convert Firestore Timestamps to readable dates for JSON output
    const toursWithReadableDates = tours.map((tour) => ({
      ...tour,
      travelDates: tour.travelDates.map((td: any) => ({
        ...td,
        startDate:
          td.startDate?.toDate?.() || new Date(td.startDate.seconds * 1000),
        endDate: td.endDate?.toDate?.() || new Date(td.endDate.seconds * 1000),
      })),
      metadata: {
        ...tour.metadata,
        createdAt:
          tour.metadata.createdAt?.toDate?.() ||
          new Date(tour.metadata.createdAt.seconds * 1000),
        updatedAt:
          tour.metadata.updatedAt?.toDate?.() ||
          new Date(tour.metadata.updatedAt.seconds * 1000),
      },
      pricingHistory:
        tour.pricingHistory?.map((ph: any) => ({
          ...ph,
          effectiveDate:
            ph.effectiveDate?.toDate?.() ||
            new Date(ph.effectiveDate.seconds * 1000),
        })) || [],
    }));

    // Log the complete JSON structure
    console.log("📋 ALL TOUR PACKAGES (JSON FORMAT):");
    console.log(JSON.stringify(toursWithReadableDates, null, 2));

    console.log("=".repeat(60));
    console.log("✅ Tour packages logged successfully!");

    // Also log a summary
    console.log("\n📈 TOUR PACKAGES SUMMARY:");
    tours.forEach((tour, index) => {
      console.log(`${index + 1}. ${tour.name} (${tour.tourCode})`);
      console.log(`   Destinations: ${tour.destinations?.join(", ") ?? "—"}`);
      console.log(`   Duration: ${tour.duration} days`);
      console.log(`   Status: ${tour.status}`);
      console.log(
        `   Price: ${tour.pricing.currency} ${tour.pricing.original}`,
      );
      console.log(`   Travel Dates: ${tour.travelDates.length} available`);
      console.log("");
    });
  } catch (error) {
    console.error("❌ Error getting all tour packages:", error);
    throw new Error("Failed to fetch all tour packages");
  }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function updateTour(
  id: string,
  updates: Partial<TourFormDataWithStringDates>,
): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to update tour");
    }

    console.log(`✅ Updated tour ${id}`);
  } catch (error) {
    console.error("Error updating tour:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to update tour",
    );
  }
}

export async function updateTourMedia(
  id: string,
  mediaData: { coverImage?: string; gallery?: string[] },
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/${id}/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mediaData),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to update tour media");
    }

    console.log(`✅ Updated tour ${id} media`);
  } catch (error) {
    console.error("Error updating tour media:", error);
    throw new Error("Failed to update tour media");
  }
}

// Clean up removed gallery images from storage
export async function cleanupRemovedGalleryImages(
  originalGallery: string[],
  newGallery: string[],
): Promise<void> {
  try {
    // Find images that were removed (exist in original but not in new)
    const removedImages = originalGallery.filter(
      (url) => !newGallery.includes(url),
    );

    if (removedImages.length === 0) {
      console.log("No gallery images to clean up");
      return;
    }

    console.log("Cleaning up removed gallery images:", removedImages);

    // Extract file paths from URLs
    const filePaths = removedImages
      .map((url) => extractFilePathFromUrl(url))
      .filter((path) => path !== null) as string[];

    if (filePaths.length === 0) {
      console.log("No valid file paths found for cleanup");
      return;
    }

    // Delete files from Supabase storage
    const deleteResult = await deleteMultipleFiles(filePaths, STORAGE_BUCKET);

    if (deleteResult.success) {
      console.log("Successfully cleaned up removed gallery images");
    } else {
      console.error(
        "Failed to clean up some gallery images:",
        deleteResult.error,
      );
    }
  } catch (error) {
    console.error("Error during gallery cleanup:", error);
    // Don't throw here as this is a cleanup operation and shouldn't break the main flow
  }
}

export async function updateTourStatus(
  id: string,
  status: "active" | "draft" | "archived",
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to update tour status");
    }

    console.log(`✅ Updated tour ${id} status to ${status}`);
  } catch (error) {
    console.error("Error updating tour status:", error);
    throw new Error("Failed to update tour status");
  }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function deleteTour(id: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to delete tour");
    }

    console.log(`✅ Deleted tour ${id}`);
  } catch (error) {
    console.error("Error deleting tour:", error);
    throw new Error("Failed to delete tour");
  }
}

// Soft delete - mark as archived instead of deleting
export async function archiveTour(id: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/${id}/archive`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to archive tour");
    }

    console.log(`✅ Archived tour ${id}`);
  } catch (error) {
    console.error("Error archiving tour:", error);
    throw new Error("Failed to archive tour");
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export async function batchUpdateTours(
  updates: { id: string; data: Partial<TourFormDataWithStringDates> }[],
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/batch/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to batch update tours");
    }

    console.log(`✅ Batch updated ${data.count} tours`);
  } catch (error) {
    console.error("Error batch updating tours:", error);
    throw new Error("Failed to batch update tours");
  }
}

export async function batchDeleteTours(ids: string[]): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/batch/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to batch delete tours");
    }

    console.log(`✅ Batch deleted ${data.count} tours`);
  } catch (error) {
    console.error("Error batch deleting tours:", error);
    throw new Error("Failed to batch delete tours");
  }
}

// ============================================================================
// SEARCH AND FILTER HELPERS (Client-side)
// ============================================================================

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateTourData(data: TourFormDataWithStringDates): string[] {
  const errors: string[] = [];

  if (!data.name || data.name.trim().length < 3) {
    errors.push("Tour name must be at least 3 characters long");
  }

  if (!data.tourCode || data.tourCode.trim().length < 2) {
    errors.push("Tour code is required and must be at least 2 characters long");
  }

  if (!data.description || data.description.trim().length < 10) {
    errors.push("Description must be at least 10 characters long");
  }

  if (!data.duration || data.duration.trim().length === 0) {
    errors.push("Duration must be at least 1 day");
  } else {
    // Extract number from "X days" format
    const durationMatch = data.duration.match(/(\d+)/);
    if (durationMatch) {
      const durationNumber = parseInt(durationMatch[1]);
      if (durationNumber < 1) {
        errors.push("Duration must be at least 1 day");
      }
    } else {
      errors.push("Duration must be in format 'X days'");
    }
  }

  if (!data.travelDates || data.travelDates.length === 0) {
    errors.push("At least one travel date is required");
  } else {
    // Validate each travel date
    data.travelDates.forEach((td, index) => {
      if (!td.startDate) {
        errors.push(`Travel date ${index + 1}: Start date is required`);
      }
      if (!td.endDate) {
        errors.push(`Travel date ${index + 1}: End date is required`);
      }
      if (td.startDate && td.endDate) {
        const startDate = new Date(td.startDate);
        const endDate = new Date(td.endDate);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          errors.push(`Travel date ${index + 1}: Invalid date format`);
        } else if (startDate >= endDate) {
          errors.push(
            `Travel date ${index + 1}: End date must be after start date`,
          );
        }
      }
    });
  }

  if (!data.pricing.original || data.pricing.original <= 0) {
    errors.push("Original price must be greater than 0");
  }

  if (
    data.pricing.discounted &&
    data.pricing.discounted >= data.pricing.original
  ) {
    errors.push("Discounted price must be less than original price");
  }

  if (!data.pricing.deposit || data.pricing.deposit <= 0) {
    errors.push("Deposit amount is required and must be greater than 0");
  }

  if (data.details.highlights.length === 0) {
    errors.push("At least one highlight is required");
  }

  if (data.details.itinerary.length === 0) {
    errors.push("At least one itinerary item is required");
  }

  // Validate URL fields if they exist
  if (data.url && !isValidUrl(data.url)) {
    errors.push("Direct URL must be a valid URL");
  }

  if (data.brochureLink && !isValidUrl(data.brochureLink)) {
    errors.push("Brochure link must be a valid URL");
  }

  if (data.stripePaymentLink && !isValidUrl(data.stripePaymentLink)) {
    errors.push("Stripe payment link must be a valid URL");
  }

  if (data.preDeparturePack && !isValidUrl(data.preDeparturePack)) {
    errors.push("Pre-departure pack link must be a valid URL");
  }

  return errors;
}

// Helper function to validate URLs
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================================
// TEST FUNCTION - For debugging database connection
// ============================================================================
export async function testFirestoreConnection(): Promise<void> {
  console.log("Testing via API route - fetching all tours");
  try {
    const tours = await getAllTours();
    console.log(`Total tours: ${tours.length}`);
    tours.forEach((tour) => {
      console.log("Tour ID:", tour.id);
      console.log("Tour data:", tour);
    });
  } catch (error) {
    console.error("API test failed:", error);
  }
}
