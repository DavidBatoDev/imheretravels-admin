/**
 * Column Functions Index
 *
 * This file exports all column function implementations for static import.
 * Used by the function execution service to load functions efficiently.
 */

// Identifier Functions
import travellerInitialsFunction from "./identifier/traveller-initials";
import lookupTourCodeFunction from "./identifier/tour-code";
import generateBookingReferenceFunction from "./identifier/booking-id";
import bookingCodeColumnFunction from "./identifier/booking-code";
import tourPackageUniqueCounterFunction from "./identifier/tour-package-name-unique-counter";
import tourDateToYyyymmddFunction from "./identifier/formatted-date";

// Traveler Information Functions
import fullNameFunction from "./traveler-information/full-name";

// Tour Details Functions
import tourEndDateFromStartAndDurationFunction from "./tour-details/return-date";
import tourDurationByNameFunction from "./tour-details/tour-duration";
import eligibleSecondsCountFunction from "./tour-details/eligible2ndofmonths";
import availablePaymentTermFunction from "./tour-details/available-payment-terms";
import daysBetweenReservationAndTourFunction from "./tour-details/days-between-booking-and-tour-date";
import paymentConditionFunction from "./tour-details/payment-condition";

// Full Payment Functions
import fullPaymentAmountFunction from "./full-payment/full-payment-amount";
import fullPaymentDueDateFunction from "./full-payment/full-payment-due-date";

// Payment Term 1 Functions
import p1AmountFunction from "./payment-term-1/p1-amount";
import p1DueDateFunction from "./payment-term-1/p1-due-date";

// Payment Term 2 Functions
import p2AmountFunction from "./payment-term-2/p2-amount";
import p2DueDateFunction from "./payment-term-2/p2-due-date";

// Payment Term 3 Functions
import p3AmountFunction from "./payment-term-3/p3-amount";
import p3DueDateFunction from "./payment-term-3/p3-due-date";

// Payment Term 4 Functions
import p4AmountFunction from "./payment-term-4/p4-amount";
import p4DueDateFunction from "./payment-term-4/p4-due-date";


// Email Functions - Reservation
// import generateGmailDraftFunction from "./reservation-email/email-draft-link";
// import getEmailDraftSubjectFunction from "./reservation-email/subject-line-reservation";
import sendEmailDraftOnceFunction from "./reservation-email/sent-email-link";
import getSentDateReservationFunction from "./reservation-email/reservation-email-sent-date";

// Email Functions - Cancellation
import generateCancellationGmailDraftFunction from "./cancellation/cancellation-email-draft-link";
import getEmailSentDateFunction from "./cancellation/subject-line-cancellation";
import sendCancellationEmailDraftOnceFunction from "./cancellation/sent-cancellation-email-link";
import getSentDateCancellationFunction from "./cancellation/cancellation-email-sent-date";
import getEligibleRefundFunction from "./cancellation/eligible-refund";
import getNonRefundableAmountFunction from "./cancellation/non-refundable-amount";
import getRefundableAmountFunction from "./cancellation/refundable-amount";
import getCancellationScenarioFunction from "./cancellation/cancellation-scenario";

// Payment Setting Functions
import getOriginalTourCostFunction from "./payment-setting/original-tour-cost";
import getTourDiscountedCostFunction from "./payment-setting/discounted-tour-cost";
import getTourCurrencyAndDepositFunction from "./payment-setting/reservation-fee";
import getTotalPaidAmountFunction from "./payment-setting/paid";
import getRemainingBalanceFunction from "./payment-setting/remaining-balance";
import bookingStatusFunction from "./payment-setting/booking-status";
import paymentProgressFunction from "./payment-setting/payment-progress";
import getAdminFeeFunction from "./payment-setting/admin-fee";
import getPaidTermsFunction from "./payment-setting/paid-terms";
import getOverpaidAmountFunction from "./payment-setting/overpaid-amount";
import getTotalLateFeesFunction from "./payment-setting/total-late-fees";

// Discount Functions
import getDiscountRateFunction from "./discounts/discount-rate";
import getDiscountTypeFunction from "./discounts/discount-type";
import getDiscountDisplayFunction from "./discounts/discount-display";

// Payment Reminder Functions
import getBaseMondayFromP1DueDateFunction from "./payment-term-1/p1-scheduled-reminder-date";
import getBaseMondayFromP2DueDateFunction from "./payment-term-2/p2-scheduled-reminder-date";
import getBaseMondayFromP3DueDateFunction from "./payment-term-3/p3-scheduled-reminder-date";
import getBaseMondayFromP4DueDateFunction from "./payment-term-4/p4-scheduled-reminder-date";

// Full Payment Functions (additional)
import getFullPaymentRemainingFunction from "./full-payment/full-payment-amount";

