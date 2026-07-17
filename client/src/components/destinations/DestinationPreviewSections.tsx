"use client";

/**
 * Read-only previews for the destination editor of the sections generated live
 * on www: Top Tours (from linked tours), derived Highlights, Reviews (from
 * linked tours + per-destination featured/hidden overrides), and the shared
 * static "Join our community" band. These mirror the public page components so
 * the editor reads as true WYSIWYG.
 *
 * Reviews are the one interactive preview: an admin can hide a review from THIS
 * destination page or add (feature) a review from any tour — scoped to this
 * destination only, never touching the review's global status.
 */

import { useMemo, useState } from "react";
import { Star, ImageIcon, EyeOff, Eye, Plus, X, Search } from "lucide-react";
import type { TourPackage, Highlight } from "@/types/tours";
import type { ReviewDoc } from "@/types/reviews";

const WWW_BASE = "https://www.imheretravels.com";
export const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

const toTitleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Matches www `priceLabel` — e.g. "GBP £1,199". */
export function formatTourPrice(t: TourPackage): string {
  const p = t.pricing;
  if (!p) return "";
  const amount = p.discounted && p.discounted > 0 ? p.discounted : p.original;
  if (typeof amount !== "number") return "";
  const symbol = CURRENCY_SYMBOL[p.currency] ?? "";
  return `${p.currency ?? ""} ${symbol}${amount.toLocaleString()}`.trim();
}

export type DerivedHighlight = { image: string; title: string; description: string };

/** Merge each linked tour's trip highlights (Highlight objects with an image). */
export function deriveHighlights(linkedTours: TourPackage[]): DerivedHighlight[] {
  return linkedTours.flatMap((t) =>
    ((t.details?.highlights ?? []) as (string | Highlight)[])
      .filter((h): h is Highlight => typeof h === "object" && !!h.image)
      .map((h) => ({
        image: h.image as string,
        title: h.text ?? "",
        description: h.subtitle ?? "",
      })),
  );
}

/* ── Top {name} Tours (mirrors the public tour card) ──────────────────────── */

const PinIcon = () => (
   
  <img src={resolveImg("/Icons/SVG/Pin/pin-solid-red.svg")} alt="" width={14} height={14} />
);

