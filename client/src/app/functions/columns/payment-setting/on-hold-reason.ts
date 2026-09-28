import { BookingSheetColumn } from "@/types/booking-sheet-column";

/** Why the booking is On Hold, e.g. "Moving to a 2027 date, TBC with guest". */
export const onHoldReasonColumn: BookingSheetColumn = {
  id: "onHoldReason",
  data: {
    id: "onHoldReason",
    columnName: "On Hold Reason",
    dataType: "string",
    parentTab: "Payment Setting",
    includeInForms: true,
    color: "orange",
    width: 220,
  },
};
