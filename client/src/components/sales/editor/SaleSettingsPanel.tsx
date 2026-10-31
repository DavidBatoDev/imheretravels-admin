"use client";

import { AlertTriangle, Copy, ExternalLink, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaleCheckoutMode } from "@/types/sale-events";
import { WWW_DOMAIN, WWW_ORIGIN, publicSaleUrl, salePreviewUrl } from "../sale-utils";
import { CharCount, FieldInput, FieldLabel, FieldTextarea, HelpText, PanelSectionHead } from "./fields";
import SaleDrawer from "./SaleDrawer";
import { SchedulePanel } from "./SaleEditorToolbar";
import { BannerSlot } from "./SaleHeroEditor";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, WWW_SALE_ROUTES, type SaleDraft } from "./sale-draft";

const CHECKOUT_OPTIONS: [SaleCheckoutMode, string, string][] = [
  ["auto", "Automatic (Stripe)", "The customer pays the reservation fee by card in the reservation form."],
  ["manual", "Manual payment links", "The customer is shown the payment link you set on their slot in Track slots."],
];

export default function SaleSettingsPanel({
  open,
  onClose,
  draft,
  onChange,
  onSlugChange,
  savedSlug,
  otherSlugs,
  previewToken,
  ogUploading,
  onOgUpload,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  draft: SaleDraft;
  onChange: (patch: Partial<SaleDraft>) => void;
  onSlugChange: (slug: string) => void;
  savedSlug: string | null;
  otherSlugs: string[];
  previewToken: string | null;
  ogUploading: boolean;
  onOgUpload: (file: File) => void;
  onCopy: (text: string, what: string) => void;
}) {
  const slugTaken = otherSlugs.includes(draft.slug);
  const pageUrl = publicSaleUrl(draft.slug || "your-sale");
  // Mirrors www: a custom SEO title is used exactly as typed; otherwise the
  // hero title gets the site's "— I'm Here Travels" suffix.
  const customTitle = draft.seoTitle.trim();
  const fullTitle =
    customTitle || `${draft.heroTitle.trim() || draft.name.trim() || "Sale title"} — I'm Here Travels`;
  const seoDesc =
    draft.seoDescription.trim() || draft.heroSubtitle.trim() || "Your sale description will appear here in search results and when the link is shared.";
  const shareImage = draft.ogImage.trim() || draft.bannerUrl.trim() || draft.tours[0]?.saved.coverImage;
  const shareFallback = !draft.ogImage.trim() ? (draft.bannerUrl.trim() ? "Using the desktop banner" : shareImage ? "Using the first tour's cover" : "No image") : null;
  const previewLink = previewToken ? salePreviewUrl(previewToken) : null;

  return (
    <SaleDrawer open={open} onOpenChange={(o) => !o && onClose()} icon={Settings} title="Sale settings" description="Dates, URL, booking rules, search & sharing">
      <div className="flex flex-col gap-8">
        {/* ── Schedule ── */}
        <section aria-labelledby="set-schedule">
          <PanelSectionHead id="set-schedule">Start &amp; end dates</PanelSectionHead>
          <SchedulePanel startLocal={draft.startLocal} endTba={draft.endTba} endLocal={draft.endLocal} onChange={onChange} />
        </section>

        {/* ── Page & URL ── */}
        <section aria-labelledby="set-url">
          <PanelSectionHead id="set-url">Page &amp; URL</PanelSectionHead>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="set-name" required>
                Sale name
              </FieldLabel>
              <FieldInput id="set-name" value={draft.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} aria-describedby="set-name-help" />
              <HelpText id="set-name-help">Internal name, shown in the admin and the preview banner.</HelpText>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="set-slug" required>
                URL slug
              </FieldLabel>
              <div className="flex items-center rounded-md border-2 border-dark-gray/70 bg-white transition-colors focus-within:border-crimson-red focus-within:ring-2 focus-within:ring-crimson-red/25 hover:border-midnight">
                <span className="select-none pl-3 font-body text-sm text-dark-gray">{WWW_DOMAIN}/</span>
                <input
                  id="set-slug"
                  value={draft.slug}
                  onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80))}
                  onBlur={() => onSlugChange(draft.slug.replace(/-+/g, "-").replace(/^-|-$/g, ""))}
                  className="h-9 min-w-0 flex-1 bg-transparent pr-3 font-body text-sm text-midnight outline-none"
                  aria-invalid={slugTaken || !draft.slug}
                  aria-describedby="set-slug-help"
                />
              </div>
              <div id="set-slug-help" className="flex flex-col gap-1">
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1 break-all font-body text-xs font-medium text-midnight underline underline-offset-2 hover:text-crimson-red"
                >
                  {pageUrl} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                {slugTaken && <Warn tone="error">Another sale already uses /{draft.slug}.</Warn>}
                {savedSlug && savedSlug !== draft.slug && <Warn>Changing the slug breaks links already shared to /{savedSlug}.</Warn>}
                {draft.slug && !WWW_SALE_ROUTES.includes(draft.slug) && (
                  <Warn>The website only has a sale page at /{WWW_SALE_ROUTES.join(", /")} right now. Other slugs need a www route first.</Warn>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Redirects ── */}
        <section aria-labelledby="set-redirects">
          <PanelSectionHead id="set-redirects">Redirects</PanelSectionHead>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="set-redirect-slugs">Extra links</FieldLabel>
              <FieldTextarea
                id="set-redirect-slugs"
                rows={3}
                value={draft.redirectSlugs}
                onChange={(e) => onChange({ redirectSlugs: e.target.value })}
                placeholder={"bf\nblackfriday2026"}
                aria-describedby="set-redirect-slugs-help"
              />
              <HelpText id="set-redirect-slugs-help">
                One per line. {WWW_DOMAIN}/bf would forward to the sale page. If a link matches an existing page or tour, that page wins.
              </HelpText>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="set-fallback-url">Redirect when the sale isn&apos;t live</FieldLabel>
              <FieldInput
                id="set-fallback-url"
                value={draft.fallbackUrl}
                maxLength={500}
                onChange={(e) => onChange({ fallbackUrl: e.target.value })}
                placeholder="/all-tours"
                aria-describedby="set-fallback-url-help"
              />
              <HelpText id="set-fallback-url-help">
                Sends visitors here from the sale page while it&apos;s Draft or Ended. Start with / or https://. Leave blank to show the 404 or Sale ended page.
              </HelpText>
            </div>
          </div>
        </section>

        {/* ── Booking ── */}
        <section aria-labelledby="set-booking">
          <PanelSectionHead id="set-booking">Booking</PanelSectionHead>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="set-hold" required>
                Hold minutes
              </FieldLabel>
              <FieldInput
                id="set-hold"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                step={1}
                value={draft.holdMinutes}
                onChange={(e) => onChange({ holdMinutes: e.target.value })}
                className="w-32"
                aria-describedby="set-hold-help"
              />
              <HelpText id="set-hold-help">How long a customer keeps their slots while they fill in the reservation form (1–60).</HelpText>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 font-sans text-sm font-bold text-midnight">Checkout</legend>
              {CHECKOUT_OPTIONS.map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-crimson-red/30",
                    draft.checkoutMode === value ? "border-crimson-red bg-crimson-red/5" : "border-dark-gray/40 hover:border-midnight",
                  )}
                >
                  <input
                    type="radio"
                    name="checkout-mode"
                    value={value}
                    checked={draft.checkoutMode === value}
                    onChange={() => onChange({ checkoutMode: value })}
                    className="mt-1 size-4 accent-crimson-red"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-sans text-sm font-bold text-midnight">{title}</span>
                    <span className="font-body text-xs text-dark-gray">{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        {/* ── SEO & sharing ── */}
        <section aria-labelledby="set-seo">
          <PanelSectionHead id="set-seo">SEO &amp; sharing</PanelSectionHead>

          {/* Google result preview */}
          <div className="mb-4 rounded-xl bg-light-grey/70 p-3">
            <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-wider text-dark-gray">Google result preview</p>
            <div className="rounded-xl border border-light-grey bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-light-grey bg-white">
                  <img src="/favicon.svg" alt="" className="size-3.5" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-xs font-medium text-midnight">I&apos;m Here Travels</p>
                  <p className="truncate text-[11px] text-dark-gray">
                    {WWW_DOMAIN} › {draft.slug || "your-sale"}
                  </p>
                </div>
              </div>
              <p className="mt-2 truncate text-base leading-snug text-[#1a0dab]">{fullTitle}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-dark-gray">{seoDesc}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="set-seo-title">SEO title</FieldLabel>
                <CharCount value={draft.seoTitle} max={SEO_TITLE_MAX} />
              </div>
              <FieldInput
                id="set-seo-title"
                value={draft.seoTitle}
                onChange={(e) => onChange({ seoTitle: e.target.value })}
                placeholder={draft.heroTitle || "Uses the hero title"}
                aria-invalid={draft.seoTitle.length > SEO_TITLE_MAX}
                aria-describedby="set-seo-title-help"
              />
              <HelpText id="set-seo-title-help">Used exactly as typed. Blank uses the hero title followed by “— I&apos;m Here Travels”.</HelpText>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="set-seo-desc">SEO description</FieldLabel>
                <CharCount value={draft.seoDescription} max={SEO_DESCRIPTION_MAX} />
              </div>
              <FieldTextarea
                id="set-seo-desc"
                rows={3}
                value={draft.seoDescription}
                onChange={(e) => onChange({ seoDescription: e.target.value })}
                placeholder={draft.heroSubtitle || "Uses the hero subtitle"}
                aria-invalid={draft.seoDescription.length > SEO_DESCRIPTION_MAX}
                aria-describedby="set-seo-desc-help"
              />
              <HelpText id="set-seo-desc-help">Shown under the title in search results and in link previews. Blank uses the hero subtitle.</HelpText>
            </div>
            <BannerSlot
              id="set-og"
              label="Share image"
              hint="1200×630 for WhatsApp, Facebook, X and LinkedIn previews. Blank uses the desktop banner."
              url={draft.ogImage}
              aspect="aspect-[1.91/1]"
              uploading={ogUploading}
              onUrl={(v) => onChange({ ogImage: v })}
              onFile={onOgUpload}
            />

            {/* Social card preview */}
            <div className="rounded-xl bg-light-grey/70 p-3">
              <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-wider text-dark-gray">Link share preview</p>
              <div className="overflow-hidden rounded-xl border border-light-grey bg-white">
                <div className="relative aspect-[1.91/1] w-full bg-light-grey">
                  {shareImage ? (
                    <img src={shareImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center font-body text-xs text-dark-gray">No share image</div>
                  )}
                  {shareFallback && shareImage && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 font-body text-[11px] font-bold text-white">{shareFallback}</span>
                  )}
                </div>
                <div className="border-t border-light-grey px-3 py-2.5">
                  <p className="font-body text-[11px] uppercase tracking-wide text-dark-gray">{WWW_DOMAIN}</p>
                  <p className="truncate font-sans text-sm font-bold text-midnight">{fullTitle}</p>
                  <p className="line-clamp-2 font-body text-xs text-dark-gray">{seoDesc}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Private preview ── */}
        <section aria-labelledby="set-preview" className="pb-2">
          <PanelSectionHead id="set-preview">Private preview link</PanelSectionHead>
          {previewLink ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={previewLink}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Private preview link"
                  className="h-10 min-w-0 flex-1 rounded-md border-2 border-light-grey bg-light-grey/50 px-3 font-mono text-xs text-midnight outline-none focus-visible:border-crimson-red"
                />
                <button
                  type="button"
                  onClick={() => onCopy(previewLink, "Preview link")}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border-2 border-midnight px-4 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
                >
                  <Copy className="h-4 w-4" aria-hidden /> Copy
                </button>
                <a
                  href={previewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open preview in a new tab"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-midnight text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
              <HelpText>
                Works in any status, including Draft. Booking is disabled and search engines won&apos;t index it. It shows the last saved version. Anyone with the link can view it.
              </HelpText>
            </div>
          ) : (
            <HelpText>Save the sale once to get a private preview link.</HelpText>
          )}
          <HelpText className="mt-2">Site: {WWW_ORIGIN}</HelpText>
        </section>
      </div>
    </SaleDrawer>
  );
}

function Warn({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "error" }) {
  return (
    <p className={cn("flex items-start gap-1.5 font-body text-xs", tone === "error" ? "font-bold text-[#B4232E]" : "text-[#9A4A00]")}>
      {tone === "error" ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}
