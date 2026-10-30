"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { effectiveStatus } from "@/lib/sale/slots";
import type { SaleEvent, SaleInventory, SaleSlot, SaleStatus } from "@/types/sale-events";
import type { TourPackage } from "@/types/tours";

export { salePriceFor } from "@/lib/sale/slots";

/** Ladder length the editor allows. The API accepts up to 8. */
export const MAX_SLOTS = 4;
export const DEFAULT_SLOTS = 4;

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Re-renders every `intervalMs` with the client's current time. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}

// ---------------------------------------------------------------------------
// Slot status
// ---------------------------------------------------------------------------

export const msOf = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

export type SlotDisplayStatus = "available" | "held" | "paying" | "sold" | "expired";

export function slotDisplayStatus(slot: SaleSlot, now: number): SlotDisplayStatus {
  const eff = effectiveStatus({ index: slot.index, status: slot.status, heldUntilMs: msOf(slot.heldUntil) }, now);
  if (eff === "available" && (slot.status === "held" || slot.status === "paying")) return "expired";
  return eff;
}

/** Held, paying or sold right now: its price is fixed and it can't be removed. */
export function isSlotLocked(slot: SaleSlot | undefined, now: number): boolean {
  if (!slot) return false;
  const s = slotDisplayStatus(slot, now);
  return s === "held" || s === "paying" || s === "sold";
}

