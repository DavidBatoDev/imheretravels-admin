/**
 * Shared (server-safe) constants + types for the reviews hub filter/sort.
 * Kept out of the "use client" component so the server page can import the
 * SORT_OPTIONS value (client-module value exports become proxies on the server).
 */

export type TourOption = { slug: string; name: string; count: number };

export const SORT_OPTIONS = [
  { value: "relevant", label: "Most relevant" },
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
  { value: "media", label: "With photos & video" },
  { value: "longest", label: "Most detailed" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: SortValue = "relevant";

/**
 * Where a review came from. Deliberately coarser than the internal `ReviewSource`
 * enum: publicly a review is either ours or federated, which is exactly what the
 * cards badge ("via Google" / "via TourRadar"; first-party cards show no badge).
 * The `user` vs `admin` split is an authoring detail and stays out of the UI —
 * the "Verified" badge already conveys what a shopper cares about.
 */
export const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "direct", label: "imheretravels.com" },
  { value: "google", label: "Google" },
  { value: "tourradar", label: "TourRadar" },
] as const;

export type SourceValue = (typeof SOURCE_OPTIONS)[number]["value"];

export const DEFAULT_SOURCE: SourceValue = "all";

/** Minimal shape needed to filter by source. */
export interface ReviewSourceField {
  source?: string;
}

export function matchesSource(r: ReviewSourceField, value: SourceValue): boolean {
  switch (value) {
    case "google":
      return r.source === "google";
    case "tourradar":
      return r.source === "tourradar";
    case "direct":
      // Anything not federated: user submissions + admin-authored.
      return r.source !== "google" && r.source !== "tourradar";
    default:
      return true;
  }
}

/**
 * Minimal fields needed to sort a review. `PublicReview` satisfies this
 * structurally, and so does any lighter object that carries these fields — so
 * both the hub (server) and the per-tour section (client) share one sorter.
 */
export interface ReviewSortFields {
  createdAt: number;
  verified?: boolean;
  photos?: unknown[];
  videos?: unknown[];
  bodyMarkdown?: string;
}

export const reviewHasMedia = (r: ReviewSortFields): boolean =>
  (r.photos?.length ?? 0) + (r.videos?.length ?? 0) > 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const LENGTH_CAP = 600; // chars beyond this add no further "detail" credit
const HALF_LIFE_DAYS = 180; // recency weight halves roughly every ~6 months

/**
 * "Most relevant" score — surfaces the reviews a shopper actually wants first:
 * trusted (verified booker), illustrated (photos/video), substantive, and still
 * reasonably fresh. Weights are deliberately simple and tunable.
 */
function relevanceScore(r: ReviewSortFields, nowMs: number): number {
  const trust = r.verified ? 3 : 0;
  const media = reviewHasMedia(r) ? 2 : 0;
  const detail = (2 * Math.min(r.bodyMarkdown?.length ?? 0, LENGTH_CAP)) / LENGTH_CAP;
  const ageDays = r.createdAt ? Math.max(0, (nowMs - r.createdAt) / DAY_MS) : Infinity;
  const recency = 3 * Math.exp(-ageDays / HALF_LIFE_DAYS);
  return trust + media + detail + recency;
}

/** Sort a review list per the selected sort option (input is newest-first). */
export function sortReviews<T extends ReviewSortFields>(
  list: T[],
  sort: SortValue,
): T[] {
  const copy = [...list];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.createdAt - b.createdAt);
    case "media":
      return copy.sort(
        (a, b) =>
          Number(reviewHasMedia(b)) - Number(reviewHasMedia(a)) ||
          b.createdAt - a.createdAt,
      );
    case "longest":
      return copy.sort(
        (a, b) => (b.bodyMarkdown?.length ?? 0) - (a.bodyMarkdown?.length ?? 0),
      );
    case "recent":
      return copy.sort((a, b) => b.createdAt - a.createdAt);
    default: {
      // "relevant" (the default) — ties fall back to newest-first.
      const now = Date.now();
      return copy.sort(
        (a, b) => relevanceScore(b, now) - relevanceScore(a, now) || b.createdAt - a.createdAt,
      );
    }
  }
}

// ─── Free-text search ────────────────────────────────────────────────────────

/** Fields a review contributes to the search haystack. */
export interface ReviewSearchFields {
  title?: string;
  bodyMarkdown?: string;
  reviewerFirstName?: string;
  reviewerLocation?: string;
}

/**
 * Lowercased haystack for free-text review search. Shared so the hub (server,
 * `?q=`) and the per-tour section (client, in-place) match on identical text.
 */
export function reviewSearchText(r: ReviewSearchFields): string {
  return `${r.title ?? ""} ${r.bodyMarkdown ?? ""} ${r.reviewerFirstName ?? ""} ${
    r.reviewerLocation ?? ""
  }`.toLowerCase();
}
