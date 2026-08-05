/**
 * Pure mapping + merge logic for Google Business Profile reviews → `tourReviews`
 * docs. Kept dependency-free (no firebase-admin, no network) so it can be
 * unit-tested with plain assertions via ts-node — see google-reviews-map.test.ts.
 *
 * The scheduled function (scheduled-sync-google-reviews.ts) owns the OAuth/fetch/
 * Firestore side and delegates all field mapping and the moderation-preserving
 * upsert decision to the pure functions here.
 */

export type ReviewStatus = "published" | "hidden" | "pending";

/** A single review object as returned by mybusiness v4 accounts.locations.reviews.list. */
export interface GoogleReview {
  name?: string; // accounts/{a}/locations/{l}/reviews/{reviewId}
  reviewId?: string;
  reviewer?: {
    displayName?: string;
    profilePhotoUrl?: string;
    isAnonymous?: boolean;
  };
  starRating?: string; // "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED"
  comment?: string;
  createTime?: string; // RFC3339
  updateTime?: string; // RFC3339
  reviewReply?: { comment?: string; updateTime?: string };
  reviewMediaItems?: Array<{
    thumbnailUrl?: string;
    thumbnailLabel?: string;
    videoUrl?: string;
  }>;
}

export interface MappedGoogleReviewVideo {
  src: string;
  poster?: string;
}

/** Normalized, storage-ready view of a Google review (epoch ms, numeric rating). */
export interface MappedGoogleReview {
  externalId: string; // stable dedup key (reviewId)
  docId: string; // `google_${externalId}`
  rating: number; // 1–5
  bodyMarkdown: string;
  reviewerFirstName: string;
  reviewerLastName?: string;
  reviewerFullName: string;
  reviewerAvatar?: string;
  externalReply?: string;
  photos: string[];
  videos: MappedGoogleReviewVideo[];
  createdAt: number; // epoch ms
  externalUpdatedAt: number; // epoch ms
  displayDate: string; // "Month YYYY"
}

const STAR_WORDS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

/** Map Google's enum star rating to a 1–5 number. Returns 0 when unspecified. */
export function starRatingToNumber(starRating?: string): number {
  return STAR_WORDS[String(starRating ?? "").toUpperCase()] ?? 0;
}

/** Split a display name into first token + remainder; tolerant of blanks. */
export function splitDisplayName(displayName?: string): {
  first: string;
  last?: string;
  full: string;
} {
  const full = (displayName ?? "").trim().replace(/\s+/g, " ");
  if (!full) return { first: "Google user", full: "" };
  const [first, ...rest] = full.split(" ");
  return { first, last: rest.length ? rest.join(" ") : undefined, full };
}

