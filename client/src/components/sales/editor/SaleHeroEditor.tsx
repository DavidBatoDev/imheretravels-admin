"use client";

import { useRef } from "react";
import { ArrowDown, ImageIcon, Loader2, Monitor, Smartphone, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGBP, useNow, type SalePhase } from "../sale-utils";
import { EditTag, FieldInput, FieldLabel, HelpText, InlineTextarea } from "./fields";

export type BannerKind = "desktop" | "mobile" | "og";
export type PreviewMode = "desktop" | "mobile";

const COUNTDOWN_UNITS = [
  { label: "Days", ms: 86_400_000 },
  { label: "Hours", ms: 3_600_000 },
  { label: "Mins", ms: 60_000 },
  { label: "Secs", ms: 1_000 },
] as const;

interface SaleHeroEditorProps {
  title: string;
  subtitle: string;
  bannerUrl: string;
  mobileBannerUrl: string;
  onChange: (patch: { heroTitle?: string; heroSubtitle?: string; bannerUrl?: string; mobileBannerUrl?: string }) => void;
  statusText: string;
  phase: SalePhase;
  isDraft: boolean;
  startAt: string | null;
  endAt: string | null;
  upTo: number;
  hasTours: boolean;
  /** www shows the first tour's cover (desktop only) when there's no banner. */
  fallbackImage?: string;
  mode: PreviewMode;
  onModeChange: (m: PreviewMode) => void;
  uploading: Record<BannerKind, boolean>;
  onUpload: (kind: BannerKind, file: File) => void;
}

