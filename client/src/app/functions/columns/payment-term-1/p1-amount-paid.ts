import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Cash actually received for P1. "P1 Amount" is what was asked; this is what
 * arrived. Paying more shrinks the later terms, paying less leaves the
 * shortfall on them (replaces "Manual Credit from P1"). The Stripe webhook
 * fills it automatically; enter by hand for bank transfers. Absent = legacy,
 * treated as equal to P1 Amount.
 */
export const p1AmountPaidColumn: BookingSheetColumn = {
  id: "p1AmountPaid",
  data: {
    id: "p1AmountPaid",
    columnName: "P1 Amount Paid",
    dataType: "currency",
    parentTab: "Payment Term 1",
    includeInForms: true,
    width: 140,
  },
};
