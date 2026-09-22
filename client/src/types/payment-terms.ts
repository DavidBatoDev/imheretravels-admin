import { Timestamp } from "firebase/firestore";

// ============================================================================
// PAYMENT TERMS CONFIGURATION TYPES
// ============================================================================

export interface PaymentTermConfiguration {
  id: string;
  name: string;
  description: string;

  // New flexible payment system fields
  paymentPlanType: PaymentPlanType; // The specific payment plan type
  paymentType: "full_payment" | "monthly_scheduled" | "invalid_booking"; // Payment processing type
  daysRequired?: number; // Days required for full payment or invalid booking threshold
  monthsRequired?: number; // Months required for scheduled payment
  monthlyPercentages?: number[]; // Percentage for each month (only for monthly_scheduled type)
  depositPercentage: number; // Standard 15% deposit for all plans

  // Common fields
  isActive: boolean;
  percentage?: number; // Legacy percentage field for backward compatibility
  sortOrder: number;
  color: string;
  metadata: PaymentTermMetadata;
}

// New flexible payment plan type enum
export type PaymentPlanType =
  | "invalid_booking"
  | "full_payment_48hrs"
  | "p1_single_installment"
  | "p2_two_installments"
  | "p3_three_installments"
  | "p4_four_installments"
  | "custom"; // For custom payment plans

export interface PaymentTermMetadata {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // Reference to users
}

// ============================================================================
// PAYMENT TERMS FORM TYPES
// ============================================================================

export interface PaymentTermFormData {
  name: string;
  description: string;
  paymentPlanType: PaymentPlanType;
  paymentType: "full_payment" | "monthly_scheduled" | "invalid_booking";
  daysRequired?: number;
  monthsRequired?: number;
  monthlyPercentages?: number[];
  depositPercentage: number;
  color?: string;
}

export interface PaymentTermCreateRequest {
  name: string;
  description: string;
  paymentPlanType: PaymentPlanType;
  paymentType: "full_payment" | "monthly_scheduled" | "invalid_booking";
  daysRequired?: number;
  monthsRequired?: number;
  monthlyPercentages?: number[];
  depositPercentage: number;
  color: string;
  isActive: boolean;
  percentage?: number;
  sortOrder: number;
}

export interface PaymentTermUpdateRequest {
  id: string;
  name?: string;
  description?: string;
  paymentPlanType?: PaymentPlanType;
  paymentType?: "full_payment" | "monthly_scheduled" | "invalid_booking";
  daysRequired?: number;
  monthsRequired?: number;
  monthlyPercentages?: number[];
  depositPercentage?: number;
  color?: string;
  isActive?: boolean;
  percentage?: number;
}

// ============================================================================
// PAYMENT TERMS CALCULATION TYPES
// ============================================================================

export interface PaymentTermEvaluationResult {
  applicableTerm: string;
  daysDifference: number;
  isValid: boolean;
  message?: string;
  paymentPlanType: PaymentPlanType;
}

// ============================================================================
// DEFAULT PAYMENT TERMS CONFIGURATION
// ============================================================================

export const DEFAULT_PAYMENT_TERMS: Omit<
  PaymentTermConfiguration,
  "id" | "metadata"
>[] = [
  {
    name: "Invalid Booking",
    description:
      "To handle bookings that cannot be processed due to scheduling constraints. Tour date is within 3 days of booking date.",
    paymentPlanType: "invalid_booking",
    paymentType: "invalid_booking",
    daysRequired: 3,
    depositPercentage: 0,
    isActive: true,
    sortOrder: 1,
    color: "#ef4444", // red
  },
  {
    name: "Full Payment Required Within 2 Days",
    description:
      "Capture last-minute bookings while ensuring immediate payment. Tour date is 3-30 days away with no eligible installment dates available.",
    paymentPlanType: "full_payment_48hrs",
    paymentType: "full_payment",
    daysRequired: 3, // Starts at 3 days from tour date
    depositPercentage: 0, // Changed from 15 to 0 - full payment means no deposit
    isActive: true,
    percentage: 100, // Legacy percentage for full payment
    sortOrder: 2,
    color: "#f59e0b", // amber
  },
  {
    name: "P1 - Single Installment",
    description:
      "Ready to pay in full? Pick me.",
    paymentPlanType: "p1_single_installment",
    paymentType: "monthly_scheduled",
    daysRequired: undefined,
    monthsRequired: 1,
    depositPercentage: 0, // Changed from 15 to 0 - no deposit required
    monthlyPercentages: [100], // Changed from [85] to [100] - full amount in single payment
    isActive: true,
    percentage: 100, // Legacy percentage
    sortOrder: 3,
    color: "#3b82f6", // blue
  },
  {
    name: "P2 - Two Installments",
    description:
      "Want to split it into two payments? This is it!",
    paymentPlanType: "p2_two_installments",
    paymentType: "monthly_scheduled",
    daysRequired: undefined,
    monthsRequired: 2,
    depositPercentage: 0, // Changed from 15 to 0 - no deposit required
    monthlyPercentages: [50, 50], // Changed from [42.5, 42.5] to [50, 50] - full amount split evenly
    isActive: true,
    percentage: 100, // Legacy percentage
    sortOrder: 4,
    color: "#8b5cf6", // violet
  },
  {
    name: "P3 - Three Installments",
    description:
      "If you like, you can make three equal payments, too!",
    paymentPlanType: "p3_three_installments",
    paymentType: "monthly_scheduled",
    daysRequired: undefined,
    monthsRequired: 3,
    depositPercentage: 0, // Changed from 15 to 0 - no deposit required
    monthlyPercentages: [33.33, 33.33, 33.34], // Changed from [28.3, 28.3, 28.3] to [33.33, 33.33, 33.34] - full amount split evenly
    isActive: true,
    percentage: 100, // Legacy percentage
    sortOrder: 5,
    color: "#10b981", // emerald
  },
  {
    name: "P4 - Four Installments",
    description:
      "Since you're booking early, take advantage of 4 easy payments. No extra charges!",
    paymentPlanType: "p4_four_installments",
    paymentType: "monthly_scheduled",
    daysRequired: undefined,
    monthsRequired: 4,
    depositPercentage: 0, // Changed from 15 to 0 - no deposit required
    monthlyPercentages: [25, 25, 25, 25], // Changed from [21.25, 21.25, 21.25, 21.25] to [25, 25, 25, 25] - full amount split evenly
    isActive: true,
    percentage: 100, // Legacy percentage
    sortOrder: 6,
    color: "#06b6d4", // cyan
  },
];

