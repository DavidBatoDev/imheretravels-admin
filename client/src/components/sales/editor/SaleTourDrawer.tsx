"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ExternalLink, Lock, Package, Plus, Trash2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TourPackage } from "@/types/tours";
import { MAX_SLOTS, SLOT_STATUS_META, formatGBP, numOrNaN, slotDisplayStatus } from "../sale-utils";
import { FieldInput, HelpText, LockTip, PanelSectionHead } from "./fields";
import SaleDrawer from "./SaleDrawer";
import {
  canRemoveSlot,
  fillSlots,
  freeSlots,
  invSlot,
  isLockedAt,
  newKey,
  previewSlots,
  slotList,
  tourView,
  type DraftTour,
  type Inventory,
  type TourView,
} from "./sale-draft";

const ICON_BTN =
  "inline-flex size-9 items-center justify-center rounded-full border-2 border-dark-gray/70 text-midnight transition-colors hover:border-midnight hover:bg-light-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/50 disabled:hover:bg-transparent";
const OUTLINE_PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-midnight px-4 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/60 disabled:hover:bg-transparent";
const WARN = "text-[#9A4A00]";

/** Side editor for one sale tour: the linked tour (read-only) and its slot ladder. */
export default function SaleTourDrawer({
  tour,
  tourPkg,
  inventory,
  now,
  position,
  total,
  hasLocked,
  onPatch,
  onMove,
  onRemove,
  onClose,
}: {
  tour: DraftTour | null;
  tourPkg?: TourPackage;
  inventory: Inventory;
  now: number;
  position: number;
  total: number;
  hasLocked: boolean;
  onPatch: (patch: Partial<DraftTour>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const view = tour ? tourView(tour, tourPkg) : null;
  return (
    <SaleDrawer
      open={!!tour}
      onOpenChange={(o) => !o && onClose()}
      icon={Package}
      title={view ? `Edit deal · ${view.name}` : "Edit deal"}
      description="1 slot = 1 person. Slots sell in order, slot 1 first."
      footer={
        tour && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-dark-gray">
                Position {position + 1} of {total}
              </span>
              <button type="button" className={ICON_BTN} disabled={position === 0} onClick={() => onMove(-1)} aria-label="Move this deal earlier">
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className={ICON_BTN} disabled={position >= total - 1} onClick={() => onMove(1)} aria-label="Move this deal later">
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <LockTip show={hasLocked} text="Has held/sold slots, so it can't be removed">
              <button
                type="button"
                disabled={hasLocked}
                onClick={onRemove}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-crimson-red px-4 font-body text-sm font-bold text-[#B4232E] transition-colors hover:bg-crimson-red hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/60 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove from sale
              </button>
            </LockTip>
          </div>
        )
      }
    >
      {tour && view && <TourEditorBody key={tour.key} tour={tour} view={view} inventory={inventory} now={now} onPatch={onPatch} />}
    </SaleDrawer>
  );
}

function TourEditorBody({
  tour: t,
  view,
  inventory,
  now,
  onPatch,
}: {
  tour: DraftTour;
  view: TourView;
  inventory: Inventory;
  now: number;
  onPatch: (patch: Partial<DraftTour>) => void;
}) {
  const locked = (pos: number) => isLockedAt(inventory, t.tourPackageId, pos, now);
  const original = view.originalPrice;
  const preview = previewSlots(inventory, t, original, now);
  const ladder = t.discounts.map((d) => numOrNaN(d.value));
  const notDescending = ladder.some((d, i) => i > 0 && Number.isFinite(d) && Number.isFinite(ladder[i - 1]) && d > ladder[i - 1]);
  const free = freeSlots(t, original);

  const setDiscount = (pos: number, value: string) => onPatch({ discounts: t.discounts.map((d, i) => (i === pos ? { ...d, value } : d)) });
  const moveSlot = (pos: number, dir: -1 | 1) => {
    const j = pos + dir;
    if (j < 0 || j >= t.discounts.length || locked(pos) || locked(j)) return;
    const next = [...t.discounts];
    [next[pos], next[j]] = [next[j], next[pos]];
    onPatch({ discounts: next });
  };
  const removeSlot = (pos: number) => {
    if (canRemoveSlot(inventory, t, pos, now)) onPatch({ discounts: t.discounts.filter((_, i) => i !== pos) });
  };
  const addSlot = () => {
    if (t.discounts.length >= MAX_SLOTS) return;
    const last = t.discounts[t.discounts.length - 1]?.value ?? "";
    onPatch({ discounts: [...t.discounts, { key: newKey(), value: last }] });
  };

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby={`${t.key}-tour-head`}>
        <PanelSectionHead id={`${t.key}-tour-head`}>Tour</PanelSectionHead>
        <div className="flex gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-md bg-light-grey">
            {view.coverImage && <img src={view.coverImage} alt="" className="h-full w-full object-cover" />}
          </div>
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-body text-sm">
            <dt className="font-bold text-midnight">Name</dt>
            <dd className="min-w-0 truncate text-midnight">{view.name}</dd>
            <dt className="font-bold text-midnight">Price</dt>
            <dd className="tabular-nums text-midnight">{formatGBP(original)} per person</dd>
            <dt className="font-bold text-midnight">Page</dt>
            <dd>
              {view.publicUrl ? (
                <a href={view.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-midnight underline underline-offset-2 hover:text-crimson-red">
                  View tour <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : view.status === "missing" ? (
                <span className="font-bold text-[#B4232E]">Tour not found — remove it from the sale</span>
              ) : (
                <span className="text-dark-gray">{view.status === "draft" ? "Draft — no public page" : "Archived — no public page"}</span>
              )}
            </dd>
          </dl>
        </div>
        <HelpText className="mt-3">
          Name, cover and price come from the tour package and update automatically. Change them in Tour Packages. Sale prices are always the tour&apos;s current price minus
          each slot&apos;s discount; sold slots keep the price they sold at.
        </HelpText>
        {t.notes.length > 0 && (
          <div className="mt-4 rounded-md border-2 border-vivid-orange/60 bg-light-yellow/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-sans text-xs font-bold text-midnight">From the CSV import</span>
              <button
                type="button"
                onClick={() => onPatch({ notes: [] })}
                className="inline-flex items-center gap-1 rounded font-body text-xs font-bold text-midnight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
              >
                <X className="h-3 w-3" aria-hidden /> Dismiss
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {t.notes.map((n, i) => (
                <li key={i} className="flex gap-1.5 font-body text-xs text-midnight">
                  <AlertTriangle className={cn("mt-0.5 h-3 w-3 shrink-0", WARN)} aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby={`${t.key}-slots-head`}>
        <PanelSectionHead id={`${t.key}-slots-head`}>Slot ladder</PanelSectionHead>
        <p className="mb-3 flex items-start gap-2 rounded-md bg-light-grey/70 px-3 py-2 font-body text-xs text-midnight">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-bold">1 slot = 1 person.</span> {t.discounts.length} slot{t.discounts.length === 1 ? "" : "s"} means up to {t.discounts.length}{" "}
            {t.discounts.length === 1 ? "person" : "people"} can book at a discount. Slots sell in order (slot 1 first); a party of N takes the next N free slots. Held and sold slots
            keep their discount.
          </span>
        </p>

        <QuickFill tour={t} locked={locked} onApply={(discounts) => onPatch({ discounts })} />

        <table className="mt-4 w-full">
          <caption className="sr-only">Slots for {view.name}</caption>
          <thead>
            <tr className="text-left font-sans text-xs font-bold text-midnight">
              <th scope="col" className="w-10 pb-2">Slot</th>
              <th scope="col" className="pb-2">Discount £</th>
              <th scope="col" className="pb-2">Sale price</th>
              <th scope="col" className="pb-2">Status</th>
              <th scope="col" className="pb-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {t.discounts.map((d, pos) => {
              const saved = invSlot(inventory, t.tourPackageId, pos);
              const isLocked = locked(pos);
              const p = preview[pos];
              const st = saved ? slotDisplayStatus(saved, now) : null;
              const disc = numOrNaN(d.value);
              const isFree = Number.isFinite(disc) && disc >= original;
              return (
                <tr key={d.key} className="border-t border-light-grey align-middle">
                  <td className="py-1.5 font-sans text-sm font-bold text-midnight">{pos + 1}</td>
                  <td className="py-1.5 pr-2">
                    <LockTip show={isLocked} text="Held/sold slots keep their price">
                      <div className="relative w-28">
                        <FieldInput
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="1"
                          value={d.value}
                          disabled={isLocked}
                          onChange={(e) => setDiscount(pos, e.target.value)}
                          aria-label={`Slot ${pos + 1} discount in pounds`}
                          aria-invalid={!isLocked && d.value.trim() !== "" && (!Number.isFinite(disc) || disc < 0)}
                          className={cn("h-9", isLocked && "pr-8")}
                        />
                        {isLocked && <Lock className="absolute right-2.5 top-2.5 h-4 w-4 text-dark-gray" aria-hidden />}
                      </div>
                    </LockTip>
                  </td>
                  <td className="py-1.5 pr-2 font-body text-sm font-bold tabular-nums text-midnight">
                    {p?.salePrice == null ? <span className="font-normal text-dark-gray">—</span> : formatGBP(p.salePrice)}
                    {isFree && !isLocked && <span className={cn("block text-xs font-normal", WARN)}>Free: discount ≥ price</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {st ? (
                      <Badge variant="outline" className={SLOT_STATUS_META[st].className}>
                        {SLOT_STATUS_META[st].label}
                      </Badge>
                    ) : (
                      <span className="font-body text-xs text-dark-gray">New</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className={cn(ICON_BTN, "size-8")}
                        disabled={pos === 0 || isLocked || locked(pos - 1)}
                        onClick={() => moveSlot(pos, -1)}
                        aria-label={`Move slot ${pos + 1} up`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={cn(ICON_BTN, "size-8")}
                        disabled={pos === t.discounts.length - 1 || isLocked || locked(pos + 1)}
                        onClick={() => moveSlot(pos, 1)}
                        aria-label={`Move slot ${pos + 1} down`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={cn(ICON_BTN, "size-8 hover:border-crimson-red hover:text-[#B4232E]")}
                        disabled={!canRemoveSlot(inventory, t, pos, now)}
                        onClick={() => removeSlot(pos)}
                        aria-label={`Remove slot ${pos + 1}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={addSlot} disabled={t.discounts.length >= MAX_SLOTS} className={OUTLINE_PILL}>
            <Plus className="h-4 w-4" aria-hidden /> Add slot
          </button>
          <span className="font-body text-xs text-dark-gray">
            {t.discounts.length} of {MAX_SLOTS} slots · “Add slot” copies the last discount
          </span>
        </div>
        {free.length > 0 && (
          <p className={cn("mt-3 flex items-start gap-1.5 font-body text-xs", WARN)}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Slot {slotList(free)} would sell at £0: the discount is the whole {formatGBP(original)} price or more.
          </p>
        )}
        {notDescending && (
          <p className={cn("mt-2 flex items-start gap-1.5 font-body text-xs", WARN)}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />A later slot has a bigger discount than an earlier one. Slot 1 is usually the biggest discount.
          </p>
        )}
      </section>
    </div>
  );
}

/** "Set slots N–M to £X": fills a range in one go (and adds slots up to M if needed). */
function QuickFill({ tour: t, locked, onApply }: { tour: DraftTour; locked: (pos: number) => boolean; onApply: (discounts: DraftTour["discounts"]) => void }) {
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(Math.max(1, t.discounts.length)));
  const [value, setValue] = useState("");
  const f = Number(from);
  const tt = Number(to);
  const v = numOrNaN(value);
  const valid = Number.isInteger(f) && Number.isInteger(tt) && f >= 1 && tt >= 1 && f <= MAX_SLOTS && tt <= MAX_SLOTS && Number.isFinite(v) && v >= 0;
  const id = `${t.key}-fill`;
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border-2 border-dashed border-dark-gray/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply(fillSlots(t, f, tt, String(v), locked));
      }}
      aria-labelledby={`${id}-label`}
    >
      <span id={`${id}-label`} className="w-full font-sans text-xs font-bold text-midnight">
        Quick fill
      </span>
      <label className="flex items-center gap-1.5 font-body text-sm text-midnight">
        Set slots
        <FieldInput type="number" min={1} max={MAX_SLOTS} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-16" aria-label="From slot" />
      </label>
      <label className="flex items-center gap-1.5 font-body text-sm text-midnight">
        to
        <FieldInput type="number" min={1} max={MAX_SLOTS} value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-16" aria-label="To slot" />
      </label>
      <label className="flex items-center gap-1.5 font-body text-sm text-midnight">
        at £
        <FieldInput type="number" min={0} step="1" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-24" aria-label="Discount in pounds" placeholder="200" />
        off
      </label>
      <button type="submit" disabled={!valid} className={OUTLINE_PILL}>
        Apply
      </button>
      <HelpText className="w-full">Adds slots up to the last number if needed (max {MAX_SLOTS}). Held and sold slots are skipped.</HelpText>
    </form>
  );
}
