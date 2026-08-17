import { computeEligibleInstallmentDatesLocal } from "@/lib/installment-schedule";
import { BookingSheetColumn } from "@/types/booking-sheet-column";

export const p4DueDateColumn: BookingSheetColumn = {
  id: "p4DueDate",
  data: {
    id: "p4DueDate",
    columnName: "P4 Due Date",
    dataType: "function",
    function: "getP4DueDateFunction",
    parentTab: "Payment Term 4",
    includeInForms: false,
    color: "yellow",
    width: 120,
    arguments: [
      {
        name: "reservationDate",
        type: "unknown",
        columnReference: "Reservation Date",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "tourDate",
        type: "unknown",
        columnReference: "Tour Date",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paymentPlan",
        type: "string",
        columnReference: "Payment Plan",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
      {
        name: "paymentCondition",
        type: "string",
        columnReference: "Payment Condition",
        isOptional: true,
        hasDefault: false,
        isRest: false,
        value: "",
      },
    ],
  },
};

// Column Function Implementation
export function tourDateToYyyymmdd(tourDate: unknown): string {
  if (tourDate === null || tourDate === undefined) return "";
  if (typeof tourDate === "string" && tourDate.trim() === "") return "";

  let date: Date | null = null;
  try {
    if (
      typeof tourDate === "object" &&
      tourDate !== null &&
      "toDate" in (tourDate as any)
    ) {
      date = (tourDate as any).toDate();
    } else if (
      typeof tourDate === "object" &&
      tourDate !== null &&
      "seconds" in (tourDate as any)
    ) {
      const s = (tourDate as any).seconds;
      date = new Date(s * 1000);
    } else if (tourDate instanceof Date) {
      date = tourDate;
    } else if (typeof tourDate === "number") {
      date = new Date(tourDate);
    } else if (typeof tourDate === "string") {
      const raw = tourDate.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("/").map(Number);
        date = new Date(yyyy, mm - 1, dd);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yyyy, mm, dd] = raw.split("-").map(Number);
        date = new Date(yyyy, mm - 1, dd);
      } else {
        const parsed = new Date(raw);
        date = isNaN(parsed.getTime()) ? null : parsed;
      }
    } else return "ERROR";

    if (!date || isNaN(date.getTime())) return "ERROR";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;
  } catch {
    return "ERROR";
  }
}

export default function getP4DueDateFunction(
  reservationDate?: unknown,
  tourDate?: unknown,
  paymentPlan?: string,
  paymentCondition?: string,
): string | "" | "ERROR" {
  if (["Full Payment", "P1", "P2", "P3"].includes(paymentPlan ?? "")) return "";
  if (paymentCondition !== "Standard Booking, P4") return "";
  if (!reservationDate) return "";

  const resYmd = tourDateToYyyymmdd(reservationDate);
  const tourYmd = tourDateToYyyymmdd(tourDate);
  if (resYmd === "" || tourYmd === "") return "";
  if (resYmd === "ERROR" || tourYmd === "ERROR") return "ERROR";

  // Parse as local midnight (not UTC) to avoid the midnight trap.
  const [ry, rm, rd] = resYmd.split("-").map(Number);
  const res = new Date(ry, rm - 1, rd);
  const [ty, tm, td] = tourYmd.split("-").map(Number);
  const tour = new Date(ty, tm - 1, td);
  // Canonical rule lives in lib/installment-schedule.ts — do not reimplement.
  const validDates = computeEligibleInstallmentDatesLocal(res, tour);

  if (validDates.length < 4) return "";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // If payment plan is P4, return only the 4th date
  if (paymentPlan === "P4") {
    return fmt(validDates[3]);
  }

  // If no payment plan, return all four dates comma-separated
  return [0, 1, 2, 3].map((i) => fmt(validDates[i])).join(", ");
}
