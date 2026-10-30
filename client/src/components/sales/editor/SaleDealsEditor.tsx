"use client";

import { useRef } from "react";
import { AlertTriangle, ExternalLink, FileSpreadsheet, ImageIcon, Lock, Package, Plus, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourPackage } from "@/types/tours";
import { DragHandle, SortableItem, SortableList, rectSortingStrategy } from "@/components/tours/dnd/SortableList";
import TourPicker from "../TourPicker";
import { CSV_HEADER_EXAMPLE, CSV_ROW_EXAMPLE, MAX_SLOTS, formatGBP } from "../sale-utils";
import { HelpText, LockTip } from "./fields";
import { freeSlots, previewSlots, slotList, tourView, type DraftTour, type Inventory, type PreviewSlot, type TourView, type UnmatchedGroup } from "./sale-draft";

const PILL_OUTLINE =
  "inline-flex h-10 items-center gap-2 rounded-full border-2 border-midnight bg-white px-5 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red focus-visible:ring-offset-2";
const WARN = "text-[#9A4A00]";

interface SaleDealsEditorProps {
  tours: DraftTour[];
  tourById: Map<string, TourPackage>;
  pickableTours: TourPackage[];
  inventory: Inventory;
  now: number;
  unmatched: UnmatchedGroup[];
  hasLocked: (t: DraftTour) => boolean;
  onAddTour: (tour: TourPackage) => void;
  onRemoveTour: (key: string) => void;
  onReorder: (from: number, to: number) => void;
  onEditTour: (key: string) => void;
  onCsvFile: (file: File) => void;
  onResolveUnmatched: (u: UnmatchedGroup, tour: TourPackage) => void;
  onSkipUnmatched: (key: string) => void;
}

