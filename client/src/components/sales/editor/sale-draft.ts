// Editor state for a sale, and the pure rules around it: building a draft from
// a saved sale or a tour, applying CSV rows, slot locking, and turning the
// draft into the API's SaleInput. No React here.

import type { SaleInput, SaleWithInventory } from "@/services/sale-events-service";
import type { SaleCheckoutMode, SaleSlot, SaleStatus } from "@/types/sale-events";
import type { TourPackage } from "@/types/tours";
import {
  DEFAULT_SLOTS,
  MAX_SLOTS,
  formatGBP,
  isoToLocalInput,
  isSlotLocked,
  localInputToIso,
  numOrNaN,
  salePriceFor,
  slotDisplayStatus,
  type CsvTourGroup,
} from "../sale-utils";

let seq = 0;
export const newKey = () => `k${++seq}`;

export interface DraftSlot {
  key: string;
  /** Discount £ as typed. */
  value: string;
}

export interface DraftTour {
  key: string;
  tourPackageId: string;
  tourSlug: string;
  tourName: string;
  coverImage?: string;
  displayName: string;
  originalPrice: string;
  /** Discount per ladder position, slot 1 first. */
  discounts: DraftSlot[];
  /** CSV import notes for this tour. */
  notes: string[];
}

export interface SaleDraft {
  name: string;
  slug: string;
  /** False while the slug still follows the name. */
  slugTouched: boolean;
  status: SaleStatus;
  /** "YYYY-MM-DDTHH:mm" in the browser's timezone, or "". */
  startLocal: string;
  endTba: boolean;
  endLocal: string;
  holdMinutes: string;
  checkoutMode: SaleCheckoutMode;
  heroTitle: string;
  heroSubtitle: string;
  bannerUrl: string;
  mobileBannerUrl: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  tours: DraftTour[];
}

export interface UnmatchedGroup {
  key: string;
  group: CsvTourGroup;
  candidates: TourPackage[];
  reason?: string;
}

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 200;

// ---------------------------------------------------------------------------
// Building drafts
// ---------------------------------------------------------------------------

const emptyLadder = () => Array.from({ length: DEFAULT_SLOTS }, () => ({ key: newKey(), value: "" }));

export function draftFromSale(sale: SaleWithInventory): SaleDraft {
  return {
    name: sale.name,
    slug: sale.slug,
    slugTouched: true,
    status: sale.status,
    startLocal: isoToLocalInput(sale.startAt),
    endTba: sale.endAt === null,
    endLocal: isoToLocalInput(sale.endAt),
    holdMinutes: String(sale.holdMinutes),
    checkoutMode: sale.checkoutMode,
    heroTitle: sale.hero.title ?? "",
    heroSubtitle: sale.hero.subtitle ?? "",
    bannerUrl: sale.hero.bannerUrl ?? "",
    mobileBannerUrl: sale.hero.mobileBannerUrl ?? "",
    seoTitle: sale.seo?.title ?? "",
    seoDescription: sale.seo?.description ?? "",
    ogImage: sale.seo?.ogImage ?? "",
    tours: sale.tours.map((t) => {
      const slots = sale.inventory[t.tourPackageId]?.slots ?? [];
      return {
        key: newKey(),
        tourPackageId: t.tourPackageId,
        tourSlug: t.tourSlug,
        tourName: t.tourName,
        coverImage: t.coverImage,
        // Card title is always the tour name.
        displayName: t.tourName || t.displayName,
        originalPrice: String(t.originalPrice),
        discounts: slots.length ? slots.map((s) => ({ key: newKey(), value: String(s.discountGBP) })) : emptyLadder(),
        notes: [],
      };
    }),
  };
}

export function newSaleDraft(isFirstSale: boolean): SaleDraft {
  return {
    name: isFirstSale ? "Black Friday" : "",
    slug: isFirstSale ? "black-friday" : "",
    slugTouched: false,
    status: "draft",
    startLocal: "",
    endTba: true,
    endLocal: "",
    holdMinutes: "15",
    checkoutMode: "auto",
    heroTitle: isFirstSale ? "Black Friday Sale" : "",
    heroSubtitle: "",
    bannerUrl: "",
    mobileBannerUrl: "",
    seoTitle: "",
    seoDescription: "",
    ogImage: "",
    tours: [],
  };
}

