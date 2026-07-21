import { BookingSheetColumn } from "@/types/booking-sheet-column";
import { firebaseUtils } from "@/app/functions/firebase-utils";
import { resolveTourPackage } from "./resolve-tour-package";

export const originalTourCostColumn: BookingSheetColumn = {
  id: "originalTourCost",
  data: {
    id: "originalTourCost",
    columnName: "Original Tour Cost",
    dataType: "function",
    function: "getOriginalTourCostFunction",
    parentTab: "Tour Details",
    includeInForms: false,
    color: "gray",
    width: 183.3333740234375,
    arguments: [
      {
        name: "tourPackageName",
        type: "string",
        columnReference: "Tour Package Name",
        isOptional: false,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "tourDate",
        type: "date",
        columnReference: "Tour Date",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
    ],
  },
};

// Column Function Implementation
/**
 * Description:
 * - Retrieves the base `originalTourCost` (pricing.original) for a given tour package.
 * - No discounts are applied here; discounts are handled by the discounted-tour-cost column.
 * - If the tour package name is blank or not found, returns an empty string.
 * - NEW: If booking has locked pricing, returns stored value instead of fetching from tourPackages.
 *
 * Parameters:
 * - tourPackageName → string representing the name of the selected tour package.
 * - tourDate → optional date used to select a custom original price for that travel date.
 * - bookingContext → optional booking context containing locked pricing information
 *
 * Returns:
 * - number → the original cost for the tour package (or custom date-specific original price)
 * - "" → if no match or invalid input
 */
export default async function getOriginalTourCost(
  tourPackageName: string,
  tourDate?: any,
  bookingContext?: {
    originalTourCost?: number;
    lockPricing?: boolean;
    priceSource?: string;
    tourId?: string;
    tourCode?: string;
  },
): Promise<number | ""> {
  // If booking has locked pricing, return the stored value
  if (
    bookingContext?.lockPricing &&
    bookingContext?.originalTourCost !== undefined
  ) {
    return bookingContext.originalTourCost;
  }

  // A tourId or tourCode is enough to resolve the tour even with no name.
  if (!tourPackageName && !bookingContext?.tourId && !bookingContext?.tourCode) {
    return "";
  }

  // Fetch all tour packages
  const tourPackages = await firebaseUtils.getCollectionData("tourPackages");
  if (!tourPackages || tourPackages.length === 0) return "";

  // Resolve by id → code → name; the name alone goes stale when a tour is renamed.
  const matchedPackage = resolveTourPackage(
    tourPackages as any[],
    tourPackageName,
    bookingContext,
  );

  // Check for custom original price if tourDate is provided
  let baseCost: number | "" = "";
  if (tourDate && (matchedPackage as any)?.travelDates) {
    // Handle Firestore Timestamp object properly
    let travelDateToMatch: Date;
    if (tourDate.seconds !== undefined) {
      // Firestore Timestamp format: {seconds: number, nanoseconds: number}
      travelDateToMatch = new Date(tourDate.seconds * 1000);
    } else if (tourDate.toDate && typeof tourDate.toDate === "function") {
      // Firestore Timestamp instance
      travelDateToMatch = tourDate.toDate();
    } else {
      // Fallback: try to parse as regular date
      travelDateToMatch = new Date(tourDate);
    }

    const matchingTravelDate = (matchedPackage as any).travelDates.find(
      (td: any) => {
        const tdStart = td.startDate?.toDate?.() || new Date(td.startDate);
        return tdStart.toDateString() === travelDateToMatch.toDateString();
      },
    );

    // If custom original price is set for this date, use it
    if (
      matchingTravelDate?.hasCustomOriginal &&
      matchingTravelDate?.customOriginal !== undefined
    ) {
      baseCost = matchingTravelDate.customOriginal;
    } else {
      baseCost = (matchedPackage as any)?.pricing?.original ?? "";
    }
  } else {
    // No tourDate provided, use default pricing
    baseCost = (matchedPackage as any)?.pricing?.original ?? "";
  }

  if (baseCost === "") return "";

  // Always return the base (non-discounted) original cost. Discounts are applied elsewhere.
  return baseCost;
}