/** "The deals" section. Cards mirror www `SaleTourCard`; tour data is live from the tour package. */
export default function SaleDealsEditor(props: SaleDealsEditorProps) {
  const { tours, tourById, pickableTours, inventory, now, unmatched } = props;
  const csvRef = useRef<HTMLInputElement>(null);
  const inSale = new Set(tours.map((t) => t.tourPackageId));

  return (
    <section id="sale-deals" aria-labelledby="deals-heading" className="scroll-mt-32 overflow-hidden rounded-[24px] bg-white shadow-medium">
      <div className="px-5 py-8 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="deals-heading" className="font-display text-h2-mobile text-midnight md:text-h2-desktop">
              The deals
            </h2>
            <p className="mt-3 font-body text-b2-mobile text-midnight md:text-b2-desktop">
              Prices are per person. Each tour has a handful of discounted slots, cheapest first — when one goes, the next price applies.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) props.onCsvFile(f);
              }}
            />
            <button type="button" className={PILL_OUTLINE} onClick={() => csvRef.current?.click()}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Import CSV
            </button>
            <TourPicker
              tours={pickableTours}
              excludeIds={inSale}
              onSelect={props.onAddTour}
              aria-label="Add tour"
              className="h-10 rounded-full border-2 border-crimson-red bg-crimson-red px-5 font-body text-sm font-bold text-white shadow-small hover:border-light-red hover:bg-light-red hover:text-white"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add tour
            </TourPicker>
          </div>
        </div>
        <HelpText className="mt-3">
          <span className="font-bold text-midnight">1 slot = 1 person.</span> Each tour links to a tour package: its name, cover and price are read from the tour, and sale
          prices are that price minus each slot&apos;s discount. Draft tours can be added (they have no public tour page).
        </HelpText>
        <HelpText className="mt-1">
          CSV: one row per slot, header <code className="rounded bg-light-grey px-1 text-midnight">{CSV_HEADER_EXAMPLE}</code>, e.g.{" "}
          <code className="rounded bg-light-grey px-1 text-midnight">{CSV_ROW_EXAMPLE}</code> (“500 OFF” and “£500” work too; up to {MAX_SLOTS} slots per tour; other columns are
          ignored). Tours match by country label, then name, then slug.
        </HelpText>

        {unmatched.length > 0 && (
          <div role="region" aria-label="Unmatched CSV tours" className="mt-6 rounded-lg border-2 border-vivid-orange bg-light-yellow/30 p-4">
            <p className="mb-3 flex items-center gap-2 font-sans text-sm font-bold text-midnight">
              <AlertTriangle className={cn("h-4 w-4", WARN)} aria-hidden />
              {unmatched.length} CSV tour{unmatched.length === 1 ? "" : "s"} need{unmatched.length === 1 ? "s" : ""} a manual pick. Save is blocked until each is picked or skipped.
            </p>
            <ul className="flex flex-col gap-2">
              {unmatched.map((u) => (
                <li key={u.key} className="flex flex-wrap items-center gap-3 rounded-md border border-light-grey bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-sans text-sm font-bold text-midnight">{u.group.label}</div>
                    <div className="font-body text-xs text-dark-gray">
                      {u.group.ladder.length} slot{u.group.ladder.length === 1 ? "" : "s"} · −{u.group.ladder.map((d) => formatGBP(d)).join(" / −")}
                      {u.reason && ` · ${u.reason}`}
                    </div>
                  </div>
                  <TourPicker
                    tours={pickableTours}
                    suggested={u.candidates}
                    excludeIds={inSale}
                    onSelect={(t) => props.onResolveUnmatched(u, t)}
                    size="sm"
                    className="w-56 border-2 border-dark-gray/70 bg-white text-midnight"
                    placeholder="Pick tour…"
                    aria-label={`Pick tour for ${u.group.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => props.onSkipUnmatched(u.key)}
                    className="h-9 rounded-full px-3 font-body text-sm font-bold text-midnight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
                  >
                    Skip
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tours.length === 0 ? (
          <div className="mt-8 rounded-lg border-2 border-dashed border-dark-gray/50 p-10 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-crimson-red" aria-hidden />
            <p className="font-sans text-h6-mobile text-midnight">No deals yet</p>
            <p className="mt-1 font-body text-b4-desktop text-dark-gray">Add tours one by one, or import the sale CSV.</p>
          </div>
        ) : (
          <SortableList ids={tours.map((t) => t.key)} onReorder={props.onReorder} strategy={rectSortingStrategy}>
            <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
              {tours.map((t, i) => {
                const view = tourView(t, tourById.get(t.tourPackageId));
                return (
                  <SortableItem key={t.key} id={t.key}>
                    {({ setNodeRef, style, handle }) => (
                      <li ref={setNodeRef} style={style}>
                        <DealCard
                          tour={t}
                          view={view}
                          slots={previewSlots(inventory, t, view.originalPrice, now)}
                          hasLocked={props.hasLocked(t)}
                          priorityLabel={`Deal ${i + 1}`}
                          dragHandle={<DragHandle handle={handle} className="flex size-9 items-center justify-center rounded-full bg-white text-midnight shadow-small" />}
                          onEdit={() => props.onEditTour(t.key)}
                          onRemove={() => props.onRemoveTour(t.key)}
                        />
                      </li>
                    )}
                  </SortableItem>
                );
              })}
            </ul>
          </SortableList>
        )}
      </div>
    </section>
  );
}

function DealCard({
  tour: t,
  view,
  slots,
  hasLocked,
  priorityLabel,
  dragHandle,
  onEdit,
  onRemove,
}: {
  tour: DraftTour;
  view: TourView;
  slots: PreviewSlot[];
  hasLocked: boolean;
  priorityLabel: string;
  dragHandle: React.ReactNode;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const original = view.originalPrice;
  const next = slots.find((s) => s.state === "available") ?? slots.find((s) => s.state !== "sold");
  const fromPrice = next?.salePrice ?? null;
  const unsold = slots.filter((s) => s.state !== "sold");
  const saveUpTo = unsold.reduce((m, s) => Math.max(m, s.discount ?? 0), 0);
  const left = slots.filter((s) => s.state === "available").length;
  const onHold = slots.filter((s) => s.state === "on_hold").length;
  const sold = slots.filter((s) => s.state === "sold").length;
  const soldOut = slots.length > 0 && sold === slots.length;
  const missingDiscounts = slots.filter((s) => s.discount === null).length;
  const free = freeSlots(t, original);
  const headingId = `deal-${t.key}`;

  return (
    <article aria-labelledby={headingId} className="flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-small ring-1 ring-light-grey transition-shadow hover:shadow-medium">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-light-grey">
        {view.coverImage ? (
          <img src={view.coverImage} alt="" className={cn("h-full w-full object-cover", soldOut && "grayscale")} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-dark-gray">
            <ImageIcon className="h-8 w-8" aria-hidden />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {soldOut ? (
            <span className="inline-flex items-center rounded-full bg-midnight px-3 py-1.5 font-body text-b4-mobile font-bold text-white md:text-b4-desktop">Sold out</span>
          ) : (next?.discount ?? 0) > 0 ? (
            <span className="inline-flex items-center rounded-full bg-crimson-red px-3 py-1.5 font-body text-b4-mobile font-bold tabular-nums text-white md:text-b4-desktop">
              Save {formatGBP(next!.discount!)}
            </span>
          ) : null}
          {view.status === "draft" && (
            <span className="inline-flex items-center rounded-full bg-sunglow-yellow px-3 py-1.5 font-body text-b4-mobile font-bold text-midnight md:text-b4-desktop">Draft tour</span>
          )}
          {view.status === "missing" && (
            <span className="inline-flex items-center rounded-full bg-midnight px-3 py-1.5 font-body text-b4-mobile font-bold text-white md:text-b4-desktop">Tour not found</span>
          )}
        </div>
        <div className="absolute right-3 top-3 flex gap-2">
          {dragHandle}
          <LockTip show={hasLocked} text="Has held/sold slots, so it can't be removed">
            <button
              type="button"
              disabled={hasLocked}
              onClick={onRemove}
              aria-label={`Remove ${view.name} from sale`}
              className="flex size-9 items-center justify-center rounded-full bg-white text-[#B4232E] shadow-small transition-colors hover:bg-crimson-red hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:text-dark-gray/50 disabled:hover:bg-white"
            >
              {hasLocked ? <Lock className="h-4 w-4" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            </button>
          </LockTip>
        </div>
        <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-body text-[11px] font-bold text-white">{priorityLabel}</span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Card title is the tour name (rename the tour to change it). */}
        <h3 id={headingId} className="font-sans text-h5-mobile font-bold text-midnight md:text-h5-desktop">
          {view.name}
        </h3>
        <p className="mt-1 font-body text-xs">
          {view.publicUrl ? (
            <a href={view.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-midnight underline underline-offset-2 hover:text-crimson-red">
              View tour <ExternalLink className="h-3 w-3" aria-hidden />
              <span className="sr-only">(opens {view.name} in a new tab)</span>
            </a>
          ) : view.status === "missing" ? (
            <span className="font-bold text-[#B4232E]">This tour no longer exists. Remove it from the sale.</span>
          ) : (
            <span className="text-dark-gray">{view.status === "draft" ? "Draft — no public page" : "Archived — no public page"}</span>
          )}
        </p>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
          {fromPrice !== null ? (
            <>
              <span className="font-body text-b4-desktop text-dark-gray">Now from</span>
              <span className="font-display text-h4-mobile leading-none text-midnight md:text-h4-desktop">{formatGBP(fromPrice)}</span>
              {original > fromPrice && (
                <span className="font-body text-b2-mobile text-dark-gray line-through md:text-b2-desktop">
                  <span className="sr-only">Was </span>
                  {formatGBP(original)}
                </span>
              )}
            </>
          ) : (
            <span className="font-body text-b4-desktop text-dark-gray">Enter slot discounts to see prices</span>
          )}
        </div>
        <p className="mt-1 font-body text-xs text-dark-gray">
          Tour price {formatGBP(original)} per person
          {saveUpTo > 0 && (
            <>
              {" "}
              · <span className="font-bold text-midnight">save up to {formatGBP(saveUpTo)}</span>
            </>
          )}
        </p>

        <p className="mt-4 flex items-center gap-1.5 font-sans text-xs font-bold text-midnight">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {slots.length} slot{slots.length === 1 ? "" : "s"} · 1 slot = 1 person
        </p>
        {slots.length > 0 && <CompactLadder slots={slots} nextIndex={next?.state === "available" ? next.index : undefined} />}

        <p className="mt-3 font-body text-b4-mobile font-medium tabular-nums text-midnight md:text-b4-desktop">
          {slots.length === 0 ? "Slots coming soon" : soldOut ? "Sold out" : `${left} of ${slots.length} left`}
          {(onHold > 0 || sold > 0) && !soldOut && (
            <span className="font-normal text-dark-gray">
              {sold > 0 && ` · ${sold} sold`}
              {onHold > 0 && ` · ${onHold} on hold`}
            </span>
          )}
        </p>

        {missingDiscounts > 0 && (
          <p className="mt-2 flex items-center gap-1 font-body text-xs font-medium text-[#B4232E]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {missingDiscounts} slot{missingDiscounts === 1 ? " has" : "s have"} no discount yet
          </p>
        )}
        {free.length > 0 && (
          <p className={cn("mt-2 flex items-start gap-1 font-body text-xs", WARN)}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Slot {slotList(free)} would sell at £0
          </p>
        )}

        <div className="mt-auto pt-5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-midnight px-6 py-2.5 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red focus-visible:ring-offset-2"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Edit slots &amp; discounts
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * The ladder at a glance, 5 slots per row so 10–20 slots stay readable:
 * slot number and sale price per cell, in the www slot colours
 * (next up = solid crimson, on hold = dashed amber, sold = grey struck).
 */
function CompactLadder({ slots, nextIndex }: { slots: PreviewSlot[]; nextIndex?: number }) {
  return (
    <ol className="mt-2 grid grid-cols-5 gap-1" aria-label="Slot prices, cheapest first">
      {slots.map((s) => {
        const isNext = s.index === nextIndex;
        return (
          <li
            key={s.index}
            className={cn(
              "flex min-h-10 flex-col items-center justify-center rounded-sm px-0.5 py-1 text-center tabular-nums",
              s.state === "sold"
                ? "bg-light-grey text-dark-gray"
                : s.state === "on_hold"
                  ? "border-2 border-dashed border-vivid-orange bg-light-yellow/40 text-midnight"
                  : isNext
                    ? "bg-crimson-red text-white"
                    : "bg-crimson-red/10 text-midnight",
            )}
          >
            <span className="sr-only">
              Slot {s.index}, {s.salePrice === null ? "no price yet" : formatGBP(s.salePrice)}
              {s.discount !== null && `, ${formatGBP(s.discount)} off`}, {s.state === "on_hold" ? "on hold" : s.state}
              {isNext && ", next up"}
            </span>
            <span aria-hidden className="font-body text-[0.65rem] font-medium leading-tight">
              {s.state === "sold" ? "Sold" : s.state === "on_hold" ? "Hold" : `#${s.index}`}
            </span>
            <span aria-hidden className={cn("font-body text-[0.75rem] font-bold leading-tight", s.state === "sold" && "line-through decoration-1")}>
              {s.salePrice === null ? "—" : formatGBP(s.salePrice)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
