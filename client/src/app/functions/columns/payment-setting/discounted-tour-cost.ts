import { BookingSheetColumn } from "@/types/booking-sheet-column";
import { firebaseUtils } from "@/app/functions/firebase-utils";
import { resolveTourPackage } from "./resolve-tour-package";

export const discountedTourCostColumn: BookingSheetColumn = {
  id: "discountedTourCost",
  data: {
    id: "discountedTourCost",
    columnName: "Discounted Tour Cost",
    dataType: "function",
    function: "getTourDiscountedCostFunction",
    parentTab: "Tour Details",
    includeInForms: false,
    color: "gray",
    width: 205.3333740234375,
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
      {
        name: "eventName",
        type: "string",
        columnReference: "Event Name",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "discountRate",
        type: "number",
        columnReference: "Discount",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "discountType",
        type: "string",
        columnReference: "Discount Type",
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
 * Calculates the discounted tour cost based on original cost and discount rate.
 *
 * For percentage discounts: Applies percentage reduction to original cost
 * For flat amount discounts: Subtracts the flat amount from original cost
 * NEW: If booking has locked pricing, returns stored value instead of recalculating.
 *
 * Parameters:
 * - tourPackageName → string representing the name of the selected tour package.
 * - tourDate → optional date for matching custom pricing
 * - eventName → optional string representing the discount event name
 * - discountRate → optional number (percentage value like 20, or flat amount like 300)
 * - discountType → optional string indicating "percent" or "amount"
 * - bookingContext → optional booking context containing locked pricing information
 *
 * Returns:
 * - number → the discounted cost (original cost - discount)
 * - "" → if no match or invalid input
 */

export default async function getTourDiscountedCost(
  tourPackageName: string,
  tourDate?: any,
  eventName?: string | null,
  discountRate?: number | null,
  discountType?: string | null,
  bookingContext?: {
    discountedTourCost?: number;
    lockPricing?: boolean;
    priceSource?: string;
    tourId?: string;
    tourCode?: string;
  },
): Promise<number | ""> {
  // If booking has locked pricing, return the stored value
  if (
    bookingContext?.lockPricing &&
    bookingContext?.discountedTourCost !== undefined
  ) {
    return bookingContext.discountedTourCost;
  }

  // A tourId or tourCode is enough to resolve the tour even with no name.
  if (!tourPackageName && !bookingContext?.tourId && !bookingContext?.tourCode) {
    return "";
  }

  // Fetch all tour packages from Firestore
  const tourPackages = await firebaseUtils.getCollectionData("tourPackages");
  if (!tourPackages || tourPackages.length === 0) return "";

  // Resolve by id → code → name; the name alone goes stale when a tour is renamed.
  const matchedPackage = resolveTourPackage(
    tourPackages as any[],
    tourPackageName,
    bookingContext,
  );

  if (!matchedPackage) return "";

  // Get the base cost (original or custom)
  let baseCost: number | "" = "";
  if (tourDate && (matchedPackage as any)?.travelDates) {
    const travelDateToMatch = new Date(tourDate);
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
    // No tourDate provided, use default original pricing
    baseCost = (matchedPackage as any)?.pricing?.original ?? "";
  }

  if (baseCost === "") return "";

  // If a discount is provided, apply it
  if (
    eventName &&
    discountRate !== null &&
    discountRate !== undefined &&
    discountRate !== 0
  ) {
    let discountedCost: number;

    // Normalize discountType to lowercase for case-insensitive comparison
    const normalizedDiscountType = discountType?.toLowerCase().trim();

    if (
      normalizedDiscountType === "percent" ||
      normalizedDiscountType === "percentage"
    ) {
      // For percentage discounts: apply percentage reduction
      // discountRate is like 20 for 20%
      const discountDecimal = discountRate / 100;
      discountedCost = Math.round(baseCost * (1 - discountDecimal) * 100) / 100;
    } else if (
      normalizedDiscountType === "amount" ||
      normalizedDiscountType?.includes("amount")
    ) {
      // For flat amount discounts: subtract the flat amount
      // discountRate is the amount like 300 for £300 off
      discountedCost = Math.round((baseCost - discountRate) * 100) / 100;
    } else {
      // Default: treat as percentage if not specified or unrecognized
      const discountDecimal = discountRate / 100;
      discountedCost = Math.round(baseCost * (1 - discountDecimal) * 100) / 100;
    }

    return discountedCost;
  }

  // No discount, return empty string (system should use Original Tour Cost instead)
  return "";
}
