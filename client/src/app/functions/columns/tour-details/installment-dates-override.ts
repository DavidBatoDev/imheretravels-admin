import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Approved exception to the instalment schedule rule, e.g. a booking that
 * chose P3 before the 14-day spacing floor existed. Comma-separated ISO dates:
 * "2026-07-31, 2026-08-28, 2026-09-04". When set, Eligible Last Fridays and the
 * P1–P4 due dates use these dates instead of the rule
 * (lib/installment-schedule.ts resolveInstallmentDatesLocal). Leave blank for
 * normal bookings.
 */
export const installmentDatesOverrideColumn: BookingSheetColumn = {
  id: "installmentDatesOverride",
  data: {
    id: "installmentDatesOverride",
    columnName: "Installment Dates Override",
    dataType: "string",
    parentTab: "Tour Details",
    includeInForms: false,
    color: "orange",
    width: 260,
  },
};
