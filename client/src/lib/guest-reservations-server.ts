import "server-only";

import { db, doc, getDoc } from "@/lib/server-firestore";
import { validateGuestInvitation } from "@/lib/guest-booking-server";
import type { GuestInvitation, ParentBookingData } from "@/lib/guest-booking-shared";

/**
 * Server side of the guest invitation page (api/public/guest-reservations).
 * The page used to read the parent's stripePayments and bookings docs and
 * write its own draft from the browser, with a fee it chose. Here the
 * invitation is checked and the fee is the parent booking's reservationFee.
 */

export type GuestContext = {
  parentBooking: Omit<ParentBookingData, "guestInvitations">;
  invitation: GuestInvitation;
  /** The guest's reservation fee (the parent booking's reservationFee). */
  depositAmount: number;
  parentPaymentPlanDetails: unknown;
  parentSelectedPaymentPlan: unknown;
};

export type GuestContextResult = { ok: true; context: GuestContext } | { ok: false; error: string };

export async function loadGuestContext(parentBookingId: string, guestEmail: string): Promise<GuestContextResult> {
  const validation = await validateGuestInvitation(parentBookingId, guestEmail);
  if (!validation.isValid || !validation.parentBooking || !validation.invitation) {
    return { ok: false, error: validation.error || "Invalid invitation" };
  }

  // Other guests' emails stay on the server.
  const { guestInvitations: _others, ...parentBooking } = validation.parentBooking;

  let tourImage = "";
  if (parentBooking.tourPackageId) {
    const tourSnap = await getDoc(doc(db, "tourPackages", parentBooking.tourPackageId));
    const tour = tourSnap.exists() ? tourSnap.data() : undefined;
    tourImage = tour?.media?.coverImage || tour?.coverImage || "";
  }

  // Pricing and plan come from the main booker's booking (the page's old
  // lookup order: payment doc → booking doc, else the id as a booking id).
  const parentPayment = (await getDoc(doc(db, "stripePayments", parentBookingId))).data() ?? {};
  let booking: Record<string, any> | undefined;
  const bookingDocId = parentPayment.booking?.documentId;
  if (bookingDocId) {
    const snap = await getDoc(doc(db, "bookings", bookingDocId));
    if (snap.exists()) booking = snap.data();
  }
  if (!booking) {
    const snap = await getDoc(doc(db, "bookings", parentBookingId));
    if (snap.exists()) booking = snap.data();
  }

  return {
    ok: true,
    context: {
      parentBooking: {
        ...parentBooking,
        tourImage,
        ...(booking && {
          paymentPlan: booking.paymentPlan || "",
          paymentMethod: booking.paymentMethod || "",
        }),
      },
      invitation: validation.invitation,
      depositAmount: Number(booking?.reservationFee) || 0,
      parentPaymentPlanDetails: parentPayment.payment?.paymentPlanDetails ?? null,
      parentSelectedPaymentPlan: parentPayment.payment?.selectedPaymentPlan ?? null,
    },
  };
}

/** The guest's status once paid: on the parent's instalment plan, or not. */
export function guestPaidStatus(parentPaymentPlan: string | undefined): "terms_selected" | "reserve_paid" {
  return parentPaymentPlan && parentPaymentPlan.toUpperCase() !== "FULL PAYMENT"
    ? "terms_selected"
    : "reserve_paid";
}