export const SLOT_STATUS_META: Record<SlotDisplayStatus, { label: string; className: string }> = {
  available: { label: "Available", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  held: { label: "Held", className: "border-amber-200 bg-amber-50 text-amber-800" },
  paying: { label: "Paying", className: "border-sky-200 bg-sky-50 text-sky-800" },
  sold: { label: "Sold", className: "border-crimson-red/30 bg-crimson-red/10 text-crimson-red" },
  expired: { label: "Expired hold", className: "border-border bg-muted text-muted-foreground" },
};

export function inventorySummary(inv: SaleInventory | undefined, now: number) {
  let sold = 0;
  let held = 0;
  let left = 0;
  for (const s of inv?.slots ?? []) {
    const st = slotDisplayStatus(s, now);
    if (st === "sold") sold++;
    else if (st === "held" || st === "paying") held++;
    else left++;
  }
  return { sold, held, left, total: sold + held + left };
}

export function saleSummary(sale: SaleEvent & { inventory: Record<string, SaleInventory> }, now: number) {
  const totals = { sold: 0, held: 0, left: 0, total: 0 };
  for (const t of sale.tours) {
    const s = inventorySummary(sale.inventory[t.tourPackageId], now);
    totals.sold += s.sold;
    totals.held += s.held;
    totals.left += s.left;
    totals.total += s.total;
  }
  return totals;
}

export const SALE_STATUS_META: Record<SaleStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-border bg-muted text-muted-foreground" },
  live: { label: "Live", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  paused: { label: "Paused", className: "border-amber-200 bg-amber-50 text-amber-800" },
  ended: { label: "Ended", className: "border-border bg-secondary text-secondary-foreground" },
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatGBP = (n: number) => gbp.format(n);

export function formatDateTime(iso: string | null | undefined): string {
  const ms = msOf(iso);
  if (ms === null) return "";
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "Live · ends TBA", "Starts 28 Nov 2026, 00:00 · ends TBA", etc. */
export function saleWindowLabel(sale: Pick<SaleEvent, "status" | "startAt" | "endAt">, now: number): string {
  const start = msOf(sale.startAt);
  const end = msOf(sale.endAt);
  const endPart = end === null ? "ends TBA" : end <= now ? `ended ${formatDateTime(sale.endAt)}` : `ends ${formatDateTime(sale.endAt)}`;
  const startPart = start === null ? "" : start > now ? `Starts ${formatDateTime(sale.startAt)}` : `Started ${formatDateTime(sale.startAt)}`;
  if (sale.status === "live") {
    if (start !== null && start > now) return `Live from ${formatDateTime(sale.startAt)} · ${endPart}`;
    return `Live · ${endPart}`;
  }
  return [startPart, endPart].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// www page mirrors (keep in sync with www/lib/sale/ladder.ts)
// ---------------------------------------------------------------------------

export const WWW_ORIGIN = process.env.NEXT_PUBLIC_WWW_URL || "https://imheretravels.com";
export const WWW_DOMAIN = WWW_ORIGIN.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
export const publicSaleUrl = (slug: string) => `${WWW_ORIGIN}/${slug}`;
export const salePreviewUrl = (previewToken: string) => `${WWW_ORIGIN}/sale-preview/${previewToken}`;

const londonDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const londonDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Europe/London",
});
const londonFull = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

/** "28 Nov 2026, 00:00" in UK time, for readouts next to local-time inputs. */
export const ukDateTime = (iso: string) => londonFull.format(new Date(iso));

export type SalePhase = "upcoming" | "live" | "paused" | "ended";

/** Same rules as www `salePhase`; a draft previews as if it were live. */
export function salePhase(sale: { status: SaleStatus; startAt: string | null; endAt: string | null }, nowMs: number): SalePhase {
  if (sale.status === "paused") return "paused";
  if (sale.status === "ended") return "ended";
  if (sale.startAt && nowMs < Date.parse(sale.startAt)) return "upcoming";
  if (sale.endAt && nowMs >= Date.parse(sale.endAt)) return "ended";
  return "live";
}

/** The hero status pill copy, as www renders it. */
export function heroStatusLabel(sale: { startAt: string | null; endAt: string | null }, phase: SalePhase): string {
  switch (phase) {
    case "upcoming":
      return `Starts ${londonDateTime.format(new Date(sale.startAt!))}`;
    case "paused":
      return "Sale paused";
    case "ended":
      return "Sale ended";
    default:
      return sale.endAt ? `Live now · Ends ${londonDate.format(new Date(sale.endAt))}` : "Live now · Ends TBA";
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO → "YYYY-MM-DDTHH:mm" in the browser's timezone (DateTimePicker format). */
export function isoToLocalInput(iso: string | null | undefined): string {
  const ms = msOf(iso);
  if (ms === null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (local) → ISO UTC, or null when empty/invalid. */
export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** "500 OFF", "£2,199", " 1699 " → number; NaN when not a number. */
export function parseMoney(v: unknown): number {
  const s = String(v ?? "")
    .replace(/off/i, "")
    .replace(/[£,\s]/g, "")
    .trim();
  if (!s) return NaN;
  return Number(s);
}

/** Text from a numeric input → number, NaN when empty. */
export const numOrNaN = (s: string) => (s.trim() === "" ? NaN : Number(s));

// ---------------------------------------------------------------------------
// CSV import: `Tour,Slots,Original Price,Discount GBP,Sale Price`
// ---------------------------------------------------------------------------

export interface CsvTourGroup {
  /** Tour label as written in the CSV, e.g. "Argentina". */
  label: string;
  originalPrice: number | null;
  /** Discount £ per slot, ordered by the Slots column. */
  ladder: number[];
  warnings: string[];
}

export interface CsvParseResult {
  groups: CsvTourGroup[];
  errors: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const headerKey = (h: string) => norm(h).replace(/[^a-z]/g, "");

export function parseSaleCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: headerKey,
  });
  const errors: string[] = parsed.errors.slice(0, 3).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  const fields = parsed.meta.fields ?? [];
  const need = ["tour", "slots", "discountgbp"];
  const missing = need.filter((f) => !fields.includes(f));
  if (missing.length) {
    return {
      groups: [],
      errors: [`Missing column(s): ${missing.join(", ")}. Expected header: Tour,Slots,Original Price,Discount GBP,Sale Price`],
    };
  }

  const byTour = new Map<string, { label: string; rows: { slot: number; original: number; discount: number; sale: number; line: number }[] }>();
  parsed.data.forEach((r, i) => {
    const label = (r.tour ?? "").trim();
    if (!label) return;
    const line = i + 2;
    const slot = Number(String(r.slots ?? "").trim());
    const discount = parseMoney(r.discountgbp);
    if (!Number.isInteger(slot) || slot < 1 || !Number.isFinite(discount) || discount < 0) {
      errors.push(`Row ${line} (${label}): couldn't read Slots/Discount GBP, skipped`);
      return;
    }
    const key = norm(label);
    const g = byTour.get(key) ?? { label, rows: [] };
    g.rows.push({ slot, original: parseMoney(r.originalprice), discount, sale: parseMoney(r.saleprice), line });
    byTour.set(key, g);
  });

  const groups: CsvTourGroup[] = [];
  for (const { label, rows } of byTour.values()) {
    rows.sort((a, b) => a.slot - b.slot);
    const warnings: string[] = [];
    const originals = [...new Set(rows.map((r) => r.original).filter(Number.isFinite))];
    const originalPrice = originals[0] ?? null;
    if (originals.length > 1) warnings.push(`CSV has different original prices (${originals.join(", ")}); using ${originals[0]}`);
    const seen = new Set<number>();
    const ladderRows = rows.filter((r) => {
      if (seen.has(r.slot)) {
        warnings.push(`Slot ${r.slot} appears twice; kept the first`);
        return false;
      }
      seen.add(r.slot);
      return true;
    });
    if (ladderRows.length > MAX_SLOTS) {
      warnings.push(`Only the first ${MAX_SLOTS} slots were imported (CSV has ${ladderRows.length})`);
    }
    for (const r of ladderRows) {
      if (originalPrice !== null && Number.isFinite(r.sale) && Math.abs(originalPrice - r.discount - r.sale) > 0.5) {
        warnings.push(`Slot ${r.slot}: CSV sale price ${r.sale} ≠ ${originalPrice} − ${r.discount}; using the discount`);
      }
    }
    groups.push({ label, originalPrice, ladder: ladderRows.slice(0, MAX_SLOTS).map((r) => r.discount), warnings });
  }
  return { groups, errors };
}

/** Labels that must always be picked by hand (they span several tours). */
const MANUAL_LABELS = new Set(["ph tours", "ph tour", "philippines tours"]);
/** Known spelling differences between the sale sheet and tour data. */
const LABEL_ALIASES: Record<string, string> = { kazhakstan: "kazakhstan", kazakstan: "kazakhstan" };

export interface TourMatch {
  tour: TourPackage | null;
  /** Ambiguous or close candidates, for the manual picker. */
  candidates: TourPackage[];
  reason?: string;
}

export function matchCsvTour(label: string, tours: TourPackage[]): TourMatch {
  const raw = norm(label);
  if (MANUAL_LABELS.has(raw)) return { tour: null, candidates: [], reason: "Covers several tours, pick one" };
  const n = LABEL_ALIASES[raw] ?? raw;
  const slugN = slugify(n);
  const tiers: ((t: TourPackage) => boolean)[] = [
    (t) => norm(t.cardSubHeader ?? "") === n,
    (t) => norm(t.name ?? "").includes(n),
    (t) => !!slugN && (t.slug ?? "").toLowerCase().includes(slugN),
  ];
  for (const test of tiers) {
    const hits = tours.filter(test);
    if (hits.length === 1) return { tour: hits[0], candidates: [] };
    if (hits.length > 1) return { tour: null, candidates: hits, reason: `${hits.length} tours match, pick one` };
  }
  return { tour: null, candidates: [], reason: "No matching tour" };
}
