import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const p3LateFeesPenaltyColumn: BookingSheetColumn = {
  id: "p3LateFeesPenalty",
  data: {
    id: "p3LateFeesPenalty",
    columnName: "P3 Late Fees Penalty",
    dataType: "string",
    parentTab: "Payment Term 3",
    includeInForms: false,
    color: "yellow",
    width: 150,
    // Late fees may only be set by the guarded late-fee engine, never typed in by hand.
    readOnly: true,
  },
};
