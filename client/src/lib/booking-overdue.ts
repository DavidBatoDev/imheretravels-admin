/**
 * Overdue detection for the bookings list and the booking detail modal.
 *
 * A "Pending" booking is shown as "Overdue" when an instalment (or the full
 * payment) is past its due date and unpaid, or when the final balance deadline
 * (tour date - 2 calendar months) has passed and the booking is not fully paid.
 * Both views must use this module so they never disagree.
 */
import type { Booking } from "@/types/bookings";

function toDate(value: any): Date | null {
  if (!value) return null;
  let date: Date | null = null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    date = value.toDate();
  } else if (typeof value === "object" && value._seconds) {
    date = new Date(value._seconds * 1000);
  } else if (typeof value === "object" && value.seconds) {
    date = new Date(value.seconds * 1000);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    date = new Date(value);
  }
  return date && !isNaN(date.getTime()) ? date : null;
}

function isPaid(datePaid: any): boolean {
  if (!datePaid) return false;
  if (typeof datePaid === "object" && datePaid?.toDate) return true;
  if (datePaid instanceof Date && !isNaN(datePaid.getTime())) return true;
  if (typeof datePaid === "string" && datePaid.trim() !== "") return true;
  return false;
}

/** paymentProgress is stored as "50%" (or a number) by the function column. */
function rawPaymentProgress(booking: Booking | null): number {
  const value = (booking as any)?.paymentProgress;
  const n =
    typeof value === "string"
      ? parseFloat(value.replace(/%/g, ""))
      : typeof value === "number"
        ? value
        : NaN;
  return isNaN(n) ? 0 : Math.min(Math.max(n, 0), 100);
}

/** Final balance deadline: tourDate - 2 calendar months. */
export function getFinalBalanceDeadline(
  booking: Booking,
): { date: Date; label: string } | null {
  const raw: any = booking.tourDate;
  if (!raw || typeof raw === "string") return null;
  const d = toDate(raw);
  if (!d) return null;

  const deadline = new Date(d.getFullYear(), d.getMonth() - 2, d.getDate());
  const label = deadline.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { date: deadline, label };
}

export function checkOverduePayments(booking: Booking): {
  hasOverdue: boolean;
  message: string;
} {
  if (booking.bookingStatus?.toLowerCase() === "cancelled") {
    return { hasOverdue: false, message: "" };
  }

  const now = new Date();
  const isOverdue = (dueDate: any) => {
    const date = toDate(dueDate);
    return !!date && date < now;
  };

  const paymentPlan = (
    booking.availablePaymentTerms ||
    booking.paymentPlan ||
    ""
  ).toUpperCase();

  if (paymentPlan.includes("FULL PAYMENT")) {
    if (
      isOverdue(booking.fullPaymentDueDate) &&
      !isPaid(booking.fullPaymentDatePaid)
    ) {
      return { hasOverdue: true, message: "Full payment is overdue" };
    }
  }

  for (const term of ["p1", "p2", "p3", "p4"] as const) {
    const dueDate = (booking as any)[`${term}DueDate`];
    if (
      dueDate &&
      isOverdue(dueDate) &&
      !isPaid((booking as any)[`${term}DatePaid`])
    ) {
      return {
        hasOverdue: true,
        message: `${term.toUpperCase()} installment is overdue`,
      };
    }
  }

  // Unrounded, so 99.6% still counts as not fully paid.
  if (rawPaymentProgress(booking) < 100) {
    const finalDeadline = getFinalBalanceDeadline(booking);
    if (finalDeadline && finalDeadline.date < now) {
      return {
        hasOverdue: true,
        message: `Full balance was due by ${finalDeadline.label} (2 months before tour)`,
      };
    }
  }

  return { hasOverdue: false, message: "" };
}
