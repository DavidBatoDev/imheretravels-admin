"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import SearchInput from "@/components/reviews/public/SearchInput";
import useListboxNav from "@/components/reviews/public/useListboxNav";
import {
  SORT_OPTIONS,
  type SortValue,
  type TourOption,
} from "@/components/reviews/public/reviews-filter";
import type { ReviewSource, ReviewStatus } from "@/types/reviews";

/**
 * Filter bar for the admin reviews "Site view". Visually identical to the public
 * hub's `ReviewsFilterBar` (same shell, same dropdown markup, same a11y hooks),
 * with two differences:
 *
 *  - state is local, not URL-driven — the admin dashboard has no shareable
 *    `?tour=`/`?sort=` contract, and this mirrors how the public per-tour section
 *    (`TourReviewsSection`) filters in place;
 *  - it adds the moderation-only Status and Source filters that the reviews table
 *    already has, because admins see hidden/pending reviews the public never does.
 */

export type StatusFilter = ReviewStatus | "all";
export type SourceFilter = ReviewSource | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
  { value: "pending", label: "Pending" },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "user", label: "Traveler" },
  { value: "admin", label: "Admin" },
  { value: "google", label: "Google" },
  { value: "tourradar", label: "TourRadar" },
];

export default function AdminReviewsFilterBar({
  tours,
  totalCount,
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
}: {
  tours: TourOption[];
  totalCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  tour: string | null;
  onTourChange: (slug: string | null) => void;
  sort: SortValue;
  onSortChange: (sort: SortValue) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  source: SourceFilter;
  onSourceChange: (source: SourceFilter) => void;
}) {
  const activeTourName = tour
    ? tours.find((t) => t.slug === tour)?.name ?? "Select tour"
    : `All tours (${totalCount})`;
  const sortLabel = SORT_OPTIONS.find((s) => s.value === sort)?.label ?? SORT_OPTIONS[0].label;
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === status)!.label;
  const sourceLabel = SOURCE_OPTIONS.find((s) => s.value === source)!.label;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <SearchInput value={query} onChange={onQueryChange} className="w-full lg:max-w-xs" />

      {tours.length > 1 && (
        <TourMenu
          tours={tours}
          totalCount={totalCount}
          activeTour={tour}
          label={activeTourName}
          onSelect={onTourChange}
        />
      )}

      <Menu
        prefix="Sort"
        label={sortLabel}
        options={SORT_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
        value={sort}
        onSelect={onSortChange}
      />
      <Menu
        prefix="Status"
        label={statusLabel}
        options={STATUS_OPTIONS}
        value={status}
        onSelect={onStatusChange}
      />
      <Menu
        prefix="Source"
        label={sourceLabel}
        options={SOURCE_OPTIONS}
        value={source}
        onSelect={onSourceChange}
      />
    </div>
  );
}

/** Dropdown shell: closes on outside click. Escape/arrows live in `useListboxNav`. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return { open, setOpen, ref, triggerRef, listRef };
}

// Brand radii are prefixed in admin (`rounded-*` is the shadcn --radius scale).
const triggerClass =
  "flex w-full items-center justify-between gap-3 rounded-full border border-light-grey bg-white px-4 py-2.5 font-body text-b4-desktop text-midnight shadow-xxsmall transition-colors hover:bg-light-grey/60 lg:w-auto";
const panelClass =
  "absolute z-30 mt-2 max-h-80 w-[min(20rem,calc(100vw-2rem))] overflow-auto rounded-brand-md border border-light-grey bg-white p-1.5 shadow-medium";
const itemClass =
  "flex w-full items-center justify-between gap-3 rounded-brand-sm px-3 py-2 text-left font-body text-b4-desktop text-dark-gray hover:bg-light-grey";

/** Generic single-select listbox (sort / status / source). */
function Menu<T extends string>({
  prefix,
  label,
  options,
  value,
  onSelect,
}: {
  prefix: string;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const { open, setOpen, ref, triggerRef, listRef } = useDropdown();
  useListboxNav({ open, listRef, triggerRef, onClose: () => setOpen(false) });

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <span className="truncate">
          <span className="text-grey">{prefix}:</span> {label}
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={listRef} className={panelClass} role="listbox">
          {options.map((o) => (
            <MenuItem
              key={o.value}
              label={o.label}
              selected={value === o.value}
              onClick={() => {
                onSelect(o.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TourMenu({
  tours,
  totalCount,
  activeTour,
  label,
  onSelect,
}: {
  tours: TourOption[];
  totalCount: number;
  activeTour: string | null;
  label: string;
  onSelect: (slug: string | null) => void;
}) {
  const { open, setOpen, ref, triggerRef, listRef } = useDropdown();
  const [query, setQuery] = useState("");
  const hasSearch = tours.length > 6;
  const filtered = tours.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  // When the panel has its own autofocused search box, don't steal that focus.
  useListboxNav({ open, listRef, triggerRef, onClose: () => setOpen(false), autoFocus: !hasSearch });

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <span className="truncate">
          <span className="text-grey">Tour:</span> {label}
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={listRef} className={panelClass} role="listbox">
          {hasSearch && (
            <div className="sticky top-0 mb-1 flex items-center gap-2 rounded-brand-sm bg-white px-2 py-1.5">
              <Search className="size-4 text-grey" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tours…"
                aria-label="Search tours"
                className="w-full bg-transparent font-body text-b4-desktop text-midnight outline-none placeholder:text-grey"
              />
            </div>
          )}
          <MenuItem
            label="All tours"
            count={totalCount}
            selected={!activeTour}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          />
          {filtered.map((t) => (
            <MenuItem
              key={t.slug}
              label={t.name}
              count={t.count}
              selected={activeTour === t.slug}
              onClick={() => {
                onSelect(t.slug);
                setOpen(false);
              }}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 font-body text-b4-desktop text-grey">No tours match.</p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`${itemClass} ${selected ? "bg-light-grey/70 font-medium text-midnight" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {selected && <Check className="size-4 shrink-0 text-crimson-red" />}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined && <span className="shrink-0 text-grey">{count}</span>}
    </button>
  );
}
