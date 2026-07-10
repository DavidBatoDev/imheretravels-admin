"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import useFocusTrap from "@/components/reviews/public/useFocusTrap";
import type { ReviewVideo } from "@/types/reviews";

type MediaItem =
  | { type: "image"; src: string }
  | { type: "video"; src: string; poster?: string };

const PREVIEW_COUNT = 3; // thumbnails shown in the table before the "+N" tile

/**
 * Compact media strip for a review table row: the first three assets as
 * thumbnails, with a "+N" tile when there are more. Clicking any tile opens a
 * gallery (arrows / keyboard / counter) rather than navigating away.
 *
 * Videos come first, matching the public card's ordering (`ReviewPhotos`), so a
 * review's clip is the first thing a moderator sees.
 */
export default function ReviewMediaStrip({
  photos = [],
  videos = [],
  authorAlt,
  onRemovePhoto,
  onRemoveVideo,
  disabled = false,
}: {
  photos?: string[];
  videos?: ReviewVideo[];
  authorAlt: string;
  onRemovePhoto?: (url: string) => void;
  onRemoveVideo?: (src: string) => void;
  disabled?: boolean;
}) {
  const media: MediaItem[] = [
    ...videos.map((v) => ({ type: "video" as const, src: v.src, poster: v.poster })),
    ...photos.map((src) => ({ type: "image" as const, src })),
  ];

  const [active, setActive] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  useFocusTrap({ active: active !== null, containerRef: viewerRef });
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
      if (e.key === "ArrowRight") setActive((i) => (i === null ? i : (i + 1) % media.length));
      if (e.key === "ArrowLeft")
        setActive((i) => (i === null ? i : (i - 1 + media.length) % media.length));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active, media.length]);

  if (media.length === 0) return null;

  const shown = media.slice(0, PREVIEW_COUNT);
  const overflow = media.length - shown.length;
  const current = active === null ? null : media[active];
  const go = (delta: number) =>
    setActive((i) => (i === null ? i : (i + delta + media.length) % media.length));

  const removeFor = (item: MediaItem) =>
    item.type === "video"
      ? onRemoveVideo && (() => onRemoveVideo(item.src))
      : onRemovePhoto && (() => onRemovePhoto(item.src));

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {shown.map((item, i) => {
          const isLast = i === shown.length - 1;
          const remove = removeFor(item);
          return (
            <span key={item.src} className="group relative">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={
                  item.type === "video"
                    ? `Play video from ${authorAlt}`
                    : `View photo ${i + 1} from ${authorAlt}`
                }
                className="relative block h-14 w-14 overflow-hidden rounded ring-1 ring-border"
              >
                <Thumb item={item} />
                {item.type === "video" && !(isLast && overflow > 0) && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                  </span>
                )}
                {isLast && overflow > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-midnight/60 text-sm font-bold text-white">
                    +{overflow}
                  </span>
                )}
              </button>
              {/* The "+N" tile stands for several assets, so it gets no remove control. */}
              {remove && !(isLast && overflow > 0) && (
                <button
                  type="button"
                  aria-label={item.type === "video" ? "Remove video" : "Remove photo"}
                  onClick={remove}
                  disabled={disabled}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-1 shadow ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {mounted &&
        current &&
        createPortal(
          <div
            ref={viewerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Trip media from ${authorAlt}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 p-4"
            onClick={() => setActive(null)}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={() => setActive(null)}
            >
              <X className="h-6 w-6" />
            </button>
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:left-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(-1);
                  }}
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 md:right-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(1);
                  }}
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
                <span className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                  {(active ?? 0) + 1} / {media.length}
                </span>
              </>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              {current.type === "video" ? (
                <video
                  src={current.src}
                  poster={current.poster}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[85vh] max-w-[92vw] rounded-md"
                />
              ) : (
                <img
                  src={current.src}
                  alt={`Trip photo from ${authorAlt}`}
                  className="max-h-[85vh] max-w-[92vw] rounded-md object-contain"
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Uploads carry no poster, so fall back to the video's own first frame. */
function Thumb({ item }: { item: MediaItem }) {
  if (item.type === "image") {
    return <img src={item.src} alt="" className="h-full w-full object-cover transition group-hover:opacity-80" />;
  }
  if (item.poster) {
    return <img src={item.poster} alt="" className="h-full w-full object-cover transition group-hover:opacity-80" />;
  }
  return (
    <video
      src={item.src}
      muted
      playsInline
      preload="metadata"
      className="h-full w-full bg-midnight object-cover transition group-hover:opacity-80"
    />
  );
}
