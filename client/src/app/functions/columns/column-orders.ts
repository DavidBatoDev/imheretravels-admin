import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Global Column Order Configuration
 *
 * Single source of truth for all booking sheet column orders.
 * This makes it easier to manage, reorder, and visualize column positions
 * without editing individual column files.
 *
 * To reorder columns:
 * 1. Adjust the order numbers below
 * 2. Save the file
 * 3. The changes will be reflected immediately
 */

/**
 * Column order mapping
 * Maps column ID to its display order number
 */
export const COLUMN_ORDERS: Record<string, number> = {
  // ============================================================================
  // IDENTIFIER (1-6)
  // ============================================================================
  bookingId: 1,
  bookingCode: 2,
  tourCode: 3,
  travellerInitials: 4,
  tourPackageNameUniqueCounter: 5,
  formattedDate: 6,

  // ============================================================================
  // TRAVELER INFORMATION (7-10)
  // ============================================================================
  emailAddress: 7,
  firstName: 8,
  lastName: 9,
  fullName: 10,

  // ============================================================================
  // TOUR DETAILS (11-24)
  // ============================================================================
  reservationDate: 11,
  bookingType: 12,
  tourPackageName: 13,
  tourDate: 14,
  returnDate: 15,
  tourDuration: 16,
  paymentCondition: 17,
  eligible2ndofmonths: 18,
  availablePaymentTerms: 19,
  daysBetweenBookingAndTourDate: 20,
  originalTourCost: 21,
  discountedTourCost: 22,
  reservationFee: 23,
  reservationAmountPaid: 23.5,
  remainingBalance: 24,
  overpaidAmount: 24.5,

  // ============================================================================
  // DISCOUNTS (25-26)
  // ============================================================================
  eventName: 25,
  discountRate: 26,

  // ============================================================================
  // DUO OR GROUP BOOKING (27-29)
  // ============================================================================
  isMainBooker: 27,
  // 28 intentionally free — the old "Group ID / Group ID Generator" column was
  // removed; `groupId` is now the single shared party code.
  groupId: 29,

  // ============================================================================
  // RESERVATION EMAIL (30-37)
  // ============================================================================
  includeBccReservation: 30,
  useDiscountedTourCost: 31,
  generateEmailDraft: 32,
  emailDraftLink: 33,
  subjectLineReservation: 34,
  sendEmail: 35,
  sentEmailLink: 36,
  reservationEmailSentDate: 37,

  // ============================================================================
  // PAYMENT SETTING (38-53)
  // ============================================================================
  adminFee: 38,
  paid: 39,
  paidTerms: 40,
  totalLateFees: 40.5,
  manualCredit: 41,
  creditFrom: 42,
  paymentPlan: 43,
  paymentMethod: 44,
  enablePaymentReminder: 45,
  sentInitialReminderLink: 46,
  bookingStatus: 47,
  paymentProgress: 48,
  guestInfoEmailSentLink: 49,

  // ============================================================================
  // FULL PAYMENT (50-52)
  // ============================================================================
  fullPaymentDueDate: 50,
  fullPaymentAmount: 51,
  fullPaymentAmountPaid: 51.5,
  fullPaymentDatePaid: 52,

  // ============================================================================
  // PAYMENT TERM 1 - P1 (54-60)
  // ============================================================================
  p1ScheduledReminderDate: 54,
  p1ScheduledEmailLink: 55,
  p1CalendarEventId: 56,
  p1CalendarEventLink: 57,
  p1DueDate: 58,
  p1Amount: 59,
  p1AmountPaid: 59.5,
  p1DatePaid: 60,
  p1LateFeesPenalty: 82,
  p1LateFeeAppliedAt: 83,
  p1LateFeesNoticeLink: 84,

  // ============================================================================
  // PAYMENT TERM 2 - P2 (61-67)
  // ============================================================================
  p2ScheduledReminderDate: 61,
  p2ScheduledEmailLink: 62,
  p2CalendarEventId: 63,
  p2CalendarEventLink: 64,
  p2DueDate: 65,
  p2Amount: 66,
  p2AmountPaid: 66.5,
  p2DatePaid: 67,
  p2LateFeesPenalty: 86,
  p2LateFeeAppliedAt: 87,
  p2LateFeesNoticeLink: 88,

  // ============================================================================
  // PAYMENT TERM 3 - P3 (68-74)
  // ============================================================================
  p3ScheduledReminderDate: 68,
  p3ScheduledEmailLink: 69,
  p3CalendarEventId: 70,
  p3CalendarEventLink: 71,
  p3DueDate: 72,
  p3Amount: 73,
  p3AmountPaid: 73.5,
  p3DatePaid: 74,
  p3LateFeesPenalty: 90,
  p3LateFeeAppliedAt: 91,
  p3LateFeesNoticeLink: 92,

  // ============================================================================
  // PAYMENT TERM 4 - P4 (75-81)
  // ============================================================================
  p4ScheduledReminderDate: 75,
  p4ScheduledEmailLink: 76,
  p4CalendarEventId: 77,
  p4CalendarEventLink: 78,
  p4DueDate: 79,
  p4Amount: 80,
  p4AmountPaid: 80.5,
  p4DatePaid: 81,
  p4LateFeesPenalty: 94,
  p4LateFeeAppliedAt: 95,
  p4LateFeesNoticeLink: 96,

  // ============================================================================
  // CANCELLATION (82-98)
  // ============================================================================
  reasonForCancellation: 98,
  cancellationRequestDate: 99,
  cancellationScenario: 100,
  supplierCostsCommitted: 101,
  isNoShow: 102,
  includeBccCancellation: 103,
  eligibleRefund: 104,
  nonRefundableAmount: 105,
  refundableAmount: 106,
  travelCreditIssued: 107,
  generateCancellationDraft: 108,
  cancellationEmailDraftLink: 109,
  subjectLineCancellation: 110,
  sendCancellationEmail: 111,
  sentCancellationEmailLink: 112,
  cancellationEmailSentDate: 113,

  // ============================================================================
  // DELETE (98) - Delete column at the end
  // ============================================================================
  delete: 114,
};

