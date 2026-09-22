import { BookingSheetColumn } from "@/types/booking-sheet-column";

/** Cash actually received for P3. See p1-amount-paid.ts for the rules. */
export const p3AmountPaidColumn: BookingSheetColumn = {
  id: "p3AmountPaid",
  data: {
    id: "p3AmountPaid",
    columnName: "P3 Amount Paid",
    dataType: "currency",
    parentTab: "Payment Term 3",
    includeInForms: true,
    width: 140,
  },
};
