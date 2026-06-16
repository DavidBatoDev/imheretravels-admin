import { useEffect } from "react";
import { collection, onSnapshot, type Firestore } from "firebase/firestore";
import type {
  ReservationPaymentTerm,
  ReservationTourPackage,
} from "../state/useReservationCatalogState";

type UseReservationCatalogSubscriptionsOptions = {
  db: Firestore;
  debug?: boolean;
  setTourPackages: React.Dispatch<React.SetStateAction<ReservationTourPackage[]>>;
  setIsLoadingPackages: React.Dispatch<React.SetStateAction<boolean>>;
  setPaymentTerms: React.Dispatch<React.SetStateAction<ReservationPaymentTerm[]>>;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const toDateString = (value: unknown): string | null => {
  if (!value) return null;

  let dateObj: Date | null = null;

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    dateObj = new Date(((value as { seconds: number }).seconds ?? 0) * 1000);
  } else if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      dateObj = (value as { toDate: () => Date }).toDate();
    } catch {
      dateObj = null;
    }
  } else {
    dateObj = new Date(value as string);
  }

  if (!dateObj || isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString().slice(0, 10);
};

export const useReservationCatalogSubscriptions = ({
  db,
  debug = false,
  setTourPackages,
  setIsLoadingPackages,
  setPaymentTerms,
}: UseReservationCatalogSubscriptionsOptions) => {
  useEffect(() => {
    const q = collection(db, "tourPackages");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const pkgList = snap.docs.map((snapshotDoc) => {
          const payload = snapshotDoc.data() as any;
          const name = payload.name ?? payload.title ?? "";

          // Only offer dates the admin has marked available — hidden/inactive
          // travel windows must never be bookable, even via a deep link.
          const availableTravelDates = (payload.travelDates ?? []).filter(
            (t: any) => t?.isAvailable !== false,
          );

          const dates = availableTravelDates
            .map((t: any) => toDateString(t?.startDate))
            .filter(Boolean) as string[];

          if (dates.length === 0) {
            console.warn(
              `Tour package "${
                payload.name ?? payload.title ?? snapshotDoc.id
              }" has no valid tour dates.`,
            );
          }

          const travelDateDetails = availableTravelDates
            .map((t: any) => {
              const parsedDate = toDateString(t?.startDate);
              if (!parsedDate) return null;
              return {
                date: parsedDate,
                customDeposit: t.customDeposit,
                customOriginal: t.customOriginal,
                hasCustomDeposit: t.hasCustomDeposit,
              };
            })
            .filter(Boolean);

          const coverImage =
            payload.media?.coverImage ||
            payload.coverImage ||
            payload.image ||
            null;

          const highlights = payload.details?.highlights || payload.highlights || [];
          if (debug && highlights.length > 0) {
            console.log("Tour highlights for", name, ":", highlights);
          }

          const slugFromPayload = payload.slug || payload.slugified || null;
          return {
            id: snapshotDoc.id,
            name,
            slug: slugFromPayload || (name ? slugify(name) : snapshotDoc.id),
            travelDates: dates,
            travelDateDetails: travelDateDetails as ReservationTourPackage["travelDateDetails"],
            stripePaymentLink: payload.stripePaymentLink,
            status: payload.status || "active",
            deposit: payload.pricing?.deposit ?? 250,
            price: payload.pricing?.original ?? 2050,
            coverImage,
            duration: payload.duration || null,
            highlights,
            destinations: payload.destinations || payload.details?.destinations || [],
            description: payload.description || payload.summary || "",
            region: payload.region || payload.country || "",
            country: payload.country || "",
            rating: payload.rating || 4.8,
            media: payload.media,
          } satisfies ReservationTourPackage;
        });

        if (debug) {
          console.log("ðŸ“¦ Loaded tour packages:", pkgList.length);
          console.log("Sample cover image:", pkgList[0]?.coverImage);
        }

        setTourPackages(pkgList);
        setIsLoadingPackages(false);
      },
      (err) => {
        console.error("tourPackages snapshot error", err);
        setIsLoadingPackages(false);
      },
    );

    return () => unsub();
  }, [db, debug, setTourPackages, setIsLoadingPackages]);

  useEffect(() => {
    const q = collection(db, "paymentTerms");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const terms = snap.docs
          .map((snapshotDoc) => {
            const data = snapshotDoc.data();
            return {
              id: snapshotDoc.id,
              name: data.name,
              description: data.description,
              paymentPlanType: data.paymentPlanType,
              monthsRequired: data.monthsRequired,
              monthlyPercentages: data.monthlyPercentages,
              color: data.color,
            } satisfies ReservationPaymentTerm;
          })
          .sort((a, b) => {
            const order = [
              "p1_single_installment",
              "p2_two_installments",
              "p3_three_installments",
              "p4_four_installments",
            ];
            return (
              order.indexOf(a.paymentPlanType) - order.indexOf(b.paymentPlanType)
            );
          });

        setPaymentTerms(terms);
      },
      (err) => console.error("paymentTerms snapshot error", err),
    );

    return () => unsub();
  }, [db, setPaymentTerms]);
};

