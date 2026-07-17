"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RichMarkdown from "@/components/markdown/RichMarkdown";

/**
 * Markdown authoring field with a Write / Preview toggle.
 *
 * We use a raw-markdown textarea (not the reviews WYSIWYG) because Incidents &
 * Policies routinely need tables, headings and code blocks — full markdown the
 * WYSIWYG can't round-trip. Preview renders through the same XSS-safe
 * RichMarkdown component used on the detail pages.
 */
export default function MarkdownField({
  value,
  onChange,
  placeholder,
  id,
  rows = 14,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
  rows?: number;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div className="rounded-md border border-border">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "write" | "preview")}>
        <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger value="write" className="text-xs">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              Preview
            </TabsTrigger>
          </TabsList>
          <span className="pr-1 text-xs text-muted-foreground">
            Markdown supported
          </span>
        </div>

        <TabsContent value="write" className="m-0">
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="resize-y rounded-none border-0 font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </TabsContent>

        <TabsContent value="preview" className="m-0">
          <div className="min-h-[8rem] px-4 py-3">
            {value.trim() ? (
              <RichMarkdown>{value}</RichMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
