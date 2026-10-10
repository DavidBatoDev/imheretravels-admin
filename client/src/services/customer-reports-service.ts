/**
 * Customer Reports Service
 *
 * Data priority per booking:
 *   1. Passport form data (server-only, fetched from /api/reports/guest-passport-data)
 *   2. Stripe payment data (stripePayments Firestore collection)
 *   3. Booking document only (admin-created — demographics null)
 */

import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { bookingService } from "./booking-service";
import {
  CustomerReport,
  CustomerReportRow,
  CustomerReportMetrics,
  DemographicSlice,
} from "@/types/customer-reports";
import { DateRangeFilter } from "@/types/financial-reports";

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value.includes("T") ? value : value + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") return new Date(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as Record<string, unknown>).seconds === "number"
  ) {
    return new Date((value as Record<string, number>).seconds * 1000);
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcAge(birthdateStr: string | null, atDateStr: string): number | null {
  if (!birthdateStr) return null;
  const bDate = toDate(birthdateStr);
  const atDate = toDate(atDateStr);
  if (!bDate || !atDate) return null;
  const diff = atDate.getTime() - bDate.getTime();
  if (diff < 0) return null;
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function ageGroup(age: number | null): string {
  if (age === null) return "Unknown";
  if (age < 18) return "<18";
  if (age <= 25) return "18–25";
  if (age <= 35) return "26–35";
  if (age <= 45) return "36–45";
  if (age <= 55) return "46–55";
  if (age <= 65) return "56–65";
  return "65+";
}

// ---------------------------------------------------------------------------
// Stripe payment fetcher
// ---------------------------------------------------------------------------

interface StripeGuestData {
  firstName: string;
  lastName: string;
  email: string | null;
  nationality: string | null;
  birthdate: string | null;
}

interface StripePaymentJoinRow {
  mainGuest: StripeGuestData;
  additionalGuests: StripeGuestData[];
  groupSize: number;
}

async function fetchStripePaymentsByBookingId(): Promise<Map<string, StripePaymentJoinRow>> {
  const map = new Map<string, StripePaymentJoinRow>();
  try {
    const snap = await getDocs(collection(db, "stripePayments"));
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const bookingId: string | undefined = data.bookingId ?? data.booking?.bookingId;
      if (!bookingId) return;
      const customer = data.customer ?? {};
      const bookingInfo = data.booking ?? {};
      const additionalGuests: StripeGuestData[] = (bookingInfo.additionalGuests ?? []).map(
        (g: Record<string, string>) => ({
          firstName: g.firstName ?? "",
          lastName: g.lastName ?? "",
          email: g.email ?? null,
          nationality: g.nationality ?? null,
          birthdate: g.birthdate ?? null,
        })
      );
      map.set(bookingId, {
        mainGuest: {
          firstName: customer.firstName ?? "",
          lastName: customer.lastName ?? "",
          email: customer.email ?? null,
          nationality: customer.nationality ?? null,
          birthdate: customer.birthdate ?? null,
        },
        additionalGuests,
        groupSize:
          typeof bookingInfo.groupSize === "number"
            ? bookingInfo.groupSize
            : 1 + additionalGuests.length,
      });
    });
  } catch {
    // Proceed without Stripe data
  }
  return map;
}

// ---------------------------------------------------------------------------
// Overdue detection
// ---------------------------------------------------------------------------

function detectOverdue(booking: Record<string, unknown>): boolean {
  const status = booking.bookingStatus as string | undefined;
  if (status === "Cancelled" || status === "Completed") return false;
  const hasLateFee =
    (typeof booking.p1LateFeesPenalty === "number" && booking.p1LateFeesPenalty > 0) ||
    (typeof booking.p2LateFeesPenalty === "number" && booking.p2LateFeesPenalty > 0) ||
    (typeof booking.p3LateFeesPenalty === "number" && booking.p3LateFeesPenalty > 0) ||
    (typeof booking.p4LateFeesPenalty === "number" && booking.p4LateFeesPenalty > 0) ||
    (typeof booking.totalLateFees === "number" && booking.totalLateFees > 0);
  const hasBalance =
    typeof booking.remainingBalance === "number" && booking.remainingBalance > 0;
  return hasLateFee && hasBalance;
}

// ---------------------------------------------------------------------------
// Demographic aggregation
// ---------------------------------------------------------------------------

