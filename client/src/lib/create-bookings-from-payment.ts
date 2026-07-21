// Shared helper that creates booking documents from a confirmed reservation-fee
// stripePayments document. Used by both the Stripe webhook (production path)
// and the /api/stripe-payments/create-booking endpoint (client-confirmed path)
// so the two flows stay in sync.

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  addDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  createBookingData,
  generateGroupId,
  normalizeTourDateToUTCPlus8Nine,
  type BookingCreationInput,
} from "@/lib/booking-calculations";
import crypto from "crypto";

export type CreationLockOwner = "api" | "webhook";

export type CreateBookingsResult =
  | {
      alreadyExists: true;
      bookingDocumentId: string;
      bookingId: string;
    }
  | {
      alreadyExists: false;
      bookingDocumentIds: string[];
      bookingIds: string[];
      mainBooker: {
        firstName: string;
        lastName: string;
        email: string;
      };
      tourPackageName: string;
      reservationFeeTotal: number;
    };

export class CreateBookingsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function generateGroupMemberIdFunction(
  bookingType: string,
  tourName: string,
  firstName: string,
  lastName: string,
  email: string,
  isActive: boolean,
): string {
  if (!(bookingType === "Duo Booking" || bookingType === "Group Booking")) {
    return "";
  }
  if (isActive !== true) return "";

  const initials =
    (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase();
  const idPrefix = bookingType === "Duo Booking" ? "DB" : "GB";

  const identity = `${bookingType}|${tourName}|${firstName}|${lastName}|${email}`;
  let hashNum = 0;
  for (let i = 0; i < identity.length; i++) {
    hashNum += identity.charCodeAt(i) * (i + 1);
  }
  const hashTag = String(Math.abs(hashNum) % 10000).padStart(4, "0");
  const memberNumber = String((Math.abs(hashNum) % 999) + 1).padStart(3, "0");

  return `${idPrefix}-${initials}-${hashTag}-${memberNumber}`;
}

function toDate(input: unknown): Date | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string" && input.trim() === "") return null;

  try {
    if (
      typeof input === "object" &&
      input !== null &&
      "toDate" in (input as any) &&
      typeof (input as any).toDate === "function"
    ) {
      return (input as any).toDate();
    }
    if (
      typeof input === "object" &&
      input !== null &&
      "seconds" in (input as any) &&
      typeof (input as any).seconds === "number"
    ) {
      const s = (input as any).seconds as number;
      const ns =
        typeof (input as any).nanoseconds === "number"
          ? (input as any).nanoseconds
          : 0;
      return new Date(s * 1000 + Math.floor(ns / 1e6));
    }
    if (input instanceof Date) return input;
    if (typeof input === "number") return new Date(input);
    if (typeof input === "string") {
      const raw = input.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("/").map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yyyy, mm, dd] = raw.split("-").map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
      }
      return new Date(raw);
    }
    return null;
  } catch {
    return null;
  }
}

function calculateReturnDate(
  tourDate: unknown,
  durationDays: string | number | null | undefined,
): string {
  const start = toDate(tourDate);
  if (!start || isNaN(start.getTime())) return "";

  let days: number;
  if (typeof durationDays === "number") {
    days = durationDays;
  } else if (typeof durationDays === "string") {
    const match = durationDays.match(/\d+/);
    days = match ? parseInt(match[0], 10) : NaN;
  } else {
    return "";
  }

  if (!days || isNaN(days)) return "";

  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  end.setDate(end.getDate() + days - 1);

  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getTourPackageData(tourPackageId: string) {
  try {
    const tourPackageDoc = await getDoc(doc(db, "tourPackages", tourPackageId));
    if (tourPackageDoc.exists()) {
      return { id: tourPackageDoc.id, ...tourPackageDoc.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching tour package:", error);
    return null;
  }
}

async function getExistingBookingsCountForTourPackage(
  tourPackageName: string,
): Promise<number> {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(
      bookingsRef,
      where("tourPackageName", "==", tourPackageName),
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error("Error counting bookings for tour package:", error);
    return 0;
  }
}

// Returns next-available row minus 1 (createBookingData adds +1). Fills gaps.
async function getTotalBookingsCount(): Promise<number> {
  try {
    const bookingsRef = collection(db, "bookings");
    const snapshot = await getDocs(bookingsRef);

    const existingRows = new Set<number>();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.row && typeof data.row === "number") {
        existingRows.add(data.row);
      }
    });

    if (existingRows.size === 0) return 0;

    let nextRow = 1;
    while (existingRows.has(nextRow)) {
      nextRow++;
    }
    return nextRow - 1;
  } catch (error) {
    console.error("Error getting next row number:", error);
    return 0;
  }
}

