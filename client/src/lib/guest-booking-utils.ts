/**
 * Guest Booking Utilities (browser)
 *
 * Invitation validation for the guest reservation page, which still reads
 * Firestore from the browser. The checks themselves live in
 * guest-booking-shared.ts; the server routes use guest-booking-server.ts.
 *
 * Phase 0 step 5 moves the guest page behind API routes; this file goes then.
 */

import { db } from "@/lib/firebase";
import { getDoc, doc } from "firebase/firestore";
import {
  BOOKING_NOT_FOUND,
  VALIDATION_FAILED,
  evaluateInvitation,
  toParentBookingData,
  type InvitationValidationResult,
} from "@/lib/guest-booking-shared";

export {
  formatExpirationDate,
  getDaysUntilExpiration,
  type GuestInvitation,
  type InvitationValidationResult,
  type ParentBookingData,
} from "@/lib/guest-booking-shared";

/**
 * Validate a guest invitation link: the parent booking must exist, and the
 * invitation must pass evaluateInvitation.
 */
export async function validateGuestInvitation(
  parentBookingId: string,
  guestEmail: string
): Promise<InvitationValidationResult> {
  try {
    // Fetch parent booking from stripePayments collection
    const parentDocSnap = await getDoc(doc(db, "stripePayments", parentBookingId));
    if (!parentDocSnap.exists()) return BOOKING_NOT_FOUND;

    return evaluateInvitation(
      toParentBookingData(parentDocSnap.id, parentDocSnap.data()),
      guestEmail
    );
  } catch (error) {
    console.error("Error validating guest invitation:", error);
    return VALIDATION_FAILED;
  }
}
