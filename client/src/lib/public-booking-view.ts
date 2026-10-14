// What the public booking-status page may see of a booking, built on the
// server (api/public/booking/[token]) instead of the browser reading Firestore.
// Pure: no Firebase imports, so the route and its tests share it.

export const REQUIRED_PUBLIC_BOOKING_FIELDS = [
  "bookingId",
  "fullName",
  "tourPackageName",
  "tourDate",
  "formattedDate",
  "tourDuration",
  "originalTourCost",
  "paid",
  "remainingBalance",
  "bookingType",
] as const;

export function hasRequiredPublicBookingFields(bookingData: Record<string, unknown>): boolean {
  return REQUIRED_PUBLIC_BOOKING_FIELDS.every(
    (field) => bookingData[field] !== undefined && bookingData[field] !== null,
  );
}

export interface PublicPreDeparturePack {
  id: string;
  fileName: string;
  originalName: string;
  fileDownloadURL: string;
  contentType: string;
  size: number;
  uploadedAt: unknown;
}

/** The allowlisted projection the page renders (was buildPublicData in the page). */
export function buildPublicBookingView(
  bookingDocumentId: string,
  bookingData: any,
  preDeparturePack: PublicPreDeparturePack | null,
  options: { includePaymentTokens?: boolean } = {},
) {
  const totalCost =
    (bookingData.isMainBooker && bookingData.discountedTourCost
      ? bookingData.discountedTourCost
      : bookingData.originalTourCost) || 0;
  const paid = bookingData.paid || 0;

  const fallbackProgress = totalCost === 0 ? 0 : Math.round((paid / totalCost) * 100);
  const paymentProgressValue =
    typeof bookingData.paymentProgress === "string"
      ? parseFloat(bookingData.paymentProgress.replace(/%/g, "")) || fallbackProgress
      : typeof bookingData.paymentProgress === "number"
        ? bookingData.paymentProgress
        : fallbackProgress;

  return {
    bookingDocumentId,
    bookingId: bookingData.bookingId,
    bookingCode: bookingData.bookingCode,
    tourCode: bookingData.tourCode,
    emailAddress: bookingData.emailAddress,
    fullName: bookingData.fullName,
    firstName: bookingData.firstName,
    travellerInitials: bookingData.travellerInitials,
    tourPackageName: bookingData.tourPackageName,
    tourDate: bookingData.tourDate,
    returnDate: bookingData.returnDate,
    tourDuration: bookingData.tourDuration,
    formattedDate: bookingData.formattedDate,
    reservationDate: bookingData.reservationDate,
    originalTourCost: bookingData.originalTourCost,
    discountedTourCost: bookingData.discountedTourCost,
    reservationFee: bookingData.reservationFee,
    manualCredit: bookingData.manualCredit,
    creditFrom: bookingData.creditFrom,
    paid,
    remainingBalance: bookingData.remainingBalance,
    paymentProgress: paymentProgressValue,
    paymentPlan: bookingData.paymentPlan,
    bookingStatus: bookingData.bookingStatus,
    reasonForCancellation: bookingData.reasonForCancellation,
    fullPaymentDueDate: bookingData.fullPaymentDueDate,
    fullPaymentAmount: bookingData.fullPaymentAmount,
    fullPaymentDatePaid: bookingData.fullPaymentDatePaid,
    p1DueDate: bookingData.p1DueDate,
    p1Amount: bookingData.p1Amount,
    p1DatePaid: bookingData.p1DatePaid,
    p2DueDate: bookingData.p2DueDate,
    p2Amount: bookingData.p2Amount,
    p2DatePaid: bookingData.p2DatePaid,
    p3DueDate: bookingData.p3DueDate,
    p3Amount: bookingData.p3Amount,
    p3DatePaid: bookingData.p3DatePaid,
    p4DueDate: bookingData.p4DueDate,
    p4Amount: bookingData.p4Amount,
    p4DatePaid: bookingData.p4DatePaid,
    p1LateFeesPenalty: bookingData.p1LateFeesPenalty,
    p1LateFeeAppliedAt: bookingData.p1LateFeeAppliedAt,
    p2LateFeesPenalty: bookingData.p2LateFeesPenalty,
    p2LateFeeAppliedAt: bookingData.p2LateFeeAppliedAt,
    p3LateFeesPenalty: bookingData.p3LateFeesPenalty,
    p3LateFeeAppliedAt: bookingData.p3LateFeeAppliedAt,
    p4LateFeesPenalty: bookingData.p4LateFeesPenalty,
    p4LateFeeAppliedAt: bookingData.p4LateFeeAppliedAt,
    addOns: bookingData.addOns,
    sentEmailLink: bookingData.sentEmailLink,
    eventName: bookingData.eventName,
    discountRate: bookingData.discountRate,
    discountType: bookingData.discountType,
    bookingType: bookingData.bookingType,
    isMainBooker: bookingData.isMainBooker,
    enablePaymentReminder: bookingData.enablePaymentReminder,
    preDeparturePack: preDeparturePack ?? undefined,
    revolutPayments: bookingData.revolutPayments,
    ...(options.includePaymentTokens && { paymentTokens: bookingData.paymentTokens }),
  };
}

// ---------------------------------------------------------------------------
// Timestamps over JSON. firebase-admin Timestamps would serialise as
// {_seconds,_nanoseconds}; tag them so the browser can rebuild real client
// Timestamps and the page's date code (toDate(), .seconds) works unchanged.
// ---------------------------------------------------------------------------

export type WireTimestamp = { __ts: [number, number] };

const isTimestampLike = (v: any): v is { seconds: number; nanoseconds: number } =>
  !!v &&
  typeof v === "object" &&
  typeof v.toDate === "function" &&
  typeof v.seconds === "number" &&
  typeof v.nanoseconds === "number";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

export function timestampsToWire(value: unknown): unknown {
  if (isTimestampLike(value)) return { __ts: [value.seconds, value.nanoseconds] } satisfies WireTimestamp;
  if (Array.isArray(value)) return value.map(timestampsToWire);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, timestampsToWire(v)]));
  }
  return value;
}

export function timestampsFromWire<T>(value: unknown, make: (seconds: number, nanoseconds: number) => T): unknown {
  if (Array.isArray(value)) return value.map((v) => timestampsFromWire(v, make));
  if (isPlainObject(value)) {
    const ts = (value as Partial<WireTimestamp>).__ts;
    if (Array.isArray(ts) && ts.length === 2 && Object.keys(value).length === 1) return make(ts[0], ts[1]);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, timestampsFromWire(v, make)]));
  }
  return value;
}