export function TopToursPreview({
  name,
  linkedTours,
}: {
  name: string;
  linkedTours: TourPackage[];
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="mb-8 text-center md:mb-12">
        <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">
          Top {name || "Destination"} Tours
        </h2>
        <p className="mt-3 font-body text-b4-mobile md:text-b4-desktop text-dark-gray">
          Small-group adventures — every detail taken care of.
        </p>
      </div>

      {linkedTours.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-grey/40 bg-white/60 py-10 text-center font-body text-b4-desktop text-dark-gray">
          No tours linked yet. Add tours in Settings → Linked Tours to populate this section.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {linkedTours.map((tour) => {
            const price = formatTourPrice(tour);
            const description = (tour.description ?? "").slice(0, 160);
            return (
              <li key={tour.slug} className="group flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-small">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-light-grey">
                  {tour.media?.coverImage ? (
                     
                    <img src={resolveImg(tour.media.coverImage)} alt={tour.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-dark-gray/40">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5 md:p-6">
                  {tour.duration && (
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-light-grey px-3 py-1 font-body text-b4-desktop text-midnight">
                      <PinIcon />
                      {toTitleCase(tour.duration)}
                    </span>
                  )}
                  <h3 className="mt-4 font-sans text-h5-mobile md:text-h5-desktop text-midnight group-hover:text-crimson-red">
                    {tour.name}
                  </h3>
                  {description && (
                    <p className="mt-2 font-body text-b4-mobile md:text-b4-desktop text-dark-gray">
                      {description}
                    </p>
                  )}
                  {price && (
                    <div className="mt-auto flex items-baseline gap-2 pt-5">
                      <span className="font-body text-b4-desktop text-dark-gray">From</span>
                      <span className="font-sans text-h6-mobile md:text-h6-desktop text-midnight">{price}</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Derived {name} Highlights (mirrors the public Highlights carousel card) ── */

export function DerivedHighlightsPreview({ highlights }: { highlights: DerivedHighlight[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      {highlights.map((item, i) => (
        <div key={i} className="flex shrink-0 flex-col overflow-hidden rounded-lg bg-white shadow-small" style={{ width: "282px", height: "420px" }}>
          <div className="relative shrink-0 overflow-hidden" style={{ height: "260px" }}>
            {item.image ? (
               
              <img src={resolveImg(item.image)} alt={item.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-light-grey text-dark-gray/40">
                <ImageIcon className="h-7 w-7" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-start p-4">
            <h3 className="font-sans text-h6-mobile md:text-h6-desktop text-midnight">{item.title}</h3>
            {item.description && (
              <p className="mt-1 line-clamp-3 font-body text-b4-mobile md:text-b4-desktop text-dark-gray">
                {item.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Reviews (lighter mirror of the public DestinationReviewsSection) ──────── */

function Stars({ rating, className = "size-4" }: { rating: number; className?: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${n <= Math.round(rating) ? "fill-crimson-red text-crimson-red" : "text-grey/30"}`}
        />
      ))}
    </span>
  );
}

function reviewDate(r: ReviewDoc): string {
  if (r.displayDate) return r.displayDate;
  if (!r.createdAt) return "";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "2-digit", year: "numeric" }).format(
    new Date(r.createdAt),
  );
}

function sourceLabel(r: ReviewDoc): string | null {
  return r.source === "google" ? "via Google" : r.source === "tourradar" ? "via TourRadar" : null;
}

/** A single review card matching the public ReviewCard look (lighter — plain body). */
function EditorReviewCard({
  review,
  featured,
  hidden,
  onHide,
  onUnhide,
  onUnfeature,
}: {
  review: ReviewDoc;
  featured: boolean;
  hidden: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onUnfeature: () => void;
}) {
  const label = sourceLabel(review);
  const date = reviewDate(review);
  return (
    <div className={`relative flex flex-col gap-4 rounded-lg bg-white p-6 shadow-small transition-opacity ${hidden ? "opacity-45" : ""}`}>
      {/* Editor controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        {featured && (
          <span className="rounded-full bg-vivid-orange/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vivid-orange">
            Added
          </span>
        )}
        {hidden ? (
          <button type="button" onClick={onUnhide} title="Show on this destination"
            className="grid size-7 place-items-center rounded-full bg-light-grey text-dark-gray hover:text-spring-green">
            <Eye className="size-3.5" />
          </button>
        ) : (
          <button type="button" onClick={onHide} title="Hide on this destination"
            className="grid size-7 place-items-center rounded-full bg-light-grey text-dark-gray hover:text-crimson-red">
            <EyeOff className="size-3.5" />
          </button>
        )}
        {featured && (
          <button type="button" onClick={onUnfeature} title="Remove from this destination"
            className="grid size-7 place-items-center rounded-full bg-light-grey text-dark-gray hover:text-crimson-red">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pr-16">
        <div className="flex items-center gap-3">
          <Stars rating={review.rating} />
          {label && (
            <span className="whitespace-nowrap rounded-full bg-light-grey px-2.5 py-1 font-body text-b4-desktop text-dark-gray">
              {label}
            </span>
          )}
        </div>
        {date && <span className="font-body text-b4-desktop text-grey">{date}</span>}
      </div>

      {review.title && (
        <p className="-mb-2 font-sans text-h6-desktop font-bold text-midnight">{review.title}</p>
      )}
      <p className="line-clamp-5 font-body text-b4-desktop text-dark-gray">
        {(review.bodyMarkdown || "").replace(/[#*_>`]/g, "")}
      </p>

      <div className="mt-auto flex items-center gap-3 pt-2">
        {review.reviewerAvatar ? (
          <div className="size-12 shrink-0 overflow-hidden rounded-full bg-light-grey">
            <img src={resolveImg(review.reviewerAvatar)} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-light-grey font-sans text-h6-desktop font-bold text-midnight">
            {(review.reviewerFirstName?.[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-sans text-h6-desktop font-bold text-midnight">
            {review.reviewerFirstName} {review.reviewerLastName ?? ""}
          </p>
          {review.reviewerLocation && (
            <p className="truncate font-body text-b4-desktop text-vivid-orange">{review.reviewerLocation}</p>
          )}
        </div>
      </div>

      {review.tourName && (
        <span className="font-body text-b4-desktop text-grey">
          from <span className="text-crimson-red underline">{review.tourName}</span>
        </span>
      )}
    </div>
  );
}

export function ReviewsPreview({
  name,
  linkedReviews,
  featuredReviews,
  allReviews,
  hiddenIds,
  featuredIds,
  onHide,
  onUnhide,
  onFeature,
  onUnfeature,
}: {
  name: string;
  linkedReviews: ReviewDoc[];
  featuredReviews: ReviewDoc[];
  allReviews: ReviewDoc[];
  hiddenIds: string[];
  featuredIds: string[];
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  onFeature: (id: string) => void;
  onUnfeature: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Candidate set = linked-tour reviews ∪ featured, de-duped by id.
  const candidates = useMemo(() => {
    const map = new Map<string, ReviewDoc>();
    [...linkedReviews, ...featuredReviews].forEach((r) => map.set(r.id, r));
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [linkedReviews, featuredReviews]);

  const featuredSet = new Set(featuredIds);
  const visible = candidates.filter((r) => !hiddenIds.includes(r.id));
  const hidden = candidates.filter((r) => hiddenIds.includes(r.id));

  const avg = visible.length > 0 ? visible.reduce((s, r) => s + (r.rating || 0), 0) / visible.length : 0;
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: visible.filter((r) => Math.round(r.rating) === star).length,
  }));
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  const candidateIds = new Set(candidates.map((r) => r.id));
  const addable = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allReviews
      .filter((r) => !candidateIds.has(r.id))
      .filter((r) =>
        term
          ? `${r.reviewerFirstName} ${r.reviewerLastName ?? ""} ${r.tourName} ${r.title ?? ""} ${r.bodyMarkdown}`
              .toLowerCase()
              .includes(term)
          : true,
      )
      .slice(0, 40);
  }, [allReviews, candidateIds, search]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">
          {name || "Destination"} Tour Reviews
        </h2>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-crimson-red bg-crimson-red/5 px-4 py-2 font-body text-sm font-medium text-crimson-red transition-colors hover:bg-crimson-red/10"
        >
          <Plus className="size-4" /> Add review
        </button>
      </div>

      {/* Summary card — mirrors the public RatingBreakdown + "Ready to book" CTA */}
      <div className="rounded-lg bg-white p-6 shadow-small md:p-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-light-grey">
          <div className="lg:pr-10">
            <div className="flex items-start gap-6">
              <div className="text-center">
                <p className="font-sans text-[44px] font-bold leading-none text-midnight">{avg.toFixed(1)}</p>
                <div className="mt-1 flex justify-center">
                  <Stars rating={avg} />
                </div>
                <p className="mt-1 font-body text-b4-desktop text-grey">{visible.length} reviews</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {buckets.map((b) => (
                  <div key={b.star} className="flex items-center gap-2">
                    <span className="w-3 text-right font-body text-b4-desktop text-dark-gray">{b.star}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-light-grey">
                      <span
                        className="block h-full rounded-full bg-crimson-red"
                        style={{ width: `${(b.count / maxBucket) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 font-body text-b4-desktop text-grey">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4 lg:pl-10">
            <div>
              <h3 className="font-sans text-h5-mobile md:text-h5-desktop text-midnight">
                Ready to book your own adventure?
              </h3>
              <p className="mt-2 max-w-md font-body text-b4-mobile md:text-b4-desktop text-grey">
                Real trips, real travelers. Find the {name || "destination"} tour that&apos;s right for you and start planning.
              </p>
            </div>
            <span className="inline-flex w-fit items-center justify-center rounded-full bg-crimson-red px-6 py-3 font-body font-medium text-white opacity-80 shadow-small select-none">
              View All Tours
            </span>
          </div>
        </div>
      </div>

      {/* Review cards */}
      {visible.length > 0 ? (
        <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <li key={r.id}>
              <EditorReviewCard
                review={r}
                featured={featuredSet.has(r.id)}
                hidden={false}
                onHide={() => onHide(r.id)}
                onUnhide={() => onUnhide(r.id)}
                onUnfeature={() => onUnfeature(r.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-2xl border-2 border-dashed border-grey/40 bg-white/60 py-10 text-center font-body text-b4-desktop text-dark-gray">
          No reviews will show here. Link tours with reviews, or add specific reviews above.
        </p>
      )}

      {/* Hidden reviews (collapsed, editor-only) */}
      {hidden.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-gray/60">
            <EyeOff className="size-3.5" /> Hidden on this destination ({hidden.length})
          </p>
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {hidden.map((r) => (
              <li key={r.id}>
                <EditorReviewCard
                  review={r}
                  featured={featuredSet.has(r.id)}
                  hidden
                  onHide={() => onHide(r.id)}
                  onUnhide={() => onUnhide(r.id)}
                  onUnfeature={() => onUnfeature(r.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add-review picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPickerOpen(false)} aria-hidden />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-light-grey px-6 py-4">
              <span className="font-sans font-bold text-midnight">Add a review to {name || "this destination"}</span>
              <button type="button" onClick={() => setPickerOpen(false)}
                className="grid size-7 place-items-center rounded-full text-dark-gray hover:bg-light-grey hover:text-midnight">
                <X className="size-4" />
              </button>
            </div>
            <div className="border-b border-light-grey p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dark-gray/50" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reviews by name, tour, or text…"
                  className="w-full rounded-md border border-border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-crimson-red/40"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
              {addable.length === 0 ? (
                <p className="py-8 text-center text-sm text-dark-gray/60">
                  {search ? "No matching reviews." : "No other published reviews to add."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {addable.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => { onFeature(r.id); setPickerOpen(false); setSearch(""); }}
                        className="group flex w-full items-start gap-3 rounded-xl border border-light-grey p-3 text-left transition-colors hover:border-crimson-red/40 hover:bg-crimson-red/5"
                      >
                        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-light-grey text-xs font-bold text-midnight">
                          {(r.reviewerFirstName?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-sans text-b4-desktop font-bold text-midnight">
                              {r.reviewerFirstName} {r.reviewerLastName ?? ""}
                            </span>
                            <Stars rating={r.rating} className="size-3" />
                          </div>
                          <p className="line-clamp-2 font-body text-xs text-dark-gray">
                            {(r.bodyMarkdown || "").replace(/[#*_>`]/g, "")}
                          </p>
                          {r.tourName && <p className="mt-0.5 text-[11px] text-grey">{r.tourName}</p>}
                        </div>
                        <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-crimson-red/10 text-crimson-red opacity-0 transition-opacity group-hover:opacity-100">
                          <Plus className="size-3.5" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Join our community (shared static band) ──────────────────────────────── */

export function JoinCommunityPreview() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto overflow-hidden rounded-lg bg-white shadow-small" style={{ width: "1200px", maxWidth: "100%" }}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="flex flex-col justify-center gap-5 p-8 md:p-12">
            <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">Join our community</h2>
            <p className="font-body text-b4-mobile md:text-b4-desktop text-dark-gray">
              Stay up to date on the latest news, deals and tours when you sign up.
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="email"
                disabled
                placeholder="Enter your email"
                className="w-full cursor-not-allowed rounded-full border border-grey bg-white px-5 py-3 font-body text-b4-desktop text-midnight placeholder:text-grey"
              />
              <p className="font-body text-b4-desktop text-grey">
                By submitting you agree with our Privacy Policy.
              </p>
              <span className="inline-flex w-fit items-center justify-center rounded-full bg-crimson-red px-6 py-3 font-body font-medium text-white opacity-80 select-none">
                Submit
              </span>
            </div>
          </div>
          <div className="relative min-h-[240px] w-full bg-light-grey">
            <img
              src={resolveImg("/figma/join-community.jpg")}
              alt="Travelers enjoying a tropical destination"
              className="absolute inset-0 h-full w-full object-cover object-[center_85%]"
            />
          </div>
        </div>
      </div>
      <p className="mt-3 text-center font-body text-[11px] text-dark-gray/60">
        Shared newsletter band — shown on every destination page, not editable per-destination.
      </p>
    </div>
  );
}
