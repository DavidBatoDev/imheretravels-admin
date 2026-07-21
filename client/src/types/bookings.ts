import { Timestamp } from "firebase/firestore";

// Payment token data for installment tracking
export interface PaymentTokenData {
  token: string;
  expiresAt: Timestamp;
  stripePaymentDocId: string;
  status: "pending" | "processing" | "success" | "failed" | "expired";
  paidAt?: Timestamp;
  lastAttemptAt?: Timestamp;
  errorMessage?: string;
}

// Payment tokens object for all installments
export interface PaymentTokens {
  full_payment?: PaymentTokenData;
  p1?: PaymentTokenData;
  p2?: PaymentTokenData;
  p3?: PaymentTokenData;
  p4?: PaymentTokenData;
}

export interface Booking {
  // Core booking fields (matching default columns)
  id: string;
  bookingId: string;
  bookingCode: string;
  tourCode: string;
  reservationDate: Date;
  bookingType: "Individual" | "Group";
  bookingStatus: "Confirmed" | "Pending" | "Cancelled" | "Completed";
  daysBetweenBookingAndTour: number;
  groupId?: string;
  isMainBooker: boolean;

  // Traveller information
  travellerInitials: string;
  firstName: string;
  lastName: string;
  fullName: string;
  emailAddress: string;

  // Tour package details
  tourPackageNameUniqueCounter: number;
  tourPackageName: string;
  /**
   * Stable tourPackages document id. `tourCode` and `tourPackageName` above are
   * historical snapshots that drift when a tour is renamed or recoded — join on
   * this instead. Backfilled by scripts/backfill-booking-tour-id.ts.
   */
  tourId?: string;
  tourIdResolvedVia?: "tourCode" | "tourPackageName";
  formattedDate: string;
  tourDate: Date;
  returnDate?: Date;
  tourDuration: string;

  // Pricing
  useDiscountedTourCost?: boolean;
  originalTourCost: number;
  discountedTourCost?: number;

  // Discounts
  eventName?: string;
  discountType?: "percent" | "amount"; // percent or flat amount
  discountRate?: number;

  // Price snapshot metadata (for historical price tracking)
  priceSnapshotDate?: Timestamp; // When prices were captured from tourPackage
  tourPackagePricingVersion?: number; // Version number of tourPackage pricing used
  priceSource?: "snapshot" | "manual" | "recalculated"; // How prices were determined
  lockPricing?: boolean; // Prevents recalculation from current tourPackage prices

  // Email management - Reservation
  reservationEmail?: string;
  includeBccReservation: boolean;
  generateEmailDraft: boolean;
  emailDraftLink?: string;
  subjectLineReservation?: string;
  sendEmail: boolean;
  sentEmailLink?: string;
  reservationEmailSentDate?: Date;

  // Payment terms
  paymentCondition?: "Full Payment" | "Partial Payment" | "Installment";
  eligible2ndOfMonths: boolean;
  availablePaymentTerms?: string;
  paymentPlan?: "Monthly" | "Quarterly" | "Custom";
  paymentMethod?: "Credit Card" | "Bank Transfer" | "Cash" | "PayPal";
  enablePaymentReminder: boolean;
  sentInitialReminderLink?: string;
  paymentProgress: number;
  selectedPlanAt?: Timestamp | Date; // When the payment plan was selected by the customer

  // Payment details
  fullPayment?: number;
  fullPaymentDueDate?: Date;
  fullPaymentAmount?: number;
  fullPaymentDatePaid?: Date;
  paymentTerm1?: string; // Due Date, Amount, Date Paid, Reminder, Email Link, Calendar Event ID/Link
  paymentTerm2?: string;
  paymentTerm3?: string;
  paymentTerm4?: string;
  reservationFee?: number;
  paid: number;
  remainingBalance: number;
  totalLateFees?: number;
  manualCredit?: number;
  creditFrom?: string;

  // Late fees (term-level)
  p1LateFeesPenalty?: number;
  p1LateFeeAppliedAt?: Date | Timestamp;
  p1LateFeesNoticeLink?: string;

  p2LateFeesPenalty?: number;
  p2LateFeeAppliedAt?: Date | Timestamp;
  p2LateFeesNoticeLink?: string;

  p3LateFeesPenalty?: number;
  p3LateFeeAppliedAt?: Date | Timestamp;
  p3LateFeesNoticeLink?: string;

  p4LateFeesPenalty?: number;
  p4LateFeeAppliedAt?: Date | Timestamp;
  p4LateFeesNoticeLink?: string;

  // Cancellation management
  reasonForCancellation?: string;
  cancellationRequestDate?: Date;
  supplierCostsCommitted?: number;
  travelCreditIssued?: number;
  cancellationScenario?: string;
  isNoShow?: boolean;
  includeBccCancellation: boolean;
  generateCancellationEmailDraft: boolean;
  cancellationEmailDraftLink?: string;
  subjectLineCancellation?: string;
  sendCancellationEmail: boolean;
  sentCancellationEmailLink?: string;
  cancellationEmailSentDate?: Date;
  eligibleRefund?: string;
  nonRefundableAmount?: number;
  refundableAmount?: number;
  adminFee?: number;

  // Payment tokens for installment tracking
  paymentTokens?: PaymentTokens;

  // Access token for public booking status page
  access_token?: string;

  // Dynamic fields for any additional columns
  [key: string]: any;
}
