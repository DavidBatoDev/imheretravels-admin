"use client";

import type { UseFormReturn } from "react-hook-form";
import { X, Image as ImageIcon, Camera, SendHorizontal } from "lucide-react";

const CURRENCY_SYM: Record<string, string> = { USD: "$", EUR: "£", GBP: "£" };

interface HeroSetupPanelProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<any>;
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

// Branded share image: dark left panel (brand + tour title + days/price) and the
// cover photo on the right — mirrors the generated OG image used in link previews.
function BrandedShareImage({ src, name, subtitle }: { src?: string; name: string; subtitle: string }) {
  return (
    <div className="relative flex aspect-[1.91/1] w-full overflow-hidden bg-[#15151a]">
      <div className="flex w-[46%] shrink-0 flex-col justify-center gap-0.5 px-2.5 py-2">
        <span className="text-[6px] font-medium text-white/55">I&apos;m Here Travels</span>
        <span className="text-[6px] font-bold uppercase tracking-[0.12em] text-crimson-red">Small Group Tour</span>
        <span className="font-hk-grotesk text-[13px] font-bold leading-[1.05] text-white line-clamp-2">{name}</span>
        {subtitle && <span className="mt-0.5 text-[6px] text-white/45">{subtitle}</span>}
      </div>
      <div className="relative flex-1 bg-light-grey">
        {src ? (
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-dark-gray/40">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function HeroSetupPanel({
  open, onClose, form, coverImageUrl, onEditCover, onRemoveCover,
}: HeroSetupPanelProps) {
  const w = (n: string) => form.watch(n as any);

  const title = (w("seo.title") as string) || (w("name") as string) || "Tour title";
  const desc =
    (w("seo.description") as string) ||
    (w("description") as string) ||
    "Your tour description will appear here when the link is shared.";
  const slug = (w("slug") as string) || "tour-slug";
  const url = (w("url") as string) || `https://imheretravels.com/all-tours/${slug}`;
  const domain =
    url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "imheretravels.com";

  // Branded-image fields
  const name = (w("name") as string) || title;
  const duration = (w("duration") as string) || "";
  const sym = CURRENCY_SYM[(w("pricing.currency") as string) || "GBP"] || "£";
  const rawPrice = (w("pricing.discounted") ?? w("pricing.original")) as number | undefined;
  const priceStr = rawPrice ? `${sym}${Number(rawPrice).toLocaleString()}` : "";
  const subtitle = [duration, priceStr && `From ${priceStr}`].filter(Boolean).join(" · ");

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden />}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[560px] max-w-[92vw] bg-white shadow-2xl z-50 flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-grey bg-white shrink-0">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-crimson-red" />
            <span className="font-sans font-bold text-midnight text-sm">Hero Setup</span>
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
              <p className="mb-3 text-xs text-dark-gray/70">
                Used as the tour card thumbnail and the preview image when the link is shared.
              </p>
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

            {/* ── Share preview ── */}
            <section>
              <SectionHead>Share Preview</SectionHead>
              <p className="mb-3 text-xs text-dark-gray/70">
                How this tour&apos;s link looks when shared — collapsed in the chat, and expanded
                when tapped. Uses the cover image, tour name, days/price, and SEO description.
              </p>
              <div className="grid grid-cols-2 gap-3">

                {/* Collapsed — as shown in the chat thread */}
                <div>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-dark-gray/50">Hero + URL</p>
                  <div className="overflow-hidden rounded-2xl bg-[#1c1c1e] p-1.5">
                    <div className="overflow-hidden rounded-xl">
                      <BrandedShareImage src={coverImageUrl} name={name} subtitle={subtitle} />
                    </div>
                    <p className="mt-1.5 px-1 text-[10px] font-semibold text-white">— I&apos;m Here Travels</p>
                    <p className="truncate px-1 pb-0.5 text-[8px] text-white/45">{domain}</p>
                  </div>
                  <p className="mt-0.5 flex items-center justify-end gap-0.5 pr-1 text-[8px] text-dark-gray/40">
                    Sent <SendHorizontal className="size-2.5" />
                  </p>
                </div>

                {/* Expanded — when the link is tapped */}
                <div>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-dark-gray/50">Hero + description</p>
                  <div className="overflow-hidden rounded-2xl bg-[#1c1c1e] p-1.5">
                    <div className="overflow-hidden rounded-xl">
                      <BrandedShareImage src={coverImageUrl} name={name} subtitle={subtitle} />
                    </div>
                    <p className="mt-1.5 px-1 text-[10px] font-semibold text-white">— I&apos;m Here Travels</p>
                    <p className="mt-0.5 line-clamp-4 px-1 pb-0.5 text-[8px] leading-snug text-white/60">{desc}</p>
                  </div>
                </div>

              </div>
            </section>

          </div>
        </div>
      </div>
    </>
  );
}
