/**
 * Guest booking logic shared by the browser (guest-booking-utils.ts) and the
 * server (guest-booking-server.ts): types, the payment-doc → parent-booking
 * mapping and the invitation checks. No Firestore access here, so both sides
 * can use it with their own SDK.
 */

import type { Timestamp } from "firebase/firestore";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface GuestInvitation {
  email: string;
  invitedAt: Timestamp;
  expiresAt: Timestamp;
  status: "pending" | "accepted" | "expired";
}

export interface ParentBookingData {
  id: string;
  bookingType: string;
  tourPackageId: string;
  tourName: string;
  tourDate: Timestamp | string;
  tourImage?: string;
  groupSize: number;
  groupId: string;
  paymentPlan: string;
  paymentMethod: string;
  stripePaymentId: string;
  guestInvitations?: GuestInvitation[];
  // Pricing data
  basePriceAdult?: number;
  discountEvent?: string;
  discountRate?: number;
  depositAmount?: number;
  p1Amount?: number;
  p1DueDate?: Timestamp | string;
  p2Amount?: number;
  p2DueDate?: Timestamp | string;
  p3Amount?: number;
  p3DueDate?: Timestamp | string;
  p4Amount?: number;
  p4DueDate?: Timestamp | string;
}

export interface InvitationValidationResult {
  isValid: boolean;
  error?: string;
  parentBooking?: ParentBookingData;
  invitation?: GuestInvitation;
}

// ============================================================================
// MAPPING AND CHECKS
// ============================================================================

/** Map a parent `stripePayments` document to ParentBookingData. */
export function toParentBookingData(id: string, rawData: any): ParentBookingData {
  return {
    id,
    bookingType: rawData.booking?.type || "",
    tourPackageId: rawData.tour?.packageId || "",
    tourName: rawData.tour?.packageName || "",
    tourDate: rawData.tour?.date || "",
    groupSize: rawData.booking?.groupSize || 1,
    groupId: rawData.booking?.groupCode || "",
    paymentPlan: rawData.booking?.paymentPlan || "",
    paymentMethod: rawData.payment?.method || "stripe",
    stripePaymentId: rawData.id || id,
    guestInvitations: rawData.guestInvitations || [],
    // Pricing data from booking document (will be fetched separately if needed)
    basePriceAdult: rawData.booking?.basePriceAdult,
    discountEvent: rawData.booking?.discountEvent,
    discountRate: rawData.booking?.discountRate,
    depositAmount: rawData.booking?.depositAmount,
    p1Amount: rawData.booking?.p1Amount,
    p1DueDate: rawData.booking?.p1DueDate,
    p2Amount: rawData.booking?.p2Amount,
    p2DueDate: rawData.booking?.p2DueDate,
    p3Amount: rawData.booking?.p3Amount,
    p3DueDate: rawData.booking?.p3DueDate,
    p4Amount: rawData.booking?.p4Amount,
    p4DueDate: rawData.booking?.p4DueDate,
  };
}

/**
 * Checks a found parent booking for a guest:
 * - Booking hasn't been cancelled
 * - Invitation exists for the given email
 * - Invitation hasn't expired (7 days)
 * - Guest hasn't already booked
 */
export function evaluateInvitation(
  parentData: ParentBookingData,
  guestEmail: string,
  now: Date = new Date()
): InvitationValidationResult {
  // Check if booking was cancelled
  if (parentData.bookingType === "Cancelled") {
    return {
      isValid: false,
      error:
        "This booking has been cancelled. Guest reservations are no longer available.",
    };
  }

  // Check if invitation exists for this email
  const guestInvitations = parentData.guestInvitations || [];
  const invitation = guestInvitations.find(
    (inv) => inv.email.toLowerCase() === guestEmail.toLowerCase()
  );

  if (!invitation) {
    return {
      isValid: false,
      error: "No invitation found for this email address.",
    };
  }

  // Check if invitation has expired (7 days from invitedAt)
  const expiresAt = invitation.expiresAt.toDate();

  if (now > expiresAt) {
    return {
      isValid: false,
      error:
        "This invitation has expired. Please contact the main booker for a new invitation.",
    };
  }

  // Check if guest has already accepted (made a booking)
  if (invitation.status === "accepted") {
    return {
      isValid: false,
      error: "You have already completed your reservation for this booking.",
    };
  }

  // All checks passed
  return {
    isValid: true,
    parentBooking: parentData,
    invitation,
  };
}

export const BOOKING_NOT_FOUND: InvitationValidationResult = {
  isValid: false,
  error: "Invalid invitation link. The booking was not found.",
};

export const VALIDATION_FAILED: InvitationValidationResult = {
  isValid: false,
  error: "An error occurred while validating your invitation. Please try again.",
};

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Format expiration date for display
 */
export function formatExpirationDate(expiresAt: Timestamp): string {
  const date = expiresAt.toDate();
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Calculate days remaining until expiration
 */
export function getDaysUntilExpiration(expiresAt: Timestamp): number {
  const now = new Date();
  const expiration = expiresAt.toDate();
  const diffMs = expiration.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
