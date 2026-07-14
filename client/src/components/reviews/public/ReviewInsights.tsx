import { BadgeCheck } from "lucide-react";
import { buildKeywordChips } from "./review-keywords";
import type { PublicReview } from "@/types/reviews";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const monthYear = (ms: number) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(ms));

/** Reviews created within the last year. Kept out of render so the component
 *  body stays pure (no direct `Date.now()` call during render). */
function countRecent(reviews: PublicReview[]): number {
  const cutoff = Date.now() - YEAR_MS;
  return reviews.filter((r) => r.createdAt && r.createdAt >= cutoff).length;
}

/**
 * Compact trust + freshness signals shown under the rating breakdown:
 * verified-traveler framing, how recent the reviews are, and a short
 * "what travelers love" highlight from the top keyword themes. Everything is
 * derived from the already-loaded reviews (no extra reads); each piece renders
 * only when it has something meaningful to say, to keep the section tidy.
 */
export default function ReviewInsights({
  reviews,
  showFacts = true,
  showHighlights = true,
}: {
  reviews: PublicReview[];
  /** The verified / latest / last-year facts line. */
  showFacts?: boolean;
  /** The "Travelers love: …" keyword chips. */
  showHighlights?: boolean;
}) {
  if (reviews.length === 0) return null;

  const loved = showHighlights ? buildKeywordChips(reviews).slice(0, 3) : [];

  const facts: React.ReactNode[] = [];
  if (showFacts) {
    const verified = reviews.filter((r) => r.verified).length;
    const latestMs = reviews.reduce((m, r) => Math.max(m, r.createdAt || 0), 0);
    const recentCount = countRecent(reviews);
    if (verified > 0) {
      facts.push(
        <span key="verified" className="inline-flex items-center gap-1 text-spring-green">
          <BadgeCheck className="size-3.5" />
          <span className="text-grey">
            {verified} from verified traveler{verified === 1 ? "" : "s"}
          </span>
        </span>,
      );
    }
    if (latestMs > 0) facts.push(<span key="latest">Latest {monthYear(latestMs)}</span>);
    if (recentCount > 0) facts.push(<span key="recent">{recentCount} in the last year</span>);
  }

  if (facts.length === 0 && loved.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {facts.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-b4-desktop text-grey">
          {facts.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden>·</span>}
              {f}
            </span>
          ))}
        </p>
      )}

      {loved.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 font-body text-b4-desktop text-midnight">
          <span className="text-grey">Travelers love:</span>
          {loved.map((c) => (
            <span
              key={c.key}
              className="rounded-full bg-light-yellow/60 px-2.5 py-0.5 font-medium text-midnight"
            >
              {c.label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
