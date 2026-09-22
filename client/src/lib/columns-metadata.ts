// ============================================================================
// COLUMNS METADATA UTILITIES
// ============================================================================
// This file contains utilities for managing user column preferences
// Used by both the migration scripts and client-side code

/**
 * Complete list of all booking sheet column IDs
 * This is the source of truth for all available columns
 */
export const ALL_COLUMN_IDS = [
  // Identifier
  "bookingId",
  "bookingCode",
  "tourCode",

  // Traveler Information
  "travellerInitials",
  "firstName",
  "lastName",
  "fullName",
  "emailAddress",

  // Tour Details
  "reservationDate",
  "tourPackageNameUniqueCounter",
  "tourPackageName",
  "bookingType",
  "formattedDate",
  "tourDate",
  "returnDate",
  "tourDuration",
  "daysBetweenBookingAndTour",

  // Payment Setting
  "originalTourCost",
  "discountedTourCost",
  "paymentCondition",
  "eligible2ndOfMonths",
  "availablePaymentTerms",
  "paymentPlan",
  "paymentMethod",
  "enablePaymentReminder",

  // Discounts
  "eventName",
  "discountType",
  "discountRate",

  // Full Payment
  "fullPaymentDueDate",
  "fullPaymentAmount",
  "fullPaymentAmountPaid",
  "fullPaymentDatePaid",

  // Payment Term 1
  "p1ReminderEmailSent",
  "p1ReminderEmailSentDate",
  "p1ReminderEmailLink",
  "p1ScheduledEmail",
  "p1ScheduledEmailDate",
  "p1ScheduledEmailLink",
  "p1CalendarEventId",
  "p1CalendarEventLink",
  "p1DueDate",
  "p1Amount",
  "p1AmountPaid",
  "p1DatePaid",

  // Payment Term 2
  "p2ReminderEmailSent",
  "p2ReminderEmailSentDate",
  "p2ReminderEmailLink",
  "p2ScheduledEmail",
  "p2ScheduledEmailDate",
  "p2ScheduledEmailLink",
  "p2CalendarEventId",
  "p2CalendarEventLink",
  "p2DueDate",
  "p2Amount",
  "p2AmountPaid",
  "p2DatePaid",

  // Payment Term 3
  "p3ReminderEmailSent",
  "p3ReminderEmailSentDate",
  "p3ReminderEmailLink",
  "p3ScheduledEmail",
  "p3ScheduledEmailDate",
  "p3ScheduledEmailLink",
  "p3CalendarEventId",
  "p3CalendarEventLink",
  "p3DueDate",
  "p3Amount",
  "p3AmountPaid",
  "p3DatePaid",

  // Payment Term 4
  "p4ReminderEmailSent",
  "p4ReminderEmailSentDate",
  "p4ReminderEmailLink",
  "p4ScheduledEmail",
  "p4ScheduledEmailDate",
  "p4ScheduledEmailLink",
  "p4CalendarEventId",
  "p4CalendarEventLink",
  "p4DueDate",
  "p4Amount",
  "p4AmountPaid",
  "p4DatePaid",

  // Payment Details
  "reservationFee",
  "reservationAmountPaid",
  "paid",
  "remainingBalance",
  "overpaidAmount",
  "manualCredit",
  "creditFrom",

  // Reservation Email
  "reservationEmail",
  "includeBccReservation",
  "generateEmailDraft",
  "emailDraftLink",
  "subjectLineReservation",
  "sendEmail",
  "sentEmailLink",
  "reservationEmailSentDate",

  // Cancellation
  "reasonForCancellation",
  "cancellationDate",
  "cancellationEmail",
  "includeBccCancellation",
  "generateCancellationEmailDraft",
  "cancellationEmailDraftLink",
  "subjectLineCancellation",
  "sendCancellationEmail",
  "sentCancellationEmailLink",
  "cancellationEmailSentDate",

  // Duo or Group Booking
  "groupId",
  "isMainBooker",

  // Other
  "bookingStatus",
  "delete",
];

/**
 * Creates the initial columnsMetadata structure for a new user
 * with all columns visible by default
 *
 * @returns Initial columnsMetadata object
 */
export function createInitialColumnsMetadata() {
  const columnsMetadata = {
    widths: {} as Record<string, number>,
    visibility: {} as Record<string, boolean>,
    order: ALL_COLUMN_IDS,
    frozen: [] as string[],
  };

  // Set all columns to visible by default
  ALL_COLUMN_IDS.forEach((columnId) => {
    columnsMetadata.visibility[columnId] = true;
  });

  return columnsMetadata;
}
