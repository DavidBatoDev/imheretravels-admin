import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Cash actually received for the full payment. The Stripe webhook fills this
 * automatically; enter it by hand for bank transfers. Absent = legacy booking,
 * treated as equal to Full Payment Amount.
 */
export const fullPaymentAmountPaidColumn: BookingSheetColumn = {
  id: "fullPaymentAmountPaid",
  data: {
    id: "fullPaymentAmountPaid",
    columnName: "Full Payment Amount Paid",
    dataType: "currency",
    parentTab: "Full Payment",
    includeInForms: true,
    width: 162,
  },
};