// topN = 0 means include all (no "Other" grouping)
function toSlices(
  counts: Map<string, number>,
  total: number,
  topN = 0
): DemographicSlice[] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const entries = topN > 0 ? sorted.slice(0, topN) : sorted;
  const rest = topN > 0 ? sorted.slice(topN) : [];
  const otherCount = rest.reduce((s, [, c]) => s + c, 0);

  const slices: DemographicSlice[] = entries.map(([label, count]) => ({
    label,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  if (otherCount > 0) {
    slices.push({
      label: "Other",
      count: otherCount,
      percent: total > 0 ? Math.round((otherCount / total) * 100) : 0,
    });
  }
  return slices;
}

function buildMetrics(rows: CustomerReportRow[]): CustomerReportMetrics {
  const total = rows.length;
  const bookingIds = new Set(rows.map((r) => r.bookingId));

  let newCount = 0;
  let returningCount = 0;
  const ages: number[] = [];
  const natCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const ageGroupCounts = new Map<string, number>();
  const newVsRetCounts = new Map([["New", 0], ["Returning", 0], ["Unknown", 0]]);
  const genderCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.customerType === "New") newCount++;
    else if (row.customerType === "Returning") returningCount++;
    newVsRetCounts.set(row.customerType, (newVsRetCounts.get(row.customerType) ?? 0) + 1);

    if (row.ageAtReservation !== null) ages.push(row.ageAtReservation);

    const nat = row.nationality ?? "Unknown";
    natCounts.set(nat, (natCounts.get(nat) ?? 0) + 1);

    const cty = row.country ?? "Unknown";
    countryCounts.set(cty, (countryCounts.get(cty) ?? 0) + 1);

    const ag = ageGroup(row.ageAtReservation);
    ageGroupCounts.set(ag, (ageGroupCounts.get(ag) ?? 0) + 1);

    const gender = row.gender ?? "Unknown";
    genderCounts.set(gender, (genderCounts.get(gender) ?? 0) + 1);

    const effectiveStatus = row.isOverdue ? "Overdue" : (row.bookingStatus ?? null);
    if (effectiveStatus) {
      statusCounts.set(effectiveStatus, (statusCounts.get(effectiveStatus) ?? 0) + 1);
    }
  }

  const averageAge =
    ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;

  const AGE_ORDER = ["<18", "18–25", "26–35", "36–45", "46–55", "56–65", "65+", "Unknown"];
  const ageGroupBreakdown: DemographicSlice[] = AGE_ORDER.filter((g) =>
    ageGroupCounts.has(g)
  ).map((g) => {
    const count = ageGroupCounts.get(g) ?? 0;
    return { label: g, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
  });

  const newVsReturning: DemographicSlice[] = ["New", "Returning", "Unknown"]
    .filter((k) => (newVsRetCounts.get(k) ?? 0) > 0)
    .map((k) => {
      const count = newVsRetCounts.get(k) ?? 0;
      return { label: k, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
    });

  // Status order — no Unknown; Overdue is derived from late-fee detection
  const STATUS_ORDER = ["Confirmed", "Completed", "Pending", "Overdue", "Cancelled"];
  const bookingStatusBreakdown: DemographicSlice[] = STATUS_ORDER.filter((s) =>
    statusCounts.has(s)
  ).map((s) => {
    const count = statusCounts.get(s) ?? 0;
    return { label: s, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
  });

  // Gender order
  const GENDER_ORDER = ["Female", "Male", "Unknown"];
  const genderBreakdown: DemographicSlice[] = GENDER_ORDER.filter((g) =>
    genderCounts.has(g)
  ).map((g) => {
    const count = genderCounts.get(g) ?? 0;
    return { label: g, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
  });

  return {
    totalGuestRows: total,
    totalBookings: bookingIds.size,
    newCount,
    returningCount,
    averageAge,
    nationalityBreakdown: toSlices(natCounts, total, 0), // all nationalities
    countryBreakdown: toSlices(countryCounts, total, 10),
    ageGroupBreakdown,
    newVsReturning,
    genderBreakdown,
    bookingStatusBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Passport form data (personal data: fetched from the server, never bundled)
// ---------------------------------------------------------------------------

interface GuestPassportEntry {
  source: string;
  fullName: string;
  nationality: string;
  country: string;
  birthdate: string; // YYYY-MM-DD
  gender: string;
  passportLink: string;
}

async function fetchGuestPassportData(
  bookingCodes: string[],
): Promise<Record<string, GuestPassportEntry>> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to view the customer report");
  const token = await user.getIdToken();

  const res = await fetch("/api/reports/guest-passport-data", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bookingCodes }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Failed to load passport data: ${error}`);
  }
  const { entries } = (await res.json()) as { entries: Record<string, GuestPassportEntry> };
  return entries;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateCustomerReport(
  dateRange: DateRangeFilter
): Promise<CustomerReport> {
  const { startDate, endDate } = dateRange;

  const allBookings = await bookingService.getAllBookings();
  const filtered = allBookings.filter((b) => {
    const d = toDate(b.reservationDate);
    if (!d) return false;
    const iso = toISODate(d);
    return iso >= startDate && iso <= endDate;
  });

  const lookupCodes = filtered.flatMap((b) =>
    [b.bookingCode, b.bookingId, b.id].filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  const [stripeMap, passportData] = await Promise.all([
    fetchStripePaymentsByBookingId(),
    fetchGuestPassportData(lookupCodes),
  ]);

  type RawRow = Omit<CustomerReportRow, "customerType">;
  const rawRows: RawRow[] = [];

  for (const booking of filtered) {
    const bookingCode: string = booking.bookingCode ?? booking.bookingId ?? booking.id ?? "";
    const bookingId: string = booking.bookingId ?? booking.id ?? bookingCode;
    const resDateObj = toDate(booking.reservationDate);
    const tourDateObj = toDate(booking.tourDate);
    const reservationDate = resDateObj ? toISODate(resDateObj) : "";
    const tourDate = tourDateObj ? toISODate(tourDateObj) : "";
    const tourName: string = booking.tourPackageName ?? "";
    const bookingStatus: string | null = (booking.bookingStatus as string) ?? null;

    const paid: number = typeof booking.paid === "number" ? booking.paid : 0;
    const refundableAmount: number =
      typeof booking.refundableAmount === "number" ? booking.refundableAmount : 0;
    const netRevenue = paid - refundableAmount;

    const isOverdue = detectOverdue(booking as Record<string, unknown>);

    // ── Priority 1: Passport form data ──────────────────────────────────────
    const passportEntry = passportData[bookingCode] ?? passportData[bookingId];
    if (passportEntry) {
      rawRows.push({
        bookingId,
        bookingCode,
        reservationDate,
        tourDate,
        tourName,
        bookingStatus,
        numberOfGuests: 1,
        isMainBooker: true,
        guestName: passportEntry.fullName || booking.fullName || "",
        nationality: passportEntry.nationality,
        country: passportEntry.country,
        birthdate: passportEntry.birthdate,
        ageAtReservation: calcAge(passportEntry.birthdate, reservationDate),
        gender: passportEntry.gender,
        source: "Admin",
        passportLink: passportEntry.passportLink,
        email: booking.emailAddress ?? null,
        isOverdue,
        grossRevenue: paid,
        netRevenue,
      });
      continue;
    }

    // ── Priority 2: Stripe payment data ─────────────────────────────────────
    const stripeData = stripeMap.get(bookingCode) ?? stripeMap.get(bookingId);
    if (stripeData) {
      const groupSize = stripeData.groupSize;
      const revenuePerGuest = groupSize > 0 ? paid / groupSize : paid;
      const netPerGuest = groupSize > 0 ? netRevenue / groupSize : netRevenue;

      const { mainGuest } = stripeData;
      rawRows.push({
        bookingId,
        bookingCode,
        reservationDate,
        tourDate,
        tourName,
        bookingStatus,
        numberOfGuests: groupSize,
        isMainBooker: true,
        guestName: `${mainGuest.firstName} ${mainGuest.lastName}`.trim() || booking.fullName || "",
        nationality: mainGuest.nationality ?? null,
        country: mainGuest.nationality ?? null,
        birthdate: mainGuest.birthdate ?? null,
        ageAtReservation: calcAge(mainGuest.birthdate ?? null, reservationDate),
        gender: null,
        source: "Reservation Form",
        passportLink: null,
        email: mainGuest.email,
        isOverdue,
        grossRevenue: revenuePerGuest,
        netRevenue: netPerGuest,
      });

      for (const guest of stripeData.additionalGuests) {
        rawRows.push({
          bookingId,
          bookingCode,
          reservationDate,
          tourDate,
          tourName,
          bookingStatus,
          numberOfGuests: groupSize,
          isMainBooker: false,
          guestName: `${guest.firstName} ${guest.lastName}`.trim() || "Guest",
          nationality: guest.nationality ?? null,
          country: guest.nationality ?? null,
          birthdate: guest.birthdate ?? null,
          ageAtReservation: calcAge(guest.birthdate ?? null, reservationDate),
          gender: null,
          source: "Reservation Form",
          passportLink: null,
          email: guest.email ?? null,
          isOverdue,
          grossRevenue: revenuePerGuest,
          netRevenue: netPerGuest,
        });
      }
      continue;
    }

    // ── Priority 3: Admin-created booking ────────────────────────────────────
    rawRows.push({
      bookingId,
      bookingCode,
      reservationDate,
      tourDate,
      tourName,
      bookingStatus,
      numberOfGuests: 1,
      isMainBooker: true,
      guestName:
        booking.fullName ?? `${booking.firstName ?? ""} ${booking.lastName ?? ""}`.trim(),
      nationality: null,
      country: null,
      birthdate: null,
      ageAtReservation: null,
      gender: null,
      source: "Admin",
      passportLink: null,
      email: booking.emailAddress ?? null,
      isOverdue,
      grossRevenue: paid,
      netRevenue,
    });
  }

  // ── Classify New vs Returning ────────────────────────────────────────────
  const emailFirstSeen = new Map<string, string>();
  const sorted = [...rawRows].sort((a, b) => a.reservationDate.localeCompare(b.reservationDate));
  for (const row of sorted) {
    if (row.email) {
      const key = row.email.toLowerCase();
      if (!emailFirstSeen.has(key)) emailFirstSeen.set(key, row.reservationDate);
    }
  }

  const rows: CustomerReportRow[] = rawRows.map((row) => {
    let customerType: "New" | "Returning" | "Unknown" = "Unknown";
    if (row.email) {
      const key = row.email.toLowerCase();
      const first = emailFirstSeen.get(key);
      customerType = first === row.reservationDate ? "New" : "Returning";
    }
    return { ...row, customerType };
  });

  return { rows, metrics: buildMetrics(rows) };
}
