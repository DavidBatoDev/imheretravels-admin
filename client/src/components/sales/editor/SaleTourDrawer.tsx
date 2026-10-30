"use client";

import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Lock, Package, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TourPackage } from "@/types/tours";
import { MAX_SLOTS, SLOT_STATUS_META, formatGBP, numOrNaN, slotDisplayStatus } from "../sale-utils";
import { FieldInput, FieldLabel, HelpText, LockTip, PanelSectionHead } from "./fields";
import SaleDrawer from "./SaleDrawer";
import {
  canRemoveSlot,
  invSlot,
  isLockedAt,
  newKey,
  previewSlots,
  type DraftTour,
  type Inventory,
} from "./sale-draft";

const ICON_BTN =
  "inline-flex size-9 items-center justify-center rounded-full border-2 border-dark-gray/70 text-midnight transition-colors hover:border-midnight hover:bg-light-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/50 disabled:hover:bg-transparent";

/** Side editor for one tour: card text, original price and the slot ladder. */
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
  const open = !!tour;
  return (
    <SaleDrawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      icon={Package}
      title={tour ? `Edit deal · ${tour.displayName || tour.tourName}` : "Edit deal"}
      description={tour ? tour.tourName : undefined}
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
      {tour && <TourEditorBody tour={tour} tourPkg={tourPkg} inventory={inventory} now={now} onPatch={onPatch} />}
    </SaleDrawer>
  );
}

function TourEditorBody({
  tour: t,
  tourPkg,
  inventory,
  now,
  onPatch,
}: {
  tour: DraftTour;
  tourPkg?: TourPackage;
  inventory: Inventory;
  now: number;
  onPatch: (patch: Partial<DraftTour>) => void;
}) {
  const locked = (pos: number) => isLockedAt(inventory, t.tourPackageId, pos, now);
  const original = numOrNaN(t.originalPrice);
  const tourPrice = tourPkg?.pricing?.original;
  const priceDiffers = typeof tourPrice === "number" && Number.isFinite(original) && Math.abs(original - tourPrice) > 0.009;
  const preview = previewSlots(inventory, t, now);
  const ladder = t.discounts.map((d) => numOrNaN(d.value));
  const notDescending = ladder.some((d, i) => i > 0 && Number.isFinite(d) && Number.isFinite(ladder[i - 1]) && d > ladder[i - 1]);

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
      <section aria-labelledby={`${t.key}-card-head`}>
        <PanelSectionHead id={`${t.key}-card-head`}>Card</PanelSectionHead>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="font-body text-sm font-bold text-midnight">Card title</span>
            <p className="flex min-h-11 items-center rounded-md border-2 border-dashed border-dark-gray/40 bg-light-grey/50 px-3 font-body text-midnight">
              {t.displayName || t.tourName}
            </p>
            <HelpText id={`${t.key}-display-help`}>The tour&apos;s name. Rename the tour in Tour Packages to change it.</HelpText>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={`${t.key}-price`} required>
              Original price (£ per person)
            </FieldLabel>
            <FieldInput
              id={`${t.key}-price`}
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={t.originalPrice}
              onChange={(e) => onPatch({ originalPrice: e.target.value })}
              aria-invalid={!Number.isFinite(original) || original < 0}
              aria-describedby={priceDiffers ? `${t.key}-price-warn` : `${t.key}-price-help`}
            />
            {priceDiffers ? (
              <p id={`${t.key}-price-warn`} className="flex flex-wrap items-center gap-1 font-body text-xs text-[#9A4A00]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Tour page price is {formatGBP(tourPrice)}.
                <button
                  type="button"
                  className="font-bold underline underline-offset-2 hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
                  onClick={() => onPatch({ originalPrice: String(tourPrice) })}
                >
                  Use {formatGBP(tourPrice)}
                </button>
              </p>
            ) : (
              <HelpText id={`${t.key}-price-help`}>Shown struck through on the card.</HelpText>
            )}
          </div>
        </div>
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
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[#9A4A00]" aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby={`${t.key}-slots-head`}>
        <PanelSectionHead id={`${t.key}-slots-head`}>Slot ladder</PanelSectionHead>
        <HelpText className="mb-3">
          Slots sell in order: slot 1 first. A party of N takes the next N free slots. Held and sold slots keep the price they were shown.
        </HelpText>
        <table className="w-full">
          <caption className="sr-only">Slots for {t.displayName}</caption>
          <thead>
            <tr className="text-left font-sans text-xs font-bold text-midnight">
              <th scope="col" className="w-8 pb-2">#</th>
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
              const overOriginal = Number.isFinite(disc) && Number.isFinite(original) && disc > original;
              return (
                <tr key={d.key} className="border-t border-light-grey align-middle">
                  <td className="py-2 font-sans text-sm font-bold text-midnight">{pos + 1}</td>
                  <td className="py-2 pr-2">
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
                  <td className="py-2 pr-2 font-body text-sm font-bold tabular-nums text-midnight">
                    {p?.salePrice == null ? <span className="font-normal text-dark-gray">—</span> : formatGBP(p.salePrice)}
                    {overOriginal && <span className="block font-normal text-xs text-[#9A4A00]">More than the price</span>}
                  </td>
                  <td className="py-2 pr-2">
                    {st ? (
                      <Badge variant="outline" className={SLOT_STATUS_META[st].className}>
                        {SLOT_STATUS_META[st].label}
                      </Badge>
                    ) : (
                      <span className="font-body text-xs text-dark-gray">New</span>
                    )}
                  </td>
                  <td className="py-2">
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
                        className={cn(ICON_BTN, "size-8 hover:border-crimson-red hover:text-crimson-red")}
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
          <button
            type="button"
            onClick={addSlot}
            disabled={t.discounts.length >= MAX_SLOTS}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-midnight px-4 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/60 disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add slot
          </button>
          <span className="font-body text-xs text-dark-gray">
            {t.discounts.length} of {MAX_SLOTS} slots
          </span>
        </div>
        {notDescending && (
          <p className="mt-3 flex items-center gap-1.5 font-body text-xs text-[#9A4A00]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />A later slot has a bigger discount than an earlier one. Slot 1 is usually the cheapest.
          </p>
        )}
      </section>
    </div>
  );
}