export function draftFromTour(tour: TourPackage, csv?: CsvTourGroup): DraftTour {
  const ladder = csv?.ladder ?? [];
  return {
    key: newKey(),
    tourPackageId: tour.id,
    tourSlug: tour.slug ?? "",
    tourName: tour.name ?? "",
    coverImage: tour.media?.coverImage || undefined,
    displayName: (tour.name || tour.cardSubHeader || "").slice(0, 80),
    originalPrice: String(csv?.originalPrice ?? tour.pricing?.original ?? 0),
    discounts: ladder.length ? ladder.map((d) => ({ key: newKey(), value: String(d) })) : emptyLadder(),
    notes: [],
  };
}

/** Comparable form of a draft, for the unsaved-changes check (ignores React keys and notes). */
export function draftSnapshot(d: SaleDraft): string {
  const { tours, slugTouched: _touched, ...rest } = d;
  return JSON.stringify([
    rest,
    tours.map((t) => [t.tourPackageId, t.displayName, t.originalPrice, t.discounts.map((s) => s.value)]),
  ]);
}

// ---------------------------------------------------------------------------
// Slots and inventory
// ---------------------------------------------------------------------------

export type Inventory = SaleWithInventory["inventory"] | undefined;

export const invSlot = (inv: Inventory, tourPackageId: string, position: number): SaleSlot | undefined =>
  inv?.[tourPackageId]?.slots.find((s) => s.index === position + 1);

export const isLockedAt = (inv: Inventory, tourPackageId: string, position: number, now: number) =>
  isSlotLocked(invSlot(inv, tourPackageId, position), now);

export const tourHasLocked = (inv: Inventory, tourPackageId: string, now: number) =>
  (inv?.[tourPackageId]?.slots ?? []).some((s) => isSlotLocked(s, now));

/** A row can go when it's free and nothing locked sits after it (positions would shift). */
export const canRemoveSlot = (inv: Inventory, t: DraftTour, pos: number, now: number) =>
  t.discounts.length > 1 && t.discounts.every((_, i) => i < pos || !isLockedAt(inv, t.tourPackageId, i, now));

export type PublicSlotState = "available" | "on_hold" | "sold";

export interface PreviewSlot {
  index: number;
  discount: number | null;
  salePrice: number | null;
  state: PublicSlotState;
  locked: boolean;
}

/** What the sale page would show for this tour's ladder right now. */
export function previewSlots(inv: Inventory, t: DraftTour, now: number): PreviewSlot[] {
  const original = numOrNaN(t.originalPrice);
  return t.discounts.map((d, pos) => {
    const saved = invSlot(inv, t.tourPackageId, pos);
    const st = saved ? slotDisplayStatus(saved, now) : "available";
    const locked = isSlotLocked(saved, now);
    const disc = numOrNaN(d.value);
    const discount = locked && saved ? saved.discountGBP : Number.isFinite(disc) ? disc : null;
    const salePrice =
      locked && saved ? saved.salePrice : Number.isFinite(original) && discount !== null ? salePriceFor(original, discount) : null;
    return {
      index: pos + 1,
      discount,
      salePrice,
      state: st === "sold" ? "sold" : st === "held" || st === "paying" ? "on_hold" : "available",
      locked,
    };
  });
}

