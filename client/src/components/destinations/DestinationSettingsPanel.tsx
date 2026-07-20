"use client";

import type { UseFormReturn } from "react-hook-form";
import { X, Settings, Camera, Image as ImageIcon, Sparkles } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Destination, DESTINATION_REGIONS } from "@/types/destinations";
import LinkedToursEditor from "./LinkedToursEditor";
import { pendingSeoPatch } from "./seo-template";

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

/** Picker targets handled by the parent form. */
export type DestinationPickerField = "hero";

interface DestinationSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<any>;
  destination: Destination | null;
  /** Opens the parent-owned ImagePickerModal for the given field */
  onPickImage: (field: DestinationPickerField, initialUrl?: string) => void;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="h-4 w-1 shrink-0 rounded-full bg-crimson-red" aria-hidden />
      <span className="text-xs font-bold uppercase tracking-wider text-midnight">{children}</span>
      <span className="h-0.5 flex-1 rounded-full bg-grey/40" aria-hidden />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-body text-dark-gray mb-0.5">{children}</label>;
}

function TextInput({
  value, onChange, placeholder, type = "text",
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
    />
  );
}

function formatMeta(ts: any): string {
  if (!ts) return "—";
  try {
    const d = typeof ts.toDate === "function" ? ts.toDate()
      : ts.seconds ? new Date(ts.seconds * 1000)
      : new Date(ts);
    return isNaN(d.getTime()) ? "—"
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

export default function DestinationSettingsPanel({
  open, onClose, form, destination, onPickImage,
}: DestinationSettingsPanelProps) {
  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);

  const heroImage = (w("heroImage") as string | null) || "";
  const meta = destination?.metadata as any;

  // Suggested SEO/URL from the destination name (title always, slug/description
  // only when empty or still auto — never clobbers hand-written copy or a live URL).
  const seoPatch = pendingSeoPatch({
    name: w("name") as string,
    slug: w("slug") as string,
    seo: w("seo") as { title?: string; description?: string } | undefined,
  });
  const applySeoAutofill = () => {
    const patch = pendingSeoPatch({
      name: form.getValues("name") as string,
      slug: form.getValues("slug") as string,
      seo: form.getValues("seo") as { title?: string; description?: string } | undefined,
    });
    if (patch.title !== undefined) sv("seo.title", patch.title);
    if (patch.description !== undefined) sv("seo.description", patch.description);
    if (patch.slug !== undefined) sv("slug", patch.slug);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[560px] max-w-[92vw] bg-white shadow-2xl z-50 flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-grey bg-white shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-crimson-red" />
            <span className="font-sans font-bold text-midnight text-sm">Destination Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-dark-gray hover:bg-light-grey hover:text-midnight transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="px-6 py-5 space-y-6">

            {/* ── Hero Image ── */}
            <section>
              <SectionHead>Hero Image</SectionHead>
              <div className="group/hero relative aspect-video w-full overflow-hidden rounded-2xl bg-light-grey">
                {heroImage ? (
                  <>
                    <img src={resolveImg(heroImage)} alt="Hero" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover/hero:bg-black/30" />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover/hero:opacity-100">
                      <button
                        type="button"
                        onClick={() => onPickImage("hero", resolveImg(heroImage) || undefined)}
                        className="grid size-10 place-items-center rounded-full bg-white text-midnight shadow-small transition-colors hover:text-crimson-red"
                        title="Change hero image"
                      >
                        <Camera className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => sv("heroImage", "")}
                        className="grid size-10 place-items-center rounded-full bg-crimson-red text-white shadow-small"
                        title="Remove hero image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPickImage("hero")}
                    className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-dark-gray/50 transition-colors hover:bg-light-grey/70"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs font-medium">Upload hero image</span>
                  </button>
                )}
              </div>

              <div className="mt-3">
                <FieldLabel>Hero Alt Text</FieldLabel>
                <TextInput
                  value={w("heroImageAlt") ?? ""}
                  onChange={(v) => sv("heroImageAlt", v)}
                  placeholder="Describe the hero image"
                />
              </div>
            </section>

            {/* ── Region ── */}
            <section>
              <SectionHead>Region</SectionHead>
              <FieldLabel>Region / Continent</FieldLabel>
              {(() => {
                const current = (w("region") as string) || "";
                // Keep any existing off-list value selectable so it never blanks out.
                const options = DESTINATION_REGIONS.includes(current as (typeof DESTINATION_REGIONS)[number]) || !current
                  ? [...DESTINATION_REGIONS]
                  : [current, ...DESTINATION_REGIONS];
                return (
                  <Select value={current || undefined} onValueChange={(v) => sv("region", v)}>
                    <SelectTrigger className="h-9 text-sm border-border w-full">
                      <SelectValue placeholder="Select a region" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </section>

            {/* ── Publish ── */}
            <section>
              <SectionHead>Publish</SectionHead>
              <FieldLabel>Status</FieldLabel>
              <Select value={w("status") ?? "draft"} onValueChange={(v) => sv("status", v)}>
                <SelectTrigger className="h-9 text-sm border-border w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </section>

            {/* ── Linked Tours ── */}
            <section>
              <SectionHead>Linked Tours</SectionHead>
              <p className="mb-3 text-[11px] text-dark-gray/70">
                Tours linked here are grouped under this destination on the site.
              </p>
              <LinkedToursEditor form={form} />
            </section>

            {/* ── SEO & URL ── */}
            <section>
              <SectionHead>SEO &amp; URL</SectionHead>

              {/* Auto-fill prompt (from the destination name) */}
              {Object.keys(seoPatch).length > 0 && (
                <div className="mb-4 rounded-xl border border-crimson-red/30 bg-crimson-red/5 p-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-crimson-red" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-midnight">Auto-fill from name</p>
                      <p className="text-[11px] leading-snug text-dark-gray">
                        Set{" "}
                        {[
                          seoPatch.title !== undefined && "title",
                          seoPatch.description !== undefined && "description",
                          seoPatch.slug !== undefined && "URL slug",
                        ]
                          .filter(Boolean)
                          .join(", ")}{" "}
                        from &ldquo;{(w("name") as string) || "the destination name"}&rdquo;. You can still edit after.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={applySeoAutofill}
                      className="shrink-0 rounded-full bg-crimson-red px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-light-red"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              {/* Live preview */}
              {(() => {
                const seoTitle = (w("seo.title") as string) || (w("name") as string) || "Destination";
                const seoDesc = (w("seo.description") as string) || ((w("description") as string[]) ?? [])[0] || "This destination description will appear in search results.";
                const slug = (w("slug") as string) || "destination-slug";
                const cleanUrl = `imheretravels.com/all-destinations/${slug}`;
                const breadcrumb = cleanUrl.split("/").filter(Boolean).join(" › ");
                return (
                  <div className="mb-4 space-y-3 rounded-xl bg-light-grey/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-gray/50">Preview · read-only</p>
                    <div className="overflow-hidden rounded-xl border border-[#dadce0] shadow-xsmall">
                      <div className="flex items-end bg-[#dee1e6] px-2 pt-2">
                        <div className="flex min-w-0 max-w-[88%] items-center gap-2 rounded-t-lg bg-white px-3 py-1.5">
                          <img src="/favicon.svg" alt="" className="size-4 shrink-0" />
                          <span className="truncate text-xs font-medium text-midnight">{seoTitle}</span>
                          <X className="size-3 shrink-0 text-dark-gray/50" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-white px-3 py-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-light-grey px-3 py-1">
                          <span className="text-[10px] text-dark-gray/50">🔒</span>
                          <span className="truncate text-xs text-dark-gray">{cleanUrl}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-light-grey bg-white p-3">
                      <div className="flex items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-light-grey bg-white">
                          <img src="/favicon.svg" alt="" className="size-3.5" />
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-xs font-medium text-midnight">I&apos;m Here Travels</p>
                          <p className="truncate text-[11px] text-dark-gray/70">{breadcrumb}</p>
                        </div>
                      </div>
                      <p className="mt-2 truncate text-base leading-snug text-[#1a0dab]">{seoTitle}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-dark-gray">{seoDesc}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <FieldLabel>SEO Title</FieldLabel>
                    {(() => {
                      const len = ((w("seo.title") as string) ?? "").length;
                      return <span className={`text-[10px] font-medium ${len > 60 ? "text-crimson-red" : "text-dark-gray/50"}`}>{len}/60</span>;
                    })()}
                  </div>
                  <TextInput value={w("seo.title") ?? ""} onChange={(v) => sv("seo.title", v)} placeholder="Page title for search engines" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <FieldLabel>SEO Description</FieldLabel>
                    {(() => {
                      const len = ((w("seo.description") as string) ?? "").length;
                      return <span className={`text-[10px] font-medium ${len > 160 ? "text-crimson-red" : "text-dark-gray/50"}`}>{len}/160</span>;
                    })()}
                  </div>
                  <textarea
                    value={w("seo.description") ?? ""}
                    onChange={(e) => sv("seo.description", e.target.value)}
                    placeholder="Meta description shown under the title in search results"
                    rows={3}
                    className="w-full resize-y min-h-[64px] border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
                  />
                </div>
                <div>
                  <FieldLabel>URL Slug</FieldLabel>
                  <TextInput value={w("slug") ?? ""} onChange={(v) => sv("slug", v)} placeholder="philippines" />
                </div>
              </div>
            </section>

            {/* ── Metadata ── */}
            <section className="pb-4">
              <SectionHead>Metadata</SectionHead>
              <dl className="space-y-2">
                {([
                  ["Created", formatMeta(meta?.createdAt)],
                  ["Updated", formatMeta(meta?.updatedAt)],
                  ["Created By", meta?.createdBy ?? "—"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-xs font-body text-dark-gray shrink-0">{label}</dt>
                    <dd className="text-xs font-body text-midnight truncate text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

          </div>
        </div>
      </div>
    </>
  );
}
