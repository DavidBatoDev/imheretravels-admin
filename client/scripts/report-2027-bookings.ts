#!/usr/bin/env tsx
/**
 * READ-ONLY report: bookings on tours departing 1 Jan 2027 or later.
 *
 * Context: instalment due dates for 2027+ tours moved from the last Friday of
 * each month to the second-to-last Friday (lib/installment-schedule.ts). The
 * new anchor is gated on BOTH tourDate >= 2027-01-01 AND
 * reservationDate >= SECOND_TO_LAST_FRIDAY_POLICY_DATE_UTC, so bookings that
 * already exist keep the schedule their traveller was sent even when their
 * dates are regenerated (plan selection, column recompute).
 *
 * This script counts the existing 2027+ bookings by status / plan / condition
 * and, as a safety net, lists any that WOULD flip to the new anchor under the
 * gate — that list must be empty before deploying to prod. It never writes.
 *
 * Usage:
 *   npm run report:2027-bookings -- --dev
 *   npm run report:2027-bookings -- --prod
 *   npm run report:2027-bookings -- --prod --emails   # also list email per booking, grouped by status
 */
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import { normalizeUTCDate, toDate } from "../src/lib/booking-calculations";
import {
  SECOND_TO_LAST_FRIDAY_POLICY_DATE_UTC,
  SECOND_TO_LAST_FRIDAY_TOUR_FROM_UTC,
  usesSecondToLastFriday,
} from "../src/lib/installment-schedule";

/**
 * bookingStatus is free text in practice ("Installment 2/4 — last paid …",
 * "Booking Confirmed — …", blank), so group it into a few buckets.
 */
function statusBucket(b: any): string {
  const raw = String(b.bookingStatus ?? "").trim();
  const s = raw.toLowerCase();
  if (s.includes("cancel") || b.reasonForCancellation) return "Cancelled";
  if (s.includes("paid in full") || s.includes("complete")) return "Completed / paid in full";
  const inst = s.match(/installment\s+(\d+)\s*\/\s*(\d+)/);
  if (inst) {
    return Number(inst[1]) === 0
      ? "Installment plan — no instalment paid yet"
      : "Installment plan — in progress";
  }
  if (s.startsWith("booking confirmed")) return "Booking Confirmed (reservation fee paid)";
  if (s === "confirmed") return "Confirmed";
  if (s === "pending") return "Pending";
  return raw ? `Other: ${raw}` : "(blank)";
}

function tally(rows: any[], key: string, blank = "(blank)") {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[key] ?? "").trim() || blank;
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function printTally(title: string, entries: [string, number][]) {
  console.log(`\n${title}`);
  for (const [label, count] of entries) {
    console.log(`   ${String(count).padStart(5)}  ${label}`);
  }
}

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log("  read-only: this script never writes\n");

  const snap = await db.collection("bookings").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const unparseable: any[] = [];
  const in2027 = all.filter((b) => {
    const tour = toDate(b.tourDate);
    if (!tour) {
      unparseable.push(b);
      return false;
    }
    return normalizeUTCDate(tour).getTime() >= SECOND_TO_LAST_FRIDAY_TOUR_FROM_UTC;
  });

  console.log(`Scanned ${all.length} bookings.`);
  console.log(`Unparseable tourDate: ${unparseable.length}`);
  console.log(`\nBookings on tours departing 2027-01-01 or later: ${in2027.length}`);

  printTally(
    "By status (bucketed):",
    tally(in2027.map((b) => ({ bucket: statusBucket(b) })), "bucket"),
  );

  // --emails: list each booking (id, email, raw status, plan, tour) under its bucket.
  if (process.argv.includes("--emails")) {
    const groups = new Map<string, any[]>();
    for (const b of in2027) {
      const k = statusBucket(b);
      groups.set(k, [...(groups.get(k) || []), b]);
    }
    for (const [bucket, rows] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n${bucket} (${rows.length}):`);
      rows
        .sort((a, b) => String(a.emailAddress || "").localeCompare(String(b.emailAddress || "")))
        .forEach((b) => {
          const tour = toDate(b.tourDate)!.toISOString().slice(0, 10);
          console.log(
            `   ${String(b.emailAddress || "(no email)").padEnd(40)} ${String(b.bookingId || b.id).padEnd(28)} plan=${String(b.paymentPlan || "-").padEnd(3)} tour=${tour}  ${b.tourPackageName || ""}  [${b.bookingStatus || "blank"}]`,
          );
        });
    }
  }
  printTally("By bookingStatus (raw):", tally(in2027, "bookingStatus"));
  printTally(
    "By payment plan committed:",
    tally(
      in2027.map((b) => ({ plan: b.paymentPlan ? "plan selected" : "no plan yet" })),
      "plan",
    ),
  );
  printTally("By paymentPlan:", tally(in2027, "paymentPlan", "(none)"));
  printTally("By paymentCondition:", tally(in2027, "paymentCondition"));
  printTally(
    "By tour year:",
    tally(
      in2027.map((b) => ({ year: String(toDate(b.tourDate)!.getUTCFullYear()) })),
      "year",
    ),
  );

  // Safety net: under the gate, which existing bookings would move to the
  // second-to-last-Friday anchor if their dates were regenerated today?
  const policyDate = new Date(SECOND_TO_LAST_FRIDAY_POLICY_DATE_UTC)
    .toISOString()
    .slice(0, 10);
  const wouldFlip = in2027.filter((b) => {
    const res = toDate(b.reservationDate);
    const tour = toDate(b.tourDate);
    return (
      !!res &&
      !!tour &&
      usesSecondToLastFriday(normalizeUTCDate(res), normalizeUTCDate(tour))
    );
  });
  const noReservationDate = in2027.filter((b) => !toDate(b.reservationDate));

  console.log(`\nSecond-to-last-Friday policy date: ${policyDate}`);
  console.log(`Existing 2027+ bookings reserved on/after it (would use the new anchor): ${wouldFlip.length}`);
  if (noReservationDate.length) {
    console.log(`2027+ bookings with unparseable reservationDate (gate falls back to last Friday): ${noReservationDate.length}`);
  }
  for (const b of wouldFlip) {
    console.log(
      `   ${b.bookingId || b.id}  |  ${b.emailAddress || ""}  |  status=${b.bookingStatus || ""}  plan=${b.paymentPlan || "-"}  res=${toDate(b.reservationDate)!.toISOString().slice(0, 10)}  tour=${toDate(b.tourDate)!.toISOString().slice(0, 10)}`,
    );
  }
  if (wouldFlip.length === 0) {
    console.log("   none — existing 2027+ bookings keep their last-Friday schedules.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
