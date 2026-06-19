import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const paymentMethodColumn: BookingSheetColumn = {
  id: "paymentMethod",
  data: {
    id: "paymentMethod",
    columnName: "Payment Method",
    dataType: "select",
    parentTab: "Payment Setting",
    includeInForms: true,
    width: 179.3333740234375,
    options: ["", "Stripe"],
  },
};
