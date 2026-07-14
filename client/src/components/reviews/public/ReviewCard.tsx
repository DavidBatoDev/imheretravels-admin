import { BadgeCheck } from "lucide-react";
import ImageWithSkeleton from "./ImageWithSkeleton";
import Markdown from "./Markdown";
import ExpandableBody from "./ExpandableBody";
import Stars from "./Stars";
import ReviewPhotos from "./ReviewPhotos";
import ReactCountryFlag from "react-country-flag";
import { getTourRadarReviewsUrl } from "./tourradar-links";
import { isoForLocation, isoFromFlagEmoji } from "./country-flags";
import type { PublicReview } from "@/types/reviews";

// PORT PATCH 4 — admin has no /tours/[slug] route, so the tour link points at the
// live public site and opens in a new tab. www uses next/link to its own route.
const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || "";

function formatDate(review: PublicReview): string {
  if (review.displayDate) return review.displayDate;
  if (!review.createdAt) return "";
  // "MMMM dd, yyyy" → e.g. "July 09, 2026".
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(review.createdAt));
}

// Collapsed-card clamp heights, as plain numbers (rem) for the modal's reveal-
// highlight `clipPath` below. The `ExpandableBody collapsedClassName` calls use
// the STATIC Tailwind classes `max-h-20`/`max-h-52` instead of building this
// value into a class string — Tailwind's JIT scanner needs a complete literal
// class name in source, so these two must be kept numerically in sync by hand:
// `max-h-20` = 20 × 0.25rem = 5rem, `max-h-52` = 52 × 0.25rem = 13rem.
const GRID_CLAMP_REM = 13; // ~9 lines — matches `max-h-52`
const ROW_CLAMP_REM = 5; // compact hub row — matches `max-h-20`

/**
 * A single review card. Used on the tour page testimonials grid and the
 * community hub. Set `showTour` to surface which tour the review is for (hub).
 *
 * `variant="modal"` renders the same content unclamped (full body, no "Read
 * more") for the focus modal opened from the grid card.
 */
