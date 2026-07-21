"use client";

import { useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Search, X, Plus, Check, Loader2, MapPin } from "lucide-react";
import { getAllTours } from "@/services/tours-service";
import type { TourPackage } from "@/types/tours";

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

interface AttachedToursEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Searchable multi-select for attaching existing tourPackages to a resident
 * host. Writes the selected doc IDs into the `attachedTourIds` form field.
 *
 * Only tours flagged `isHosted` are attachable — normal tours are never
 * offered here, since a resident host by definition hosts hosted tours.
 */
export default function AttachedToursEditor({ form }: AttachedToursEditorProps) {
  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);

  const [tours, setTours] = useState<TourPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const attachedIds: string[] = w("attachedTourIds") ?? [];

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

  const tourById = useMemo(() => {
    const map: Record<string, TourPackage> = {};
    tours.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [tours]);

  const attachedTours = attachedIds
    .map((id) => tourById[id])
    .filter(Boolean) as TourPackage[];

  // Only hosted tours are offered. Already-attached tours are still resolved
  // from the full list above so legacy/normal attachments stay removable.
  const availableTours = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tours
      .filter((t) => t.isHosted === true)
      .filter((t) => !attachedIds.includes(t.id))
      .filter((t) =>
        term
          ? t.name?.toLowerCase().includes(term) ||
            t.slug?.toLowerCase().includes(term) ||
            t.tourCode?.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [tours, attachedIds, search]);

  const attach = (id: string) => {
    if (!attachedIds.includes(id)) sv("attachedTourIds", [...attachedIds, id]);
  };
  const detach = (id: string) => {
    sv(
      "attachedTourIds",
      attachedIds.filter((x) => x !== id),
    );
  };

  return (
    <div className="space-y-3">
      {/* Selected tours */}
      {attachedTours.length > 0 ? (
        <div className="space-y-2">
          {attachedTours.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-light-grey bg-white p-2 shadow-xsmall"
            >
              <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-light-grey">
                {t.media?.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
                <p className="truncate text-xs text-dark-gray">
                  /{t.slug}
                  {t.isHosted !== true && (
                    <span className="ml-1 text-crimson-red">· not a hosted tour</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => detach(t.id)}
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
          No tours attached yet. Search below to attach hosted tours.
        </p>
      )}

      {/* Search + available list */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dark-gray/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search hosted tours to attach…"
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
              key={t.id}
              type="button"
              onClick={() => attach(t.id)}
              className="group flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-light-grey"
            >
              <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-light-grey">
                {t.media?.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
          {search
            ? "No matching hosted tours."
            : "No hosted tours available to attach."}
        </p>
      )}

      {attachedTours.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-dark-gray/70">
          <Check className="size-3 text-spring-green" />
          {attachedTours.length} tour{attachedTours.length === 1 ? "" : "s"} attached
        </p>
      )}
    </div>
  );
}