/** Biggest single-slot discount across the sale ("Up to £X off"). */
export function maxDiscount(d: SaleDraft): number {
  let max = 0;
  for (const t of d.tours) for (const s of t.discounts) {
    const n = numOrNaN(s.value);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function csvNotes(group: CsvTourGroup, tour: TourPackage): string[] {
  const notes = [...group.warnings];
  const tourPrice = tour.pricing?.original;
  if (group.originalPrice !== null && typeof tourPrice === "number" && Math.abs(group.originalPrice - tourPrice) > 0.009) {
    notes.unshift(`CSV original price ${formatGBP(group.originalPrice)} differs from the tour's price ${formatGBP(tourPrice)}`);
  }
  return notes;
}

/** Applies a CSV group to a tour (adding it if needed), keeping held/sold slots' discount. */
export function applyCsvGroup(
  tours: DraftTour[],
  group: CsvTourGroup,
  tour: TourPackage,
  locked: (tourPackageId: string, pos: number) => boolean,
): DraftTour[] {
  const notes = csvNotes(group, tour);
  const existing = tours.find((t) => t.tourPackageId === tour.id);
  if (!existing) return [...tours, { ...draftFromTour(tour, group), notes }];
  const lastLocked = existing.discounts.reduce((n, _, i) => (locked(tour.id, i) ? i + 1 : n), 0);
  // CSV ladders are already capped at MAX_SLOTS; locked slots beyond them stay.
  const len = Math.max(Math.min(group.ladder.length, MAX_SLOTS), lastLocked);
  const discounts = Array.from({ length: len }, (_, i) => {
    const cur = existing.discounts[i];
    if (cur && locked(tour.id, i)) return cur;
    return { key: cur?.key ?? newKey(), value: String(group.ladder[i] ?? cur?.value ?? "") };
  });
  if (discounts.some((_, i) => locked(tour.id, i))) notes.push("Held/sold slots kept their current discount");
  return tours.map((t) =>
    t.key === existing.key
      ? { ...t, discounts, notes, originalPrice: group.originalPrice !== null ? String(group.originalPrice) : t.originalPrice }
      : t,
  );
}

// ---------------------------------------------------------------------------
// Validation → SaleInput
// ---------------------------------------------------------------------------

export type DraftArea = "page" | "schedule" | "settings" | "seo" | "tours";
export interface DraftError {
  area: DraftArea;
  message: string;
}

export function toSaleInput(
  d: SaleDraft,
  opts: { unmatched: number; otherSlugs: string[] },
): { input: SaleInput | null; errors: DraftError[] } {
  const errors: DraftError[] = [];
  const err = (area: DraftArea, message: string) => errors.push({ area, message });

  if (!d.name.trim()) err("page", "Sale name is required");
  if (!/^[a-z0-9-]+$/.test(d.slug)) err("settings", "URL slug can only use lowercase letters, numbers and hyphens");
  else if (opts.otherSlugs.includes(d.slug)) err("settings", `Another sale already uses /${d.slug}`);
  const hold = Number(d.holdMinutes);
  if (!Number.isInteger(hold) || hold < 1 || hold > 60) err("settings", "Hold minutes must be a whole number from 1 to 60");
  const startAt = localInputToIso(d.startLocal);
  const endAt = d.endTba ? null : localInputToIso(d.endLocal);
  if (!d.endTba && !endAt) err("schedule", "Pick an end date, or turn on “End date TBA”");
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) err("schedule", "End date must be after the start date");
  if (d.seoTitle.length > SEO_TITLE_MAX) err("seo", `SEO title is over ${SEO_TITLE_MAX} characters`);
  if (d.seoDescription.length > SEO_DESCRIPTION_MAX) err("seo", `SEO description is over ${SEO_DESCRIPTION_MAX} characters`);
  if (d.status === "live" && d.tours.length === 0) err("tours", "Add at least one tour before setting the sale live");
  if (opts.unmatched) err("tours", `Pick or skip the ${opts.unmatched} unmatched CSV tour(s)`);

  const tours = d.tours.map((t, i) => {
    const label = t.displayName || t.tourName || `Tour ${i + 1}`;
    const original = numOrNaN(t.originalPrice);
    if (!t.displayName.trim()) err("tours", `${t.tourName || `Tour ${i + 1}`}: card title is required`);
    if (!Number.isFinite(original) || original < 0) err("tours", `${label}: original price must be £0 or more`);
    const ladder = t.discounts.map((s) => numOrNaN(s.value));
    if (ladder.some((n) => !Number.isFinite(n) || n < 0)) err("tours", `${label}: enter a discount (£0 or more) for every slot`);
    return {
      tourPackageId: t.tourPackageId,
      tourSlug: t.tourSlug,
      displayName: t.displayName.trim().slice(0, 80),
      tourName: t.tourName,
      originalPrice: original,
      ...(t.coverImage ? { coverImage: t.coverImage } : {}),
      order: i,
      ladder,
    };
  });
  if (errors.length) return { input: null, errors };
  return {
    errors,
    input: {
      slug: d.slug,
      name: d.name.trim(),
      status: d.status,
      startAt,
      endAt,
      holdMinutes: hold,
      checkoutMode: d.checkoutMode,
      // Empty strings clear a banner.
      hero: {
        title: d.heroTitle.trim(),
        subtitle: d.heroSubtitle.trim(),
        bannerUrl: d.bannerUrl.trim(),
        mobileBannerUrl: d.mobileBannerUrl.trim(),
      },
      seo: { title: d.seoTitle.trim(), description: d.seoDescription.trim(), ogImage: d.ogImage.trim() },
      tours,
    },
  };
}
