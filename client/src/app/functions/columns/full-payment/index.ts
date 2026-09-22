import { withOrder } from "../column-orders";
import { fullPaymentAmountColumn as _fullPaymentAmountColumn } from "./full-payment-amount";
import { fullPaymentAmountPaidColumn as _fullPaymentAmountPaidColumn } from "./full-payment-amount-paid";
import { fullPaymentDatePaidColumn as _fullPaymentDatePaidColumn } from "./full-payment-date-paid";
import { fullPaymentDueDateColumn as _fullPaymentDueDateColumn } from "./full-payment-due-date";

// Export columns with orders injected from global column-orders.ts
export const fullPaymentAmountColumn = withOrder(_fullPaymentAmountColumn);
export const fullPaymentAmountPaidColumn = withOrder(_fullPaymentAmountPaidColumn);
export const fullPaymentDatePaidColumn = withOrder(_fullPaymentDatePaidColumn);
export const fullPaymentDueDateColumn = withOrder(_fullPaymentDueDateColumn);
