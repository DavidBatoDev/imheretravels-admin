#!/usr/bin/env tsx
/**
 * READ-ONLY audit: finds bookings where the public /booking-status page's
 * payment-term calculation would disagree with the canonical admin
 * calculation (src/lib/booking-calculations.ts).
 *
 * Root cause: the public page had its own copy of the "which payment term
 * (P1-P4) is this booking eligible for" formula, computed off `today` instead
 * of `reservationDate` and using a naive calendar-month diff instead of the
 * "last Friday of month, 2-months-before-tour" rule. It has been fixed in
 * app/booking-status/[bookingDocumentId]/page.tsx to call the canonical
 * functions directly. This script finds any OTHER booking whose public page
 * would have shown a different term than admin, prior to that fix, so they
 * can be reviewed. It never writes.
 *
 * Usage: npx tsx scripts/audit-booking-status-payment-term-mismatch.ts --prod
 */
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import {
  getDaysBetweenDates,
  getEligible2ndOfMonths,
  getPaymentCondition,
} from "../src/lib/booking-calculations";

// Replica of the OLD (buggy) public booking-status page formula, for diffing.
function oldPublicPageTerm(reservationDate: unknown, tourDateValue: unknown): string {
  const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "object") {
      const v = value as any;
      if ("seconds" in v && typeof v.seconds === "number") return new Date(v.seconds * 1000);
      if ("toDate" in v && typeof v.toDate === "function") {
        try {
          const d = v.toDate();
          return d instanceof Date && !isNaN(d.getTime()) ? d : null;
        } catch {
          return null;
        }
      }
    }
    if (typeof value === "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const tour = toDate(tourDateValue);
  if (!tour) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tourMidnight = new Date(tour);
  tourMidnight.setHours(0, 0, 0, 0);
  const daysBetween = Math.ceil((tourMidnight.getTime() - today.getTime()) / 86400000);

  if (daysBetween < 2) return "invalid";
  if (daysBetween >= 2 && daysBetween < 30) return "full_payment";

  const fullPaymentDue = new Date(tour);
  fullPaymentDue.setDate(fullPaymentDue.getDate() - 30);
  const yearDiff = fullPaymentDue.getFullYear() - today.getFullYear();
  const monthDiff = fullPaymentDue.getMonth() - today.getMonth();
  const monthCount = Math.max(0, yearDiff * 12 + monthDiff);

  if (monthCount >= 4) return "P4";
  if (monthCount === 3) return "P3";
  if (monthCount === 2) return "P2";
  if (monthCount === 1) return "P1";
  return "full_payment";
}

function canonicalTerm(reservationDate: unknown, tourDateValue: unknown): string {
  if (!tourDateValue) return "";
  const daysBetween = getDaysBetweenDates(reservationDate, tourDateValue);
  const eligible = getEligible2ndOfMonths(reservationDate, tourDateValue);
  const condition = getPaymentCondition(tourDateValue, eligible, daysBetween);
  if (condition === "Invalid Booking") return "invalid";
  if (condition === "Last Minute Booking") return "full_payment";
  const m = condition.match(/P[1-4]/);
  return m ? m[0] : "";
}

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log("  read-only: this script never writes\n");

  const snap = await db.collection("bookings").get();
  const bookings = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const mismatches: Array<{
    id: string;
    bookingId: string;
    email: string;
    bookingStatus: string;
    storedPaymentCondition: string;
    canonical: string;
    oldPublicPage: string;
  }> = [];

  for (const b of bookings) {
    // The buggy term only reaches the customer while they haven't picked a
    // payment plan yet — that's the only place availablePaymentPlans (and
    // hence getAvailablePaymentTerm) is rendered.
    if (b.paymentPlan) continue;
    const status = String(b.bookingStatus || "").toLowerCase();
    if (status === "cancelled") continue;

    const canonical = canonicalTerm(b.reservationDate, b.tourDate);
    const old = oldPublicPageTerm(b.reservationDate, b.tourDate);
    if (canonical && old && canonical !== old) {
      mismatches.push({
        id: b.id,
        bookingId: b.bookingId || "",
        email: b.emailAddress || "",
        bookingStatus: b.bookingStatus || "",
        storedPaymentCondition: b.paymentCondition || "",
        canonical,
        oldPublicPage: old,
      });
    }
  }

  console.log(`Scanned ${bookings.length} bookings. Found ${mismatches.length} mismatches:\n`);
  for (const m of mismatches) {
    console.log(
      `${m.bookingId || m.id}  |  ${m.email}  |  status=${m.bookingStatus}  |  admin(stored)=${m.storedPaymentCondition}  |  canonical=${m.canonical}  |  old public page=${m.oldPublicPage}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
