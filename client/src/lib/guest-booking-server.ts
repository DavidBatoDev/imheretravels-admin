import "server-only";

import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "@/lib/server-firestore";
import {
  BOOKING_NOT_FOUND,
  VALIDATION_FAILED,
  evaluateInvitation,
  toParentBookingData,
  type InvitationValidationResult,
} from "@/lib/guest-booking-shared";

/**
 * Guest booking checks for API routes, through firebase-admin.
 * Same rules as the browser version (guest-booking-utils.ts).
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

/**
 * Check if a guest has already made a booking for this group
 * Prevents duplicate guest bookings
 */
export async function checkDuplicateGuestBooking(
  groupId: string,
  guestEmail: string
): Promise<boolean> {
  try {
    const q = query(
      collection(db, "bookings"),
      where("groupId", "==", groupId),
      where("email", "==", guestEmail.toLowerCase())
    );

    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty; // Returns true if duplicate exists
  } catch (error) {
    console.error("Error checking duplicate guest booking:", error);
    return false; // Assume no duplicate on error (fail open)
  }
}
