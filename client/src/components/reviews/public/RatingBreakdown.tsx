import Stars from "./Stars";
import type { PublicReview } from "@/types/reviews";

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

/**
 * Airbnb/Booking-style rating summary: a big average + star row alongside a
 * 5★→1★ distribution of bars. Computed over whatever reviews are passed in
 * (the per-tour section passes every shown review — first-party + federated —
 * matching the cards below it).
 */
export default function RatingBreakdown({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) return null;

  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  for (const r of reviews) {
    const star = Math.max(1, Math.min(5, Math.round(r.rating || 0)));
    counts[star] += 1;
    sum += r.rating || 0;
  }
  const total = reviews.length;
  const average = Math.round((sum / total) * 10) / 10;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex items-center gap-3">
        <span className="font-display text-h2-mobile md:text-h2-desktop text-midnight">
          {average.toFixed(1)}
        </span>
        <div>
          <Stars count={average} />
          <p className="mt-1 font-body text-b4-desktop text-grey">
            {total} review{total === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <ul className="w-full space-y-1.5 sm:flex-1">
        {STAR_ROWS.map((star) => {
          const pct = total ? Math.round((counts[star] / total) * 100) : 0;
          return (
            <li key={star} className="flex items-center gap-2.5">
              <span className="w-3 text-right font-body text-b4-desktop text-grey">{star}</span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-light-grey"
                role="img"
                aria-label={`${star} stars: ${counts[star]} of ${total}`}
              >
                <div
                  className="h-full rounded-full bg-crimson-red"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-7 text-right font-body text-b4-desktop text-grey">
                {counts[star]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
