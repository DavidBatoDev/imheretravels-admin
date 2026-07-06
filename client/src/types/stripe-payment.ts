import { Timestamp } from "firebase/firestore";

// ============================================================================
// STRIPE PAYMENT DOCUMENT TYPES
// ============================================================================

/**
 * Represents a Stripe payment document from the stripePayments collection.
 * This document tracks the lifecycle of a reservation from initial creation
 * through payment confirmation and payment plan selection.
 */
export interface StripePaymentDocument {
  // ========== Core Identification ==========
  id: string; // Firestore document ID
  bookingId?: string; // Booking reference (e.g., "SB-ARW-20260123-DF002")
  bookingDocumentId?: string; // Reference to bookings collection document ID
  stripeIntentId: string; // Stripe payment intent ID

  // ========== Customer Information (Nested Object) ==========
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    nationality: string;
    birthdate: string; // ISO format: "2005-07-20"
  };

  // ========== Booking Details (Nested Object with Array) ==========
  booking: {
    type: "Single Booking" | "Group Booking";
    groupSize: number;
    additionalGuests: AdditionalGuest[]; // Array of additional guests
  };

  // ========== Tour Information (Nested Object) ==========
  tour: {
    packageId: string; // Reference to tourPackages collection
    packageName: string; // Tour name
    date: string; // ISO format: "2026-01-23"
  };

  // ========== Payment Information (Nested Object) ==========
  payment: {
    amount: number; // Payment amount
    currency: "GBP" | "USD" | "EUR"; // Currency code
    type: "reservationFee" | "fullPayment" | "installment"; // Payment type
    clientSecret: string; // Stripe client secret for frontend
    status?: string; // Status of the specific payment attempt
  };

  // ========== Payment Plan (Optional, Step 3) ==========
  paymentPlan?: {
    selected: "full_payment" | "P1" | "P2" | "P3" | "P4"; // Changed from last_minute to full_payment
    details: PaymentPlanDetails | null; // null for full_payment bookings
  };

  // ========== Notification Tracking (Nested Object) ==========
  notification?: {
    id: string; // Reference to notifications collection
    sent: boolean; // Whether notification was sent
    sentAt?: Timestamp; // When notification was sent
  };

  // ========== Abandoned-Booking Follow-Up Tracking (Nested Object) ==========
  // Written by the sendAbandonedBookingFollowUps Cloud Function. Deliberately
  // separate from timestamps.updatedAt so the abandoned-payments cleanup job
  // still treats the draft as inactive.
  followUps?: {
    first?: { sentAt: Timestamp; messageId: string };
    second?: { sentAt: Timestamp; messageId: string };
    suppressedReason?: string; // e.g. "paid_elsewhere" | "unsubscribed" | "recently_emailed"
  };

  // ========== Timestamps (Nested Object) ==========
  timestamps: {
    createdAt: Timestamp; // When payment was initiated
    updatedAt: Timestamp; // Last update
    confirmedAt?: Timestamp; // When terms were confirmed (Step 3)
  };
}

/**
 * Additional guest information for group bookings
 */
export interface AdditionalGuest {
  firstName: string;
  lastName: string;
  email?: string;
  nationality?: string;
  birthdate?: string;
}

/**
 * Payment plan details - null for full_payment bookings
 */
export interface PaymentPlanDetails {
  id: string; // Payment plan ID
  type: "P1" | "P2" | "P3" | "P4"; // Plan type
  name: string; // Display name (e.g., "P1 - Single Instalment")
  description: string;
  monthsRequired: number; // Number of months in the plan
  monthlyPercentages: number[]; // Percentage breakdown per month
  depositPercentage: number; // Deposit percentage (typically 15%)
  schedule?: PaymentScheduleItem[]; // Calculated payment schedule
}

/**
 * Individual payment schedule item
 */
export interface PaymentScheduleItem {
  month: number; // Month number (1-4)
  dueDate: string; // ISO date string
  amount: number; // Amount due
  percentage: number; // Percentage of total
  status: "pending" | "paid" | "overdue";
  paidAt?: Timestamp;
}

