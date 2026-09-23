import { computeEligibleInstallmentDatesLocal } from "@/lib/installment-schedule";

export type AvailablePaymentTerm = {
  term: string;
  isLastMinute: boolean;
  isInvalid: boolean;
};

export type PaymentScheduleItem = {
  date: string;
  amount: number;
};

export type GeneratePaymentScheduleInput = {
  tourDate: string;
  monthsRequired: number;
  totalTourPrice: number;
  depositAmount: number;
  fromDate?: Date;
};

const toLocalDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (
    parts.length === 3 &&
    Number.isFinite(parts[0]) &&
    Number.isFinite(parts[1]) &&
    Number.isFinite(parts[2])
  ) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(dateStr);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const getEligibleLastFridayDates = (
  tourDateStr: string,
  fromDate: Date = new Date(),
): Date[] => {
  const reservationDate = new Date(fromDate);
  reservationDate.setHours(0, 0, 0, 0);

  const tourDate = toLocalDate(tourDateStr);
  if (!tourDate) return [];
  tourDate.setHours(0, 0, 0, 0);

  // Canonical rule lives in lib/installment-schedule.ts — do not reimplement.
  return computeEligibleInstallmentDatesLocal(reservationDate, tourDate);
};

/**
 * Minimum number of days between today and the tour start for a date to be
 * bookable. Mirrors the sheet's Payment Condition rule (payment-condition.ts /
 * booking-calculations.ts getPaymentCondition): fewer than 3 days with no
 * instalment date is an "Invalid Booking", so the form must not offer it.
 */
export const MIN_DAYS_BEFORE_TOUR = 3;

export const calculateDaysBetween = (
  tourDateStr: string,
  fromDate: Date = new Date(),
): number => {
  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);

  const tour = new Date(tourDateStr);
  tour.setHours(0, 0, 0, 0);

  const diffTime = tour.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const isTourAllDatesTooSoon = (
  pkg?: { travelDates?: string[] },
  fromDate: Date = new Date(),
): boolean => {
  if (!pkg) return false;
  const validDates = (pkg.travelDates ?? []).filter(Boolean);

  return (
    validDates.length > 0 &&
    validDates.every(
      (date) => calculateDaysBetween(date, fromDate) < MIN_DAYS_BEFORE_TOUR,
    )
  );
};

export const getAvailablePaymentTermForDate = (
  tourDate: string,
  fromDate: Date = new Date(),
): AvailablePaymentTerm => {
  if (!tourDate) return { term: "", isLastMinute: false, isInvalid: false };

  const daysBetween = calculateDaysBetween(tourDate, fromDate);
  const eligibleCount = getEligibleLastFridayDates(tourDate, fromDate).length;

  // Match payment-condition.ts logic:
  // eligible=0 & days<3 => Invalid Booking
  if (eligibleCount === 0 && daysBetween < MIN_DAYS_BEFORE_TOUR) {
    return { term: "invalid", isLastMinute: false, isInvalid: true };
  }

  // eligible=0 & days>=3 => Last Minute Booking
  if (eligibleCount === 0 && daysBetween >= MIN_DAYS_BEFORE_TOUR) {
    return { term: "full_payment", isLastMinute: true, isInvalid: false };
  }

  if (eligibleCount >= 4) {
    return { term: "P4", isLastMinute: false, isInvalid: false };
  }

  if (eligibleCount === 3) {
    return { term: "P3", isLastMinute: false, isInvalid: false };
  }

  if (eligibleCount === 2) {
    return { term: "P2", isLastMinute: false, isInvalid: false };
  }

  if (eligibleCount === 1) {
    return { term: "P1", isLastMinute: false, isInvalid: false };
  }

  return { term: "full_payment", isLastMinute: true, isInvalid: false };
};

export const fixTermName = (name: string): string => {
  return name
    .replace(/Instalment/g, "Installment")
    .replace(/instalments/g, "installments");
};

export const getFriendlyDescription = (monthsRequired: number): string => {
  switch (monthsRequired) {
    case 1:
      return "Ready to pay in full? Pick me.";
    case 2:
      return "Want to split it into two payments? This is it!";
    case 3:
      return "If you like, you can make three equal payments, too!";
    case 4:
      return "Since you're booking early, take advantage of 4 easy payments. No extra charges!";
    default:
      return "";
  }
};

export const generatePaymentScheduleForMonths = ({
  tourDate,
  monthsRequired,
  totalTourPrice,
  depositAmount,
  fromDate = new Date(),
}: GeneratePaymentScheduleInput): PaymentScheduleItem[] => {
  if (!tourDate || monthsRequired <= 0) return [];

  const remainingBalance = totalTourPrice - depositAmount;
  const monthlyAmount = remainingBalance / monthsRequired;
  const validDueDates = getEligibleLastFridayDates(tourDate, fromDate);

  if (validDueDates.length < monthsRequired) return [];

  return validDueDates.slice(0, monthsRequired).map((date, index) => ({
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`,
    amount:
      index === monthsRequired - 1
        ? remainingBalance - monthlyAmount * (monthsRequired - 1)
        : monthlyAmount,
  }));
};
