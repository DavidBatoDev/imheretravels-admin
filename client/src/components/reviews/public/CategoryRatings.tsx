import { Compass, Sparkles, Wallet, Utensils, Hotel, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Stars from "./Stars";
import type { CategoryAggregate, CategoryKey } from "@/types/reviews";

/** Icon per category (falls back to a star for any future/unknown category). */
const CATEGORY_ICON: Record<CategoryKey, LucideIcon> = {
  guide: Compass,
  experience: Sparkles,
  value: Wallet,
  food: Utensils,
  accommodation: Hotel,
};

/**
 * Airbnb-style per-category rating panel (Guide / Experience / Value / …). Shows
 * only categories that have data — federated (TourRadar/Google) reviews never
 * carry category scores, so `computeCategoryAggregates` returns an empty list
 * for tours without first-party category ratings and this renders nothing.
 */
export default function CategoryRatings({
  categories,
  columns = 1,
  layout = "stack",
}: {
  categories: CategoryAggregate[];
  /** 1 (default, stacked) or 2 (side-by-side grid, e.g. the hub summary card). */
  columns?: 1 | 2;
  /** "stack" = vertical list/grid (default); "row" = horizontal wrapping row. */
  layout?: "stack" | "row";
}) {
  if (categories.length === 0) return null;

  // Horizontal one-line-per-category row (used full-width under the hub summary).
  if (layout === "row") {
    return (
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {categories.map((c) => {
          const Icon = CATEGORY_ICON[c.key] ?? Star;
          return (
            <div
              key={c.key}
              role="group"
              aria-label={`${c.label}: ${c.average.toFixed(1)} out of 5`}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="flex items-center gap-1.5 whitespace-nowrap font-body text-b4-desktop text-midnight"
              >
                <Icon className="size-3.5 shrink-0 text-crimson-red" strokeWidth={2} />
                {c.label}
              </span>
              <span aria-hidden className="flex items-center gap-1.5">
                <Stars count={c.average} size="sm" />
                <span className="font-body text-b4-desktop font-medium text-midnight">
                  {c.average.toFixed(1)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // The 2-up hub panel is deliberately tighter than the design-system default:
  // smallest body token (b4, not b3), smaller stars/icons, less row spacing, and
  // single-line labels — so each category reads as a compact one-liner.
  const compact = columns === 2;

  return (
    <div
      className={
        compact
          ? "grid gap-x-6 gap-y-2.5 sm:grid-cols-2"
          : "mt-6 grid max-w-2xl gap-y-3"
      }
    >
      {categories.map((c) => {
        const Icon = CATEGORY_ICON[c.key] ?? Star;
        return (
          // One clean string for screen readers ("Tour Guide: 4.8 out of 5"); the
          // icon, stars and number are decorative duplicates of that label.
          <div
            key={c.key}
            role="group"
            aria-label={`${c.label}: ${c.average.toFixed(1)} out of 5`}
            className={`flex items-center justify-between ${compact ? "gap-2" : "gap-3"}`}
          >
            <span
              aria-hidden
              className={`flex items-center whitespace-nowrap font-body text-midnight ${
                compact ? "gap-1.5 text-b4-desktop" : "gap-2 text-b3-desktop"
              }`}
            >
              <Icon
                className={`shrink-0 text-crimson-red ${compact ? "size-3.5" : "size-4"}`}
                strokeWidth={2}
              />
              {c.label}
            </span>
            <span aria-hidden className={`flex items-center ${compact ? "gap-1.5" : "gap-2"}`}>
              <Stars count={c.average} size={compact ? "sm" : "md"} />
              <span
                className={`text-right font-body text-b4-desktop font-medium text-midnight ${
                  compact ? "w-6" : "w-7"
                }`}
              >
                {c.average.toFixed(1)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