// ============================================================================
// FORM DATA TYPES FOR RESERVATION BOOKING FORM
// ============================================================================

/**
 * Step 1: Personal & Booking Details
 */
export interface Step1FormData {
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  bookingType: "Single Booking" | "Group Booking";
  groupSize: number;
  tourPackageId: string;
  tourDate: string;
  additionalGuests: AdditionalGuest[];
}

/**
 * Step 2: Payment (Reservation Fee)
 */
export interface Step2PaymentData {
  stripeIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

/**
 * Step 3: Payment Plan Selection
 */
export interface Step3PaymentPlanData {
  selectedPaymentPlan: "full_payment" | "P1" | "P2" | "P3" | "P4";
  paymentPlanDetails: PaymentPlanDetails | null;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request body for creating initial payment intent (Step 1)
 */
export interface CreatePaymentIntentRequest {
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    nationality: string;
    birthdate: string;
  };
  booking: {
    type: string;
    groupSize: number;
    additionalGuests: AdditionalGuest[];
  };
  tour: {
    packageId: string;
    packageName: string;
    date: string;
  };
  payment: {
    amount: number;
    currency: string;
  };
}

/**
 * Response from creating payment intent
 */
export interface CreatePaymentIntentResponse {
  success: boolean;
  data?: {
    paymentDocId: string;
    clientSecret: string;
    stripeIntentId: string;
  };
  error?: string;
}

/**
 * Request body for selecting payment plan (Step 3)
 */
export interface SelectPaymentPlanRequest {
  paymentDocId: string;
  selectedPaymentPlan: "full_payment" | "P1" | "P2" | "P3" | "P4";
  paymentPlanDetails: PaymentPlanDetails | null;
}

/**
 * Response from selecting payment plan
 */
export interface SelectPaymentPlanResponse {
  success: boolean;
  data?: {
    bookingId: string;
    paymentPlan: string;
  };
  error?: string;
}

// ============================================================================
// BACKWARD COMPATIBILITY - FLATTENED STRUCTURE
// ============================================================================

/**
 * Flattened structure for backward compatibility with existing code
 * (matches your current implementation)
 */
export interface StripePaymentDocumentFlat {
  // Identification
  id: string;
  bookingId?: string;
  bookingDocumentId?: string;
  stripeIntentId: string;

  // Customer (flattened)
  email: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthdate: string;

  // Booking (flattened)
  bookingType: string;
  groupSize: number;
  additionalGuests: AdditionalGuest[];

  // Tour (flattened)
  tourPackageId: string;
  tourPackageName: string;
  tourDate: string;

  // Payment (flattened)
  amountGBP: number;
  currency: string;
  type: string;
  clientSecret: string;

  // Payment Plan (flattened)
  selectedPaymentPlan?: string;
  paymentPlanDetails?: PaymentPlanDetails | null;

  // Status & Notifications (flattened)
  status: string;
  notificationId?: string;
  notificationSent?: boolean;
  notificationSentAt?: Timestamp;

