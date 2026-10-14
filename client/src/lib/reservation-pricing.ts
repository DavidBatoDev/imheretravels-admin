// Reservation-fee pricing, shared by the reservation form (display) and the
// server (what actually gets charged). Pure: callers pass the tourPackages doc.
//
// The server must price from Firestore, never from the browser's amount: the
// form used to send `amountGBP` / `payment.amount` / `payment.originalPrice`
// itself, so a customer could choose their own fee or tour price.

/** A tour's travel date as "YYYY-MM-DD" (Timestamp, {seconds}, Date or string). */
export const toDateString = (value: unknown): string | null => {
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

export const DEFAULT_RESERVATION_FEE = 250;
export const MIN_GROUP_SIZE = 3;
export const MAX_GROUP_SIZE = 20;

/** Travellers covered by one reservation (the form's deriveGroupSize). */
export function travellerCount(bookingType: string, groupSize: number): number {
  if (bookingType === "Group Booking") return groupSize;
  if (bookingType === "Duo Booking") return 2;
  return 1;
}

export type ReservationPrice =
  | {
      ok: true;
      /** Total reservation fee in GBP (per-person fee × travellers). */
      amount: number;
      perPersonFee: number;
      travellers: number;
      /** The date's custom tour price, when set (becomes the booking's originalTourCost). */
      originalPrice?: number;
      packageName: string;
    }
  | { ok: false; error: string };

const BOOKING_TYPES = new Set(["Single Booking", "Duo Booking", "Group Booking"]);

export function priceReservation(
  tourPackage: Record<string, any> | undefined,
  tourDate: string,
  bookingType: string,
  groupSize: number,
): ReservationPrice {
  if (!tourPackage) return { ok: false, error: "Tour not found" };
  if (!BOOKING_TYPES.has(bookingType)) return { ok: false, error: "Invalid booking type" };
  if (
    bookingType === "Group Booking" &&
    !(Number.isInteger(groupSize) && groupSize >= MIN_GROUP_SIZE && groupSize <= MAX_GROUP_SIZE)
  ) {
    return { ok: false, error: `Group size must be ${MIN_GROUP_SIZE}-${MAX_GROUP_SIZE}` };
  }

  const detail = (tourPackage.travelDates ?? []).find(
    (t: any) => t?.isAvailable !== false && toDateString(t?.startDate) === tourDate,
  );
  if (!detail) return { ok: false, error: "This tour date is not available" };

  const packageFee = tourPackage.pricing?.deposit ?? DEFAULT_RESERVATION_FEE;
  const perPersonFee =
    detail.hasCustomDeposit === true ? (detail.customDeposit ?? packageFee) : packageFee;
  const travellers = travellerCount(bookingType, groupSize);

  return {
    ok: true,
    amount: perPersonFee * travellers,
    perPersonFee,
    travellers,
    ...(detail.customOriginal ? { originalPrice: detail.customOriginal } : {}),
    packageName: tourPackage.name ?? tourPackage.title ?? "",
  };
}
