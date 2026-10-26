"use client";
import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  label?: string;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  isValid?: boolean;
  className?: string;
  /** Tour length in days — previews the trip span while hovering a start date. */
  spanDays?: number;
  /** Month to show when there's no value yet (ISO date). Defaults to today. */
  defaultMonth?: string;
  /** Open on mount, e.g. right after "Add Tour Date". */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function toISO(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}
function daysInMonth(y: number, m: number) {
  // Use UTC to avoid timezone/DST offsets when computing day counts
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function shiftDays(iso: string, n: number) {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10);
}
function shiftMonths(iso: string, n: number) {
  const { y, m, d } = parseISO(iso);
  const target = new Date(Date.UTC(y, m + n, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  return toISO(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}
function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}
function formatShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TourDatePicker({
  value,
  onChange,
  label = "Tour Date",
  minYear = 2000,
  maxYear = 2050,
  disabled = false,
  isValid = false,
  className,
  spanDays,
  defaultMonth,
  autoOpen = false,
  onAutoOpened,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const shouldFocusDay = React.useRef(false);

  const selectedISO = value || "";
  const today = todayISO();
  const anchorISO = selectedISO || defaultMonth || today;

  const [view, setView] = React.useState(() => parseISO(anchorISO));
  const [focusISO, setFocusISO] = React.useState(anchorISO);
  const [hoverISO, setHoverISO] = React.useState<string | null>(null);

  const openPicker = React.useCallback(
    (next: boolean) => {
      if (next) {
        // Re-sync to the current value every time it opens
        setView(parseISO(anchorISO));
        setFocusISO(anchorISO);
        shouldFocusDay.current = true;
      }
      setHoverISO(null);
      setOpen(next);
    },
    [anchorISO]
  );

  React.useEffect(() => {
    if (!autoOpen || disabled) return;
    triggerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    openPicker(true);
    onAutoOpened?.();
    // mount-only: autoOpen is a one-shot request
  }, []);

  // Move DOM focus to the roving day after keyboard navigation / opening
  React.useEffect(() => {
    if (!open || !shouldFocusDay.current) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusISO}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      shouldFocusDay.current = false;
    }
  }, [open, focusISO, view]);

  // Always 6 weeks so the popover height never jumps between months
  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const gridStart = shiftDays(toISO(view.y, view.m, 1), -firstWeekday);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const iso = shiftDays(gridStart, i);
    const { m, d } = parseISO(iso);
    return { iso, d, inMonth: m === view.m };
  });
  const rovingISO = cells.some((c) => c.iso === focusISO)
    ? focusISO
    : toISO(view.y, view.m, 1);

  // Trip span preview: hovered day wins, else the current selection
  const span = spanDays && spanDays > 1 ? spanDays : 1;
  const previewStart = hoverISO ?? selectedISO;
  const previewEnd = previewStart ? shiftDays(previewStart, span - 1) : "";

  const canPrev = view.y > minYear || view.m > 0;
  const canNext = view.y < maxYear || view.m < 11;

  const goToMonth = (y: number, m: number) => {
    const t = new Date(Date.UTC(y, m, 1));
    const ny = t.getUTCFullYear();
    if (ny < minYear || ny > maxYear) return;
    setView({ y: ny, m: t.getUTCMonth(), d: 1 });
  };

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => shiftDays(rovingISO, -1),
      ArrowRight: () => shiftDays(rovingISO, 1),
      ArrowUp: () => shiftDays(rovingISO, -7),
      ArrowDown: () => shiftDays(rovingISO, 7),
      PageUp: () => shiftMonths(rovingISO, e.shiftKey ? -12 : -1),
      PageDown: () => shiftMonths(rovingISO, e.shiftKey ? 12 : 1),
      Home: () => shiftDays(rovingISO, -parseISO(rovingISO).d + 1),
      End: () => {
        const { y, m } = parseISO(rovingISO);
        return toISO(y, m, daysInMonth(y, m));
      },
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const next = move();
    const { y } = parseISO(next);
    if (y < minYear || y > maxYear) return;
    shouldFocusDay.current = true;
    setFocusISO(next);
    setHoverISO(span > 1 ? next : null);
    setView(parseISO(next));
  };

  return (
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          disabled={disabled}
          className={cn(
            "mt-1 flex w-full items-center justify-between gap-2 px-3 py-2 rounded-md bg-input text-foreground border-2 focus:outline-none text-left disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 h-9 text-sm",
            open
              ? "border-crimson-red"
              : isValid
                ? "border-crimson-red pr-12 hover:border-crimson-red"
                : "border-border hover:border-primary/50",
            "focus:border-crimson-red focus:ring-2 focus:ring-crimson-red/20",
            className
          )}
        >
          <span className={selectedISO ? "" : "opacity-60"}>
            {selectedISO ? formatShort(selectedISO) : "Select date"}
          </span>
          {!isValid && <CalendarDays className="h-4 w-4 shrink-0 text-dark-gray/60" />}
        </button>
      </PopoverTrigger>
      {isValid && !open && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-crimson-red">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        aria-label={label}
        className="w-[19rem] rounded-xl bg-white p-3 shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()} // the effect above focuses the day instead
      >
        {/* month nav */}
        <div className="mb-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(view.y, view.m - 1)}
            disabled={!canPrev}
            aria-label="Previous month"
            className="grid size-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-light-grey hover:text-midnight disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-1">
            <select
              value={view.m}
              onChange={(e) => goToMonth(view.y, parseInt(e.target.value))}
              aria-label="Month"
              className="cursor-pointer rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold text-midnight hover:bg-light-grey focus:outline-none focus:ring-2 focus:ring-crimson-red/30"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={view.y}
              onChange={(e) => goToMonth(parseInt(e.target.value), view.m)}
              aria-label="Year"
              className="cursor-pointer rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold text-midnight hover:bg-light-grey focus:outline-none focus:ring-2 focus:ring-crimson-red/30"
            >
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => goToMonth(view.y, view.m + 1)}
            disabled={!canNext}
            aria-label="Next month"
            className="grid size-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-light-grey hover:text-midnight disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* calendar grid */}
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 text-[11px] font-semibold text-gray-500">
              {d}
            </div>
          ))}
        </div>
        <div
          ref={gridRef}
          className="grid grid-cols-7 gap-y-0.5"
          onKeyDown={onGridKeyDown}
          onMouseLeave={() => setHoverISO(null)}
        >
          {cells.map((cell) => {
            const isSelected = cell.iso === selectedISO;
            const isToday = cell.iso === today;
            const isPreviewStart = !!previewStart && cell.iso === previewStart;
            const inSpan =
              span > 1 && !!previewStart && cell.iso > previewStart && cell.iso <= previewEnd;
            const isSpanEnd = inSpan && cell.iso === previewEnd;
            return (
              <button
                key={cell.iso}
                type="button"
                data-iso={cell.iso}
                tabIndex={cell.iso === rovingISO ? 0 : -1}
                aria-pressed={isSelected}
                aria-label={formatShort(cell.iso)}
                onClick={() => pick(cell.iso)}
                onMouseEnter={() => span > 1 && setHoverISO(cell.iso)}
                onFocus={() => setFocusISO(cell.iso)}
                className={cn(
                  "relative h-9 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red/50 focus-visible:z-10",
                  inSpan ? "bg-crimson-red/10" : "",
                  isSpanEnd ? "rounded-r-lg" : "",
                  isPreviewStart && span > 1 ? "rounded-l-lg" : "",
                  isSelected
                    ? "rounded-lg bg-crimson-red font-semibold text-white"
                    : isPreviewStart
                      ? "rounded-lg bg-crimson-red/80 font-semibold text-white"
                      : !inSpan
                        ? "rounded-lg hover:bg-light-grey"
                        : "",
                  !isSelected && !isPreviewStart && (cell.inMonth ? "text-midnight" : "text-gray-300"),
                  isToday && !isSelected && !isPreviewStart && "font-semibold text-crimson-red"
                )}
              >
                {cell.d}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-crimson-red" />
                )}
              </button>
            );
          })}
        </div>

        {/* footer */}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-light-grey pt-2">
          <p className="min-w-0 truncate text-xs text-dark-gray">
            {previewStart ? (
              span > 1 ? (
                <>
                  {formatShort(previewStart).replace(/, \d{4}$/, "")} → {formatShort(previewEnd)}
                  <span className="text-dark-gray/60"> · {span}d</span>
                </>
              ) : (
                formatShort(previewStart)
              )
            ) : (
              "Pick a start date"
            )}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {selectedISO && (
              <button
                type="button"
                onClick={() => pick("")}
                className="rounded-md px-2 py-1 text-xs font-medium text-dark-gray transition-colors hover:bg-light-grey hover:text-midnight"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                shouldFocusDay.current = true;
                setFocusISO(today);
                setView(parseISO(today));
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-crimson-red transition-colors hover:bg-crimson-red/10"
            >
              Today
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
