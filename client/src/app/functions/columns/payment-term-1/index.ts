import { withOrder } from "../column-orders";
import { p1AmountColumn as _p1AmountColumn } from "./p1-amount";
import { p1AmountPaidColumn as _p1AmountPaidColumn } from "./p1-amount-paid";
import { p1CalendarEventIdColumn as _p1CalendarEventIdColumn } from "./p1-calendar-event-id";
import { p1CalendarEventLinkColumn as _p1CalendarEventLinkColumn } from "./p1-calendar-event-link";
import { p1DatePaidColumn as _p1DatePaidColumn } from "./p1-date-paid";
import { p1DueDateColumn as _p1DueDateColumn } from "./p1-due-date";
import { p1ScheduledEmailLinkColumn as _p1ScheduledEmailLinkColumn } from "./p1-scheduled-email-link";
import { p1LateFeeAppliedAtColumn as _p1LateFeeAppliedAtColumn } from "./p1-late-fee-applied-at";
import { p1LateFeesNoticeLinkColumn as _p1LateFeesNoticeLinkColumn } from "./p1-late-fees-notice-link";
import { p1LateFeesPenaltyColumn as _p1LateFeesPenaltyColumn } from "./p1-late-fees-penalty";
import { p1ScheduledReminderDateColumn as _p1ScheduledReminderDateColumn } from "./p1-scheduled-reminder-date";

// Export columns with orders injected from global column-orders.ts
export const p1AmountColumn = withOrder(_p1AmountColumn);
export const p1AmountPaidColumn = withOrder(_p1AmountPaidColumn);
export const p1CalendarEventIdColumn = withOrder(_p1CalendarEventIdColumn);
export const p1CalendarEventLinkColumn = withOrder(_p1CalendarEventLinkColumn);
export const p1DatePaidColumn = withOrder(_p1DatePaidColumn);
export const p1DueDateColumn = withOrder(_p1DueDateColumn);
export const p1LateFeeAppliedAtColumn = withOrder(_p1LateFeeAppliedAtColumn);
export const p1LateFeesNoticeLinkColumn = withOrder(
  _p1LateFeesNoticeLinkColumn,
);
export const p1LateFeesPenaltyColumn = withOrder(_p1LateFeesPenaltyColumn);
export const p1ScheduledEmailLinkColumn = withOrder(
  _p1ScheduledEmailLinkColumn,
);
export const p1ScheduledReminderDateColumn = withOrder(
  _p1ScheduledReminderDateColumn,
);
