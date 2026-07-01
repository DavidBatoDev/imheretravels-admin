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
  const [imageLoaded, setImageLoaded] = useState(false);
  // False when we had to fall back to the raw cross-origin URL: the canvas would
  // be tainted, so it can't be exported with toBlob(). Cropping is disabled and the
  // user is told to keep the original instead.
  const [exportable, setExportable] = useState(true);

  // Notify parent when apply-readiness changes. A tainted (non-exportable) image
  // can't be cropped, so it's never "ready" for the Apply Crop action.
  useEffect(() => {
    onReadyChange?.(!!completedCrop && imageLoaded && exportable);
  }, [completedCrop, imageLoaded, exportable, onReadyChange]);

  // Convert remote URL → local blob URL to avoid canvas CORS taint
  useEffect(() => {
    if (!src) return;
    setImageLoaded(false);
    setBlobSrc("");
    setExportable(true);
    let objectUrl = "";

    if (src.startsWith("blob:")) {
      setBlobSrc(src);
      return;
    }

    fetch(src)
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBlobSrc(objectUrl); setLoadError(false); setExportable(true); })
      // Fetch blocked (CORS/403, e.g. hotlink-protected CDN images). Show the image
      // for preview, but mark it non-exportable so cropping doesn't taint-crash.
      .catch(() => { setBlobSrc(src); setLoadError(false); setExportable(false); });

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
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

    // The image was loaded cross-origin (fetch fell back to the raw URL), so the
    // canvas is tainted and toBlob() would throw. Don't attempt the export — the
    // inline hint already tells the user to keep the original. (Apply Crop is also
    // disabled in this state, so this is just belt-and-braces.)
    if (!exportable) return;

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

    const canvas = document.createElement("canvas");
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    canvas.width = Math.round(completedCrop.width * scaleX);
    canvas.height = Math.round(completedCrop.height * scaleY);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Safety net: any taint/security failure here must not bubble up and crash the
    // whole app (React would unmount into the client-error screen). Surface it inline.
    try {
      ctx.drawImage(
        img,
        completedCrop.x * scaleX, completedCrop.y * scaleY,
        completedCrop.width * scaleX, completedCrop.height * scaleY,
        0, 0, canvas.width, canvas.height
      );
      canvas.toBlob((blob) => { if (blob) onCrop(blob, false); }, "image/jpeg", 0.92);
    } catch {
      setExportable(false);
      setLoadError(true);
    }
  }, [triggerApply, completedCrop, exportable, onCrop]);

  const ratioLabel =
    aspectRatio === 16 / 9 ? "16:9"
    : aspectRatio === 4 / 3 ? "4:3"
    : aspectRatio === 16 / 10 ? "16:10"
    : `${aspectRatio.toFixed(2)}:1`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl bg-gray-100 p-2">
        {!imageLoaded && (
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
                onLoad={onImageLoad}
                onError={() => setLoadError(true)}
                className="max-h-[55vh] max-w-full object-contain"
              />
            </ReactCrop>
          </div>
        )}
        {loadError && (
          <p className="mt-2 text-center text-xs text-red-500">Could not load image for cropping.</p>
        )}
        {!exportable && !loadError && (
          <p className="mt-2 text-center text-xs text-amber-600">
            This image is hosted externally and can&apos;t be cropped here. Use{" "}
            <strong>“Use original (no crop)”</strong> to keep it as-is.
          </p>
        )}
      </div>
      <p className="text-center text-xs text-gray-400">
        Aspect ratio locked to <strong className="text-gray-600">{ratioLabel}</strong>
      </p>
    </div>
  );
}
