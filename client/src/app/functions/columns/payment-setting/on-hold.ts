import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * On Hold — tick when a guest is moving to another date that isn't confirmed
 * yet. While ticked the booking shows "On Hold": it is never marked Elapsed,
 * gets no late fees or payment reminders, and its balance is left out of
 * Overdue/Expected in the reports (nothing is due until there is a date).
 * Money already paid still counts.
 *
 * To release: set the new Tour Date, untick On Hold, then toggle "Enable
 * Payment Reminder" off and on to rebuild the reminder schedule.
 * Cancelled always wins over On Hold.
 */
export const onHoldColumn: BookingSheetColumn = {
  id: "onHold",
  data: {
    id: "onHold",
    columnName: "On Hold",
    dataType: "boolean",
    parentTab: "Payment Setting",
    includeInForms: true,
    color: "orange",
    width: 110,
  },
};