export default function ReviewCard({
  review,
  showTour = false,
  variant = "grid",
  as: Shell = "li",
  highlightClipRem,
}: {
  review: PublicReview;
  showTour?: boolean;
  variant?: "grid" | "modal" | "row";
  /** Grid-variant shell element. `li` for a plain <ul>; `div` when the caller
   *  supplies its own list item (e.g. to wrap the card in extra chrome). */
  as?: "li" | "div";
  /** Modal-only: the collapsed card's clamp height (rem), so the reveal
   *  highlight below can clip to only the text that was actually hidden. */
  highlightClipRem?: number;
}) {
  const date = formatDate(review);
  const sourceLabel =
    review.source === "google"
      ? "via Google"
      : review.source === "tourradar"
        ? "via TourRadar"
        : null;
  const tourRadarUrl =
    review.source === "tourradar"
      ? getTourRadarReviewsUrl(review.tourSlug, review.externalTourId)
      : undefined;
  const isModal = variant === "modal";
  // Real SVG flag (emoji flags don't render on Windows). Prefer the source's flag
  // (TourRadar countryEmoji → ISO), else derive from the free-text location.
  const countryIso = review.reviewerCountryEmoji
    ? isoFromFlagEmoji(review.reviewerCountryEmoji)
    : isoForLocation(review.reviewerLocation);

  const sourceBadgeCls =
    "whitespace-nowrap rounded-full bg-light-grey px-2.5 py-1 font-body text-b4-desktop text-dark-gray";

  const header = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Stars count={review.rating} />
        {sourceLabel &&
          (tourRadarUrl ? (
            <a
              href={tourRadarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${sourceBadgeCls} transition-colors hover:bg-light-grey/70 hover:text-crimson-red`}
            >
              {sourceLabel}
            </a>
          ) : (
            <span className={sourceBadgeCls}>{sourceLabel}</span>
          ))}
      </div>
      {date && <span className="font-body text-b4-desktop text-grey">{date}</span>}
    </div>
  );

  const title = review.title && (
    <p className="-mb-2 font-sans text-h6-desktop font-bold text-midnight">{review.title}</p>
  );

  // In the focus modal, flash-highlight only the text that was actually hidden
  // behind the card's "Read more" truncation — not the part already visible
  // there. Achieved by stacking an identical, transparent-text copy of the
  // body on top of the real one, background-highlighted, clipped via
  // `clip-path` to start exactly at the collapsed card's clamp height. A
  // single-highlight full-paragraph flash (the old behavior) reads as "this
  // whole thing is new" even for text the reader already scrolled past on the
  // card, which is what prompted this.
  //
  // `clipPath` is set via inline `style`, not a Tailwind arbitrary-value class:
  // Tailwind's JIT scanner only generates CSS for class names it finds as a
  // COMPLETE literal string in source. A template-literal-interpolated class
  // like `` `[clip-path:inset(${x}rem_0_0_0)]` `` never matches that pattern —
  // it's syntactically valid JSX, so nothing here would fail a build or a
  // typecheck, but at runtime the class generates no CSS rule at all and the
  // clip silently never applies.
  const body =
    isModal && highlightClipRem != null ? (
      <div className="relative">
        <Markdown>{review.bodyMarkdown}</Markdown>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none"
          style={{ clipPath: `inset(${highlightClipRem}rem 0 0 0)` }}
        >
          <Markdown className="review-reveal-highlight text-transparent [&_*]:text-transparent">
            {review.bodyMarkdown}
          </Markdown>
        </div>
      </div>
    ) : (
      <Markdown className={isModal ? "review-reveal-highlight" : undefined}>
        {review.bodyMarkdown}
      </Markdown>
    );

  const reply = review.externalReply && (
    <div className="rounded-brand-md border-l-2 border-light-grey bg-light-grey/40 py-2 pl-4">
      <p className="font-body text-b4-desktop font-bold text-midnight">Response from the owner</p>
      <p className="mt-1 font-body text-b4-desktop text-dark-gray">{review.externalReply}</p>
    </div>
  );

  const photos = ((review.photos && review.photos.length > 0) ||
    (review.videos && review.videos.length > 0)) && (
    <ReviewPhotos
      photos={review.photos}
      videos={review.videos}
      authorAlt={review.reviewerFirstName}
      preview={!isModal}
    />
  );

  const tourLink = showTour && review.tourName && (
    <a
      href={`${WEBSITE_URL}/tours/${review.tourSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-body text-b4-desktop text-crimson-red underline"
    >
      {review.tourName}
    </a>
  );

  const reviewer = (
    <div className={`${isModal ? "" : "mt-auto"} flex items-center gap-4 pt-2`}>
      {review.reviewerAvatar ? (
        <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-light-grey">
          <ImageWithSkeleton
            src={review.reviewerAvatar}
            alt=""
            fill
            rounded="full"
            sizes="56px"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-light-grey font-sans text-h6-desktop font-bold text-midnight">
          {review.reviewerFirstName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-sans text-h6-desktop font-bold text-midnight">
          <span className="truncate">{review.reviewerFirstName}</span>
          {review.verified && (
            <span
              className="inline-flex items-center gap-0.5 text-spring-green"
              title="Verified traveler"
            >
              <BadgeCheck className="size-4" />
              <span className="font-body text-b4-desktop font-normal">Verified</span>
            </span>
          )}
        </p>
        {(countryIso || review.reviewerLocation) && (
          <p className="flex items-center gap-1.5 font-body text-b4-desktop text-vivid-orange">
            {countryIso && (
              <ReactCountryFlag
                countryCode={countryIso}
                svg
                title={review.reviewerLocation || countryIso}
                style={{ width: "1.1em", height: "1.1em", borderRadius: "2px" }}
                aria-hidden
              />
            )}
            {review.reviewerLocation && <span className="truncate">{review.reviewerLocation}</span>}
          </p>
        )}
      </div>
    </div>
  );

  // Compact list-row variant (reviews hub): identity + stars/date on top, a
  // tightly-clamped body with "Read more", a meta row (source pill + tour link),
  // and the trip photos as a full-height rail on the far right.
  if (variant === "row") {
    const hasMedia =
      (review.photos?.length ?? 0) > 0 || (review.videos?.length ?? 0) > 0;
    return (
      <Shell className="group relative flex min-h-40 overflow-hidden rounded-brand-lg bg-white shadow-small transition-all duration-200 hover:shadow-medium">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            {/* Compact identity (smaller avatar than the grid card). */}
            <div className="flex min-w-0 items-center gap-3">
              {review.reviewerAvatar ? (
                <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-light-grey">
                  <ImageWithSkeleton
                    src={review.reviewerAvatar}
                    alt=""
                    fill
                    rounded="full"
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-light-grey font-sans text-b2-desktop font-bold text-midnight">
                  {review.reviewerFirstName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-sans text-b2-desktop font-bold text-midnight">
                  <span className="truncate">{review.reviewerFirstName}</span>
                  {review.verified && (
                    <span className="text-spring-green" title="Verified traveler">
                      <BadgeCheck className="size-4" />
                    </span>
                  )}
                </p>
                {(countryIso || review.reviewerLocation) && (
                  <p className="flex items-center gap-1.5 font-body text-b4-desktop text-vivid-orange">
                    {countryIso && (
                      <ReactCountryFlag
                        countryCode={countryIso}
                        svg
                        title={review.reviewerLocation || countryIso}
                        style={{ width: "1.1em", height: "1.1em", borderRadius: "2px" }}
                        aria-hidden
                      />
                    )}
                    {review.reviewerLocation && (
                      <span className="truncate">{review.reviewerLocation}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Stars count={review.rating} />
              {date && <span className="font-body text-b4-desktop text-grey">{date}</span>}
            </div>
          </div>

          {title}

          <ExpandableBody
            collapsedClassName="max-h-20"
            modal={
              <ReviewCard
                review={review}
                showTour={showTour}
                variant="modal"
                highlightClipRem={ROW_CLAMP_REM}
              />
            }
          >
            {body}
          </ExpandableBody>

          {reply}

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            {sourceLabel &&
              (tourRadarUrl ? (
                <a
                  href={tourRadarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${sourceBadgeCls} transition-colors hover:bg-light-grey/70 hover:text-crimson-red`}
                >
                  {sourceLabel}
                </a>
              ) : (
                <span className={sourceBadgeCls}>{sourceLabel}</span>
              ))}
            {tourLink && (
              <span className="font-body text-b4-desktop text-grey">from {tourLink}</span>
            )}
          </div>
        </div>

        {hasMedia && (
          <div className="relative w-24 shrink-0 self-stretch sm:w-28 md:w-40">
            <ReviewPhotos
              photos={review.photos}
              videos={review.videos}
              authorAlt={review.reviewerFirstName}
              rail
            />
          </div>
        )}
      </Shell>
    );
  }

  // Modal variant: everything visible, body unclamped, no "Read more".
  if (isModal) {
    return (
      <div className="flex flex-col gap-5 rounded-brand-lg bg-white p-8 md:p-10">
        {header}
        {title}
        {body}
        {reply}
        {photos}
        {tourLink}
        {reviewer}
      </div>
    );
  }

  return (
    <Shell className="flex flex-col gap-5 rounded-brand-lg bg-white p-8 shadow-small transition-all duration-200 hover:-translate-y-0.5 hover:shadow-medium md:p-10">
      {header}
      {title}
      <ExpandableBody
        collapsedClassName="max-h-52"
        modal={
          <ReviewCard
            review={review}
            showTour={showTour}
            variant="modal"
            highlightClipRem={GRID_CLAMP_REM}
          />
        }
      >
        {body}
      </ExpandableBody>
      {reply}
      {photos}
      {tourLink}
      {reviewer}
    </Shell>
  );
}
