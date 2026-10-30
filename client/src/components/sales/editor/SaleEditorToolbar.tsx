"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { ArrowLeft, Check, Clock, Copy, ExternalLink, Eye, ListChecks, Loader2, Save, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SaleStatus } from "@/types/sale-events";
import { SALE_STATUS_META, localInputToIso, ukDateTime } from "../sale-utils";
import { FIELD_CLASS, FieldLabel, HelpText, SELECT_TRIGGER_CLASS } from "./fields";

export const STATUS_HELP: Record<SaleStatus, string> = {
  draft: "Not public. Only the private preview link shows it.",
  live: "Public. Customers can hold slots between the start and end time.",
  paused: "The page stays up but new holds are blocked.",
  ended: "The sale is over. No new holds.",
};

const PILL =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3 font-body text-sm font-bold transition-colors xl:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red focus-visible:ring-offset-1";
const PILL_IDLE = "border-dark-gray/70 bg-white text-midnight hover:border-midnight hover:bg-light-grey";
const PILL_ON = "border-crimson-red bg-crimson-red/5 text-[#B4232E]";
const ICON_PILL =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-dark-gray/70 bg-white text-midnight transition-colors hover:border-midnight hover:bg-light-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:opacity-50";

export interface ScheduleValue {
  startLocal: string;
  endTba: boolean;
  endLocal: string;
}

interface ToolbarProps {
  name: string;
  /** Phase of the saved sale on the site, e.g. "Live now" / "Not saved yet". */
  siteBadge: { label: string; className: string };
  status: SaleStatus;
  onStatus: (s: SaleStatus) => void;
  schedule: ScheduleValue;
  onSchedule: (patch: Partial<ScheduleValue>) => void;
  scheduleOpen: boolean;
  onScheduleOpen: (o: boolean) => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  canTrack: boolean;
  onTrack: () => void;
  previewLink: string | null;
  liveUrl: string | null;
  onCopy: (text: string, what: string) => void;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  isNew: boolean;
  onSave: () => void;
  onBack: () => void;
}

const ukShort = (local: string) => {
  const iso = localInputToIso(local);
  return iso ? ukDateTime(iso) : "";
};

function scheduleSummary(s: ScheduleValue) {
  const start = s.startLocal ? `Starts ${ukShort(s.startLocal)}` : "Starts when Live";
  const end = s.endTba ? "Ends TBA" : s.endLocal ? `Ends ${ukShort(s.endLocal)}` : "End not set";
  return `${start} · ${end}`;
}

