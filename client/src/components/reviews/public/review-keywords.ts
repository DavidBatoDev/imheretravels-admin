/**
 * Interest keywords for the per-tour reviews section.
 *
 * We mine each tour's published reviews into a small set of ranked "theme" chips
 * (e.g. "Great guides", "Stunning scenery") so a potential customer can filter
 * to the reviews that speak to what they care about — WITHOUT leaving the tour
 * page. Themes are matched with a curated dictionary at render time from the
 * already-loaded reviews, so there's no schema change and it works on existing
 * data (including federated TourRadar/Google cards, which are shown in-section).
 *
 * Server-safe (no "use client", no browser APIs) so both the server component
 * and the client filter can import the constants and helpers.
 */

import type { PublicReview } from "@/types/reviews";

export interface ReviewTheme {
  key: string;
  label: string; // chip text
  /** Case-insensitive matcher; a review counts once if its text matches. */
  pattern: RegExp;
}

/** A ranked keyword chip for one tour. */
export interface KeywordChip {
  key: string;
  label: string;
  count: number; // how many of the tour's reviews mention this theme
}

export const MAX_KEYWORD_CHIPS = 8;

/**
 * Curated, tour-relevant interest themes. Patterns use word boundaries and stem
 * wildcards to keep matches on-topic (e.g. `\bview` won't fire inside "review").
 * Order here is the tie-break order; display order is by count (see below).
 */
export const REVIEW_THEMES: ReviewTheme[] = [
  { key: "guides", label: "Great guides", pattern: /\b(guides?|tour leaders?|leaders?|staff|hosts?|team|crew|knowledgeable|helpful|attentive|accommodating|responsive)\b/i },
  { key: "scenery", label: "Stunning scenery", pattern: /\b(scenery|scenic|views?|beautiful|stunning|landscapes?|breathtaking|gorgeous|picturesque|paradise|sunsets?|sunrises?|beaches?)\b/i },
  { key: "organized", label: "Well organized", pattern: /\b(organi[sz]\w*|seamless|smooth|well[- ]planned|coordination|itinerar\w*|planned|hassle[- ]free|logistics|transfers?|punctual)\b/i },
  { key: "value", label: "Value for money", pattern: /\b(value|worth|affordable|budget|reasonable|pricing|price|money)\b/i },
  { key: "adventure", label: "Adventure & activities", pattern: /\b(adventur\w*|activit\w*|hik\w*|snorkel\w*|div(?:e|ing)|island hopping|kayak\w*|packed|excursions?|explor\w*)\b/i },
  { key: "group", label: "Fun group", pattern: /\b(group|friends|friendly|social|bonding|welcoming|like[- ]minded)\b/i },
  { key: "stays", label: "Comfortable stays", pattern: /\b(accommodations?|hotels?|rooms?|resorts?|comfortable|cozy|clean|stayed?)\b/i },
  { key: "food", label: "Great food", pattern: /\b(food|meals?|cuisine|delicious|dishes|eat)\b/i },
  { key: "safe", label: "Safe & relaxing", pattern: /\b(safe|safety|secure|peace\w*|relax\w*)\b/i },
  { key: "solo", label: "Solo-friendly", pattern: /\b(solo|first[- ]time|on my own)\b/i },
  { key: "culture", label: "Local culture", pattern: /\b(cultur\w*|locals?|temples?|history|historical|authentic|tradition\w*|immersive)\b/i },
  { key: "unforgettable", label: "Unforgettable", pattern: /\b(unforgettable|memorable|once in a lifetime|life[- ]changing|highlight|never forget)\b/i },
];

/** Combined title + body text of a review, lowercased for matching. */
function reviewText(review: PublicReview): string {
  return `${review.title ?? ""} ${review.bodyMarkdown ?? ""}`.toLowerCase();
}

/** Theme keys a single review mentions. */
export function matchThemes(review: PublicReview): string[] {
  const text = reviewText(review);
  return REVIEW_THEMES.filter((t) => t.pattern.test(text)).map((t) => t.key);
}

/**
 * Ranked keyword chips across a tour's reviews (highest-mentioned first), only
 * themes that actually appear, capped to `MAX_KEYWORD_CHIPS`.
 */
export function buildKeywordChips(reviews: PublicReview[]): KeywordChip[] {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    for (const key of matchThemes(review)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return REVIEW_THEMES.filter((t) => counts.has(t.key))
    .map((t) => ({ key: t.key, label: t.label, count: counts.get(t.key)! }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_KEYWORD_CHIPS);
}
