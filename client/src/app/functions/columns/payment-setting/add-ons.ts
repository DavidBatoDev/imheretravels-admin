import { BookingSheetColumn } from "@/types/booking-sheet-column";

/**
 * Add-ons — itemised extras paid on top of the tour (private room, single
 * supplement, excursion…). Stored as an array on the booking; edited through
 * a dedicated editor in the grid (dialog) and the Edit Booking modal, never as
 * free text. See src/lib/finance/add-ons.ts for the money rules.
 *
 * dataType is "string" only so generic code paths (filters, CSV) treat it as
 * text; the grid and modal special-case the id "addOns".
 */
export const addOnsColumn: BookingSheetColumn = {
  id: "addOns",
  data: {
    id: "addOns",
    columnName: "Add-ons",
    dataType: "string",
    parentTab: "Payment Setting",
    includeInForms: true,
    color: "yellow",
    width: 220,
  },
};
