"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

/**
 * Renders HTML authored by the Tiptap editor, sanitized with DOMPurify.
 * Paired with RichTextEditor (incident Summary / Actions-needed fields).
 */
export default function RichHtml({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  const clean = useMemo(() => DOMPurify.sanitize(html || ""), [html]);

  return (
    <div
      className={[
        "text-sm leading-relaxed text-foreground",
        "[&_p]:my-2 [&_p:first-child]:mt-0",
        "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-crimson-red",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:mt-1",
        "[&_a]:text-crimson-red [&_a]:underline [&_a]:break-words",
        "[&_strong]:font-semibold",
        "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:first:mt-0",
        "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-crimson-red",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-crimson-red/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2",
        // Tables — display:block so wide tables scroll instead of overflowing.
        "[&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:align-top",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
