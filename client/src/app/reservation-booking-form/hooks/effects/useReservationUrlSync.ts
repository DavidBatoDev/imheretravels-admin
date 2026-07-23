import { useCallback, useEffect } from "react";
import {
  buildUrlWithQueryParam,
  hasPaymentIdParam,
} from "../../utils/formQueryParams";

type RouterLike = {
  replace: (url: string) => void;
};

type TourPackage = {
  id: string;
  slug?: string;
  travelDates: string[];
};

type UseReservationUrlSyncOptions = {
  debug?: boolean;
  router: RouterLike;
  searchParams: { get: (key: string) => string | null } | null;
  step: number;
  selectedPackageSlug?: string;
  isLoadingPackages: boolean;
  paymentDocId: string | null;
  tourPackages: TourPackage[];
  tourPackage: string;
  tourDate: string;
  setTourPackage: (value: string) => void;
  setTourDate: (value: string) => void;
};

export const useReservationUrlSync = ({
  debug = false,
  router,
  searchParams,
  step,
  selectedPackageSlug,
  isLoadingPackages,
  paymentDocId,
  tourPackages,
  tourPackage,
  tourDate,
  setTourPackage,
  setTourDate,
}: UseReservationUrlSyncOptions) => {
  const replaceWithPaymentId = useCallback(
    (docId: string | null) => {
      if (!docId) return;
      try {
        const newUrl = `${window.location.pathname}?paymentid=${docId}`;
        try {
          router.replace(newUrl);
        } catch (e) {
          if (debug) {
            console.debug("replaceWithPaymentId: router.replace failed", "", e);
          }
        }

        try {
          const state = window.history.state || null;
          window.history.replaceState(state, "", newUrl);
        } catch (e) {
          if (debug) {
            console.debug(
              "replaceWithPaymentId: history.replaceState failed",
              "",
              e,
            );
          }
        }

        if (debug) {
          console.debug("replaceWithPaymentId: applied", { docId, newUrl });
        }
      } catch (err) {
        if (debug) console.debug("replaceWithPaymentId error", err);
      }
    },
    [router, debug],
  );

  useEffect(() => {
    try {
      if (step === 2 && selectedPackageSlug) {
        const params = new URLSearchParams(window.location.search);
        params.set("tour", String(selectedPackageSlug));
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        router.replace(newUrl);
      }
    } catch (err) {
      console.debug("Failed to set tour query param:", err);
    }
  }, [step, selectedPackageSlug, router]);

  useEffect(() => {
    try {
      if (!isLoadingPackages) {
        let tourSlug = searchParams?.get("tour");
        if (!tourSlug) {
          try {
            const raw = new URLSearchParams(window.location.search).get("tour");
            if (raw) tourSlug = raw;
          } catch {}
        }

        if (tourSlug && !tourPackage) {
          const normalized = String(tourSlug).toLowerCase();
          const match = tourPackages.find((p) => {
            const s = p.slug ? String(p.slug).toLowerCase() : "";
            return s === normalized;
          });
          // Preselect regardless of date availability — a deep link is a deliberate pick, and
          // the sidebar card already shows a "No available dates" state for this case rather
          // than needing the effect to silently no-op and leave "No tour selected yet" up.
          if (match) {
            setTourPackage(match.id);

            try {
              let tourDateParam = searchParams?.get("tourdate");
              if (!tourDateParam) {
                const rawDate = new URLSearchParams(window.location.search).get(
                  "tourdate",
                );
                if (rawDate) tourDateParam = rawDate;
              }
              if (
                tourDateParam &&
                Array.isArray(match.travelDates) &&
                match.travelDates.includes(tourDateParam)
              ) {
                setTourDate(tourDateParam);
              }
            } catch {}

            setTimeout(() => {
              const tourDateSection = document.querySelector(
                '[aria-label="Tour Date"]',
              );
              if (tourDateSection) {
                tourDateSection.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }
            }, 800);
          }
        }
      }
    } catch (err) {
      console.debug("Failed to read tour query param:", err);
    }
  }, [
    isLoadingPackages,
    searchParams,
    tourPackage,
    tourPackages,
    setTourPackage,
    setTourDate,
  ]);

  useEffect(() => {
    try {
      if (isLoadingPackages) return;
      if (paymentDocId) return;

      if (debug) {
        try {
          const curParams = new URLSearchParams(window.location.search);
          console.debug(
            "tour-sync effect: current params",
            Object.fromEntries(curParams.entries()),
          );
        } catch {}
      }

      try {
        if (hasPaymentIdParam(window.location.search)) return;
      } catch {}

      const slug = tourPackages.find((p) => p.id === tourPackage)?.slug;
      const newUrl = buildUrlWithQueryParam({
        pathname: window.location.pathname,
        search: window.location.search,
        key: "tour",
        value: slug ? String(slug) : null,
      });
      router.replace(newUrl);
    } catch (err) {
      console.debug("Failed to sync tour query param on selection:", err);
    }
  }, [tourPackage, tourPackages, router, isLoadingPackages, paymentDocId, debug]);

  useEffect(() => {
    try {
      if (isLoadingPackages) return;
      if (!tourPackage) return;
      if (tourDate) return;

      let tourDateParam = searchParams?.get("tourdate");
      if (!tourDateParam) {
        try {
          const rawDate = new URLSearchParams(window.location.search).get(
            "tourdate",
          );
          if (rawDate) tourDateParam = rawDate;
        } catch {}
      }

      if (!tourDateParam) return;
      const pkg = tourPackages.find((p) => p.id === tourPackage);
      if (pkg?.travelDates?.includes(tourDateParam)) {
        setTourDate(tourDateParam);
      }
    } catch (err) {
      console.debug("Failed to read tourdate query param:", err);
    }
  }, [
    tourPackage,
    tourPackages,
    isLoadingPackages,
    searchParams,
    tourDate,
    setTourDate,
  ]);

  useEffect(() => {
    try {
      if (isLoadingPackages) return;
      if (paymentDocId) return;

      try {
        if (hasPaymentIdParam(window.location.search)) return;
      } catch {}

      const newUrl = buildUrlWithQueryParam({
        pathname: window.location.pathname,
        search: window.location.search,
        key: "tourdate",
        value: tourDate ? String(tourDate) : null,
      });
      router.replace(newUrl);
    } catch (err) {
      console.debug("Failed to sync tourdate query param:", err);
    }
  }, [tourDate, router, isLoadingPackages, paymentDocId]);

  return {
    replaceWithPaymentId,
  };
};

