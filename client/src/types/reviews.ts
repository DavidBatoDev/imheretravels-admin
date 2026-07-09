/**
 * Tour review types for the admin app — mirror of `web/types/review.ts`.
 *
 * Source of truth is the top-level `tourReviews` Firestore collection (not the
 * legacy embedded `details.reviews[]` array on `tourPackages`). The admin
 * reviews dashboard reads/writes this collection: hide/unhide, add photos,
 * edit, and create admin-authored reviews.
 */

export type ReviewStatus = "published" | "hidden" | "pending";
export type ReviewSource = "user" | "admin" | "google" | "tourradar";

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
  { key: "guide", label: "Guide" },
  { key: "experience", label: "Experience" },
  { key: "value", label: "Value" },
  { key: "food", label: "Food" },
  { key: "accommodation", label: "Accommodation" },
] as const;

export type CategoryKey = (typeof REVIEW_CATEGORIES)[number]["key"];
export type CategoryRatings = Partial<Record<CategoryKey, number>>; // 1–5 per rated category

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
  externalUpdatedAt?: number; // epoch ms, Google updateTime — detects edits on re-sync
  externalReply?: string; // owner reply (reviewReply.comment), display-only
  reviewerFullName?: string; // Google displayName as-received (before first-name split)
  assigned?: boolean; // admin has triaged (assigned a tour OR marked hub-only)
  deletedOnGoogleAt?: number; // epoch ms — flagged when absent from a later sync

  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  displayDate?: string;
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
  displayDate?: string;
  /** Set when the optional booking-check step matched a confirmed booking. */
  bookingId?: string;
  bookingCode?: string;
  verified?: boolean;
}
