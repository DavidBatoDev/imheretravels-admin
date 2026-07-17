"use client";

import { useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Search, X, Plus, Check, Loader2, MapPin, Sparkles } from "lucide-react";
import { getAllTours } from "@/services/tours-service";
import type { TourPackage } from "@/types/tours";

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

/**
 * Derive match stems from a destination name so we can auto-suggest tours by
 * naming convention (e.g. "Philippines" → "philippine", matching
 * "philippine-sunrise"; "Brazil" → "brazil", matching "brazils-treasures").
 */
function matchStems(name: string): string[] {
  const base = (name || "").trim().toLowerCase();
  if (!base) return [];
  const hyphen = base.replace(/\s+/g, "-");
  const stems = new Set<string>([base, hyphen]);
  // Drop a trailing plural/possessive "s" so "philippines" also matches "philippine".
  if (hyphen.length > 4 && hyphen.endsWith("s")) stems.add(hyphen.slice(0, -1));
  return Array.from(stems).filter((s) => s.length >= 3);
}

function tourMatchesDestination(tour: TourPackage, stems: string[]): boolean {
  if (stems.length === 0) return false;
  const haystack = `${tour.slug ?? ""} ${tour.name ?? ""}`.toLowerCase();
  return stems.some((s) => haystack.includes(s));
}

interface LinkedToursEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Searchable multi-select for linking tourPackages to a destination. Writes the
 * selected tour SLUGS into the `tourSlugs` form field (the www destination page
 * resolves each slug live from Firestore). Suggests tours whose slug/name match
 * the destination name; the editor can add/remove any tour manually.
 */
export default function LinkedToursEditor({ form }: LinkedToursEditorProps) {
  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);

  const [tours, setTours] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const linkedSlugs: string[] = w("tourSlugs") ?? [];
  const destinationName = (w("name") as string) ?? "";

  useEffect(() => {
    let active = true;
    getAllTours()
      .then((data) => {
        if (active) setTours(data);
      })
      .catch(() => {
        if (active) setTours([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const tourBySlug = useMemo(() => {
    const map: Record<string, TourPackage> = {};
    tours.forEach((t) => {
      if (t.slug) map[t.slug] = t;
    });
    return map;
  }, [tours]);

  // Linked tours (resolve slug → tour where we can; keep unknown slugs visible).
  const linkedTours = linkedSlugs.map(
    (slug) => tourBySlug[slug] ?? ({ slug, name: slug } as TourPackage),
  );

  const stems = useMemo(() => matchStems(destinationName), [destinationName]);

  // Tours suggested by naming convention that aren't already linked.
  const suggestedTours = useMemo(() => {
    return tours
      .filter((t) => t.slug && !linkedSlugs.includes(t.slug))
      .filter((t) => tourMatchesDestination(t, stems))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [tours, linkedSlugs, stems]);

  const availableTours = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tours
      .filter((t) => t.slug && !linkedSlugs.includes(t.slug))
      .filter((t) =>
        term
          ? t.name?.toLowerCase().includes(term) ||
            t.slug?.toLowerCase().includes(term) ||
            t.tourCode?.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [tours, linkedSlugs, search]);

  const link = (slug: string) => {
    if (slug && !linkedSlugs.includes(slug)) sv("tourSlugs", [...linkedSlugs, slug]);
  };
  const unlink = (slug: string) => {
    sv("tourSlugs", linkedSlugs.filter((x) => x !== slug));
  };
  const linkAllSuggested = () => {
    const toAdd = suggestedTours.map((t) => t.slug).filter(Boolean) as string[];
    if (toAdd.length) sv("tourSlugs", [...linkedSlugs, ...toAdd]);
  };

  return (
    <div className="space-y-3">
      {/* Auto-suggested by naming convention */}
      {suggestedTours.length > 0 && (
        <div className="rounded-xl border border-vivid-orange/30 bg-vivid-orange/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-vivid-orange">
              <Sparkles className="size-3.5" />
              Suggested for {destinationName || "this destination"}
            </span>
            <button
              type="button"
              onClick={linkAllSuggested}
              className="rounded-full bg-vivid-orange px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-vivid-orange/90"
            >
              Add all {suggestedTours.length}
            </button>
          </div>
          <div className="space-y-1">
            {suggestedTours.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => link(t.slug!)}
                className="group flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-white"
              >
                <MapPin className="size-3.5 shrink-0 text-vivid-orange/70" />
                <span className="min-w-0 flex-1 truncate text-sm text-midnight">
                  {t.name} <span className="text-dark-gray/60">/{t.slug}</span>
                </span>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-vivid-orange/15 text-vivid-orange opacity-0 transition-opacity group-hover:opacity-100">
                  <Plus className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Linked tours */}
      {linkedTours.length > 0 ? (
        <div className="space-y-2">
          {linkedTours.map((t) => (
            <div
              key={t.slug}
              className="flex items-center gap-3 rounded-xl border border-light-grey bg-white p-2 shadow-xsmall"
            >
              <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-light-grey">
                {t.media?.coverImage ? (
                   
                  <img
                    src={resolveImg(t.media.coverImage)}
                    alt={t.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <MapPin className="size-4 text-dark-gray/40" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-midnight">{t.name}</p>
                <p className="truncate text-xs text-dark-gray">/{t.slug}</p>
              </div>
              <button
                type="button"
                onClick={() => unlink(t.slug!)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red"
                title="Remove"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-light-grey px-3 py-4 text-center text-xs text-dark-gray/60">
          No tours linked yet. Use the suggestions above or search below.
        </p>
      )}

      {/* Search + available list */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dark-gray/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tours to link…"
          className="w-full rounded-md border border-border py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-crimson-red/40"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-dark-gray/50" />
        </div>
      ) : availableTours.length > 0 ? (
        <div className="max-h-60 space-y-1 overflow-y-auto scrollbar-hide rounded-xl border border-light-grey p-1">
          {availableTours.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => link(t.slug!)}
              className="group flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-light-grey"
            >
              <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-light-grey">
                {t.media?.coverImage ? (
                   
                  <img
                    src={resolveImg(t.media.coverImage)}
                    alt={t.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <MapPin className="size-4 text-dark-gray/40" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium text-midnight">{t.name}</p>
                <p className="truncate text-xs text-dark-gray">
                  /{t.slug}
                  {t.status !== "active" ? ` · ${t.status}` : ""}
                </p>
              </div>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-crimson-red/10 text-crimson-red opacity-0 transition-opacity group-hover:opacity-100">
                <Plus className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-1 py-2 text-center text-xs text-dark-gray/60">
          {search ? "No matching tours." : "All tours are linked."}
        </p>
      )}

      {linkedTours.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-dark-gray/70">
          <Check className="size-3 text-spring-green" />
          {linkedTours.length} tour{linkedTours.length === 1 ? "" : "s"} linked
        </p>
      )}
    </div>
  );
}