// ============================================================================
// PAYMENT PLAN TYPE HELPERS
// ============================================================================

export const PAYMENT_PLAN_TYPE_LABELS: Record<PaymentPlanType, string> = {
  invalid_booking: "Invalid Booking",
  full_payment_48hrs: "Full Payment (2 Days)", // Updated from 48hrs to 2 Days
  p1_single_installment: "P1 - Single Installment",
  p2_two_installments: "P2 - Two Installments",
  p3_three_installments: "P3 - Three Installments",
  p4_four_installments: "P4 - Four Installments",
  custom: "Custom Plan",
};

export const PAYMENT_PLAN_TYPE_DESCRIPTIONS: Record<PaymentPlanType, string> = {
  invalid_booking:
    "Booking not allowed - Less than 3 days between reservation and tour date",
  full_payment_48hrs:
    "Immediate full payment required within 2 days of booking", // Updated from 48 hours to 2 days
  // Instalments fall on a monthly Friday anchor — the last Friday of each
  // month, or the second-to-last Friday for 2027+ tours reserved after the
  // 2027 policy date — and the balance must be settled 2 calendar months
  // before the tour. Where that deadline cuts off a month's anchor, the
  // schedule snaps back to the latest anchor that still meets it
  // (see lib/installment-schedule.ts).
  p1_single_installment:
    "Balance paid in full on one monthly Friday due date",
  p2_two_installments:
    "Balance split evenly across 2 monthly Friday due dates",
  p3_three_installments:
    "Balance split evenly across 3 monthly Friday due dates",
  p4_four_installments:
    "Balance split evenly across 4 monthly Friday due dates",
  custom: "Custom payment plan configuration",
};

// Helper function to get default configuration for a payment plan type
export function getDefaultConfigForPlanType(
  planType: PaymentPlanType
): Partial<PaymentTermFormData> {
  switch (planType) {
    case "invalid_booking":
      return {
        paymentType: "invalid_booking",
        daysRequired: 3,
        depositPercentage: 0,
        monthsRequired: undefined,
        monthlyPercentages: undefined,
      };

    case "full_payment_48hrs":
      return {
        paymentType: "full_payment",
        daysRequired: 3, // Starts at 3 days from tour date
        depositPercentage: 0,
        monthsRequired: undefined,
        monthlyPercentages: undefined,
      };

    case "p1_single_installment":
      return {
        paymentType: "monthly_scheduled",
        daysRequired: undefined,
        depositPercentage: 0, // Changed from 15 to 0
        monthsRequired: 1,
        monthlyPercentages: [100], // Changed from [85] to [100]
      };
    case "p2_two_installments":
      return {
        paymentType: "monthly_scheduled",
        daysRequired: undefined,
        depositPercentage: 0, // Changed from 15 to 0
        monthsRequired: 2,
        monthlyPercentages: [50, 50], // Changed from [42.5, 42.5] to [50, 50]
      };
    case "p3_three_installments":
      return {
        paymentType: "monthly_scheduled",
        daysRequired: undefined,
        depositPercentage: 0, // Changed from 15 to 0
        monthsRequired: 3,
        monthlyPercentages: [33.33, 33.33, 33.34], // Changed from [28.3, 28.3, 28.4] to [33.33, 33.33, 33.34]
      };
    case "p4_four_installments":
      return {
        paymentType: "monthly_scheduled",
        daysRequired: undefined,
        depositPercentage: 0, // Changed from 15 to 0
        monthsRequired: 4,
        monthlyPercentages: [25, 25, 25, 25], // Changed from [21.25, 21.25, 21.25, 21.25] to [25, 25, 25, 25]
      };

    case "custom":
      return {
        paymentType: "monthly_scheduled",
        daysRequired: undefined,
        depositPercentage: 15,
        monthsRequired: 2,
        monthlyPercentages: [50, 50],
      };

    default:
      return {
        paymentType: "full_payment",
        daysRequired: 30,
        depositPercentage: 15,
        monthsRequired: undefined,
        monthlyPercentages: undefined,
      };
  }
}
