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
}: {
  categories: CategoryAggregate[];
}) {
  if (categories.length === 0) return null;

  return (
    <div className="mt-6 grid max-w-2xl gap-y-3">
      {categories.map((c) => {
        const Icon = CATEGORY_ICON[c.key] ?? Star;
        return (
          // One clean string for screen readers ("Tour Guide: 4.8 out of 5"); the
          // icon, stars and number are decorative duplicates of that label.
          <div
            key={c.key}
            role="group"
            aria-label={`${c.label}: ${c.average.toFixed(1)} out of 5`}
            className="flex items-center justify-between gap-3"
          >
            <span
              aria-hidden
              className="flex items-center gap-2 font-body text-b3-desktop text-midnight"
            >
              <Icon className="size-4 shrink-0 text-crimson-red" strokeWidth={2} />
              {c.label}
            </span>
            <span aria-hidden className="flex items-center gap-2">
              <Stars count={c.average} />
              <span className="w-7 text-right font-body text-b4-desktop font-medium text-midnight">
                {c.average.toFixed(1)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
