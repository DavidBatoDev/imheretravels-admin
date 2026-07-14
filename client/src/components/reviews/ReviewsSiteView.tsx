"use client";

import { Eye, EyeOff, ImagePlus, Link2, Pencil, Play, Trash2 } from "lucide-react";
import ReviewCard from "@/components/reviews/public/ReviewCard";
import RatingBreakdown from "@/components/reviews/public/RatingBreakdown";
import ReviewInsights from "@/components/reviews/public/ReviewInsights";
import CategoryRatings from "@/components/reviews/public/CategoryRatings";
import AdminReviewsFilterBar, {
  type SourceFilter,
  type StatusFilter,
} from "@/components/reviews/AdminReviewsFilterBar";
import type { SortValue, TourOption } from "@/components/reviews/public/reviews-filter";
import {
  computeCategoryAggregates,
  isExternalSource,
  toPublicReview,
  type ReviewDoc,
} from "@/types/reviews";

/**
 * The public `/reviews` hub, rendered inside the admin with moderation controls.
 *
 * Everything below the toolbar is the *actual* public UI (ported verbatim into
 * `components/reviews/public/`), so what a moderator sees is what a traveler sees.
 * Two deliberate differences:
 *
 *  - it lists every status, not just `published` — hidden cards render dimmed and
 *    pending ones badged, since triaging them is the whole point;
 *  - each card is wrapped in a control strip. The card itself is untouched.
 *
 * The wrapper carries `.reviews-site-view`, which pins light mode so this stays a
 * faithful preview of the live (light-only) site even in the admin's dark theme.
 */
