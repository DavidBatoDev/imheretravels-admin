/**
 * Tour review types for the admin app — mirror of `web/types/review.ts`.
 *
 * Source of truth is the top-level `tourReviews` Firestore collection (not the
 * legacy embedded `details.reviews[]` array on `tourPackages`). The admin
 * reviews dashboard reads/writes this collection: hide/unhide, add photos,
 * edit, and create admin-authored reviews.
 */

export type ReviewStatus = "published" | "hidden" | "pending";
export type ReviewSource = "user" | "admin";

/** Full Firestore document shape for `tourReviews/{id}`. */
export interface ReviewDoc {
  id: string;

  tourId: string;
  tourSlug: string;
  tourName: string;

  rating: number; // 1–5
  title?: string;
  bodyMarkdown: string;

  reviewerFirstName: string;
  reviewerLastName?: string;
  reviewerLocation?: string;
  reviewerAvatar?: string;
  photos?: string[];

  status: ReviewStatus;
  source: ReviewSource;
  verified: boolean;

  bookingId?: string; // PRIVATE — audit/dedup only
  bookingCode?: string; // PRIVATE — audit/dedup only

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
  title?: string;
  bodyMarkdown: string;
  reviewerFirstName: string;
  reviewerLastName?: string;
  reviewerLocation?: string;
  reviewerAvatar?: string;
  photos?: string[];
  displayDate?: string;
}
