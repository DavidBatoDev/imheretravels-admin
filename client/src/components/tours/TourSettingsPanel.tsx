"use client";

import { useState } from "react";
import { useFieldArray } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import {
  X, Settings, Plus, AlertCircle, Camera, Image as ImageIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TourPackage } from "@/types/tours";
import TravelDatesEditor from "./TravelDatesEditor";

const CURRENCY_SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

interface TourSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<any>;
  tour: TourPackage | null;
  coverImageUrl?: string;
  onEditCover: () => void;
  onRemoveCover: () => void;
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
      onChange={e => onChange(e.target.value)}
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

export default function TourSettingsPanel({ open, onClose, form, tour, coverImageUrl, onEditCover, onRemoveCover }: TourSettingsPanelProps) {
  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);

  const [destInput, setDestInput] = useState("");
  const [prevSlugInput, setPrevSlugInput] = useState("");
  const destinations: string[] = w("destinations") ?? [];
  const previousSlugs: { slug: string; redirect: boolean }[] = w("previousSlugs") ?? [];

  // Recover legacy old slugs that predate auto-capture: the original URL pattern
  // was the tour name slugified. If the current slug differs from that and it's
  // not already recorded, offer it as a one-click suggestion.
  const nameSlug = normalizeSlug((w("name") as string) ?? "");
  const currentSlug = (w("slug") as string) ?? "";
  const suggestedPrevSlug =
    nameSlug && nameSlug !== currentSlug && !previousSlugs.some(p => p.slug === nameSlug)
      ? nameSlug
      : null;
  const sym = CURRENCY_SYM[(w("pricing.currency") as string) ?? "GBP"] ?? "£";

  const { fields: reqFields, append: addReq, remove: rmReq } =
    useFieldArray({ control: form.control, name: "details.requirements" as any });

  function addDest(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && destInput.trim()) {
      e.preventDefault();
      const trimmed = destInput.trim().replace(/,$/, "");
      if (trimmed && !destinations.includes(trimmed)) {
        sv("destinations", [...destinations, trimmed]);
      }
      setDestInput("");
    }
  }

  // Normalize free text into a URL slug (kebab-case), matching generateSlug().
  function normalizeSlug(v: string) {
    return v
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function addPrevSlug(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && prevSlugInput.trim()) {
      e.preventDefault();
      const slug = normalizeSlug(prevSlugInput);
      const currentSlug = (w("slug") as string) ?? "";
      if (slug && slug !== currentSlug && !previousSlugs.some(p => p.slug === slug)) {
        sv("previousSlugs", [...previousSlugs, { slug, redirect: true }]);
      }
      setPrevSlugInput("");
    }
  }

  function setPrevSlugRedirect(slug: string, redirect: boolean) {
    sv("previousSlugs", previousSlugs.map(p => (p.slug === slug ? { ...p, redirect } : p)));
  }

  function removePrevSlug(slug: string) {
    sv("previousSlugs", previousSlugs.filter(p => p.slug !== slug));
  }

  const meta = tour?.metadata as any;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
          aria-hidden
        />
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
            <span className="font-sans font-bold text-midnight text-sm">Tour Settings</span>
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

            {/* ── Cover Image ── */}
            <section>
              <SectionHead>Cover Image</SectionHead>
              <div className="group/cover relative aspect-video w-full overflow-hidden rounded-2xl bg-light-grey">
                {coverImageUrl ? (
                  <>
                    <img src={coverImageUrl} alt="Cover" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover/cover:bg-black/30" />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover/cover:opacity-100">
                      <button
                        type="button"
                        onClick={onEditCover}
                        className="grid size-10 place-items-center rounded-full bg-white text-midnight shadow-small transition-colors hover:text-crimson-red"
                        title="Change cover image"
                      >
                        <Camera className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={onRemoveCover}
                        className="grid size-10 place-items-center rounded-full bg-crimson-red text-white shadow-small"
                        title="Remove cover image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onEditCover}
                    className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-dark-gray/50 transition-colors hover:bg-light-grey/70"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs font-medium">Upload cover image</span>
                  </button>
                )}
              </div>
            </section>

            {/* ── Publish ── */}
            <section>
              <SectionHead>Publish</SectionHead>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <FieldLabel>Status</FieldLabel>
                  <Select value={w("status") ?? "draft"} onValueChange={v => sv("status", v)}>
                    <SelectTrigger className="h-9 text-sm border-border w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <span className="whitespace-nowrap text-sm font-body text-midnight">Coming Soon</span>
                  <Switch
                    checked={w("comingSoon") ?? false}
                    onCheckedChange={v => sv("comingSoon", v)}
                    className="data-[state=checked]:bg-vivid-orange"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-light-grey px-3 py-2">
                <div>
                  <span className="block text-sm font-body text-midnight">Hosted Tour</span>
                  <span className="block text-xs text-dark-gray">Shows under “Hosted Tours” instead of the main Tours list.</span>
                </div>
                <Switch
                  checked={w("isHosted") ?? false}
                  onCheckedChange={v => sv("isHosted", v)}
                  className="data-[state=checked]:bg-crimson-red"
                />
              </div>
            </section>

            {/* ── Default Pricing ── */}
            <section>
              <SectionHead>Default Pricing</SectionHead>

              {/* Display doubles as the editor — numbers are directly editable */}
              <div className="rounded-2xl border border-light-grey bg-gradient-to-br from-light-grey/60 to-white p-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-dark-gray">From</label>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="font-display text-xl text-dark-gray">{sym}</span>
                  <input
                    data-field="pricing.original"
                    type="text"
                    inputMode="decimal"
                    value={w("pricing.original") ?? ""}
                    onChange={e => sv("pricing.original", e.target.value)}
                    placeholder="2499"
                    className="w-full rounded-md bg-transparent font-display text-4xl leading-none text-midnight outline-none transition-shadow placeholder:text-dark-gray/30 hover:ring-2 hover:ring-crimson-red/15 focus:ring-2 focus:ring-crimson-red/40"
                  />
                </div>

                <div className="mt-4 flex items-end gap-3 border-t border-light-grey pt-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-gray">Deposit</label>
                    <div className="flex items-baseline gap-1">
                      <span className="font-sans text-sm text-dark-gray">{sym}</span>
                      <input
                        data-field="pricing.deposit"
                        type="text"
                        inputMode="decimal"
                        value={w("pricing.deposit") ?? ""}
                        onChange={e => sv("pricing.deposit", e.target.value)}
                        placeholder="300"
                        className="w-full rounded-md bg-transparent font-sans text-lg font-bold text-midnight outline-none transition-shadow placeholder:text-dark-gray/30 hover:ring-2 hover:ring-crimson-red/15 focus:ring-2 focus:ring-crimson-red/40"
                      />
                    </div>
                  </div>
                  <div data-field="pricing.currency" className="w-32 shrink-0">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-gray">Currency</label>
                    <Select value={w("pricing.currency") ?? "GBP"} onValueChange={v => sv("pricing.currency", v)}>
                      <SelectTrigger className="h-9 text-sm border-border w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GBP">GBP £</SelectItem>
                        <SelectItem value="USD">USD $</SelectItem>
                        <SelectItem value="EUR">EUR €</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Travel Dates ── */}
            <section>
              <SectionHead>Travel Dates</SectionHead>
              <TravelDatesEditor form={form} />
            </section>

            {/* ── Tour Identity ── */}
            <section>
              <SectionHead>Tour Identity</SectionHead>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Destinations</FieldLabel>
                  {destinations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {destinations.map(d => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1 rounded-full bg-light-grey px-2.5 py-0.5 text-xs font-body text-midnight"
                        >
                          {d}
                          <button
                            type="button"
                            onClick={() => sv("destinations", destinations.filter(x => x !== d))}
                            className="text-dark-gray hover:text-crimson-red transition-colors leading-none"
                          >
                            <X className="size-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    value={destInput}
                    onChange={e => setDestInput(e.target.value)}
                    onKeyDown={addDest}
                    placeholder="Type city, press Enter to add"
                    className="w-full border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
                  />
                </div>
              </div>
            </section>

            {/* ── Requirements ── */}
            <section>
              <SectionHead>Requirements</SectionHead>
              <div className="space-y-2">
                {(reqFields as any[]).map((field, i) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-vivid-orange flex-shrink-0" />
                    <input
                      type="text"
                      value={w(`details.requirements.${i}`) ?? ""}
                      onChange={e => sv(`details.requirements.${i}`, e.target.value)}
                      placeholder={`Requirement ${i + 1}`}
                      className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
                    />
                    <button
                      type="button"
                      onClick={() => rmReq(i)}
                      disabled={reqFields.length === 1}
                      className="text-crimson-red disabled:opacity-30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => (addReq as any)("")}
                  className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red"
                >
                  <Plus className="h-4 w-4" /> Add requirement
                </button>
              </div>
            </section>

            {/* ── SEO & URLs ── */}
            <section>
              <SectionHead>SEO & URLs</SectionHead>

              {/* Live preview — browser tab + search result */}
              {(() => {
                const seoTitle = (w("seo.title") as string) || (w("name") as string) || "Tour title";
                const seoDesc = (w("seo.description") as string) || (w("description") as string) || "Your tour description will appear here in search results.";
                const slug = (w("slug") as string) || "tour-slug";
                const directUrl = (w("url") as string) || `https://imheretravels.com/all-tours/${slug}`;
                const cleanUrl = directUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
                const breadcrumb = cleanUrl.split("/").filter(Boolean).join(" › ");
                return (
                  <div className="mb-4 space-y-3 rounded-xl bg-light-grey/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-gray/50">Preview · read-only</p>
                    {/* Chrome window mock */}
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

                    {/* Google result mock */}
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

              {/* Editable fields */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <FieldLabel>SEO Title</FieldLabel>
                    {(() => {
                      const len = ((w("seo.title") as string) ?? "").length;
                      return <span className={`text-[10px] font-medium ${len > 60 ? "text-crimson-red" : "text-dark-gray/50"}`}>{len}/60</span>;
                    })()}
                  </div>
                  <TextInput value={w("seo.title") ?? ""} onChange={v => sv("seo.title", v)} placeholder="Page title for search engines" />
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
                    onChange={e => sv("seo.description", e.target.value)}
                    placeholder="Meta description shown under the title in search results"
                    rows={3}
                    className="w-full resize-y min-h-[64px] border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div data-field="tourCode">
                    <FieldLabel>Tour Code</FieldLabel>
                    <TextInput value={w("tourCode") ?? ""} onChange={v => sv("tourCode", v)} placeholder="e.g. ARW" />
                  </div>
                  <div data-field="slug">
                    <FieldLabel>URL Slug</FieldLabel>
                    <TextInput value={w("slug") ?? ""} onChange={v => sv("slug", v)} placeholder="argentina-wonders" />
                  </div>
                </div>
                <div data-field="url">
                  <FieldLabel>Direct URL</FieldLabel>
                  <TextInput value={w("url") ?? ""} onChange={v => sv("url", v)} placeholder="https://…" type="url" />
                </div>
                <div>
                  <FieldLabel>Booking Slug Override</FieldLabel>
                  <TextInput value={w("bookingSlug") ?? ""} onChange={v => sv("bookingSlug", v)} placeholder="Overrides slug in reservation URLs" />
                </div>

                {/* Previous slugs — old URLs that redirect to this tour. The slug
                    field above is auto-recorded here on rename; toggle redirect
                    off to keep the record but stop redirecting (the old URL 404s). */}
                <div>
                  <FieldLabel>Previous Slugs (redirect to this tour)</FieldLabel>
                  {previousSlugs.length > 0 && (
                    <div className="mb-2 space-y-1.5">
                      {previousSlugs.map(p => (
                        <div
                          key={p.slug}
                          className={`flex items-center gap-2 rounded-md border border-light-grey px-2.5 py-1.5 ${p.redirect ? "" : "opacity-60"}`}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-midnight">/tours/{p.slug}</span>
                          <span className="shrink-0 text-[10px] font-medium text-dark-gray/70">
                            {p.redirect ? "redirecting" : "off · 404s"}
                          </span>
                          <Switch
                            checked={p.redirect}
                            onCheckedChange={v => setPrevSlugRedirect(p.slug, v)}
                            className="shrink-0 data-[state=checked]:bg-crimson-red"
                          />
                          <button
                            type="button"
                            onClick={() => removePrevSlug(p.slug)}
                            className="shrink-0 text-dark-gray transition-colors hover:text-crimson-red"
                            title="Remove"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {suggestedPrevSlug && (
                    <button
                      type="button"
                      onClick={() => sv("previousSlugs", [...previousSlugs, { slug: suggestedPrevSlug, redirect: true }])}
                      className="mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-crimson-red/40 bg-crimson-red/5 px-2.5 py-1.5 text-left transition-colors hover:bg-crimson-red/10"
                      title="This tour's name suggests an earlier URL slug"
                    >
                      <Plus className="size-3.5 shrink-0 text-crimson-red" />
                      <span className="min-w-0 flex-1 truncate text-xs text-midnight">
                        Add likely old slug <span className="font-mono">{suggestedPrevSlug}</span>
                      </span>
                    </button>
                  )}
                  <input
                    type="text"
                    value={prevSlugInput}
                    onChange={e => setPrevSlugInput(e.target.value)}
                    onKeyDown={addPrevSlug}
                    placeholder="Add an old slug, press Enter (e.g. tanzania-exploration-danielle-erin)"
                    className="w-full border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
                  />
                </div>
              </div>
            </section>

            {/* ── Links ── */}
            <section>
              <SectionHead>Links</SectionHead>
              <div className="space-y-3">
                {([
                  ["Brochure", "brochureLink"],
                  ["Pre-Departure Pack", "preDeparturePack"],
                ] as [string, string][]).map(([label, key]) => (
                  <div key={key} data-field={key}>
                    <FieldLabel>{label}</FieldLabel>
                    <TextInput
                      value={w(key) ?? ""}
                      onChange={v => sv(key, v)}
                      placeholder="https://…"
                      type="url"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* ── Map ── */}
            <section>
              <SectionHead>Map</SectionHead>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Map Image URL</FieldLabel>
                  <TextInput
                    value={w("details.map.image") ?? ""}
                    onChange={v => sv("details.map.image", v)}
                    placeholder="https://…"
                    type="url"
                  />
                </div>
                <div>
                  <FieldLabel>Google Maps Embed URL</FieldLabel>
                  <TextInput
                    value={w("details.map.embedUrl") ?? ""}
                    onChange={v => sv("details.map.embedUrl", v)}
                    placeholder="https://www.google.com/maps/embed?…"
                    type="url"
                  />
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
                  ["Bookings", meta?.bookingsCount != null ? String(meta.bookingsCount) : "—"],
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
