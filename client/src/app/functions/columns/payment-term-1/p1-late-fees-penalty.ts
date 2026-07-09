import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const p1LateFeesPenaltyColumn: BookingSheetColumn = {
  id: "p1LateFeesPenalty",
  data: {
    id: "p1LateFeesPenalty",
    columnName: "P1 Late Fees Penalty",
    dataType: "string",
    parentTab: "Payment Term 1",
    includeInForms: false,
    color: "yellow",
    width: 150,
    // Late fees may only be set by the guarded late-fee engine, never typed in by hand.
    readOnly: true,
  },
};