function generateAccessToken(): string {
  return crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Creates booking document(s) for a confirmed reservation-fee payment.
 *
 * - Idempotent: if a booking already exists on the payment doc, returns it.
 * - Uses a creation lock so concurrent webhook + client calls cannot duplicate.
 * - For Duo/Group bookings, splits the reservation fee per traveller and
 *   creates one booking per guest in `booking.guestDetails`.
 */
export async function createBookingsForReservationPayment(opts: {
  paymentDocId: string;
  creationLock: CreationLockOwner;
}): Promise<CreateBookingsResult> {
  const { paymentDocId, creationLock: lockOwner } = opts;

  if (!paymentDocId) {
    throw new CreateBookingsError("Missing required field: paymentDocId", 400);
  }

  console.log("📝 Creating booking for payment document:", paymentDocId);

  const paymentDocRef = doc(db, "stripePayments", paymentDocId);
  const paymentDocSnap = await getDoc(paymentDocRef);

  if (!paymentDocSnap.exists()) {
    throw new CreateBookingsError("Payment document not found", 404);
  }

  const paymentData = paymentDocSnap.data() as any;

  // Idempotency: booking already created for this payment
  if (
    paymentData.booking?.documentId &&
    paymentData.booking.documentId !== "" &&
    paymentData.booking.documentId !== "PENDING"
  ) {
    console.log("✅ Booking already exists:", paymentData.booking.documentId);
    return {
      alreadyExists: true,
      bookingDocumentId: paymentData.booking.documentId,
      bookingId: paymentData.booking.id,
    };
  }

  if (paymentData.payment?.type !== "reservationFee") {
    throw new CreateBookingsError(
      "Invalid payment type. Expected reservationFee.",
      400,
    );
  }

  if (
    paymentData.payment?.status !== "reserve_paid" &&
    paymentData.payment?.status !== "succeeded"
  ) {
    throw new CreateBookingsError(
      `Payment not confirmed. Current status: ${paymentData.payment?.status}`,
      400,
    );
  }

  // Creation lock: prevents webhook + client double-creation races.
  const existingLock = paymentData.booking?.creationLock;
  if (existingLock && existingLock !== lockOwner) {
    throw new CreateBookingsError(
      `Booking creation already in progress (lock: ${existingLock})`,
      409,
    );
  }
  if (!existingLock) {
    await updateDoc(paymentDocRef, {
      "booking.creationLock": lockOwner,
      "booking.creationStartedAt": serverTimestamp(),
      "timestamps.updatedAt": serverTimestamp(),
    });
  }

  console.log("🎯 Processing reservation fee payment - creating booking");

  const tourPackage = await getTourPackageData(paymentData.tour?.packageId);
  const tourCode = (tourPackage as any)?.tourCode || "XXX";
  // IMPORTANT: prefer the per-tour-date custom amount stored on the payment
  // doc (payment.originalPrice) over the tour package default. This is the
  // amount captured when the customer selected a specific tour date with a
  // custom price in the reservation form.
  const originalTourCost =
    paymentData.payment?.originalPrice ??
    (tourPackage as any)?.pricing?.original ??
    0;
  const discountedTourCost = (tourPackage as any)?.pricing?.discounted || null;
  const tourDuration = (tourPackage as any)?.duration || null;
  const tourPackageName =
    paymentData.tour?.packageName || (tourPackage as any)?.name || "";

  const existingCountForTourPackage =
    await getExistingBookingsCountForTourPackage(tourPackageName);
  const totalBookingsCount = await getTotalBookingsCount();

  const bookingType: string = paymentData.booking?.type || "Single Booking";
  const isGroupBooking =
    bookingType === "Duo Booking" || bookingType === "Group Booking";
  const groupId = isGroupBooking
    ? paymentData.booking?.groupCode || generateGroupId()
    : "";

  const tourDateParsed = toDate(paymentData.tour?.date);
  console.log("📅 Tour date from payment data:", paymentData.tour?.date);
  console.log("📅 Parsed tour date:", tourDateParsed);

  const calculatedReturnDate = calculateReturnDate(
    paymentData.tour?.date,
    tourDuration,
  );
  console.log("📅 Calculated return date:", calculatedReturnDate);

  const guestDetails: any[] = paymentData.booking?.guestDetails || [];
  const groupSize: number = paymentData.booking?.groupSize || 1;
  const totalReservationFee: number = paymentData.payment?.amount || 250;
  const feePerPerson = totalReservationFee / groupSize;

  console.log(
    `💰 Total fee: ${totalReservationFee}, Split among ${groupSize} people = ${feePerPerson} per person`,
  );

  const createdBookingIds: string[] = [];
  const createdBookingDocIds: string[] = [];

  const normalizedTourDate =
    normalizeTourDateToUTCPlus8Nine(tourDateParsed) || tourDateParsed;
  const tourDateTimestamp = normalizedTourDate
    ? Timestamp.fromDate(normalizedTourDate)
    : null;

  // 1. MAIN BOOKER
  const mainBookingInput: BookingCreationInput = {
    email: paymentData.customer?.email || "",
    firstName: paymentData.customer?.firstName || "",
    lastName: paymentData.customer?.lastName || "",
    bookingType,
    tourPackageName,
    tourCode,
    // Durable link to the tour. Name and code are snapshots that go stale on a
    // rename; this does not.
    // Durable link to the tour. Name and code are snapshots that go stale on a
    // rename; this does not.
    tourId: (tourPackage as any)?.id ?? paymentData.tour?.packageId ?? "",
    tourDate: normalizedTourDate || paymentData.tour?.date || "",
    returnDate: paymentData.tour?.returnDate || calculatedReturnDate || "",
    tourDuration,
    reservationFee: feePerPerson,
    paidAmount: feePerPerson,
    originalTourCost,
    discountedTourCost,
    paymentMethod: "Stripe",
    groupId,
    isMainBooking: true,
    existingBookingsCount: existingCountForTourPackage,
    totalBookingsCount,
  };

  const mainBookingData = await createBookingData(mainBookingInput);

  if (isGroupBooking) {
    mainBookingData.isMainBooker = true;
    const generatedGroupMemberId = generateGroupMemberIdFunction(
      bookingType,
      tourPackageName,
      paymentData.customer?.firstName || "",
      paymentData.customer?.lastName || "",
      paymentData.customer?.email || "",
      true,
    );
    mainBookingData.groupIdGroupIdGenerator = generatedGroupMemberId;
    mainBookingData.groupId = generatedGroupMemberId;
  }

  const mainAccessToken = generateAccessToken();

  const mainBookingRef = await addDoc(collection(db, "bookings"), {
    ...mainBookingData,
    emailAddress: paymentData.customer?.email || "",
    access_token: mainAccessToken,
    tourDate: tourDateTimestamp,
    returnDate: calculatedReturnDate,
    reservationDate: Timestamp.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    priceSnapshotDate: serverTimestamp(),
    tourPackagePricingVersion: (tourPackage as any)?.currentVersion || 1,
    priceSource: "snapshot",
    lockPricing: true,
  });

  createdBookingIds.push(mainBookingData.bookingId);
  createdBookingDocIds.push(mainBookingRef.id);
  console.log(
    `✅ Main booker booking created: ${mainBookingRef.id} (${mainBookingData.bookingId})`,
  );

  // 2. GUESTS
  for (let i = 0; i < guestDetails.length; i++) {
    const guest = guestDetails[i];
    const guestBookingInput: BookingCreationInput = {
      email: guest.email || "",
      firstName: guest.firstName || "",
      lastName: guest.lastName || "",
      bookingType,
      tourPackageName,
      tourCode,
      // Same durable link as the main booker.
      tourId: (tourPackage as any)?.id ?? paymentData.tour?.packageId ?? "",
      tourDate: normalizedTourDate || paymentData.tour?.date || "",
      returnDate: paymentData.tour?.returnDate || calculatedReturnDate || "",
      tourDuration,
      reservationFee: feePerPerson,
      paidAmount: feePerPerson,
      originalTourCost,
      discountedTourCost,
      paymentMethod: "Stripe",
      groupId,
      isMainBooking: false,
      existingBookingsCount: existingCountForTourPackage + i + 1,
      totalBookingsCount: totalBookingsCount + i + 1,
    };

    const guestBookingData = await createBookingData(guestBookingInput);

    if (isGroupBooking) {
      guestBookingData.isMainBooker = false;
      (guestBookingData as any).mainBookerId = mainBookingRef.id;
      const guestGroupMemberId = generateGroupMemberIdFunction(
        bookingType,
        tourPackageName,
        guest.firstName || "",
        guest.lastName || "",
        guest.email || "",
        true,
      );
      guestBookingData.groupIdGroupIdGenerator = guestGroupMemberId;
      guestBookingData.groupId = guestGroupMemberId;
    }

    const guestAccessToken = generateAccessToken();

    const guestBookingRef = await addDoc(collection(db, "bookings"), {
      ...guestBookingData,
      emailAddress: guest.email || "",
      access_token: guestAccessToken,
      tourDate: tourDateTimestamp,
      returnDate: calculatedReturnDate,
      reservationDate: Timestamp.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      priceSnapshotDate: serverTimestamp(),
      tourPackagePricingVersion: (tourPackage as any)?.currentVersion || 1,
      priceSource: "snapshot",
      lockPricing: true,
    });

    createdBookingIds.push(guestBookingData.bookingId);
    createdBookingDocIds.push(guestBookingRef.id);
    console.log(
      `✅ Guest ${i + 1} booking created: ${guestBookingRef.id} (${guestBookingData.bookingId})`,
    );
  }

  console.log(
    `✅ Created ${createdBookingIds.length} total bookings for payment ${paymentDocId}`,
  );

  await updateDoc(paymentDocRef, {
    "booking.documentId": createdBookingDocIds[0],
    "booking.id": createdBookingIds[0],
    bookingIds: createdBookingIds,
    bookingDocumentIds: createdBookingDocIds,
    "timestamps.updatedAt": serverTimestamp(),
  });

  console.log("✅ Stripe payment record updated with all booking references");

  return {
    alreadyExists: false,
    bookingDocumentIds: createdBookingDocIds,
    bookingIds: createdBookingIds,
    mainBooker: {
      firstName: paymentData.customer?.firstName || "",
      lastName: paymentData.customer?.lastName || "",
      email: paymentData.customer?.email || "",
    },
    tourPackageName,
    reservationFeeTotal: totalReservationFee,
  };
}
