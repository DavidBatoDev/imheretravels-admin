"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchAttachmentObjectUrl } from "@/lib/staff-fetch";

/**
 * Image preview of a Gmail attachment. The attachment API needs a staff
 * token, which a plain `<img src>` can't send, so the image is fetched with
 * the token and shown from a `blob:` URL that is revoked on unmount.
 */
export function AttachmentThumbnail({
  messageId,
  attachmentId,
  alt,
  className,
  fallback,
}: {
  messageId: string;
  attachmentId: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setSrc(null);
    setFailed(false);

    fetchAttachmentObjectUrl(messageId, attachmentId)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        url = objectUrl;
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [messageId, attachmentId]);

  if (failed) return <>{fallback}</>;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
