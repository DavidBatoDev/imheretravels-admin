/**
 * Tour review types for the admin app — mirror of `web/types/review.ts`.
 *
 * Source of truth is the top-level `tourReviews` Firestore collection. Reviews were
 * historically an embedded `details.reviews[]` array on `tourPackages`; that path was
 * removed. The admin reviews dashboard reads/writes this collection: hide/unhide, add
 * photos, edit, and create admin-authored reviews.
 */

export type ReviewStatus = "published" | "hidden" | "pending";
export type ReviewSource = "user" | "admin" | "google" | "tourradar";

/** External (federated) sources — shown as cards but excluded from the average + JSON-LD. */
export const EXTERNAL_REVIEW_SOURCES = ["google", "tourradar"] as const;

/** True for federated reviews (Google/TourRadar) — cards only, never count toward ratings. */
export function isExternalSource(source?: ReviewSource): boolean {
  return source === "google" || source === "tourradar";
}

/** A traveler-uploaded review video (played inline; `poster` is a still frame). */
export interface ReviewVideo {
  src: string; // mp4 URL
  poster?: string; // still-frame image URL shown before playback
}

/** Airbnb-style per-category ratings (mirror of web/types/review.ts). */
export const REVIEW_CATEGORIES = [
  { key: "guide", label: "Tour Guide" },
  { key: "experience", label: "Experience" },
  { key: "value", label: "Value" },
  { key: "food", label: "Food" },
  { key: "accommodation", label: "Accommodation" },
] as const;

export type CategoryKey = (typeof REVIEW_CATEGORIES)[number]["key"];
export type CategoryRatings = Partial<Record<CategoryKey, number>>; // 1–5 per rated category

/** Per-category average across a set of reviews (only categories with data). */
export interface CategoryAggregate {
  key: CategoryKey;
  label: string;
  average: number; // rounded to one decimal
  count: number;
}

/** Aggregate rating over a set of reviews. */
export interface ReviewAggregate {
  average: number; // rounded to one decimal, e.g. 4.9
  count: number;
}

/** Full Firestore document shape for `tourReviews/{id}`. */
export interface ReviewDoc {
  id: string;

  tourId: string;
  tourSlug: string;
  tourName: string;

  rating: number; // 1–5
  categoryRatings?: CategoryRatings; // optional per-category stars (first-party only)
  title?: string;
  bodyMarkdown: string;

  reviewerFirstName: string;
  reviewerLastName?: string;
  reviewerLocation?: string;
  reviewerCountryEmoji?: string; // nationality flag (e.g. TourRadar countryEmoji)
  reviewerAvatar?: string;
  photos?: string[];
  videos?: ReviewVideo[];

  status: ReviewStatus;
  source: ReviewSource;
  verified: boolean;

  bookingId?: string; // PRIVATE — audit/dedup only
  bookingCode?: string; // PRIVATE — audit/dedup only

  // External-source provenance (present when source === "google"). Federated
  // reviews arrive with no tour: tourId/tourSlug/tourName stay "" until an admin
  // assigns a tour (or marks the review hub-only).
  externalId?: string; // dedup key = external review id / content hash
  externalSource?: "google" | "tourradar"; // provider discriminator
  externalTourId?: string; // provider's tour id (TourRadar `/t/{id}`) — drives the outbound link
  externalUpdatedAt?: number; // epoch ms, Google updateTime — detects edits on re-sync
  externalReply?: string; // owner reply (reviewReply.comment), display-only
  reviewerFullName?: string; // Google displayName as-received (before first-name split)
  assigned?: boolean; // admin has triaged (assigned a tour OR marked hub-only)
  deletedOnGoogleAt?: number; // epoch ms — flagged when absent from a later sync
  /**
   * Epoch ms — set when a review disappeared from a later TourRadar scrape. A soft
   * delete: the doc, its re-hosted media and its moderation state are all preserved,
   * because an unattended scrape failure must never destroy real reviews.
   */
  deletedOnTourRadarAt?: number;

  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  displayDate?: string;
}

/**
 * Client-safe projection of a review (no booking identifiers) — the exact shape
 * the public site's review components render. Admin builds these from `ReviewDoc`
 * via `toPublicReview` so the ported www card components work unchanged.
 */
export interface PublicReview {
  id: string;
  tourSlug: string;
  tourName: string;
  rating: number;
  categoryRatings?: CategoryRatings;
  title?: string;
  bodyMarkdown: string;
  reviewerFirstName: string;
  reviewerLocation?: string;
  reviewerCountryEmoji?: string;
  reviewerAvatar?: string;
  photos?: string[];
  videos?: ReviewVideo[];
  verified: boolean;
  createdAt: number;
  displayDate?: string;
  source?: ReviewSource;
  externalTourId?: string; // provider tour id, for the "via TourRadar" outbound link
  externalReply?: string;
}

/** Project a full review doc down to what the public card renders. */
export function toPublicReview(doc: ReviewDoc): PublicReview {
  return {
    id: doc.id,
    tourSlug: doc.tourSlug,
    tourName: doc.tourName,
    rating: doc.rating,
    categoryRatings: doc.categoryRatings,
    title: doc.title,
    bodyMarkdown: doc.bodyMarkdown,
    reviewerFirstName: doc.reviewerFirstName,
    reviewerLocation: doc.reviewerLocation,
    reviewerCountryEmoji: doc.reviewerCountryEmoji,
    reviewerAvatar: doc.reviewerAvatar,
    photos: doc.photos,
    videos: doc.videos,
    verified: doc.verified,
    createdAt: doc.createdAt,
    displayDate: doc.displayDate,
    source: doc.source,
    externalTourId: doc.externalTourId,
    externalReply: doc.externalReply,
  };
}

/**
 * Average + count over a set of reviews (no source filtering).
 * Pure port of `computeReviewAggregate` in www/lib/reviews-firestore.ts.
 */
export function computeReviewAggregate(reviews: PublicReview[]): ReviewAggregate {
  if (reviews.length === 0) return { average: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  return {
    average: Math.round((sum / reviews.length) * 10) / 10,
    count: reviews.length,
  };
}

/**
 * Per-category averages across a set of reviews. Only reviews that actually carry
 * a score for a category count toward it; categories with no data are dropped.
 * Pure port of `computeCategoryAggregates` in www/lib/reviews-firestore.ts.
 */
export function computeCategoryAggregates(reviews: PublicReview[]): CategoryAggregate[] {
  return REVIEW_CATEGORIES.map(({ key, label }) => {
    let sum = 0;
    let count = 0;
    for (const r of reviews) {
      const v = r.categoryRatings?.[key];
      if (typeof v === "number") {
        sum += v;
        count += 1;
      }
    }
    return {
      key,
      label,
      average: count ? Math.round((sum / count) * 10) / 10 : 0,
      count,
    };
  }).filter((c) => c.count > 0);
}

/** Payload for creating an admin-authored review from the dashboard. */
export interface NewAdminReview {
  tourId: string;
  tourSlug: string;
  tourName: string;
  rating: number;
  categoryRatings?: CategoryRatings;
  title?: string;
  bodyMarkdown: string;
  reviewerFirstName: string;
  reviewerLastName?: string;
  reviewerLocation?: string;
  reviewerAvatar?: string;
  photos?: string[];
  videos?: ReviewVideo[];
  displayDate?: string;
  /** Set when the optional booking-check step matched a confirmed booking. */
  bookingId?: string;
  bookingCode?: string;
  verified?: boolean;
}
