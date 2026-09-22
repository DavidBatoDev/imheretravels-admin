import { BookingSheetColumn } from "@/types/booking-sheet-column";

/** Cash actually received for P2. See p1-amount-paid.ts for the rules. */
export const p2AmountPaidColumn: BookingSheetColumn = {
  id: "p2AmountPaid",
  data: {
    id: "p2AmountPaid",
    columnName: "P2 Amount Paid",
    dataType: "currency",
    parentTab: "Payment Term 2",
    includeInForms: true,
    width: 140,
  },
};