/** The sale page hero, editable in place. Mirrors www `SaleHero`. */
export default function SaleHeroEditor(props: SaleHeroEditorProps) {
  const { title, subtitle, bannerUrl, mobileBannerUrl, onChange, statusText, phase, isDraft, startAt, endAt, upTo, hasTours, fallbackImage, mode, onModeChange, uploading, onUpload } = props;
  const mobile = mode === "mobile";
  const live = phase === "live";
  const countdown =
    phase === "upcoming" && startAt
      ? { to: startAt, label: "Sale opens in" }
      : phase === "live" && endAt
        ? { to: endAt, label: "Sale ends in" }
        : null;
  const now = useNow(1000, !!countdown);

  const desktopSrc = bannerUrl || mobileBannerUrl || fallbackImage;
  const mobileSrc = mobileBannerUrl || bannerUrl || (mobile ? undefined : fallbackImage);
  const shown = mobile ? mobileSrc : desktopSrc;
  const shownKind: "desktop" | "mobile" = mobile ? "mobile" : "desktop";
  const shownLabel = mobile
    ? mobileBannerUrl
      ? "Mobile banner"
      : bannerUrl
        ? "Desktop banner (no mobile banner set)"
        : "No banner: phones show no image"
    : bannerUrl
      ? "Desktop banner"
      : mobileBannerUrl
        ? "Mobile banner (no desktop banner set)"
        : fallbackImage
          ? "No banner: first tour's cover is used"
          : "No banner";

  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section aria-labelledby="hero-editor-heading" className="overflow-hidden rounded-[24px] bg-white shadow-medium">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-light-grey px-5 py-3 md:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="hero-editor-heading" className="font-sans text-sm font-bold uppercase tracking-wider text-midnight">
            Hero
          </h2>
          <span className="font-body text-xs text-dark-gray">Click the dashed text to edit. “Up to” and the status pill update on their own.</span>
        </div>
        <div role="group" aria-label="Hero preview width" className="flex rounded-full border-2 border-dark-gray/70 p-0.5">
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["mobile", Smartphone, "Mobile"],
            ] as const
          ).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3 font-body text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red",
                mode === m ? "bg-midnight text-white" : "text-midnight hover:bg-light-grey",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {isDraft && (
        <p className="bg-sunglow-yellow px-5 py-2 font-body text-xs font-medium text-midnight md:px-6">
          Draft: this page isn&apos;t public yet. The preview below shows how it will look once it&apos;s Live.
        </p>
      )}

      <div className="bg-light-grey/60 p-0">
        <div className={cn("relative mx-auto overflow-hidden bg-midnight text-white", mobile && "my-4 max-w-[400px] rounded-[20px] shadow-large")}>
          <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-crimson-red" />
          <div
            className={cn(
              "grid gap-8 px-4 pb-10 pt-8",
              !mobile && "md:grid-cols-2 md:items-center md:gap-12 md:px-8 md:py-16 lg:py-20",
            )}
          >
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 font-body text-b4-mobile font-medium md:text-b4-desktop">
                <span className="relative flex size-2.5" aria-hidden>
                  {live && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-light-red opacity-75 motion-reduce:hidden" />
                  )}
                  <span className={cn("relative inline-flex size-2.5 rounded-full", live ? "bg-light-red" : "bg-grey")} />
                </span>
                {statusText}
              </p>

              <div className="mt-5">
                <EditTag tone="dark">
                  <label htmlFor="hero-title">Title</label>
                </EditTag>
                <InlineTextarea
                  id="hero-title"
                  tone="dark"
                  value={title}
                  maxLength={120}
                  placeholder="Black Friday Sale"
                  onChange={(e) => onChange({ heroTitle: e.target.value })}
                  className={cn("font-display text-h1-mobile", !mobile && "md:text-h1-desktop lg:text-[3.5rem] lg:leading-[1.1]")}
                />
              </div>

              {upTo > 0 ? (
                <p className={cn("mt-2 font-display text-h3-mobile tabular-nums text-light-red", !mobile && "md:text-h3-desktop")}>
                  Up to {formatGBP(upTo)} off
                </p>
              ) : (
                <p className="mt-2 font-body text-xs text-white/70">“Up to £X off” appears once a slot has a discount.</p>
              )}

              <div className="mt-4 max-w-xl">
                <EditTag tone="dark">
                  <label htmlFor="hero-subtitle">Subtitle</label>
                </EditTag>
                <InlineTextarea
                  id="hero-subtitle"
                  tone="dark"
                  value={subtitle}
                  maxLength={400}
                  placeholder="Add a short line under the title (optional)"
                  onChange={(e) => onChange({ heroSubtitle: e.target.value })}
                  className={cn("font-body text-b2-mobile text-white/85", !mobile && "md:text-b2-desktop")}
                />
              </div>

              {countdown && (
                <div className="mt-6" aria-hidden>
                  <p className="font-body text-b4-mobile font-medium uppercase tracking-wider text-white/70 md:text-b4-desktop">{countdown.label}</p>
                  <div className="mt-2 flex gap-2 sm:gap-3">
                    {COUNTDOWN_UNITS.map((u, i) => {
                      const left = Math.max(0, Date.parse(countdown.to) - now);
                      const v = Math.floor((i === 0 ? left : left % COUNTDOWN_UNITS[i - 1].ms) / u.ms);
                      return (
                        <div key={u.label} className="flex min-w-16 flex-col items-center rounded-md bg-white/10 px-3 py-2.5">
                          <span className="font-display text-h3-mobile leading-none tabular-nums">{String(v).padStart(2, "0")}</span>
                          <span className="mt-1 font-body text-[0.7rem] font-medium uppercase tracking-wider text-white/70">{u.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasTours && (
                <div className={cn("mt-7 flex flex-col gap-3", !mobile && "sm:flex-row sm:items-center")} aria-hidden>
                  <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-crimson-red px-8 py-3.5 font-body font-bold text-white shadow-small">
                    See the deals
                    <ArrowDown className="size-4" strokeWidth={2.5} />
                  </span>
                  <span className="font-body text-b4-mobile text-white/75 md:text-b4-desktop">
                    {live ? "Pay just the reservation fee today." : "Pay just the reservation fee when it opens."}
                  </span>
                </div>
              )}
            </div>

            {/* Banner (right on desktop, above-the-fold image on phones) */}
            <div className="group/banner relative overflow-hidden rounded-lg bg-white/5">
              {shown ? (
                <img
                  src={shown}
                  alt={shownLabel}
                  className={cn("aspect-[4/3] w-full object-cover", !mobile && "md:aspect-[5/4]", !bannerUrl && !mobileBannerUrl && "opacity-60")}
                />
              ) : (
                <div className={cn("flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-white/70", !mobile && "md:aspect-[5/4]")}>
                  <ImageIcon className="h-10 w-10" aria-hidden />
                  <span className="font-body text-sm">No banner image</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                <span className="font-body text-xs font-medium text-white">{shownLabel}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading[shownKind]}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 font-body text-xs font-bold text-midnight shadow-small transition-colors hover:text-crimson-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-red disabled:opacity-60"
                  >
                    {uploading[shownKind] ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
                    {(mobile ? mobileBannerUrl : bannerUrl) ? "Replace" : "Upload"} {shownKind} banner
                  </button>
                  {(mobile ? mobileBannerUrl : bannerUrl) && (
                    <button
                      type="button"
                      onClick={() => onChange(mobile ? { mobileBannerUrl: "" } : { bannerUrl: "" })}
                      aria-label={`Remove ${shownKind} banner`}
                      className="inline-flex size-8 items-center justify-center rounded-full bg-crimson-red text-white shadow-small transition-colors hover:bg-light-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(shownKind, f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Both banners at a glance */}
      <div className="grid gap-5 border-t border-light-grey px-5 py-5 md:grid-cols-2 md:px-6">
        <BannerSlot
          id="banner-desktop"
          label="Desktop banner"
          hint="Shown beside the headline, cropped to 5:4 (e.g. 1500×1200). JPG, PNG or WebP, max 5MB."
          url={bannerUrl}
          aspect="aspect-[5/4]"
          uploading={uploading.desktop}
          onUrl={(v) => onChange({ bannerUrl: v })}
          onFile={(f) => onUpload("desktop", f)}
          active={!mobile}
        />
        <BannerSlot
          id="banner-mobile"
          label="Mobile banner"
          hint="Phones only, cropped to 4:3 (e.g. 1200×900). Falls back to the desktop banner."
          url={mobileBannerUrl}
          aspect="aspect-[4/3]"
          uploading={uploading.mobile}
          onUrl={(v) => onChange({ mobileBannerUrl: v })}
          onFile={(f) => onUpload("mobile", f)}
          active={mobile}
        />
      </div>
    </section>
  );
}

export function BannerSlot({
  id,
  label,
  hint,
  url,
  aspect,
  uploading,
  onUrl,
  onFile,
  active,
}: {
  id: string;
  label: string;
  hint: string;
  url: string;
  aspect: string;
  uploading: boolean;
  onUrl: (url: string) => void;
  onFile: (file: File) => void;
  active?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-4">
      <div className={cn("relative w-28 shrink-0 overflow-hidden rounded-md border-2 bg-light-grey", aspect, active ? "border-crimson-red" : "border-light-grey")}>
        {url ? (
          <img src={url} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-dark-gray">
            <ImageIcon className="h-6 w-6" aria-hidden />
            <span className="sr-only">No {label.toLowerCase()}</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-midnight" aria-hidden />
            <span className="sr-only">Uploading</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor={`${id}-url`}>{label}</FieldLabel>
          {active && <span className="rounded-full bg-crimson-red/10 px-2 py-0.5 font-body text-[11px] font-bold text-[#B4232E]">Previewing</span>}
        </div>
        <div className="flex gap-2">
          <FieldInput id={`${id}-url`} type="url" value={url} onChange={(e) => onUrl(e.target.value)} placeholder="Upload, or paste an image URL" className="h-9" aria-describedby={`${id}-hint`} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 border-midnight px-3 font-body text-xs font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden /> {url ? "Replace" : "Upload"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => onUrl("")}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-crimson-red text-[#B4232E] transition-colors hover:bg-crimson-red hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <HelpText id={`${id}-hint`}>{hint}</HelpText>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
