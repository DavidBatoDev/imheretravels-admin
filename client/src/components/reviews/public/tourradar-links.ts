/**
 * Public TourRadar tour-review page for a TourRadar-sourced review.
 *
 * TourRadar's scraped review data (scripts/tourradar-export/fetch-tourradar-reviews.mjs
 * in admin/client) carries no per-reviewer profile URL or stable per-review anchor —
 * only a review id and the operator's tour id. So every TourRadar-sourced review card
 * for a tour links out to that tour's shared reviews section on TourRadar, not an
 * individual reviewer page.
 *
 * The tour id is stored on the review itself (`externalTourId`) at import time, so the
 * link resolves even for a review that has not been assigned to a site tour.
 */

const tourRadarReviewsUrl = (tourRadarTourId: string) =>
  `https://www.tourradar.com/t/${tourRadarTourId}#reviews`;

/**
 * Fallback for reviews imported before `externalTourId` was stored. Remove once a full
 * import has backfilled every `source: "tourradar"` doc (the upsert is a content-merge,
 * so one run is enough).
 */
const LEGACY_URL_BY_SLUG: Record<string, string> = {
  "india-discovery-tour": tourRadarReviewsUrl("321149"),
  "vietnam-expedition": tourRadarReviewsUrl("324172"),
  "philippine-sunrise": tourRadarReviewsUrl("298995"),
  "philippine-sunset": tourRadarReviewsUrl("298994"),
  "sri-lanka-wander-tour": tourRadarReviewsUrl("323687"),
};

export function getTourRadarReviewsUrl(
  tourSlug: string,
  externalTourId?: string,
): string | undefined {
  if (externalTourId) return tourRadarReviewsUrl(externalTourId);
  return LEGACY_URL_BY_SLUG[tourSlug];
}
