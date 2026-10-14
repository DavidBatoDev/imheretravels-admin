import "server-only";

import { db, doc, getDoc } from "@/lib/server-firestore";
import { priceReservation, travellerCount, type ReservationPrice } from "@/lib/reservation-pricing";
import { timestampsToWire } from "@/lib/public-booking-view";
import {
  getPaymentStatus,
  isPendingReservationStatus,
} from "@/app/reservation-booking-form/utils/paymentLookup";

/**
 * Server side of the public reservation form (api/public/reservations/*).
 *
 * The form used to write stripePayments straight from the browser. Now:
 * - only the allowlisted customer / booking / tour fields come from the
 *   browser (`readDraftInput`);
 * - the fee, original price, status and booking ids are set here;
 * - reads return `toPublicReservation`, which leaves out the Stripe client
 *   secret, creation locks, invitations and other internal fields.
 *
 * A stripePayments doc id is the reservation's capability token: it is only
 * ever given to the browser that created it (or to whoever proves the email
 * and birthdate, see the lookup route).
 */

const MAX = { name: 100, email: 254, text: 60, phone: 30 } as const;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export type DraftInput = {
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    birthdate: string;
    nationality: string;
    whatsAppNumber: string;
  };
  booking: {
    type: string;
    groupSize: number;
    guestDetails: Array<{
      email: string;
      firstName: string;
      lastName: string;
      birthdate: string;
      nationality: string;
      whatsAppNumber: string;
    }>;
  };
  tour: { packageId: string; date: string };
};

const readPerson = (p: any) => ({
  email: str(p?.email, MAX.email),
  firstName: str(p?.firstName, MAX.name),
  lastName: str(p?.lastName, MAX.name),
  birthdate: str(p?.birthdate, MAX.text),
  nationality: str(p?.nationality, MAX.text),
  whatsAppNumber: str(p?.whatsAppNumber, MAX.phone),
});

/**
 * Picks the fields a customer may set from a buildReservationDraftPayload()
 * body. Everything else in the body (payment.*, booking.id, packageName…) is
 * ignored.
 */
export function readDraftInput(body: any): { ok: true; input: DraftInput } | { ok: false; error: string } {
  const customer = readPerson(body?.customer);
  if (!customer.email.includes("@")) return { ok: false, error: "A valid email is required" };

  const type = str(body?.booking?.type, MAX.text);
  const requestedSize = Number(body?.booking?.groupSize);
  const groupSize = travellerCount(type, Number.isFinite(requestedSize) ? requestedSize : 1);
  const guests = Array.isArray(body?.booking?.guestDetails) ? body.booking.guestDetails : [];
  const guestDetails =
    type === "Duo Booking" || type === "Group Booking"
      ? guests.slice(0, Math.max(0, groupSize - 1)).map(readPerson)
      : [];

  const packageId = str(body?.tour?.packageId, 128);
  const date = str(body?.tour?.date, 10);
  if (!packageId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Choose a tour and date" };
  }

  return {
    ok: true,
    input: { customer, booking: { type, groupSize, guestDetails }, tour: { packageId, date } },
  };
}

export async function priceDraft(input: DraftInput): Promise<ReservationPrice> {
  const snap = await getDoc(doc(db, "tourPackages", input.tour.packageId));
  return priceReservation(
    snap.exists() ? snap.data() : undefined,
    input.tour.date,
    input.booking.type,
    input.booking.groupSize,
  );
}

/** The doc maps the form used to write, with server-set pricing and status. */
export function draftDocFields(input: DraftInput, price: Extract<ReservationPrice, { ok: true }>) {
  return {
    customer: input.customer,
    booking: {
      type: input.booking.type,
      groupSize: input.booking.groupSize,
      guestDetails: input.booking.guestDetails,
      id: "PENDING",
      documentId: "",
    },
    tour: {
      packageId: input.tour.packageId,
      packageName: price.packageName,
      date: input.tour.date,
    },
    payment: {
      amount: price.amount,
      currency: "GBP",
      status: "reserve_pending",
      type: "reservationFee",
      ...(price.originalPrice ? { originalPrice: price.originalPrice } : {}),
    },
  };
}

/** A draft the customer may still edit or discard: unpaid, no booking yet. */
export function isEditableDraft(data: Record<string, any>): boolean {
  const status = getPaymentStatus(data);
  const hasBooking = !!data.booking?.documentId && data.booking.documentId !== "PENDING";
  return (!status || isPendingReservationStatus(status)) && !hasBooking && data.payment?.type !== "installment";
}

/** What the form may read back about a reservation. */
export function toPublicReservation(id: string, data: Record<string, any>, extra: Record<string, unknown> = {}) {
  const p = data.payment ?? {};
  const b = data.booking ?? {};
  return timestampsToWire({
    id,
    status: data.status,
    bookingId: data.bookingId,
    tourPackageName: data.tourPackageName,
    tourDate: data.tourDate,
    amountGBP: data.amountGBP,
    paymentPlanDetails: data.paymentPlanDetails,
    bookingDocumentIds: data.bookingDocumentIds,
    customer: data.customer,
    booking: {
      id: b.id,
      documentId: b.documentId,
      type: b.type,
      groupSize: b.groupSize,
      additionalGuests: b.additionalGuests,
      guestDetails: b.guestDetails,
      isGuest: b.isGuest,
    },
    tour: data.tour,
    payment: {
      status: p.status,
      type: p.type,
      amount: p.amount,
      currency: p.currency,
      installmentTerm: p.installmentTerm,
      stripeIntentId: p.stripeIntentId,
      selectedPaymentPlan: p.selectedPaymentPlan,
      paymentPlanDetails: p.paymentPlanDetails,
    },
    timestamps: { createdAt: data.timestamps?.createdAt, updatedAt: data.timestamps?.updatedAt },
    ...extra,
  });
}

/** Whether the reservation's booking already has a payment plan (badge + reuse flow). */
export async function bookingPaymentPlan(data: Record<string, any>): Promise<string | null> {
  const bookingDocId = data.booking?.documentId || data.booking?.id;
  if (!bookingDocId || bookingDocId === "PENDING") return null;
  const snap = await getDoc(doc(db, "bookings", bookingDocId));
  return snap.exists() ? snap.data()?.paymentPlan || null : null;
}
