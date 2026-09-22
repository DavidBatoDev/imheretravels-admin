import { withOrder } from "../column-orders";
import { p4AmountColumn as _p4AmountColumn } from "./p4-amount";
import { p4AmountPaidColumn as _p4AmountPaidColumn } from "./p4-amount-paid";
import { p4CalendarEventIdColumn as _p4CalendarEventIdColumn } from "./p4-calendar-event-id";
import { p4CalendarEventLinkColumn as _p4CalendarEventLinkColumn } from "./p4-calendar-event-link";
import { p4DatePaidColumn as _p4DatePaidColumn } from "./p4-date-paid";
import { p4DueDateColumn as _p4DueDateColumn } from "./p4-due-date";
import { p4ScheduledEmailLinkColumn as _p4ScheduledEmailLinkColumn } from "./p4-scheduled-email-link";
import { p4LateFeeAppliedAtColumn as _p4LateFeeAppliedAtColumn } from "./p4-late-fee-applied-at";
import { p4LateFeesNoticeLinkColumn as _p4LateFeesNoticeLinkColumn } from "./p4-late-fees-notice-link";
import { p4LateFeesPenaltyColumn as _p4LateFeesPenaltyColumn } from "./p4-late-fees-penalty";
import { p4ScheduledReminderDateColumn as _p4ScheduledReminderDateColumn } from "./p4-scheduled-reminder-date";

// Export columns with orders injected from global column-orders.ts
export const p4AmountColumn = withOrder(_p4AmountColumn);
export const p4AmountPaidColumn = withOrder(_p4AmountPaidColumn);
export const p4CalendarEventIdColumn = withOrder(_p4CalendarEventIdColumn);
export const p4CalendarEventLinkColumn = withOrder(_p4CalendarEventLinkColumn);
export const p4DatePaidColumn = withOrder(_p4DatePaidColumn);
export const p4DueDateColumn = withOrder(_p4DueDateColumn);
export const p4LateFeeAppliedAtColumn = withOrder(_p4LateFeeAppliedAtColumn);
export const p4LateFeesNoticeLinkColumn = withOrder(
  _p4LateFeesNoticeLinkColumn,
);
export const p4LateFeesPenaltyColumn = withOrder(_p4LateFeesPenaltyColumn);
export const p4ScheduledEmailLinkColumn = withOrder(
  _p4ScheduledEmailLinkColumn,
);
export const p4ScheduledReminderDateColumn = withOrder(
  _p4ScheduledReminderDateColumn,
);
