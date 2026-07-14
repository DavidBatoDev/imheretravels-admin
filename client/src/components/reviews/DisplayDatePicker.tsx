// DisplayDatePicker.tsx — calendar picker for a review's display date.
// Adapted from admin/client/src/app/reservation-booking-form/components/BirthdatePicker.tsx,
// stripped of the 18+ birthdate constraint, restyled with brand tokens, and
// formatted "MMMM dd, yyyy" instead of a short "MMM d, yyyy".
"use client";
import React from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  minYear?: number; // default: 9 years before this year
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function toISO(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export function formatDisplayDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "2-digit", year: "numeric" }).format(d);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DisplayDatePicker({ value, onChange, minYear }: Props) {
  const maxDate = new Date();
  const maxYear = maxDate.getFullYear();
  const floorMinYear = minYear ?? maxYear - 9;

  const [open, setOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const init = value ? new Date(value + "T00:00:00") : maxDate;
  const [viewYear, setViewYear] = React.useState(init.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(init.getMonth());
  const [showMonthGrid, setShowMonthGrid] = React.useState(false);
  const [showYearGrid, setShowYearGrid] = React.useState(false);
  const [yearBase, setYearBase] = React.useState(() => Math.floor(init.getFullYear() / 12) * 12);

  const handleClose = React.useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
    }, 200);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, handleClose]);

  const selectedISO = value || "";
  const isFuture = (y: number, m: number, d: number) => new Date(y, m, d).getTime() > maxDate.getTime();

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const prevDays = daysInMonth(viewYear, (viewMonth + 11) % 12);
  const thisDays = daysInMonth(viewYear, viewMonth);

  const cells: Array<{ d: number; inMonth: boolean }> = [];
  for (let i = startWeekday - 1; i >= 0; i--) cells.push({ d: prevDays - i, inMonth: false });
  for (let d = 1; d <= thisDays; d++) cells.push({ d, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ d: cells.length - (startWeekday + thisDays) + 1, inMonth: false });

  const pick = (rowIndex: number, inMonth: boolean, d: number) => {
    let y = viewYear;
    let m = viewMonth;
    if (!inMonth) {
      if (rowIndex === 0) {
        m = viewMonth === 0 ? 11 : viewMonth - 1;
        y = viewMonth === 0 ? viewYear - 1 : viewYear;
      } else {
        m = viewMonth === 11 ? 0 : viewMonth + 1;
        y = viewMonth === 11 ? viewYear + 1 : viewYear;
      }
    }
    if (isFuture(y, m, d)) return;
    onChange(toISO(y, m, d));
    setShowMonthGrid(false);
    setShowYearGrid(false);
    handleClose();
    setTimeout(() => triggerRef.current?.focus(), 250);
  };

  const visibleYears = React.useMemo(() => {
    const yrs: number[] = [];
    for (let i = 0; i < 12; i++) yrs.push(yearBase + i);
    return yrs.filter((y) => y >= floorMinYear && y <= maxYear);
  }, [yearBase, floorMinYear, maxYear]);

  React.useEffect(() => {
    if (!showMonthGrid && !showYearGrid) return;
    const handler = () => {
      setShowMonthGrid(false);
      setShowYearGrid(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showMonthGrid, showYearGrid]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center rounded-md border border-light-grey bg-white px-4 text-left font-body text-b2-desktop text-midnight outline-none transition-colors hover:border-crimson-red/50 focus:border-crimson-red"
      >
        {selectedISO ? formatDisplayDate(selectedISO) : <span className="text-grey">No display date</span>}
      </button>

      {open &&
        createPortal(
          <div
            // pointer-events-auto: this modal is portaled to <body>, which the
            // parent Radix Dialog sets to `pointer-events: none` while open —
            // without this the calendar renders on top but every click passes
            // through to the form behind it (nothing selects).
            className={`pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
              isClosing ? "animate-[fadeOut_150ms_ease-in]" : "animate-[fadeIn_150ms_ease-out]"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Display date picker"
          >
            <div className="absolute inset-0 bg-midnight/40" onClick={handleClose} />

            <div
              className={`relative w-full max-w-md overflow-visible rounded-lg bg-white shadow-xlarge ${
                isClosing ? "animate-[scaleOut_200ms_ease-in]" : "animate-[scaleIn_200ms_ease-out]"
              }`}
            >
              <div className="flex items-center justify-between border-b border-light-grey px-5 py-4">
                <h3 className="font-hk-grotesk text-h6-desktop font-bold text-midnight">Display date</h3>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-md text-dark-gray hover:bg-light-grey"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 pt-4 pb-3">
                <div className="relative flex items-center gap-3">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMonthGrid((v) => !v);
                        setShowYearGrid(false);
                      }}
                      className="flex h-11 w-full items-center justify-between rounded-md border border-light-grey px-4 transition-colors hover:bg-light-grey/60"
                      aria-expanded={showMonthGrid}
                    >
                      <span className="font-medium">{MONTH_NAMES[viewMonth]}</span>
                      <span className={`opacity-60 transition-transform duration-200 ${showMonthGrid ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </button>

                    {showMonthGrid && (
                      <div
                        className="absolute left-0 top-full z-20 mt-2 w-full min-w-[16rem] rounded-md border border-light-grey bg-white p-3 shadow-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-3 gap-2">
                          {MONTH_NAMES.map((m, i) => {
                            const disabled = viewYear === maxYear && i > maxDate.getMonth();
                            return (
                              <button
                                key={m}
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  setViewMonth(i);
                                  setShowMonthGrid(false);
                                }}
                                className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                                  disabled ? "cursor-not-allowed opacity-40" : ""
                                } ${
                                  i === viewMonth
                                    ? "border-crimson-red bg-crimson-red text-white"
                                    : "border-light-grey hover:bg-light-grey/60"
                                }`}
                              >
                                {m}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setYearBase(Math.floor(viewYear / 12) * 12);
                        setShowYearGrid((v) => !v);
                        setShowMonthGrid(false);
                      }}
                      className="flex h-11 w-full items-center justify-between rounded-md border border-light-grey px-4 transition-colors hover:bg-light-grey/60"
                      aria-expanded={showYearGrid}
                    >
                      <span className="font-medium">{viewYear}</span>
                      <span className={`opacity-60 transition-transform duration-200 ${showYearGrid ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </button>

                    {showYearGrid && (
                      <div
                        className="absolute right-0 top-full z-30 mt-2 w-full min-w-[16rem] rounded-md border border-light-grey bg-white p-3 shadow-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-3 flex items-center justify-between border-b border-light-grey px-2 pb-3">
                          <button
                            type="button"
                            onClick={() => setYearBase((y) => Math.max(floorMinYear, y - 12))}
                            disabled={yearBase <= floorMinYear}
                            className="flex size-8 items-center justify-center rounded-md border border-light-grey transition-colors hover:bg-light-grey/60 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Previous 12 years"
                          >
                            ←
                          </button>
                          <div className="font-body text-b4-desktop text-grey">
                            {Math.max(floorMinYear, yearBase)}–{Math.min(maxYear, yearBase + 11)}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setYearBase((y) => {
                                const next = y + 12;
                                return next > maxYear ? y : Math.min(Math.floor(maxYear / 12) * 12, next);
                              })
                            }
                            disabled={yearBase + 12 > maxYear}
                            className="flex size-8 items-center justify-center rounded-md border border-light-grey transition-colors hover:bg-light-grey/60 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Next 12 years"
                          >
                            →
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {visibleYears.map((y) => (
                            <button
                              key={y}
                              type="button"
                              onClick={() => {
                                let m = viewMonth;
                                if (y === maxYear && m > maxDate.getMonth()) m = maxDate.getMonth();
                                setViewYear(y);
                                setViewMonth(m);
                                setShowYearGrid(false);
                              }}
                              className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                                y === viewYear
                                  ? "border-crimson-red bg-crimson-red text-white"
                                  : "border-light-grey hover:bg-light-grey/60"
                              }`}
                            >
                              {y}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-7 px-5 pb-1 pt-2 text-center font-body text-b4-desktop text-grey">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="py-1.5">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5 p-5 pt-2">
                {cells.map((c, idx) => {
                  const row = Math.floor(idx / 7);
                  let y = viewYear;
                  let m = viewMonth;
                  const d = c.d;
                  if (!c.inMonth) {
                    if (row === 0) {
                      m = viewMonth === 0 ? 11 : viewMonth - 1;
                      y = viewMonth === 0 ? viewYear - 1 : viewYear;
                    } else {
                      m = viewMonth === 11 ? 0 : viewMonth + 1;
                      y = viewMonth === 11 ? viewYear + 1 : viewYear;
                    }
                  }
                  const disabled =
                    y < floorMinYear || y > maxYear || (y === maxYear && m > maxDate.getMonth()) || isFuture(y, m, d);
                  const iso = toISO(y, m, d);
                  const isSelected = iso === selectedISO;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(row, c.inMonth, d)}
                      className={`h-11 rounded-md border text-sm font-medium transition-colors ${
                        disabled
                          ? "cursor-not-allowed border-transparent opacity-30"
                          : isSelected
                            ? "border-crimson-red bg-crimson-red text-white"
                            : c.inMonth
                              ? "border-light-grey hover:bg-light-grey/60"
                              : "border-transparent text-grey opacity-50 hover:opacity-80"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-light-grey bg-light-grey/30 px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    handleClose();
                  }}
                  className="font-body text-b4-desktop font-medium text-grey underline-offset-2 transition-colors hover:text-midnight hover:underline"
                >
                  Clear
                </button>
                <span className="font-body text-b4-desktop text-grey">Leave blank to hide the date</span>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes scaleOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }
      `}</style>
    </>
  );
}
