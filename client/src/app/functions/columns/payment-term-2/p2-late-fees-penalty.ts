import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const p2LateFeesPenaltyColumn: BookingSheetColumn = {
  id: "p2LateFeesPenalty",
  data: {
    id: "p2LateFeesPenalty",
    columnName: "P2 Late Fees Penalty",
    dataType: "string",
    parentTab: "Payment Term 2",
    includeInForms: false,
    color: "yellow",
    width: 150,
    // Late fees may only be set by the guarded late-fee engine, never typed in by hand.
    readOnly: true,
  },
};