/** Extract the trailing reviewId from a review `name` path, or use `reviewId`. */
export function reviewIdOf(review: GoogleReview): string {
  if (review.reviewId) return review.reviewId;
  const name = review.name ?? "";
  const parts = name.split("/");
  return parts[parts.length - 1] || "";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Month YYYY" from epoch ms, UTC (matches the admin display-date convention). */
export function toDisplayDate(epochMs: number): string {
  if (!epochMs) return "";
  const d = new Date(epochMs);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Normalize a raw Google review. Returns null when it can't be stored (no id, or
 * an unspecified star rating we shouldn't fabricate a number for).
 */
export function mapGoogleReview(review: GoogleReview): MappedGoogleReview | null {
  const externalId = reviewIdOf(review);
  if (!externalId) return null;

  const rating = starRatingToNumber(review.starRating);
  if (rating < 1) return null; // STAR_RATING_UNSPECIFIED → skip

  const name = splitDisplayName(review.reviewer?.displayName);
  const createdAt = review.createTime ? Date.parse(review.createTime) || 0 : 0;
  const externalUpdatedAt = review.updateTime
    ? Date.parse(review.updateTime) || createdAt
    : createdAt;
  const photos: string[] = [];
  const videos: MappedGoogleReviewVideo[] = [];
  for (const item of review.reviewMediaItems ?? []) {
    const thumbnailUrl = item.thumbnailUrl?.trim();
    const videoUrl = item.videoUrl?.trim();
    if (videoUrl) {
      videos.push({
        src: videoUrl,
        ...(thumbnailUrl ? { poster: thumbnailUrl } : {}),
      });
    } else if (thumbnailUrl) {
      photos.push(thumbnailUrl);
    }
  }

  return {
    externalId,
    docId: `google_${externalId}`,
    rating,
    bodyMarkdown: (review.comment ?? "").trim(),
    reviewerFirstName: name.first,
    reviewerLastName: name.last,
    reviewerFullName: name.full,
    reviewerAvatar: review.reviewer?.profilePhotoUrl || undefined,
    externalReply: review.reviewReply?.comment?.trim() || undefined,
    photos: [...new Set(photos)],
    videos: videos.filter(
      (video, index) => videos.findIndex((candidate) => candidate.src === video.src) === index,
    ),
    createdAt,
    externalUpdatedAt,
    displayDate: toDisplayDate(createdAt),
  };
}

/**
 * Build the Firestore field map for a BRAND-NEW google review doc. Epoch fields
 * are left as numbers here; the caller converts them to Firestore Timestamps.
 */
export function buildNewReviewFields(
  m: MappedGoogleReview,
  defaultStatus: ReviewStatus,
  nowMs: number,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    // No tour association until an admin assigns one.
    tourId: "",
    tourSlug: "",
    tourName: "",
    rating: m.rating,
    bodyMarkdown: m.bodyMarkdown,
    reviewerFirstName: m.reviewerFirstName,
    reviewerFullName: m.reviewerFullName,
    status: defaultStatus,
    source: "google",
    externalSource: "google",
    externalId: m.externalId,
    verified: false,
    assigned: false,
    externalUpdatedAt: m.externalUpdatedAt,
    createdAt: m.createdAt || nowMs,
    updatedAt: nowMs,
    displayDate: m.displayDate,
  };
  if (m.reviewerLastName) fields.reviewerLastName = m.reviewerLastName;
  if (m.reviewerAvatar) fields.reviewerAvatar = m.reviewerAvatar;
  if (m.externalReply) fields.externalReply = m.externalReply;
  if (m.photos.length) fields.photos = m.photos;
  if (m.videos.length) fields.videos = m.videos;
  return fields;
}

/**
 * Coerce a stored epoch value to milliseconds. Tolerates a plain number, a
 * Firestore Timestamp (duck-typed `toMillis()` — kept dependency-free so this
 * module needs no firebase-admin), a `{ _seconds }` serialized Timestamp, or a
 * Date. Returns 0 when it can't be interpreted.
 */
export function toEpochMs(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  const secs = (value as { _seconds?: unknown })?._seconds;
  if (typeof secs === "number") return secs * 1000;
  return 0;
}

/**
 * Decide what (if anything) to write when the review already exists. Returns the
 * content-only field map to merge, or null when nothing changed. Never returns
 * moderation/assignment fields (`status`, `assigned`, `tour*`) so admin actions
 * survive re-syncs. Content refreshes when Google's updateTime advances; media
 * also backfills older synced documents that predate reviewMediaItems support.
 */
export function buildUpdateFields(
  m: MappedGoogleReview,
  existing: Record<string, unknown>,
  nowMs: number,
): Record<string, unknown> | null {
  const prev = toEpochMs(existing.externalUpdatedAt);
  const contentAdvanced = !m.externalUpdatedAt || !prev || m.externalUpdatedAt > prev;
  const needsPhotoBackfill =
    m.photos.length > 0 && (!Array.isArray(existing.photos) || existing.photos.length === 0);
  const needsVideoBackfill =
    m.videos.length > 0 && (!Array.isArray(existing.videos) || existing.videos.length === 0);
  if (!contentAdvanced && !needsPhotoBackfill && !needsVideoBackfill) return null;

  const fields: Record<string, unknown> = { updatedAt: nowMs };
  if (contentAdvanced) {
    fields.rating = m.rating;
    fields.bodyMarkdown = m.bodyMarkdown;
    fields.externalUpdatedAt = m.externalUpdatedAt;
    fields.reviewerAvatar = m.reviewerAvatar ?? null;
    fields.externalReply = m.externalReply ?? null;
    fields.photos = m.photos.length ? m.photos : null;
    fields.videos = m.videos.length ? m.videos : null;
  } else {
    if (needsPhotoBackfill) fields.photos = m.photos;
    if (needsVideoBackfill) fields.videos = m.videos;
  }
  return fields;
}
