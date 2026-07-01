"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
  Plus, X, Camera, ChevronUp, ChevronDown, Image as ImageIcon,
  Film, Columns3, LayoutGrid,
} from "lucide-react";
import ImagePickerModal from "@/components/shared/ImagePickerModal";
import type { GalleryMediaItem } from "@/types/resident-hosts";

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

const MAX_COLUMNS = 4;

type Slides = GalleryMediaItem[][][];

interface GallerySlidesEditorProps {
  form: UseFormReturn<any>;
  /** Folder used as the upload target / browse start for the image picker */
  storageFolder?: string;
}

const cloneSlides = (s: Slides): Slides =>
  s.map((slide) => slide.map((col) => col.map((item) => ({ ...item }))));

const emptyItem = (seq: number): GalleryMediaItem => ({
  seq,
  type: "photo",
  size: "tall",
  src: "",
  alt: "Group trip moment",
});

/**
 * Full masonry editor for `gallerySlides` (slides → up to 4 columns → ordered
 * items), matching the www "Real Moments from Our Trips" layout. Photo items
 * pick their image through the shared ImagePickerModal; videos use a URL.
 */
export default function GallerySlidesEditor({ form, storageFolder }: GallerySlidesEditorProps) {
  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);

  const slides: Slides = w("gallerySlides") ?? [];

  // Media picker targets a specific item by its [slide, column, item] path.
  const [picker, setPicker] = useState<{ si: number; ci: number; ii: number; size: "tall" | "short"; initialUrl?: string; initialTab: "images" | "videos" } | null>(null);

  // Open the media picker for an item, defaulting to the tab matching its current type.
  const openMediaPicker = (si: number, ci: number, ii: number, item: GalleryMediaItem) => {
    if (item.type === "video") {
      setPicker({ si, ci, ii, size: item.size, initialTab: "videos" });
    } else {
      setPicker({ si, ci, ii, size: item.size, initialUrl: item.src ? resolveImg(item.src) : undefined, initialTab: "images" });
    }
  };

  const commit = (next: Slides) => sv("gallerySlides", next);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const addSlide = () => {
    const next = cloneSlides(slides);
    next.push([[emptyItem(1)]]);
    commit(next);
  };
  const removeSlide = (si: number) => {
    const next = cloneSlides(slides);
    next.splice(si, 1);
    commit(next);
  };
  const addColumn = (si: number) => {
    const next = cloneSlides(slides);
    if (next[si].length >= MAX_COLUMNS) return;
    const seq = next[si].reduce((m, col) => m + col.length, 0) + 1;
    next[si].push([emptyItem(seq)]);
    commit(next);
  };
  const removeColumn = (si: number, ci: number) => {
    const next = cloneSlides(slides);
    next[si].splice(ci, 1);
    commit(next);
  };
  const addItem = (si: number, ci: number) => {
    const next = cloneSlides(slides);
    const seq = next[si].reduce((m, col) => m + col.length, 0) + 1;
    next[si][ci].push(emptyItem(seq));
    commit(next);
  };
  const removeItem = (si: number, ci: number, ii: number) => {
    const next = cloneSlides(slides);
    next[si][ci].splice(ii, 1);
    commit(next);
  };
  const moveItem = (si: number, ci: number, ii: number, dir: -1 | 1) => {
    const next = cloneSlides(slides);
    const col = next[si][ci];
    const j = ii + dir;
    if (j < 0 || j >= col.length) return;
    [col[ii], col[j]] = [col[j], col[ii]];
    commit(next);
  };
  const patchItem = (si: number, ci: number, ii: number, patch: Partial<GalleryMediaItem>) => {
    const next = cloneSlides(slides);
    next[si][ci][ii] = { ...next[si][ci][ii], ...patch };
    commit(next);
  };

  const handlePickerConfirm = (urls: string[], kind?: "image" | "video") => {
    if (picker && urls[0]) {
      patchItem(picker.si, picker.ci, picker.ii, {
        src: urls[0],
        type: kind === "video" ? "video" : "photo",
      });
    }
    setPicker(null);
  };

  return (
    <div className="space-y-4">
      {slides.length === 0 && (
        <p className="rounded-xl border border-dashed border-light-grey px-3 py-6 text-center text-xs text-dark-gray/60">
          No gallery slides yet. Each slide is one masonry grid of up to 4 columns.
        </p>
      )}

      {slides.map((slide, si) => (
        <div key={si} className="rounded-2xl border border-light-grey bg-white p-3 shadow-xsmall">
          {/* Slide header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-crimson-red text-xs font-bold text-white">
                {si + 1}
              </span>
              <span className="text-sm font-bold text-midnight">Slide {si + 1}</span>
              <span className="text-[11px] text-dark-gray/60">
                {slide.length}/{MAX_COLUMNS} columns
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeSlide(si)}
              className="grid size-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red"
              title="Remove slide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Columns */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {slide.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-2 rounded-xl bg-light-grey/40 p-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-dark-gray">
                    <Columns3 className="h-3 w-3" /> Col {ci + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeColumn(si, ci)}
                    className="grid size-5 place-items-center rounded text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red"
                    title="Remove column"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {col.map((item, ii) => (
                  <div key={ii} className="rounded-lg border border-light-grey bg-white p-2 shadow-xsmall">
                    {/* Media preview / picker */}
                    <div
                      className={`relative w-full overflow-hidden rounded-md bg-light-grey ${
                        item.size === "tall" ? "aspect-[308/397]" : "aspect-[308/199]"
                      }`}
                    >
                      {item.type === "video" && item.src ? (
                        <>
                          <video src={resolveImg(item.src)} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => openMediaPicker(si, ci, ii, item)}
                            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/30 hover:opacity-100"
                          >
                            <Camera className="h-5 w-5 text-white drop-shadow" />
                          </button>
                        </>
                      ) : item.type !== "video" && item.src ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveImg(item.src)}
                            alt={item.alt ?? ""}
                            className="h-full w-full object-cover"
                            style={item.objectPosition ? { objectPosition: item.objectPosition } : undefined}
                          />
                          <button
                            type="button"
                            onClick={() => openMediaPicker(si, ci, ii, item)}
                            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/30 hover:opacity-100"
                          >
                            <Camera className="h-5 w-5 text-white drop-shadow" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openMediaPicker(si, ci, ii, item)}
                          className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 transition-colors hover:bg-light-grey/70"
                        >
                          <ImageIcon className="h-5 w-5" />
                          <span className="text-[10px]">Choose from storage</span>
                        </button>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openMediaPicker(si, ci, ii, item)}
                          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-midnight transition-colors hover:border-crimson-red/40 hover:text-crimson-red"
                        >
                          {item.type === "video" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                          {item.src ? "Change media" : "Choose from storage"}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchItem(si, ci, ii, { size: item.size === "tall" ? "short" : "tall" })}
                          className="grid h-7 w-9 shrink-0 place-items-center rounded-md border border-border text-[10px] font-medium text-midnight transition-colors hover:border-crimson-red/40 hover:text-crimson-red"
                          title="Toggle tall / short"
                        >
                          {item.size === "tall" ? "Tall" : "Short"}
                        </button>
                      </div>

                      {item.type !== "placeholder" && (
                        <input
                          type="text"
                          value={item.alt ?? ""}
                          onChange={(e) => patchItem(si, ci, ii, { alt: e.target.value })}
                          placeholder="Alt text"
                          className="w-full rounded-md border border-border px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-crimson-red/40"
                        />
                      )}

                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.seq ?? ""}
                          onChange={(e) => {
                            if (!/^\d*$/.test(e.target.value)) return;
                            patchItem(si, ci, ii, { seq: e.target.value === "" ? 0 : parseInt(e.target.value, 10) });
                          }}
                          placeholder="seq"
                          title="Sequence — controls the door-slide animation"
                          className="h-7 w-12 rounded-md border border-border px-1.5 text-center text-[11px] outline-none focus:ring-2 focus:ring-crimson-red/40"
                        />
                        <div className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveItem(si, ci, ii, -1)}
                            disabled={ii === 0}
                            className="grid size-6 place-items-center rounded text-dark-gray transition-colors hover:bg-light-grey disabled:opacity-30"
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(si, ci, ii, 1)}
                            disabled={ii === col.length - 1}
                            className="grid size-6 place-items-center rounded text-dark-gray transition-colors hover:bg-light-grey disabled:opacity-30"
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(si, ci, ii)}
                            className="grid size-6 place-items-center rounded text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red"
                            title="Remove item"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addItem(si, ci)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-crimson-red/40 py-1.5 text-[11px] font-medium text-crimson-red transition-colors hover:bg-crimson-red/5"
                >
                  <Plus className="h-3 w-3" /> Item
                </button>
              </div>
            ))}

            {slide.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={() => addColumn(si)}
                className="flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-dark-gray/20 text-xs font-medium text-dark-gray/60 transition-colors hover:border-crimson-red/40 hover:text-crimson-red"
              >
                <Plus className="h-4 w-4" /> Column
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addSlide}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-crimson-red/40 py-3 text-sm font-semibold text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5"
      >
        <LayoutGrid className="h-4 w-4" /> Add Gallery Slide
      </button>

      {picker && (
        <ImagePickerModal
          open
          enableVideos
          initialTab={picker.initialTab}
          onClose={() => setPicker(null)}
          onConfirm={handlePickerConfirm}
          storageFolder={storageFolder ?? "images/resident-hosts"}
          aspectRatio={picker.size === "tall" ? 308 / 397 : 308 / 199}
          initialImageUrl={picker.initialUrl}
          title="Select Gallery Media"
        />
      )}
    </div>
  );
}
