import { withOrder } from "../column-orders";
import { p2AmountColumn as _p2AmountColumn } from "./p2-amount";
import { p2AmountPaidColumn as _p2AmountPaidColumn } from "./p2-amount-paid";
import { p2CalendarEventIdColumn as _p2CalendarEventIdColumn } from "./p2-calendar-event-id";
import { p2CalendarEventLinkColumn as _p2CalendarEventLinkColumn } from "./p2-calendar-event-link";
import { p2DatePaidColumn as _p2DatePaidColumn } from "./p2-date-paid";
import { p2DueDateColumn as _p2DueDateColumn } from "./p2-due-date";
import { p2ScheduledEmailLinkColumn as _p2ScheduledEmailLinkColumn } from "./p2-scheduled-email-link";
import { p2LateFeeAppliedAtColumn as _p2LateFeeAppliedAtColumn } from "./p2-late-fee-applied-at";
import { p2LateFeesNoticeLinkColumn as _p2LateFeesNoticeLinkColumn } from "./p2-late-fees-notice-link";
import { p2LateFeesPenaltyColumn as _p2LateFeesPenaltyColumn } from "./p2-late-fees-penalty";
import { p2ScheduledReminderDateColumn as _p2ScheduledReminderDateColumn } from "./p2-scheduled-reminder-date";

// Export columns with orders injected from global column-orders.ts
export const p2AmountColumn = withOrder(_p2AmountColumn);
export const p2AmountPaidColumn = withOrder(_p2AmountPaidColumn);
export const p2CalendarEventIdColumn = withOrder(_p2CalendarEventIdColumn);
export const p2CalendarEventLinkColumn = withOrder(_p2CalendarEventLinkColumn);
export const p2DatePaidColumn = withOrder(_p2DatePaidColumn);
export const p2DueDateColumn = withOrder(_p2DueDateColumn);
export const p2LateFeeAppliedAtColumn = withOrder(_p2LateFeeAppliedAtColumn);
export const p2LateFeesNoticeLinkColumn = withOrder(
  _p2LateFeesNoticeLinkColumn,
);
export const p2LateFeesPenaltyColumn = withOrder(_p2LateFeesPenaltyColumn);
export const p2ScheduledEmailLinkColumn = withOrder(
  _p2ScheduledEmailLinkColumn,
);
export const p2ScheduledReminderDateColumn = withOrder(
  _p2ScheduledReminderDateColumn,
);
