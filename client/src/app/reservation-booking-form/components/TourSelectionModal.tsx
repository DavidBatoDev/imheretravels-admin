// client/src/app/reservation-booking-form/TourSelectionModal.tsx
"use client";

import React, { useState, useEffect } from "react";

interface TourPackage {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  location?: string;
  travelDates?: string[];
  travelDateDetails?: Array<{
    date?: string;
    customDeposit?: number;
    customOriginal?: number;
  }>;
  status?: "active" | "inactive";
  isHosted?: boolean;
  stripePaymentLink?: string;
  deposit?: number;
  price: number;
  coverImage?: string;
  duration?: string;
  highlights?: (string | { text: string; image?: string })[];
  destinations?: string[];
  region?: string;
  country?: string;
  rating?: number;
  media?: any;
  pricing?: any;
  details?: any;
}

interface TourSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tourPackages: TourPackage[];
  isLoadingPackages: boolean;
  selectedTourId: string;
  onSelectTour: (tourId: string) => void;
  isTourAllDatesTooSoon: (pkg: TourPackage) => boolean;
}

export default function TourSelectionModal({
  isOpen,
  onClose,
  tourPackages,
  isLoadingPackages,
  selectedTourId,
  onSelectTour,
  isTourAllDatesTooSoon,
}: TourSelectionModalProps) {
  const [modalImagesLoaded, setModalImagesLoaded] = useState<Set<string>>(
    new Set(),
  );
  const [activeFilter, setActiveFilter] = useState<
    "all" | "tours" | "hosted"
  >("all");

  // Reset to "All" each time the modal is reopened so a stale filter from a
  // previous visit doesn't hide tours the admin expects to see.
  useEffect(() => {
    if (isOpen) setActiveFilter("all");
  }, [isOpen]);

  // Keep image cache for this page session, but prune stale ids when package list changes.
  useEffect(() => {
    const validIds = new Set(
      tourPackages.filter((pkg) => !!pkg.coverImage).map((pkg) => pkg.id),
    );
    setModalImagesLoaded((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [tourPackages]);

  const handleClose = () => {
    onClose();
  };

  const handleSelectTour = (tour: TourPackage) => {
    if (isTourAllDatesTooSoon(tour)) return;
    onSelectTour(tour.id);
    handleClose();
  };

  const toDate = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number" || typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value?.toDate === "function") {
      return value.toDate();
    }
    if (typeof value?.seconds === "number") {
      return new Date(value.seconds * 1000);
    }
    if (typeof value?._seconds === "number") {
      return new Date(value._seconds * 1000);
    }
    return null;
  };

  const formatDateValue = (value?: any) => {
    const date = toDate(value);
    if (!date) return "Date TBD";
    return date.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  const bookablePackages = tourPackages.filter(
    (pkg) => pkg.status === "active" && !isTourAllDatesTooSoon(pkg),
  );
  const matchesFilter = (pkg: TourPackage) => {
    if (activeFilter === "tours") return !pkg.isHosted;
    if (activeFilter === "hosted") return !!pkg.isHosted;
    return true;
  };
  const displayedPackages = bookablePackages.filter(matchesFilter);
  const filterTabs: {
    key: "all" | "tours" | "hosted";
    label: string;
    count: number;
    description: string;
  }[] = [
    {
      key: "all",
      label: "All Tours",
      count: bookablePackages.length,
      description:
        "Every available adventure, small-group and hosted alike — browse the full collection.",
    },
    {
      key: "tours",
      label: "Tours",
      count: bookablePackages.filter((pkg) => !pkg.isHosted).length,
      description:
        "Small-group adventures run independently by our itinerary team — open to solo travelers and groups alike.",
    },
    {
      key: "hosted",
      label: "Hosted Tours",
      count: bookablePackages.filter((pkg) => pkg.isHosted).length,
      description:
        "Exclusive group trips led by one of our resident hosts — community-first adventures with an expert guide who knows the guests by name.",
    },
  ];
  const activeTab = filterTabs.find((tab) => tab.key === activeFilter);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={handleClose}
    >
      <div
        className="bg-card rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl border border-border/50 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border-b border-border/50">
          <div className="flex items-center justify-between p-6">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-1">
                Select Your Adventure
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose from our curated collection of experiences
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2.5 hover:bg-muted/80 rounded-xl transition-all hover:rotate-90 duration-300"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Tour Type Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto px-6 pb-4 scrollbar-hide">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-300 ease-in-out flex items-center gap-2 ${
                  activeFilter === tab.key
                    ? "bg-crimson-red text-white shadow-md"
                    : "bg-card border border-border text-foreground hover:border-crimson-red/50"
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 ${
                    activeFilter === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab && (
            <p
              key={activeTab.key}
              className="px-6 pb-4 -mt-1 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200"
            >
              {activeTab.description}
            </p>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-8 h-[calc(85vh-160px)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {isLoadingPackages ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/30 border-t-primary"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <p className="mt-4 text-muted-foreground">
                Loading amazing tours...
              </p>
            </div>
          ) : tourPackages.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted/50 mb-4">
                <svg
                  className="w-10 h-10 text-muted-foreground/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No Tours Available
              </h3>
              <p className="text-muted-foreground">
                Check back soon for exciting new adventures!
              </p>
            </div>
          ) : (
            <>
              {bookablePackages.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted/50 mb-4">
                    <svg
                      className="w-10 h-10 text-muted-foreground/40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    No Tours Available Right Now
                  </h3>
                  <p className="text-muted-foreground">
                    All tour dates are either in the past or too soon to
                    book.
                    <br />
                    Check back soon for new adventure dates!
                  </p>
                </div>
              ) : displayedPackages.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted/50 mb-4">
                    <svg
                      className="w-10 h-10 text-muted-foreground/40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    No {activeFilter === "hosted" ? "Hosted Tours" : "Tours"}{" "}
                    Available Right Now
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Try a different tab to see what's available.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveFilter("all")}
                    className="px-4 py-2 rounded-lg font-medium text-sm bg-crimson-red text-white shadow-md hover:opacity-90 transition-opacity"
                  >
                    Show All Tours
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {displayedPackages
                        .map((pkg) => {
                          const isSelected = selectedTourId === pkg.id;
                          const isDisabled = false; // Already filtered out tours with all dates too soon
                          const currency = "GBP";
                          const currencySymbol = "£";
                          const basePrice = pkg.price || 0;
                          const baseDeposit = pkg.deposit ?? 0;

                          // Helper to check if date is in the past (more than 1 day ago)
                          const isPastDate = (dateStr: any) => {
                            const date = toDate(dateStr);
                            if (!date) return false;
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return date < today;
                          };

                          const dateRows =
                            pkg.travelDateDetails &&
                            pkg.travelDateDetails.length > 0
                              ? pkg.travelDateDetails
                                  .filter((date) => !isPastDate(date.date))
                                  .map((date) => ({
                                    date: date.date,
                                    price:
                                      typeof date.customOriginal === "number"
                                        ? date.customOriginal
                                        : basePrice,
                                    deposit:
                                      typeof date.customDeposit === "number"
                                        ? date.customDeposit
                                        : baseDeposit,
                                  }))
                              : (pkg.travelDates || [])
                                  .filter((date) => !isPastDate(date))
                                  .map((date) => ({
                                    date,
                                    price: basePrice,
                                    deposit: baseDeposit,
                                  }));

                          return (
                            <button
                              key={pkg.id}
                              onClick={() => handleSelectTour(pkg)}
                              disabled={isDisabled}
                              aria-disabled={isDisabled}
                              className={`group relative flex flex-col rounded-2xl overflow-hidden bg-card transition-all duration-300 text-left shadow-md ${
                                isDisabled
                                  ? "opacity-60 cursor-not-allowed"
                                  : "transform hover:scale-[1.02] hover:shadow-xl"
                              } ${
                                isSelected && !isDisabled
                                  ? "ring-4 ring-primary ring-offset-2 ring-offset-background shadow-2xl shadow-primary/20"
                                  : ""
                              }`}
                            >
                              {/* Cover Image */}
                              <div className="relative h-36 overflow-hidden">
                                {pkg.coverImage ? (
                                  <>
                                    {!modalImagesLoaded.has(pkg.id) && (
                                      <div className="absolute inset-0 bg-muted animate-pulse" />
                                    )}
                                    <img
                                      src={pkg.coverImage}
                                      alt={pkg.name}
                                      className={`block w-full h-full object-cover object-center transition-all duration-500 ${
                                        modalImagesLoaded.has(pkg.id)
                                          ? "opacity-100"
                                          : "opacity-0"
                                      } ${
                                        isSelected
                                          ? "scale-105"
                                          : "group-hover:scale-110"
                                      }`}
                                      loading="eager"
                                      onLoad={() => {
                                        setModalImagesLoaded((prev) => {
                                          if (prev.has(pkg.id)) return prev;
                                          const next = new Set(prev);
                                          next.add(pkg.id);
                                          return next;
                                        });
                                      }}
                                    />
                                  </>
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                                    <svg
                                      className="w-16 h-16 text-muted-foreground/30"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </div>
                                )}
                              </div>

                              {/* Content */}
                              <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                                {/* Title */}
                                <h3 className="font-bold text-base text-foreground line-clamp-1">
                                  {pkg.name}
                                </h3>

                                {/* Description */}
                                {pkg.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                                    {pkg.description}
                                  </p>
                                )}

                                {/* Location */}
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <svg
                                    className="w-3.5 h-3.5 flex-shrink-0 text-royal-purple"
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
                                  <span className="line-clamp-1">
                                    {pkg.destinations?.[0] ||
                                      pkg.region ||
                                      pkg.country ||
                                      "Location Not Yet Configured"}
                                  </span>
                                </div>

                                {/* Duration */}
                                {pkg.duration && (
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                    <svg
                                      className="w-3.5 h-3.5 text-royal-purple"
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
                                    <span className="font-medium text-foreground">
                                      {pkg.duration}
                                    </span>
                                  </div>
                                )}

                                {/* Pricing by Date */}
                                <div className="pt-1">
                                  {dateRows.length > 0 ? (
                                    <div className="space-y-1">
                                      {dateRows
                                        .slice(0, 3)
                                        .map((date, index) => (
                                          <div
                                            key={`${pkg.id}-date-${index}`}
                                            className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                                          >
                                            <span className="line-clamp-1">
                                              {formatDateValue(date.date)}
                                            </span>
                                            <span className="flex items-center gap-2 whitespace-nowrap">
                                              <span className="text-[12px] font-bold text-foreground">
                                                {currencySymbol}
                                                {date.price.toLocaleString()}
                                              </span>
                                              <span className="text-[12px] font-bold text-muted-foreground">
                                                ResFee {currencySymbol}
                                                {date.deposit.toLocaleString()}
                                              </span>
                                            </span>
                                          </div>
                                        ))}
                                      {dateRows.length > 3 && (
                                        <p className="text-[10px] text-royal-purple font-medium">
                                          +{dateRows.length - 3} more{" "}
                                          {dateRows.length - 3 === 1
                                            ? "date"
                                            : "dates"}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                      <svg
                                        className="w-3 h-3 flex-shrink-0"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        />
                                      </svg>
                                      <span>No upcoming dates</span>
                                    </p>
                                  )}
                                </div>

                                {/* Highlights */}
                                {pkg.highlights &&
                                  pkg.highlights.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-1 mt-auto">
                                      {pkg.highlights
                                        .slice(0, 2)
                                        .map((highlight, index) => {
                                          const highlightText =
                                            typeof highlight === "string"
                                              ? highlight
                                              : (highlight as any)?.text ||
                                                String(highlight);

                                          return (
                                            <span
                                              key={index}
                                              className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10"
                                            >
                                              {highlightText}
                                            </span>
                                          );
                                        })}
                                      {pkg.highlights.length > 3 && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10">
                                          +{pkg.highlights.length - 2} more
                                        </span>
                                      )}
                                    </div>
                                  )}
                              </div>

                              {/* Selected Checkmark Overlay */}
                              {isDisabled && (
                                <div className="absolute inset-0 bg-background/20 flex items-center justify-center">
                                  <div className="bg-white dark:bg-gray-900 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                                    <svg
                                      className="w-4 h-4 text-destructive"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                      />
                                    </svg>
                                    <span className="text-sm font-semibold text-destructive">
                                      All dates are too soon
                                    </span>
                                  </div>
                                </div>
                              )}

                              {isSelected && !isDisabled && (
                                <div className="absolute inset-0 bg-primary/5 pointer-events-none">
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                    <div className="bg-primary text-primary-foreground p-4 rounded-full shadow-2xl animate-in zoom-in-50 duration-300">
                                      <svg
                                        className="w-10 h-10"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path
                                          fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
