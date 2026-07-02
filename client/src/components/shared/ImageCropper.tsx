"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
  src: string;
  aspectRatio: number;
  /** blob is null when the crop covers the whole image (nothing was cropped) */
  onCrop: (blob: Blob | null, isFullCrop: boolean) => void;
  isProcessing?: boolean;
  /** Increment to imperatively trigger the crop from the parent */
  triggerApply?: number;
  /** Called whenever the ability to apply changes (crop area exists or not) */
  onReadyChange?: (ready: boolean) => void;
}

function centerAspectCrop(w: number, h: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, w, h),
    w,
    h
  );
}

export default function ImageCropper({
  src,
  aspectRatio,
  onCrop,
  isProcessing = false,
  triggerApply = 0,
  onReadyChange,
}: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [blobSrc, setBlobSrc] = useState<string>("");
  const [loadError, setLoadError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [imageLoaded, setImageLoaded] = useState(false);

  // Notify parent when apply-readiness changes
  useEffect(() => {
    onReadyChange?.(!!completedCrop && imageLoaded);
  }, [completedCrop, imageLoaded, onReadyChange]);

  // Decide what the <img> actually points at. Local uploads (blob:/data:) load
  // directly. Remote URLs are served through a same-origin proxy (/api/image-proxy)
  // which sidesteps the Storage bucket's missing CORS config AND, being same-origin,
  // keeps the crop canvas untainted — so no fetch → blob → object-URL dance (which
  // is race-prone with revoke) is needed.
  useEffect(() => {
    if (!src) return;
    setImageLoaded(false);
    setLoadError(false);
    setErrorDetail("");
    setCompletedCrop(undefined);
    setCrop(undefined);

    if (src.startsWith("blob:") || src.startsWith("data:")) {
      console.log("[ImageCropper] loading local src:", src.slice(0, 40));
      setBlobSrc(src);
      return;
    }

    const proxied = `/api/image-proxy?url=${encodeURIComponent(src)}`;
    console.log("[ImageCropper] loading remote src via proxy:", src);
    setBlobSrc(proxied);
  }, [src]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
      setCrop(centerAspectCrop(w, h, aspectRatio));
      setImageLoaded(true);
    },
    [aspectRatio]
  );

  // Apply crop imperatively when triggerApply increments
  const prevTrigger = useRef(0);
  useEffect(() => {
    if (triggerApply === 0 || triggerApply === prevTrigger.current) return;
    prevTrigger.current = triggerApply;

    const img = imgRef.current;
    if (!img || !completedCrop) return;

    // If the crop region covers the whole image (within a small tolerance) there's
    // no actual cropping — tell the parent so it can reuse the original instead of
    // re-encoding and uploading a duplicate.
    const tolX = Math.max(2, img.width * 0.005);
    const tolY = Math.max(2, img.height * 0.005);
    const isFullCrop =
      completedCrop.x <= tolX &&
      completedCrop.y <= tolY &&
      completedCrop.width >= img.width - tolX &&
      completedCrop.height >= img.height - tolY;
    if (isFullCrop) {
      onCrop(null, true);
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      canvas.width = Math.round(completedCrop.width * scaleX);
      canvas.height = Math.round(completedCrop.height * scaleY);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        completedCrop.x * scaleX, completedCrop.y * scaleY,
        completedCrop.width * scaleX, completedCrop.height * scaleY,
        0, 0, canvas.width, canvas.height
      );
      // toBlob throws a SecurityError if the canvas is tainted (cross-origin image
      // drawn without CORS). The proxy fetch above normally prevents this, but guard
      // the fallback path so a taint can't crash the crop silently.
      canvas.toBlob((blob) => { if (blob) onCrop(blob, false); }, "image/jpeg", 0.92);
    } catch (err) {
      console.error("ImageCropper: failed to render crop", err);
      setLoadError(true);
    }
  }, [triggerApply, completedCrop, onCrop]);

  const ratioLabel =
    aspectRatio === 16 / 9 ? "16:9"
    : aspectRatio === 4 / 3 ? "4:3"
    : aspectRatio === 16 / 10 ? "16:10"
    : `${aspectRatio.toFixed(2)}:1`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl bg-gray-100 p-2">
        {!imageLoaded && !loadError && (
          <div
            className="relative w-full animate-pulse rounded-xl bg-gray-200"
            style={{ aspectRatio: String(aspectRatio), minHeight: "240px" }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-10 rounded-full border-4 border-gray-300 border-t-crimson-red animate-spin" />
            </div>
          </div>
        )}
        {blobSrc && (
          <div className={imageLoaded ? "flex items-center justify-center" : "hidden"}>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspectRatio}
              minWidth={50}
              minHeight={50}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={blobSrc}
                alt="Crop preview"
                onLoad={(e) => {
                  console.log(
                    `[ImageCropper] <img> loaded OK (${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}) from: ${blobSrc.slice(0, 80)}`
                  );
                  onImageLoad(e);
                }}
                onError={() => {
                  console.error(`[ImageCropper] <img> failed to load. src=${src} | img.src=${blobSrc}`);
                  setErrorDetail(`The browser could not load the image. img src = ${blobSrc}`);
                  setLoadError(true);
                }}
                className="max-h-[55vh] max-w-full object-contain"
              />
            </ReactCrop>
          </div>
        )}
        {loadError && (
          <div
            className="flex w-full flex-col items-center justify-center gap-1 rounded-xl bg-gray-200 p-6 text-center"
            style={{ aspectRatio: String(aspectRatio), minHeight: "240px" }}
          >
            <p className="text-sm font-medium text-red-500">Could not load image for cropping.</p>
            <p className="text-xs text-gray-500">Try a different image, or replace it with a new upload.</p>
            {errorDetail && (
              <p className="mt-2 max-w-md break-words text-[11px] leading-snug text-gray-400">
                {errorDetail}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-gray-400">
        Aspect ratio locked to <strong className="text-gray-600">{ratioLabel}</strong>
      </p>
    </div>
  );
}
