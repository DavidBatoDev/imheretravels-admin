"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: string; // ISO local datetime, e.g. 2025-12-19T06:30
  onChange: (iso: string) => void;
  label?: string;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  isValid?: boolean;
  /** Extra classes for the trigger button (merged over the defaults). */
  triggerClassName?: string;
  /** Trigger text when no value is set. */
  placeholder?: string;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISODate(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function to24Hour(hour12: number, meridiem: "am" | "pm") {
  if (meridiem === "am") {
    return hour12 === 12 ? 0 : hour12;
  }
  return hour12 === 12 ? 12 : hour12 + 12;
}

function formatISODateTime(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DateTimePicker({
  value,
  onChange,
  label = "Select date & time",
  minYear = 1920,
  maxYear,
  disabled = false,
  isValid = false,
  triggerClassName,
  placeholder = "Select date and time",
}: DateTimePickerProps) {
  const now = new Date();
  const maxAllowedYear = maxYear ?? now.getFullYear() + 10;

  const parsed = value ? new Date(value) : now;

  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null);

  const [viewYear, setViewYear] = React.useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(parsed.getMonth());
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(value ? parsed : null);

  const [hour, setHour] = React.useState(() => {
    const h = parsed.getHours();
    const hr = h % 12 || 12;
    return hr;
  });
  const [minute, setMinute] = React.useState(parsed.getMinutes());
  const [meridiem, setMeridiem] = React.useState<"am" | "pm">(
    parsed.getHours() >= 12 ? "pm" : "am"
  );
  const [hourText, setHourText] = React.useState<string>(() => pad((parsed.getHours() % 12) || 12));
  const [minuteText, setMinuteText] = React.useState<string>(() => pad(parsed.getMinutes()));

  const [showMonthGrid, setShowMonthGrid] = React.useState(false);
  const [showYearGrid, setShowYearGrid] = React.useState(false);
  const [yearBase, setYearBase] = React.useState(
    () => Math.floor(parsed.getFullYear() / 12) * 12
  );

  React.useEffect(() => {
    if (!open) return;
    // Mount portal inside nearest dialog to avoid focus/inert traps from parent Dialog libraries
    const container =
      triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null;
    setPortalEl(container ?? document.body);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (!value) return;
    const d = new Date(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(d);
    const h = d.getHours();
    setHour(h % 12 || 12);
    setMeridiem(h >= 12 ? "pm" : "am");
    setMinute(d.getMinutes());
  }, [open, value]);

  const selectedISO = value || "";

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const prevDays = daysInMonth(viewYear, (viewMonth + 11) % 12);
  const thisDays = daysInMonth(viewYear, viewMonth);

  const cells: Array<{ d: number; inMonth: boolean }> = [];
  for (let i = startWeekday - 1; i >= 0; i--) cells.push({ d: prevDays - i, inMonth: false });
  for (let d = 1; d <= thisDays; d++) cells.push({ d, inMonth: true });
  while (cells.length % 7 !== 0)
    cells.push({ d: cells.length - (startWeekday + thisDays) + 1, inMonth: false });

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const visibleYears = React.useMemo(() => {
    const yrs: number[] = [];
    for (let i = 0; i < 12; i++) yrs.push(yearBase + i);
    return yrs.filter((y) => y >= minYear && y <= maxAllowedYear);
  }, [yearBase, minYear, maxAllowedYear]);

  React.useEffect(() => {
    if (!showMonthGrid && !showYearGrid) return;
    const handler = () => {
      setShowMonthGrid(false);
      setShowYearGrid(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showMonthGrid, showYearGrid]);

  const updateDateTime = (date: Date) => {
    setSelectedDate(date);
    onChange(formatISODateTime(date));
  };

  const applyDay = (rowIndex: number, inMonth: boolean, dayNum: number) => {
    let y = viewYear;
    let m = viewMonth;
    const day = dayNum;
    if (!inMonth) {
      if (rowIndex === 0) {
        m = viewMonth === 0 ? 11 : viewMonth - 1;
        y = viewMonth === 0 ? viewYear - 1 : viewYear;
      } else {
        m = viewMonth === 11 ? 0 : viewMonth + 1;
        y = viewMonth === 11 ? viewYear + 1 : viewYear;
      }
    }

    const hours24 = to24Hour(hour, meridiem);
    const dt = new Date(y, m, day, hours24, minute, 0, 0);
    updateDateTime(dt);
    setShowMonthGrid(false);
    setShowYearGrid(false);
  };

  const handleTimeChange = (
    nextHour: number,
    nextMinute: number,
    nextMeridiem: "am" | "pm"
  ) => {
    const base = selectedDate || new Date(viewYear, viewMonth, 1, 0, 0, 0, 0);
    const dt = new Date(base);
    dt.setHours(to24Hour(nextHour, nextMeridiem));
    dt.setMinutes(nextMinute);
    updateDateTime(dt);
  };

  const clampHour = (h: number) => {
    if (!Number.isFinite(h)) return 12;
    let v = Math.round(h);
    if (v < 1) v = 1;
    if (v > 12) v = 12;
    return v;
  };

  const clampMinute = (m: number) => {
    if (!Number.isFinite(m)) return 0;
    let v = Math.round(m);
    if (v < 0) v = 0;
    if (v > 59) v = 59;
    return v;
  };

  const setHourValue = (v: number) => {
    const nh = clampHour(v);
    setHour(nh);
    setHourText(pad(nh));
    handleTimeChange(nh, minute, meridiem);
  };

  const setMinuteValue = (v: number) => {
    const nm = clampMinute(v);
    setMinute(nm);
    setMinuteText(pad(nm));
    handleTimeChange(hour, nm, meridiem);
  };

  const displayLabel = selectedISO
    ? new Date(selectedISO).toLocaleString()
    : placeholder;

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1));
  const minutesList = Array.from({ length: 60 }, (_, i) => i);

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          className={cn(
            `mt-1 block w-full px-4 py-3 rounded-md bg-input text-foreground placeholder:opacity-70 border-2 focus:outline-none text-left disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-sm ${
              open
                ? "border-crimson-red"
                : isValid
                  ? "border-green-500 pr-12 hover:border-green-500"
                  : "border-border hover:border-primary/50"
            } focus:border-primary focus:ring-2 focus:ring-primary/20`,
            !selectedISO && triggerClassName && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {displayLabel}
        </button>
        {isValid && !open && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-green-500">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {open && portalEl &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center animate-[fadeIn_150ms_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-label={label}
          >
            <div className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

            <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-card border border-border shadow-2xl overflow-visible animate-[scaleIn_200ms_ease-out]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-base font-semibold text-foreground">{label}</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-md bg-input border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 pt-4 pb-3 flex flex-col gap-3">
                <div className="relative flex items-center gap-3">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMonthGrid((v) => !v);
                        setShowYearGrid(false);
                      }}
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border flex items-center justify-between hover:bg-muted transition-all group"
                      aria-label="Select month"
                      aria-expanded={showMonthGrid}
                    >
                      <span className="font-medium">{monthNames[viewMonth]}</span>
                      <span
                        className={`opacity-60 transition-transform duration-200 ${
                          showMonthGrid ? "rotate-180" : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>

                    {showMonthGrid && (
                      <div
                        className="absolute z-20 top-full mt-2 left-0 w-full min-w-[16rem] rounded-xl border border-border bg-card shadow-2xl p-3 animate-[slideDown_150ms_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-3 gap-2">
                          {monthNames.map((m, i) => {
                            const disabledMonth =
                              viewYear > maxAllowedYear || viewYear < minYear;
                            return (
                              <button
                                key={m}
                                type="button"
                                disabled={disabledMonth}
                                onClick={() => {
                                  setViewMonth(i);
                                  setShowMonthGrid(false);
                                }}
                                className={[
                                  "h-10 rounded-lg text-sm font-medium border transition-all",
                                  disabledMonth
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:scale-105 active:scale-95",
                                  i === viewMonth
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-input border-border hover:bg-muted",
                                ].join(" ")}
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
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border flex items-center justify-between hover:bg-muted transition-all group"
                      aria-label="Select year"
                      aria-expanded={showYearGrid}
                    >
                      <span className="font-medium">{viewYear}</span>
                      <span
                        className={`opacity-60 transition-transform duration-200 ${
                          showYearGrid ? "rotate-180" : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>

                    {showYearGrid && (
                      <div
                        className="absolute z-30 top-full mt-2 right-0 w-full min-w-[16rem] rounded-xl border border-border bg-card shadow-2xl p-3 animate-[slideDown_150ms_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-2 pb-3 mb-3 border-b border-border">
                          <button
                            type="button"
                            onClick={() => setYearBase((y) => Math.max(minYear, y - 12))}
                            disabled={yearBase <= minYear}
                            className="h-8 w-8 rounded-lg bg-input border border-border hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                            aria-label="Previous 12 years"
                          >
                            ←
                          </button>
                          <div className="text-sm font-medium text-muted-foreground">
                            {Math.max(minYear, yearBase)}–{Math.min(maxAllowedYear, yearBase + 11)}
                          </div>
                          <button
                            type="button"
                            onClick={() => setYearBase((y) => Math.min(maxAllowedYear - 11, y + 12))}
                            disabled={yearBase + 11 >= maxAllowedYear}
                            className="h-8 w-8 rounded-lg bg-input border border-border hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                            aria-label="Next 12 years"
                          >
                            →
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {visibleYears.map((y) => {
                            const disabledYear = y > maxAllowedYear || y < minYear;
                            return (
                              <button
                                key={y}
                                type="button"
                                disabled={disabledYear}
                                onClick={() => {
                                  setViewYear(y);
                                  setShowYearGrid(false);
                                }}
                                className={[
                                  "h-10 rounded-lg text-sm font-medium border transition-all",
                                  disabledYear
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:scale-105 active:scale-95",
                                  y === viewYear
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-input border-border hover:bg-muted",
                                ].join(" ")}
                              >
                                {y}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground pt-1 pb-1">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="py-1.5">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
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

                    const disabledCell = y < minYear || y > maxAllowedYear;
                    const iso = toISODate(y, m, d);
                    const isSelected = selectedISO.startsWith(iso);

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={disabledCell}
                        onClick={() => applyDay(row, c.inMonth, d)}
                        className={[
                          "h-11 rounded-lg text-sm font-medium transition-all border",
                          disabledCell
                            ? "opacity-30 cursor-not-allowed"
                            : "hover:scale-110 active:scale-95",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-lg ring-2 ring-primary/20"
                            : c.inMonth
                              ? "bg-input border-border hover:bg-muted hover:border-muted-foreground/20"
                              : "bg-transparent border-transparent opacity-40 hover:opacity-60",
                        ].join(" ")}
                        aria-pressed={isSelected}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>

                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Time</div>
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="h-10 w-9 rounded-md bg-input border border-border hover:bg-muted"
                          onClick={() => setHourValue(hour - 1)}
                          aria-label="Decrease hour"
                        >
                          −
                        </button>
                        <input
                          className="w-full h-10 rounded-md bg-input border border-border px-3 text-center"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={hourText}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            if (val.length > 2) return;
                            const n = Number(val);
                            if (val !== "" && n >= 60) return;
                            setHourText(val);
                            if (val !== "" && Number.isFinite(n)) {
                              const nh = clampHour(n);
                              setHour(nh);
                              handleTimeChange(nh, minute, meridiem);
                            }
                          }}
                          onBlur={() => setHourValue(Number(hourText || hour))}
                          onWheel={(e) => {
                            e.preventDefault();
                            setHourValue(hour + (e.deltaY < 0 ? 1 : -1));
                          }}
                        />
                        <button
                          type="button"
                          className="h-10 w-9 rounded-md bg-input border border-border hover:bg-muted"
                          onClick={() => setHourValue(hour + 1)}
                          aria-label="Increase hour"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="col-span-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="h-10 w-9 rounded-md bg-input border border-border hover:bg-muted"
                          onClick={() => setMinuteValue(minute - 1)}
                          aria-label="Decrease minute"
                        >
                          −
                        </button>
                        <input
                          className="w-full h-10 rounded-md bg-input border border-border px-3 text-center"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={minuteText}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            if (val.length > 2) return;
                            const n = Number(val);
                            if (val !== "" && n >= 60) return;
                            setMinuteText(val);
                            if (val !== "" && Number.isFinite(n)) {
                              const nm = clampMinute(n);
                              setMinute(nm);
                              handleTimeChange(hour, nm, meridiem);
                            }
                          }}
                          onBlur={() => setMinuteValue(Number(minuteText || minute))}
                          onWheel={(e) => {
                            e.preventDefault();
                            setMinuteValue(minute + (e.deltaY < 0 ? 1 : -1));
                          }}
                        />
                        <button
                          type="button"
                          className="h-10 w-9 rounded-md bg-input border border-border hover:bg-muted"
                          onClick={() => setMinuteValue(minute + 1)}
                          aria-label="Increase minute"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="col-span-4">
                      <div className="flex rounded-md overflow-hidden border border-border">
                        {["am", "pm"].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              const next = m as "am" | "pm";
                              setMeridiem(next);
                              handleTimeChange(hour, minute, next);
                            }}
                            className={`flex-1 h-10 text-sm font-medium transition-colors ${
                              meridiem === m
                                ? "bg-primary text-primary-foreground"
                                : "bg-input text-foreground hover:bg-muted"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/30">
                <button
                  type="button"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  onClick={() => {
                    setSelectedDate(null);
                    onChange("");
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold transition-colors"
                  onClick={() => setOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          portalEl
        )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}
