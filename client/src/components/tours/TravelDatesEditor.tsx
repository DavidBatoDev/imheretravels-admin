"use client";

import React from "react";
import { UseFormReturn, useFieldArray } from "react-hook-form";
import { Plus, Minus, Copy, Plane, ArrowRight, CalendarDays, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import TourDatePicker from "./TourDatePicker";

const CURRENCY_SYM: Record<string, string> = { USD: "$", EUR: "£", GBP: "£" };

const isValidIntegerInput = (value: string) => /^\d*$/.test(value);
const isValidDecimalInput = (value: string) => /^\d*\.?\d*$/.test(value);

const formatDateDisplay = (isoDate: string): string => {
  if (!isoDate) return "";
  const date = new Date(isoDate + "T00:00:00");
  return isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

interface TravelDatesEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Reusable rich editor for the `travelDates` field array — Active toggle,
 * duplicate, Start/Days/End (auto-calculated), and per-date pricing overrides
 * (Custom Price / Reservation Fee). Presentational: drives everything via the
 * passed `form`, so it can be hosted in the Settings panel or a modal.
 */
export default function TravelDatesEditor({ form }: TravelDatesEditorProps) {
  const {
    fields: travelDateFields,
    append: appendTravelDate,
    remove: removeTravelDate,
  } = useFieldArray({ control: form.control, name: "travelDates" });

  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);
  const gv = (n: string) => form.getValues(n as any);

  const sym = CURRENCY_SYM[(w("pricing.currency") as string) ?? "GBP"] ?? "£";

  const recalcEnd = (i: number, startISO: string, days: number | undefined) => {
    if (startISO && days && days > 0) {
      const end = new Date(startISO);
      end.setDate(end.getDate() + days - 1);
      sv(`travelDates.${i}.endDate`, end.toISOString().split("T")[0]);
    }
  };

  const emptyDate = () => ({
    startDate: "", endDate: "", isAvailable: true, hasCustomPricing: false,
    customOriginal: undefined, customDiscounted: undefined, customDeposit: undefined,
    hasCustomOriginal: false, hasCustomDiscounted: false, hasCustomDeposit: false,
  });

  return (
    <div className="space-y-4">
      {travelDateFields.map((field, index) => {
        const isAvailable = w(`travelDates.${index}.isAvailable`) !== false;
        const startDate = (w(`travelDates.${index}.startDate`) as string) || "";
        const endDate = (w(`travelDates.${index}.endDate`) as string) || "";
        const days = w(`travelDates.${index}.tourDays`);
        const hasPrice = w(`travelDates.${index}.hasCustomOriginal`) === true;
        const hasFee = w(`travelDates.${index}.hasCustomDeposit`) === true;

        return (
          <div
            key={field.id}
            className={`group relative overflow-hidden rounded-2xl border bg-white shadow-xsmall transition-all ${
              isAvailable ? "border-light-grey hover:shadow-small" : "border-light-grey opacity-70"
            }`}
          >
            {/* Status accent bar */}
            <span
              className={`absolute inset-y-0 left-0 w-1 ${isAvailable ? "bg-spring-green" : "bg-grey/40"}`}
              aria-hidden
            />

            <div className="p-4 pl-5 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-crimson-red text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="leading-tight">
                    <p className="font-sans text-sm font-bold text-midnight">Tour Date {index + 1}</p>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                        isAvailable ? "text-emerald-600" : "text-dark-gray/60"
                      }`}
                    >
                      <span className={`inline-block size-1.5 rounded-full ${isAvailable ? "bg-spring-green" : "bg-grey"}`} />
                      {isAvailable ? "Available" : "Hidden"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Switch
                    checked={isAvailable}
                    onCheckedChange={(v) => sv(`travelDates.${index}.isAvailable`, v)}
                    className="data-[state=checked]:bg-spring-green"
                    title={isAvailable ? "Visible on site" : "Hidden"}
                  />
                  <button
                    type="button"
                    title="Duplicate"
                    onClick={() => {
                      const v = gv(`travelDates.${index}`) as any;
                      appendTravelDate({ ...emptyDate(), ...v });
                    }}
                    className="ml-1 grid size-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-light-grey hover:text-midnight"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => removeTravelDate(index)}
                    disabled={travelDateFields.length === 1}
                    className="grid size-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-dark-gray"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Date band: Start → Days → End */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_1fr] sm:items-end">
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-gray">
                    <Plane className="h-3.5 w-3.5 text-crimson-red" /> Start
                  </label>
                  <TourDatePicker
                    value={startDate}
                    onChange={(iso) => {
                      sv(`travelDates.${index}.startDate`, iso);
                      recalcEnd(index, iso, days);
                    }}
                    label="Tour Start Date"
                    minYear={2000}
                    maxYear={2050}
                  />
                </div>

                <div className="w-full sm:w-20">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-dark-gray">Days</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="11"
                    value={days ?? ""}
                    onChange={(e) => {
                      if (!isValidIntegerInput(e.target.value)) return;
                      const d = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                      sv(`travelDates.${index}.tourDays`, d);
                      recalcEnd(index, gv(`travelDates.${index}.startDate`) as string, d);
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-center text-sm font-medium text-midnight outline-none transition-shadow focus:ring-2 focus:ring-crimson-red/30"
                  />
                </div>

                <div className="hidden pb-2.5 sm:flex sm:items-center sm:justify-center">
                  <ArrowRight className="h-4 w-4 text-grey" />
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-gray">
                    <CalendarDays className="h-3.5 w-3.5 text-crimson-red" /> End
                  </label>
                  <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-light-grey/50 px-3 text-sm text-dark-gray">
                    <span className={endDate ? "text-midnight" : "text-dark-gray/50"}>
                      {endDate ? formatDateDisplay(endDate) : "—"}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-grey">Auto</span>
                  </div>
                </div>
              </div>

              {/* Per-date pricing overrides */}
              <div className="rounded-xl border border-light-grey bg-light-grey/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-dark-gray">Pricing override</span>
                  <span className="text-xs text-dark-gray/50">·</span>
                  <span className="text-xs text-dark-gray/60">applies to this date only</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => sv(`travelDates.${index}.hasCustomOriginal`, true)}
                      disabled={hasPrice}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-midnight transition-colors hover:border-crimson-red/40 hover:text-crimson-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-midnight"
                    >
                      <Plus className="h-3 w-3" /> Custom Price
                    </button>
                    <button
                      type="button"
                      onClick={() => sv(`travelDates.${index}.hasCustomDeposit`, true)}
                      disabled={hasFee}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-midnight transition-colors hover:border-crimson-red/40 hover:text-crimson-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-midnight"
                    >
                      <Plus className="h-3 w-3" /> Reservation Fee
                    </button>
                  </div>
                </div>

                {(hasPrice || hasFee) && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {hasPrice && (
                      <PriceField
                        label="Custom Price"
                        sym={sym}
                        value={w(`travelDates.${index}.customOriginal`)}
                        onChange={(v) => sv(`travelDates.${index}.customOriginal`, v)}
                        onRemove={() => {
                          sv(`travelDates.${index}.hasCustomOriginal`, false);
                          sv(`travelDates.${index}.customOriginal`, undefined);
                        }}
                      />
                    )}
                    {hasFee && (
                      <PriceField
                        label="Reservation Fee"
                        sym={sym}
                        value={w(`travelDates.${index}.customDeposit`)}
                        onChange={(v) => sv(`travelDates.${index}.customDeposit`, v)}
                        onRemove={() => {
                          sv(`travelDates.${index}.hasCustomDeposit`, false);
                          sv(`travelDates.${index}.customDeposit`, undefined);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => appendTravelDate(emptyDate())}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-crimson-red/40 py-3 text-sm font-semibold text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5"
      >
        <Plus className="h-4 w-4" /> Add Tour Date
      </button>
    </div>
  );
}

function PriceField({
  label, sym, value, onChange, onRemove,
}: {
  label: string;
  sym: string;
  value: unknown;
  onChange: (v: string | undefined) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-midnight">{label}</span>
        <button
          type="button"
          onClick={onRemove}
          className="grid size-5 place-items-center rounded text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red"
          title="Remove override"
        >
          <Minus className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 focus-within:ring-2 focus-within:ring-crimson-red/30">
        <span className="text-sm text-dark-gray">{sym}</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => {
            if (!isValidDecimalInput(e.target.value)) return;
            onChange(e.target.value === "" ? undefined : e.target.value);
          }}
          className="h-9 w-full bg-transparent text-sm font-medium text-midnight outline-none"
        />
      </div>
    </div>
  );
}
