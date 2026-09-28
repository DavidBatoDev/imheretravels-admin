import { withOrder } from "../column-orders";
import { availablePaymentTermsColumn as _availablePaymentTermsColumn } from "./available-payment-terms";
import { bookingTypeColumn as _bookingTypeColumn } from "./booking-type";
import { daysBetweenBookingAndTourDateColumn as _daysBetweenBookingAndTourDateColumn } from "./days-between-booking-and-tour-date";
import { eligible2ndofmonthsColumn as _eligible2ndofmonthsColumn } from "./eligible2ndofmonths";
import { installmentDatesOverrideColumn as _installmentDatesOverrideColumn } from "./installment-dates-override";
import { paymentConditionColumn as _paymentConditionColumn } from "./payment-condition";
import { reservationDateColumn as _reservationDateColumn } from "./reservation-date";
import { returnDateColumn as _returnDateColumn } from "./return-date";
import { tourDateColumn as _tourDateColumn } from "./tour-date";
import { tourDurationColumn as _tourDurationColumn } from "./tour-duration";
import { tourPackageNameColumn as _tourPackageNameColumn } from "./tour-package-name";

// Export columns with orders injected from global column-orders.ts
export const availablePaymentTermsColumn = withOrder(_availablePaymentTermsColumn);
export const bookingTypeColumn = withOrder(_bookingTypeColumn);
export const daysBetweenBookingAndTourDateColumn = withOrder(_daysBetweenBookingAndTourDateColumn);
export const eligible2ndofmonthsColumn = withOrder(_eligible2ndofmonthsColumn);
export const installmentDatesOverrideColumn = withOrder(_installmentDatesOverrideColumn);
export const paymentConditionColumn = withOrder(_paymentConditionColumn);
export const reservationDateColumn = withOrder(_reservationDateColumn);
export const returnDateColumn = withOrder(_returnDateColumn);
export const tourDateColumn = withOrder(_tourDateColumn);
export const tourDurationColumn = withOrder(_tourDurationColumn);
export const tourPackageNameColumn = withOrder(_tourPackageNameColumn);