  // Timestamps (flattened)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp;
}

// ============================================================================
// HELPER FUNCTIONS & TYPE GUARDS
// ============================================================================

/**
 * Check if payment is in pending state
 */
export function isPaymentPending(
  payment: StripePaymentDocument | StripePaymentDocumentFlat
): boolean {
  if ("payment" in payment && payment.payment) {
      return payment.payment.status === "reserve_pending";
  }
  return (payment as StripePaymentDocumentFlat).status === "reserve_pending";
}

/**
 * Check if reservation fee is paid
 */
export function isReservationPaid(
  payment: StripePaymentDocument | StripePaymentDocumentFlat
): boolean {
  const status = "payment" in payment && payment.payment ? payment.payment.status : (payment as StripePaymentDocumentFlat).status;
  return (
    status === "reserve_paid" || status === "terms_selected"
  );
}

/**
 * Check if payment plan is selected
 */
export function isPaymentPlanSelected(
  payment: StripePaymentDocument | StripePaymentDocumentFlat
): boolean {
  const status = "payment" in payment && payment.payment ? payment.payment.status : (payment as StripePaymentDocumentFlat).status;
  return status === "terms_selected";
}

/**
 * Check if this is a full payment booking (no installment plan)
 */
export function isFullPaymentBooking(
  payment: StripePaymentDocument | StripePaymentDocumentFlat
): boolean {
  const plan =
    "paymentPlan" in payment
      ? payment.paymentPlan?.selected
      : (payment as StripePaymentDocumentFlat).selectedPaymentPlan;
  return plan === "full_payment";
}

/**
 * Check if payment plan has installment details
 */
export function hasPaymentPlanDetails(
  payment: StripePaymentDocument | StripePaymentDocumentFlat
): boolean {
  const details =
    "paymentPlan" in payment
      ? payment.paymentPlan?.details
      : (payment as StripePaymentDocumentFlat).paymentPlanDetails;
  return details !== null && details !== undefined;
}

/**
 * Convert flat structure to nested structure
 */
export function flatToNested(
  flat: StripePaymentDocumentFlat
): StripePaymentDocument {
  return {
    id: flat.id,
    bookingId: flat.bookingId,
    bookingDocumentId: flat.bookingDocumentId,
    stripeIntentId: flat.stripeIntentId,
    customer: {
      email: flat.email,
      firstName: flat.firstName,
      lastName: flat.lastName,
      nationality: flat.nationality,
      birthdate: flat.birthdate,
    },
    booking: {
      type: flat.bookingType as "Single Booking" | "Group Booking",
      groupSize: flat.groupSize,
      additionalGuests: flat.additionalGuests,
    },
    tour: {
      packageId: flat.tourPackageId,
      packageName: flat.tourPackageName,
      date: flat.tourDate,
    },
    payment: {
      amount: flat.amountGBP,
      currency: flat.currency as "GBP" | "USD" | "EUR",
      type: flat.type as "reservationFee" | "fullPayment" | "installment",
      clientSecret: flat.clientSecret,
      status: flat.status,
    },
    paymentPlan: flat.selectedPaymentPlan
      ? {
          selected: flat.selectedPaymentPlan as
            | "full_payment"
            | "P1"
            | "P2"
            | "P3"
            | "P4",
          details: flat.paymentPlanDetails || null,
        }
      : undefined,
    notification: flat.notificationId
      ? {
          id: flat.notificationId,
          sent: flat.notificationSent || false,
          sentAt: flat.notificationSentAt,
        }
      : undefined,
    timestamps: {
      createdAt: flat.createdAt,
      updatedAt: flat.updatedAt,
      confirmedAt: flat.confirmedAt,
    },
  };
}

/**
 * Convert nested structure to flat structure
 */
export function nestedToFlat(
  nested: StripePaymentDocument
): StripePaymentDocumentFlat {
  return {
    id: nested.id,
    bookingId: nested.bookingId,
    bookingDocumentId: nested.bookingDocumentId,
    stripeIntentId: nested.stripeIntentId,
    email: nested.customer.email,
    firstName: nested.customer.firstName,
    lastName: nested.customer.lastName,
    nationality: nested.customer.nationality,
    birthdate: nested.customer.birthdate,
    bookingType: nested.booking.type,
    groupSize: nested.booking.groupSize,
    additionalGuests: nested.booking.additionalGuests,
    tourPackageId: nested.tour.packageId,
    tourPackageName: nested.tour.packageName,
    tourDate: nested.tour.date,
    amountGBP: nested.payment.amount,
    currency: nested.payment.currency,
    type: nested.payment.type,
    clientSecret: nested.payment.clientSecret,
    selectedPaymentPlan: nested.paymentPlan?.selected,
    paymentPlanDetails: nested.paymentPlan?.details,
    status: nested.payment.status || "reserve_pending",
    notificationId: nested.notification?.id,
    notificationSent: nested.notification?.sent,
    notificationSentAt: nested.notification?.sentAt,
    createdAt: nested.timestamps.createdAt,
    updatedAt: nested.timestamps.updatedAt,
    confirmedAt: nested.timestamps.confirmedAt,
  };
}

