import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Option } from "./Select";
import type { ReservationTourPackage } from "../hooks/state/useReservationCatalogState";

type ReservationTourSelectionSidebarCardProps = {
  step: number;
  paymentConfirmed: boolean;
  isLoadingPackages: boolean;
  selectedPackage?: ReservationTourPackage;
  highlightsExpanded: boolean;
  carouselIndex: number;
  dateVisible: boolean;
  dateMounted: boolean;
  tourPackage: string;
  tourDate: string;
  errors: { [k: string]: string };
  tourDateOptions: Option[];
  setShowTourModal: (value: boolean) => void;
  setHighlightsExpanded: (value: boolean) => void;
  setIsCarouselPaused: (value: boolean) => void;
  setCarouselIndex: Dispatch<SetStateAction<number>>;
  setTourDate: (value: string) => void;
  /** A Black Friday slot hold fixes the tour; the date stays selectable. */
  tourLocked?: boolean;
};

const toPounds = (value?: number) => {
  const amount = typeof value === "number" ? value : 0;
  return `\u00A3${amount.toLocaleString()}`;
};

const displayDate = (date: string) => {
  if (!date) return "Select Date";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Select Date";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function ReservationTourSelectionSidebarCard({
  step,
  paymentConfirmed,
  isLoadingPackages,
  selectedPackage,
  dateVisible,
  dateMounted,
  tourPackage,
  tourDate,
  errors,
  tourDateOptions,
  setShowTourModal,
  setTourDate,
  tourLocked = false,
}: ReservationTourSelectionSidebarCardProps) {
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const lockedByStep = step !== 1;
  const isSelectionLocked = paymentConfirmed || lockedByStep;
  const isTourChangeLocked = isSelectionLocked || tourLocked;

  useEffect(() => {
    setImageLoaded(false);
  }, [selectedPackage?.coverImage]);

  const location =
    selectedPackage?.destinations?.[0] ||
    selectedPackage?.region ||
    selectedPackage?.country ||
    "Location Not Yet Configured";

  const chips = (selectedPackage?.highlights || [])
    .slice(0, 3)
    .map((item) => (typeof item === "string" ? item : item.text))
    .filter(Boolean);

  const selectedDateOption = tourDateOptions.find((option) => option.value === tourDate);
  const selectedDateDetail = selectedPackage?.travelDateDetails?.find(
    (detail) => detail.date === tourDate,
  );
  const selectedTourCost =
    typeof selectedDateDetail?.customOriginal === "number"
      ? selectedDateDetail.customOriginal
      : selectedPackage?.price;
  const selectedReservationFee =
    typeof selectedDateDetail?.customDeposit === "number"
      ? selectedDateDetail.customDeposit
      : selectedPackage?.deposit;
  const hasSelectedDate = !!selectedDateOption;
  const canOpenDateMenu =
    dateMounted &&
    !isSelectionLocked &&
    !!tourPackage &&
    tourDateOptions.length > 0;

  return (
    <div className="w-full min-w-0 rounded-2xl mt-2 overflow-visible border border-border bg-card text-foreground shadow-lg transition-all duration-300">
      <div className="space-y-3">
        <div>

          {isLoadingPackages ? (
            <div className="mt-1 rounded-xl border border-border bg-card overflow-hidden">
              <div className="h-48 w-full bg-muted animate-pulse" />
              <div className="p-4 space-y-4">
                <div className="h-8 w-2/3 rounded bg-muted animate-pulse" />

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_190px] gap-3 items-start">
                  <div className="space-y-2">
                    <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-3/5 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-2/5 rounded bg-muted animate-pulse" />
                  </div>

                  <div className="w-full max-w-full xl:w-[190px] rounded-lg border border-border bg-background px-3 py-2 space-y-2">
                    <div className="h-4 w-full rounded bg-muted animate-pulse" />
                    <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="h-7 w-28 rounded-full bg-muted animate-pulse" />
                  <div className="h-7 w-24 rounded-full bg-muted animate-pulse" />
                  <div className="h-7 w-32 rounded-full bg-muted animate-pulse" />
                </div>

                <div className="pt-3 mt-2 border-t border-border">
                  <div className="h-4 w-28 ml-auto rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>
          ) : selectedPackage ? (
            <div className="w-full min-w-0 text-foreground rounded-xl border border-border bg-card overflow-hidden">
              <div
                className={`relative overflow-hidden ${
                  isTourChangeLocked ? "cursor-not-allowed" : "cursor-pointer"
                }`}
                onClick={() => {
                  if (!isTourChangeLocked) setShowTourModal(true);
                }}
              >
                <div className="overflow-hidden">
                  {selectedPackage.coverImage ? (
                    <div className="relative h-48 w-full bg-muted">
                      {!imageLoaded && (
                        <div className="absolute inset-0 animate-pulse bg-muted" />
                      )}
                      <img
                        src={selectedPackage.coverImage}
                        alt={selectedPackage.name}
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                          imageLoaded ? "opacity-100" : "opacity-0"
                        }`}
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageLoaded(true)}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-muted flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 pb-4 pt-3">
                <div className="space-y-3">
                  <h4 className="text-[30px] leading-none tracking-tight font-semibold text-foreground">
                    {selectedPackage.name}
                  </h4>

                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_190px] gap-3 items-start">
                    <div className="min-w-0 space-y-1 text-sm text-foreground/90">
                      <p className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-muted-foreground flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span>
                          <span className="font-semibold">Location:</span> {location}
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-muted-foreground flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>
                          <span className="font-semibold">Duration:</span>{" "}
                          {selectedPackage.duration || "TBD"}
                        </span>
                      </p>
                      <div className="relative">
                        <button
                          type="button"
                          className={`w-full text-left rounded-md px-1.5 py-1 transition-colors ${
                            canOpenDateMenu
                              ? "cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                              : "cursor-default"
                          }`}
                          onClick={() => {
                            if (canOpenDateMenu) setDateMenuOpen((prev) => !prev);
                          }}
                          disabled={!canOpenDateMenu}
                        >
                          <span className="flex items-center gap-2">
                            <svg
                              className={`w-4 h-4 flex-shrink-0 ${
                                canOpenDateMenu
                                  ? "text-[#EF3340]"
                                  : "text-muted-foreground"
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span>
                              <span className="font-semibold">Date:</span>{" "}
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={
                                    selectedDateOption
                                      ? canOpenDateMenu
                                        ? "text-[#EF3340] font-semibold underline decoration-[#EF3340]/70 underline-offset-4"
                                        : ""
                                      : "text-emerald-500 underline underline-offset-4"
                                  }
                                >
                                  {selectedDateOption?.label || displayDate(tourDate)}
                                </span>
                                {canOpenDateMenu && (
                                  <span className="text-[#EF3340] text-xs font-semibold">
                                    Tap to change
                                  </span>
                                )}
                              </span>
                            </span>
                          </span>
                        </button>

                        {dateMenuOpen && (
                          <div className="fixed inset-0 z-40">
                            <button
                              type="button"
                              className="absolute inset-0 bg-black/25"
                              onClick={() => setDateMenuOpen(false)}
                              aria-label="Close date menu"
                            />
                            <div className="absolute left-1/2 top-1/2 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden">
                              <div className="px-3 py-2 border-b border-border text-sm font-semibold">
                                Select tour date
                              </div>
                              <div className="max-h-[50vh] overflow-y-auto">
                                {tourDateOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`w-full text-left px-3 py-2.5 text-sm border-b border-border last:border-b-0 ${
                                      option.disabled
                                        ? "text-muted-foreground/50 cursor-not-allowed"
                                        : "hover:bg-muted"
                                    }`}
                                    disabled={!!option.disabled}
                                    onClick={() => {
                                      if (option.disabled) return;
                                      setTourDate(option.value);
                                      setDateMenuOpen(false);
                                    }}
                                  >
                                    <div className="font-medium">{option.label}</div>
                                    {option.description && (
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {option.description}
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {hasSelectedDate && (
                      <div className="w-full max-w-full xl:w-[190px] rounded-lg border border-border bg-background px-3 py-2 text-xs leading-tight space-y-2">
                        <div className="flex items-center justify-between border-b border-border pb-1.5">
                          <span className="font-medium text-muted-foreground">Total Tour Cost</span>
                          <span className="font-semibold text-[15px]">{toPounds(selectedTourCost)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-muted-foreground">Reservation Fee</span>
                          <span className="font-semibold text-[15px]">{toPounds(selectedReservationFee)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {chips.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      {chips.map((chip, index) => (
                        <span
                          key={`${chip}-${index}`}
                          className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground bg-background"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}

                  {errors?.tourDate && (
                    <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {errors.tourDate}
                    </p>
                  )}
                  {tourPackage &&
                    tourDateOptions.length === 0 &&
                    !errors?.tourDate && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/40">
                        <p className="text-xs text-amber-700 flex items-start gap-2">
                          <svg
                            className="w-4 h-4 flex-shrink-0 mt-0.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>No available dates</span>
                        </p>
                      </div>
                    )}

                  <div className="pt-3 mt-3 border-t border-border text-right">
                    {!isTourChangeLocked ? (
                      <button
                        type="button"
                        className="text-sm italic underline underline-offset-2 text-[#EF3340] hover:text-[#c92b36] transition-colors"
                        onClick={() => setShowTourModal(true)}
                      >
                        Change Tour &gt;&gt;&gt;
                      </button>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        {tourLocked && !isSelectionLocked ? "Tour set by your held slots" : "Tour locked for this step"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-1 rounded-xl border border-dashed border-border bg-card p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A2 2 0 013 15.382V6.618a2 2 0 011.106-1.789l5.788-2.894a2 2 0 011.788 0l5.788 2.894A2 2 0 0118.579 6v9m-6.579 5h8m-4-4v8"
                  />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-foreground">
                No tour selected yet
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose your adventure first, then select your preferred tour
                date.
              </p>

              {!isTourChangeLocked ? (
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#EF3340] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#d72e3a] transition-colors"
                  onClick={() => setShowTourModal(true)}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Select Tour
                </button>
              ) : (
                <p className="mt-3 text-xs italic text-muted-foreground">
                  Tour selection is locked in this step.
                </p>
              )}
            </div>
          )}

          {errors.tourPackage && (
            <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {errors.tourPackage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