export default function SaleEditorToolbar(p: ToolbarProps) {
  const statusSelect = (compact: boolean) => (
    <Select value={p.status} onValueChange={(v) => p.onStatus(v as SaleStatus)}>
      <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, compact ? "h-9 w-[6.5rem] text-xs" : "h-9 w-32")} aria-label="Sale status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-72">
        {(Object.keys(SALE_STATUS_META) as SaleStatus[]).map((s) => (
          <SelectPrimitive.Item
            key={s}
            value={s}
            className="relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-2 pl-8 pr-2 outline-none focus:bg-light-grey data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            <span className="absolute left-2 top-2.5 flex h-3.5 w-3.5 items-center justify-center">
              <SelectPrimitive.ItemIndicator>
                <Check className="h-4 w-4 text-midnight" />
              </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>
              <span className="font-sans text-sm font-bold text-midnight">{SALE_STATUS_META[s].label}</span>
            </SelectPrimitive.ItemText>
            <span className="font-body text-xs text-dark-gray">{STATUS_HELP[s]}</span>
          </SelectPrimitive.Item>
        ))}
      </SelectContent>
    </Select>
  );

  const scheduleTrigger = (compact: boolean) => (
    <Popover open={p.scheduleOpen} onOpenChange={p.onScheduleOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(PILL, p.scheduleOpen ? PILL_ON : PILL_IDLE, compact && "h-8 px-3 text-xs")} title={scheduleSummary(p.schedule)}>
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          {!compact && <span className="hidden max-w-[16rem] truncate 2xl:inline">{scheduleSummary(p.schedule)}</span>}
          <span className={cn(!compact && "hidden xl:inline 2xl:hidden")}>Schedule</span>
          {!compact && <span className="sr-only xl:hidden">Schedule</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <SchedulePanel {...p.schedule} onChange={p.onSchedule} />
      </PopoverContent>
    </Popover>
  );

  const preview = (compact: boolean) =>
    p.previewLink ? (
      <a
        href={p.previewLink}
        target="_blank"
        rel="noopener noreferrer"
        title={p.dirty ? "Opens the last saved version" : "Private preview (any status)"}
        aria-label={compact ? "Open private preview" : undefined}
        className={cn(compact ? ICON_PILL : cn(PILL, PILL_IDLE))}
      >
        <Eye className="h-4 w-4" aria-hidden />
        {!compact && "Preview"}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red">
            <button type="button" disabled className={cn(compact ? ICON_PILL : cn(PILL, PILL_IDLE), "pointer-events-none opacity-50")} aria-label="Preview">
              <Eye className="h-4 w-4" aria-hidden />
              {!compact && "Preview"}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Save once to get a preview link</TooltipContent>
      </Tooltip>
    );

  const copyBtn = p.previewLink && (
    <button type="button" onClick={() => p.onCopy(p.previewLink!, "Preview link")} className={ICON_PILL} aria-label="Copy preview link" title="Copy preview link">
      <Copy className="h-4 w-4" aria-hidden />
    </button>
  );

  const live = (compact: boolean) =>
    p.liveUrl && (
      <a
        href={p.liveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(compact ? ICON_PILL : cn(PILL, PILL_IDLE))}
        aria-label={compact ? "View live page" : undefined}
        title="View live page"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
        {!compact && <span className="hidden xl:inline">View live</span>}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );

  const saveStatus = (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-body text-xs font-medium text-dark-gray" role="status" aria-live="polite">
      {p.dirty ? (
        <>
          <span className="size-2 rounded-full bg-vivid-orange" aria-hidden />
          Unsaved changes
        </>
      ) : p.isNew ? (
        "Not saved yet"
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-[#1B7F4B]" aria-hidden />
          Saved
        </>
      )}
    </span>
  );

  const saveBtn = (compact: boolean) => (
    <button
      type="button"
      onClick={p.onSave}
      disabled={p.busy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-crimson-red font-body font-bold text-white shadow-small transition-colors hover:bg-light-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "h-9 px-4 text-sm" : "h-9 px-5 text-sm",
      )}
    >
      {p.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
      {p.saving ? (
        "Saving…"
      ) : compact ? (
        "Save"
      ) : (
        <>
          <span className="xl:hidden">{p.isNew ? "Create" : "Save"}</span>
          <span className="hidden xl:inline">{p.isNew ? "Create sale" : "Save changes"}</span>
        </>
      )}
    </button>
  );

  return (
    <div className="sticky top-0 z-30 border-b border-light-grey bg-white shadow-xsmall lg:top-16">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <button
              type="button"
              onClick={p.onBack}
              className="flex shrink-0 items-center gap-2 rounded-md font-body text-b4-desktop font-medium text-dark-gray transition-colors hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Back to Sales</span>
              <span className="sr-only sm:hidden">Back to Sales</span>
            </button>
            <span className="hidden h-6 w-px shrink-0 bg-light-grey lg:block" aria-hidden />
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span className="hidden truncate font-sans text-sm font-bold text-midnight 2xl:inline">{p.name || "Untitled sale"}</span>
              <span className={cn("shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-bold", p.siteBadge.className)}>{p.siteBadge.label}</span>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <span className="hidden xl:block">{saveStatus}</span>
            {statusSelect(false)}
            {scheduleTrigger(false)}
            <button type="button" onClick={p.onToggleSettings} className={cn(PILL, p.settingsOpen ? PILL_ON : PILL_IDLE)} aria-pressed={p.settingsOpen}>
              <Settings className="h-4 w-4" aria-hidden />
              <span className="hidden xl:inline">Settings</span>
              <span className="sr-only xl:hidden">Settings</span>
            </button>
            {p.canTrack && (
              <button type="button" onClick={p.onTrack} className={cn(PILL, PILL_IDLE)}>
                <ListChecks className="h-4 w-4" aria-hidden />
                <span className="hidden xl:inline">Track slots</span>
                <span className="sr-only xl:hidden">Track slots</span>
              </button>
            )}
            {preview(false)}
            {copyBtn}
            {live(false)}
            {saveBtn(false)}
          </div>

          {/* Mobile main row */}
          <div className="flex items-center gap-2 md:hidden">
            {statusSelect(true)}
            {saveBtn(true)}
          </div>
        </div>

        {/* Mobile secondary row */}
        <div className="flex items-center justify-between gap-2 border-t border-light-grey py-1.5 md:hidden">
          <div className="flex items-center gap-2">
            {scheduleTrigger(true)}
            {saveStatus}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={p.onToggleSettings} className={cn(ICON_PILL, p.settingsOpen && "border-crimson-red text-[#B4232E]")} aria-label="Settings" aria-pressed={p.settingsOpen}>
              <Settings className="h-4 w-4" aria-hidden />
            </button>
            {p.canTrack && (
              <button type="button" onClick={p.onTrack} className={ICON_PILL} aria-label="Track slots">
                <ListChecks className="h-4 w-4" aria-hidden />
              </button>
            )}
            {preview(true)}
            {copyBtn}
            {live(true)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SchedulePanel({ startLocal, endTba, endLocal, onChange }: ScheduleValue & { onChange: (patch: Partial<ScheduleValue>) => void }) {
  const startIso = localInputToIso(startLocal);
  const endIso = localInputToIso(endLocal);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-sans text-sm font-bold text-midnight">Schedule</p>
        <HelpText>Enter times in your local time; the UK time is shown underneath.</HelpText>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="sched-start">Start</FieldLabel>
          {startLocal && (
            <button
              type="button"
              onClick={() => onChange({ startLocal: "" })}
              className="rounded font-body text-xs font-bold text-midnight underline underline-offset-2 hover:text-crimson-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
            >
              Clear
            </button>
          )}
        </div>
        <input
          id="sched-start"
          type="datetime-local"
          value={startLocal}
          onChange={(e) => onChange({ startLocal: e.target.value })}
          className={cn(FIELD_CLASS, "h-10")}
          aria-describedby="sched-start-help"
        />
        <HelpText id="sched-start-help">
          {startIso ? (
            <>
              <span className="font-bold text-midnight">UK time: {ukDateTime(startIso)}</span>. Before this the page shows a countdown.
            </>
          ) : (
            "No start time: holds open as soon as the sale is Live."
          )}
        </HelpText>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="font-sans text-sm font-bold text-midnight">End</p>
          <label className="flex items-center gap-2 font-body text-sm text-midnight">
            <Switch id="sched-end-tba" checked={endTba} onCheckedChange={(v) => onChange({ endTba: v })} className="data-[state=checked]:bg-crimson-red" />
            End date TBA
          </label>
        </div>
        {endTba ? (
          <HelpText>The page shows “Ends TBA”. To close the sale, set Status to Ended.</HelpText>
        ) : (
          <>
            <input
              id="sched-end"
              type="datetime-local"
              value={endLocal}
              onChange={(e) => onChange({ endLocal: e.target.value })}
              className={cn(FIELD_CLASS, "h-10")}
              aria-label="End date and time"
              aria-invalid={!endIso}
              aria-describedby="sched-end-help"
            />
            <HelpText id="sched-end-help">
              {endIso ? <span className="font-bold text-midnight">UK time: {ukDateTime(endIso)}</span> : "Pick when holds stop."}
            </HelpText>
          </>
        )}
      </div>
    </div>
  );
}
