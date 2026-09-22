import { withOrder } from "../column-orders";
import { adminFeeColumn as _adminFeeColumn } from "./admin-fee";
import { bookingStatusColumn as _bookingStatusColumn } from "./booking-status";
import { creditFromColumn as _creditFromColumn } from "./credit-from";
import { discountedTourCostColumn as _discountedTourCostColumn } from "./discounted-tour-cost";
import { enablePaymentReminderColumn as _enablePaymentReminderColumn } from "./enable-payment-reminder";
import { guestInfoEmailSentLinkColumn as _guestInfoEmailSentLinkColumn } from "./guest-info-email-sent-link";
import { manualCreditColumn as _manualCreditColumn } from "./manual-credit";
import { originalTourCostColumn as _originalTourCostColumn } from "./original-tour-cost";
import { paidColumn as _paidColumn } from "./paid";
import { paidTermsColumn as _paidTermsColumn } from "./paid-terms";
import { paymentMethodColumn as _paymentMethodColumn } from "./payment-method";
import { paymentPlanColumn as _paymentPlanColumn } from "./payment-plan";
import { paymentProgressColumn as _paymentProgressColumn } from "./payment-progress";
import { remainingBalanceColumn as _remainingBalanceColumn } from "./remaining-balance";
import { overpaidAmountColumn as _overpaidAmountColumn } from "./overpaid-amount";
import { reservationFeeColumn as _reservationFeeColumn } from "./reservation-fee";
import { reservationAmountPaidColumn as _reservationAmountPaidColumn } from "./reservation-amount-paid";
import { sentInitialReminderLinkColumn as _sentInitialReminderLinkColumn } from "./sent-initial-reminder-link";
import { totalLateFeesColumn as _totalLateFeesColumn } from "./total-late-fees";

// Export columns with orders injected from global column-orders.ts
export const adminFeeColumn = withOrder(_adminFeeColumn);
export const bookingStatusColumn = withOrder(_bookingStatusColumn);
export const creditFromColumn = withOrder(_creditFromColumn);
export const discountedTourCostColumn = withOrder(_discountedTourCostColumn);
export const enablePaymentReminderColumn = withOrder(
  _enablePaymentReminderColumn,
);
export const guestInfoEmailSentLinkColumn = withOrder(
  _guestInfoEmailSentLinkColumn,
);
export const manualCreditColumn = withOrder(_manualCreditColumn);
export const originalTourCostColumn = withOrder(_originalTourCostColumn);
export const paidColumn = withOrder(_paidColumn);
export const paidTermsColumn = withOrder(_paidTermsColumn);
export const paymentMethodColumn = withOrder(_paymentMethodColumn);
export const paymentPlanColumn = withOrder(_paymentPlanColumn);
export const paymentProgressColumn = withOrder(_paymentProgressColumn);
export const remainingBalanceColumn = withOrder(_remainingBalanceColumn);
export const overpaidAmountColumn = withOrder(_overpaidAmountColumn);
export const reservationFeeColumn = withOrder(_reservationFeeColumn);
export const reservationAmountPaidColumn = withOrder(_reservationAmountPaidColumn);
export const sentInitialReminderLinkColumn = withOrder(
  _sentInitialReminderLinkColumn,
);
export const totalLateFeesColumn = withOrder(_totalLateFeesColumn);
