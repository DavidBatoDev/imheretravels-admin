"use client";

import type { UseFormReturn } from "react-hook-form";
import {
  X, Settings, Camera, Image as ImageIcon, User as UserIcon, Instagram,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ResidentHost } from "@/types/resident-hosts";
import AttachedToursEditor from "./AttachedToursEditor";

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

/** Picker targets handled by the parent form. */
export type HostPickerField = "hero" | "profile" | `heroPanel-${number}`;

interface ResidentHostSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<any>;
  host: ResidentHost | null;
  /** Opens the parent-owned ImagePickerModal for the given field */
  onPickImage: (field: HostPickerField, initialUrl?: string) => void;
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

export default function ResidentHostSettingsPanel({
  open, onClose, form, host, onPickImage,
}: ResidentHostSettingsPanelProps) {
  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);

  const heroImage = (w("heroImage") as string | null) || "";
  const heroImages: string[] = w("heroImages") ?? [];
  const profileImage = (w("profileImage") as string) || "";
  const meta = host?.metadata as any;

  const setHeroPanel = (i: number, value: string | null) => {
    const next = [...(heroImages ?? [])];
    while (next.length < 3) next.push("");
    next[i] = value ?? "";
    sv("heroImages", next);
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
            <span className="font-sans font-bold text-midnight text-sm">Host Settings</span>
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
                        onClick={() => sv("heroImage", null)}
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

              {/* Split hero (3 images) */}
              <p className="mt-3 mb-1.5 text-[11px] text-dark-gray/70">
                Split hero — set all 3 to use a tri-panel banner (overrides the single hero on the site).
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => {
                  const img = heroImages[i] || "";
                  return (
                    <div key={i} className="group/panel relative aspect-[3/4] overflow-hidden rounded-xl bg-light-grey">
                      {img ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={resolveImg(img)} alt={`Panel ${i + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 opacity-0 transition-all group-hover/panel:bg-black/30 group-hover/panel:opacity-100">
                            <button
                              type="button"
                              onClick={() => onPickImage(`heroPanel-${i}`, resolveImg(img) || undefined)}
                              className="grid size-7 place-items-center rounded-full bg-white text-midnight shadow-small hover:text-crimson-red"
                              title="Change"
                            >
                              <Camera className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setHeroPanel(i, null)}
                              className="grid size-7 place-items-center rounded-full bg-crimson-red text-white shadow-small"
                              title="Remove"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPickImage(`heroPanel-${i}`)}
                          className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 transition-colors hover:bg-light-grey/70"
                        >
                          <ImageIcon className="h-4 w-4" />
                          <span className="text-[10px]">Panel {i + 1}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
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

            {/* ── Profile Image ── */}
            <section>
              <SectionHead>Profile Image</SectionHead>
              <div className="flex items-center gap-4">
                <div className="group/profile relative size-24 shrink-0 overflow-hidden rounded-full bg-light-grey ring-2 ring-light-grey">
                  {profileImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resolveImg(profileImage)} alt="Profile" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 opacity-0 transition-all group-hover/profile:bg-black/30 group-hover/profile:opacity-100">
                        <button
                          type="button"
                          onClick={() => onPickImage("profile", resolveImg(profileImage) || undefined)}
                          className="grid size-7 place-items-center rounded-full bg-white text-midnight shadow-small hover:text-crimson-red"
                          title="Change profile image"
                        >
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => sv("profileImage", "")}
                          className="grid size-7 place-items-center rounded-full bg-crimson-red text-white shadow-small"
                          title="Remove profile image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPickImage("profile")}
                      className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 transition-colors hover:bg-light-grey/70"
                    >
                      <UserIcon className="h-6 w-6" />
                      <span className="text-[10px]">Upload</span>
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  <FieldLabel>Instagram Handle</FieldLabel>
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 focus-within:ring-2 focus-within:ring-crimson-red/40">
                    <Instagram className="h-4 w-4 text-dark-gray/60" />
                    <input
                      type="text"
                      value={w("instagram") ?? ""}
                      onChange={(e) => sv("instagram", e.target.value.replace(/^@/, ""))}
                      placeholder="handle (no @)"
                      className="w-full bg-transparent py-1.5 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Publish ── */}
            <section>
              <SectionHead>Publish</SectionHead>
              <div className="flex items-end gap-4">
                <div className="flex-1">
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
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <span className="whitespace-nowrap text-sm font-body text-midnight">Coming Soon</span>
                  <Switch
                    checked={w("comingSoon") ?? false}
                    onCheckedChange={(v) => sv("comingSoon", v)}
                    className="data-[state=checked]:bg-vivid-orange"
                  />
                </div>
              </div>
            </section>

            {/* ── Attached Tours ── */}
            <section>
              <SectionHead>Attached Tours</SectionHead>
              <p className="mb-3 text-[11px] text-dark-gray/70">
                Only tours marked as “Hosted” can be attached. Tours attached
                here are hosted by this host.
              </p>
              <AttachedToursEditor form={form} />
            </section>

            {/* ── SEO & URL ── */}
            <section>
              <SectionHead>SEO &amp; URL</SectionHead>

              {/* Live preview */}
              {(() => {
                const seoTitle = (w("seo.title") as string) || (w("pageTitle") as string) || "Resident host";
                const seoDesc = (w("seo.description") as string) || ((w("intro") as string[]) ?? [])[0] || "This resident host description will appear in search results.";
                const slug = (w("slug") as string) || "host-slug";
                const cleanUrl = `imheretravels.com/resident-hosts/${slug}`;
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
                  <TextInput value={w("slug") ?? ""} onChange={(v) => sv("slug", v)} placeholder="dev" />
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