// Re-export for external use
export {
  // Identifier
  travellerInitialsFunction,
  lookupTourCodeFunction,
  generateBookingReferenceFunction,
  bookingCodeColumnFunction,
  tourPackageUniqueCounterFunction,
  tourDateToYyyymmddFunction,
  // Traveler
  fullNameFunction,
  // Tour Details
  tourEndDateFromStartAndDurationFunction,
  tourDurationByNameFunction,
  eligibleSecondsCountFunction,
  availablePaymentTermFunction,
  daysBetweenReservationAndTourFunction,
  paymentConditionFunction,
  // Email - Reservation
  // generateGmailDraftFunction,
  // getEmailDraftSubjectFunction,
  sendEmailDraftOnceFunction,
  getSentDateReservationFunction,
  // Email - Cancellation
  generateCancellationGmailDraftFunction,
  getEmailSentDateFunction,
  sendCancellationEmailDraftOnceFunction,
  getSentDateCancellationFunction,
  getEligibleRefundFunction,
  getNonRefundableAmountFunction,
  getRefundableAmountFunction,
  getCancellationScenarioFunction,
  // Payment Setting
  getOriginalTourCostFunction,
  getTourDiscountedCostFunction,
  getTourCurrencyAndDepositFunction,
  getTotalPaidAmountFunction,
  getRemainingBalanceFunction,
  bookingStatusFunction,
  paymentProgressFunction,
  getAdminFeeFunction,
  getPaidTermsFunction,
  getOverpaidAmountFunction,
  getTotalLateFeesFunction,
  // Discounts
  getDiscountRateFunction,
  getDiscountTypeFunction,
  getDiscountDisplayFunction,
  // Payment Terms
  fullPaymentAmountFunction,
  fullPaymentDueDateFunction,
  getFullPaymentRemainingFunction,
  p1AmountFunction,
  p1DueDateFunction,
  p2AmountFunction,
  p2DueDateFunction,
  p3AmountFunction,
  p3DueDateFunction,
  p4AmountFunction,
  p4DueDateFunction,
  // Reminders
  getBaseMondayFromP1DueDateFunction,
  getBaseMondayFromP2DueDateFunction,
  getBaseMondayFromP3DueDateFunction,
  getBaseMondayFromP4DueDateFunction,
};

// Create a lookup map for faster access
// Includes both the exported name and any aliases used in column definitions
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const functionMap: Record<string, Function> = {
  // Traveler Information
  fullNameFunction,

  // Full Payment
  fullPaymentAmountFunction,
  fullPaymentDueDateFunction,

  // Payment Term 1
  p1AmountFunction,
  getP1AmountFunction: p1AmountFunction, // Alias
  p1DueDateFunction,
  getP1DueDateFunction: p1DueDateFunction, // Alias

  // Payment Term 2
  p2AmountFunction,
  getP2AmountFunction: p2AmountFunction, // Alias
  p2DueDateFunction,
  getP2DueDateFunction: p2DueDateFunction, // Alias

  // Payment Term 3
  p3AmountFunction,
  getP3AmountFunction: p3AmountFunction, // Alias
  p3DueDateFunction,
  getP3DueDateFunction: p3DueDateFunction, // Alias

  // Payment Term 4
  p4AmountFunction,
  getP4AmountFunction: p4AmountFunction, // Alias
  p4DueDateFunction,
  getP4DueDateFunction: p4DueDateFunction, // Alias

  // Identifier functions
  travellerInitialsFunction,
  lookupTourCodeFunction,
  generateBookingReferenceFunction,
  bookingCodeColumnFunction,
  tourPackageUniqueCounterFunction,
  tourDateToYyyymmddFunction,

  // Tour Details functions
  tourEndDateFromStartAndDurationFunction,
  tourDurationByNameFunction,
  eligibleSecondsCountFunction,
  availablePaymentTermFunction,
  daysBetweenReservationAndTourFunction,
  paymentConditionFunction,

  // Email functions - Reservation
  // generateGmailDraftFunction,
  // getEmailDraftSubjectFunction,
  sendEmailDraftOnceFunction,
  getSentDateReservationFunction,

  // Email functions - Cancellation
  generateCancellationGmailDraftFunction,
  getEmailSentDateFunction,
  sendCancellationEmailDraftOnceFunction,
  getSentDateCancellationFunction,
  getEligibleRefundFunction,
  getNonRefundableAmountFunction,
  getRefundableAmountFunction,
  getCancellationScenarioFunction,

  // Payment Setting functions
  getOriginalTourCostFunction,
  getTourDiscountedCostFunction,
  getTourCurrencyAndDepositFunction,
  getTotalPaidAmountFunction,
  getRemainingBalanceFunction,
  bookingStatusFunction,
  paymentProgressFunction,
  getAdminFeeFunction,
  getPaidTermsFunction,
  getOverpaidAmountFunction,
  getTotalLateFeesFunction,

  // Discount functions
  getDiscountRateFunction,
  getDiscountTypeFunction,
  getDiscountDisplayFunction,

  // Full Payment functions
  getFullPaymentDueDateFunction: fullPaymentDueDateFunction,
  getFullPaymentRemainingFunction,

  // Payment Reminder functions
  getBaseMondayFromP1DueDateFunction,
  getBaseMondayFromP2DueDateFunction,
  getBaseMondayFromP3DueDateFunction,
  getBaseMondayFromP4DueDateFunction,
};
