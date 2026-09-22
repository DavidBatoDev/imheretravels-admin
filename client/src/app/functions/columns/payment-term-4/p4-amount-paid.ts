import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Cash actually received for P4. Overpaying the final term has no later term
 * to absorb it; the excess is surfaced as `overpaidAmount` (refund / travel
 * credit pending) rather than silently absorbed.
 */
export const p4AmountPaidColumn: BookingSheetColumn = {
  id: "p4AmountPaid",
  data: {
    id: "p4AmountPaid",
    columnName: "P4 Amount Paid",
    dataType: "currency",
    parentTab: "Payment Term 4",
    includeInForms: true,
    width: 140,
  },
};