/**
 * Helper function to inject order into a column definition
 *
 * @param column - The column definition without order
 * @param columnId - The column ID to lookup the order
 * @returns Column definition with order injected
 */
export function withOrder(
  column: BookingSheetColumn,
  columnId?: string,
): BookingSheetColumn {
  const id = columnId || column.id;
  const order = COLUMN_ORDERS[id];

  if (order === undefined) {
    console.warn(
      `⚠️ No order defined for column: ${id} (${column.data.columnName})`,
    );
  }

  return {
    ...column,
    data: {
      ...column.data,
      order: order ?? 999, // Use 999 as fallback for undefined orders
    },
  };
}

/**
 * Validate that all columns have unique orders (except intentional duplicates)
 * Call this in development to check for order conflicts
 */
export function validateColumnOrders(): void {
  const orderCounts: Record<number, string[]> = {};

  Object.entries(COLUMN_ORDERS).forEach(([id, order]) => {
    if (!orderCounts[order]) {
      orderCounts[order] = [];
    }
    orderCounts[order].push(id);
  });

  const duplicates = Object.entries(orderCounts).filter(
    ([, ids]) => ids.length > 1,
  );

  if (duplicates.length > 0) {
    console.warn("⚠️ Duplicate column orders detected:");
    duplicates.forEach(([order, ids]) => {
      console.warn(`  Order ${order}: ${ids.join(", ")}`);
    });
  } else {
    console.log("✅ All column orders are unique");
  }
}

/**
 * Get all column IDs sorted by order
 */
export function getColumnIdsSortedByOrder(): string[] {
  return Object.keys(COLUMN_ORDERS).sort(
    (a, b) => COLUMN_ORDERS[a] - COLUMN_ORDERS[b],
  );
}

/**
 * Get order range for a specific tab/category
 */
export function getOrderRangeForTab(
  tabName: string,
): { min: number; max: number; columns: string[] } | null {
  const tabRanges: Record<
    string,
    { min: number; max: number; columns: string[] }
  > = {
    Identifier: {
      min: 1,
      max: 6,
      columns: Object.entries(COLUMN_ORDERS)
        .filter(([, order]) => order >= 1 && order <= 6)
        .map(([id]) => id),
    },
    "Traveler Information": {
      min: 7,
      max: 10,
      columns: Object.entries(COLUMN_ORDERS)
        .filter(([, order]) => order >= 7 && order <= 10)
        .map(([id]) => id),
    },
    "Tour Details": {
      min: 11,
      max: 24,
      columns: Object.entries(COLUMN_ORDERS)
        .filter(([, order]) => order >= 11 && order <= 24)
        .map(([id]) => id),
    },
    Discounts: {
      min: 25,
      max: 26,
      columns: Object.entries(COLUMN_ORDERS)
        .filter(([, order]) => order >= 25 && order <= 26)
        .map(([id]) => id),
    },
    "Payment Setting": {
      min: 38,
      max: 49,
      columns: Object.entries(COLUMN_ORDERS)
        .filter(([, order]) => order >= 38 && order <= 49)
        .map(([id]) => id),
    },
    Cancellation: {
      min: 82,
      max: 98,
      columns: Object.entries(COLUMN_ORDERS)
        .filter(([, order]) => order >= 82 && order <= 98)
        .map(([id]) => id),
    },
  };

  return tabRanges[tabName] || null;
}
