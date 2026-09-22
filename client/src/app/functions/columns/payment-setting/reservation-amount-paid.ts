import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Cash actually received for the reservation. Normally equals Reservation Fee;
 * when a guest sends more, the excess automatically reduces every payment
 * term (replaces "Manual Credit from Reservation"). Absent = legacy booking,
 * treated as equal to the fee.
 */
export const reservationAmountPaidColumn: BookingSheetColumn = {
  id: "reservationAmountPaid",
  data: {
    id: "reservationAmountPaid",
    columnName: "Reservation Amount Paid",
    dataType: "currency",
    parentTab: "Payment Setting",
    includeInForms: true,
    width: 162,
  },
};