export default function ReviewsSiteView({
  reviews,
  totalCount,
  tours,
  query,
  onQueryChange,
  tour,
  onTourChange,
  sort,
  onSortChange,
  status,
  onStatusChange,
  source,
  onSourceChange,
  busyId,
  onToggleHidden,
  onEdit,
  onAssign,
  onDelete,
  onAddPhotos,
  onAddVideo,
}: {
  reviews: ReviewDoc[]; // already filtered + sorted by the caller
  totalCount: number;
  tours: TourOption[];
  query: string;
  onQueryChange: (v: string) => void;
  tour: string | null;
  onTourChange: (slug: string | null) => void;
  sort: SortValue;
  onSortChange: (s: SortValue) => void;
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  source: SourceFilter;
  onSourceChange: (s: SourceFilter) => void;
  busyId: string | null;
  onToggleHidden: (r: ReviewDoc) => void;
  onEdit: (r: ReviewDoc) => void;
  onAssign: (r: ReviewDoc) => void;
  onDelete: (r: ReviewDoc) => void;
  onAddPhotos: (r: ReviewDoc) => void;
  onAddVideo: (r: ReviewDoc) => void;
}) {
  // The summary panel describes exactly what's listed below it (same rule as the
  // public hub, which computes these over its filtered set).
  const publicReviews = reviews.map(toPublicReview);

  return (
    <div className="reviews-site-view rounded-brand-lg border border-light-grey p-6 md:p-10">
      <h2 className="font-hk-grotesk text-h2-mobile md:text-h2-desktop text-midnight">
        What travelers say
      </h2>
      <p className="mt-3 max-w-2xl font-body text-b2-mobile md:text-b2-desktop text-dark-gray">
        Real stories from verified travelers who&apos;ve explored the world with us.
      </p>

      {publicReviews.length > 0 && (
        <div className="mt-6 max-w-2xl rounded-brand-lg bg-white p-6 shadow-small md:p-8">
          <RatingBreakdown reviews={publicReviews} />
          <ReviewInsights reviews={publicReviews} showHighlights={false} />

          {/* What travelers love + per-category ratings, full width — mirrors the
              public hub's bottom section. Renders nothing when the filtered set
              has no first-party category-rated reviews (federated TourRadar/Google
              reviews never carry category scores). */}
          <div className="mt-6 border-t border-light-grey pt-6">
            <ReviewInsights reviews={publicReviews} showFacts={false} />
            <div className="mt-4">
              <CategoryRatings categories={computeCategoryAggregates(publicReviews)} layout="row" />
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <AdminReviewsFilterBar
          tours={tours}
          totalCount={totalCount}
          query={query}
          onQueryChange={onQueryChange}
          tour={tour}
          onTourChange={onTourChange}
          sort={sort}
          onSortChange={onSortChange}
          status={status}
          onStatusChange={onStatusChange}
          source={source}
          onSourceChange={onSourceChange}
        />
      </div>

      {reviews.length === 0 ? (
        <p className="mt-16 text-center font-body text-b2-desktop text-dark-gray">
          No reviews match the current filters.
        </p>
      ) : (
        <ul className="mt-10 space-y-6 md:mt-12">
          {reviews.map((r) => (
            <li key={r.id}>
              <ModeratedCard
                review={r}
                busy={busyId === r.id}
                onToggleHidden={onToggleHidden}
                onEdit={onEdit}
                onAssign={onAssign}
                onDelete={onDelete}
                onAddPhotos={onAddPhotos}
                onAddVideo={onAddVideo}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One public review card plus its moderation strip and status treatment. */
function ModeratedCard({
  review,
  busy,
  onToggleHidden,
  onEdit,
  onAssign,
  onDelete,
  onAddPhotos,
  onAddVideo,
}: {
  review: ReviewDoc;
  busy: boolean;
  onToggleHidden: (r: ReviewDoc) => void;
  onEdit: (r: ReviewDoc) => void;
  onAssign: (r: ReviewDoc) => void;
  onDelete: (r: ReviewDoc) => void;
  onAddPhotos: (r: ReviewDoc) => void;
  onAddVideo: (r: ReviewDoc) => void;
}) {
  const hidden = review.status === "hidden";
  const pending = review.status === "pending";
  // Hidden *because TourRadar dropped it*, not because a moderator hid it. Worth
  // distinguishing: the first is upstream news, the second is our own decision.
  const removedUpstream = hidden && Boolean(review.deletedOnTourRadarAt);

  return (
    <div className={`relative ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {/* Status badge — only when the card is NOT what the public would see. */}
      {(hidden || pending) && (
        <span
          title={
            removedUpstream
              ? "No longer on TourRadar. It was hidden, not deleted — publish it again to keep showing it."
              : undefined
          }
          className={`absolute -top-2 left-4 z-10 rounded-full px-2.5 py-1 font-body text-b4-desktop font-medium shadow-xsmall ${
            hidden ? "bg-midnight text-white" : "bg-vivid-orange text-white"
          }`}
        >
          {removedUpstream ? "Removed on TourRadar" : hidden ? "Hidden" : "Pending"}
        </span>
      )}

      {/* Hidden reviews are dimmed + desaturated so they read as "off the site". */}
      <div className={hidden ? "opacity-50 grayscale" : ""}>
        <ReviewCard review={toPublicReview(review)} showTour as="div" variant="row" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Action
          icon={hidden ? Eye : EyeOff}
          label={hidden ? "Publish" : "Hide"}
          onClick={() => onToggleHidden(review)}
        />
        <Action icon={Pencil} label="Edit" onClick={() => onEdit(review)} />
        <Action icon={ImagePlus} label="Photos" onClick={() => onAddPhotos(review)} />
        <Action
          icon={Play}
          label={review.videos?.length ? "Replace video" : "Add video"}
          onClick={() => onAddVideo(review)}
        />
        {/* Only federated reviews arrive without a tour to assign. */}
        {isExternalSource(review.source) && (
          <Action icon={Link2} label="Assign tour" onClick={() => onAssign(review)} />
        )}
        <Action icon={Trash2} label="Delete" destructive onClick={() => onDelete(review)} />
      </div>
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-light-grey bg-white px-3 py-1.5 font-body text-b4-desktop transition-colors ${
        destructive
          ? "text-crimson-red hover:bg-crimson-red hover:text-white"
          : "text-dark-gray hover:bg-light-grey hover:text-midnight"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
