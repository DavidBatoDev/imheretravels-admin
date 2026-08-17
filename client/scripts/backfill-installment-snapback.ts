#!/usr/bin/env tsx
/**
 * Backfill for the instalment "snap-back" rule (lib/installment-schedule.ts).
 *
 * Snap-back lets a booking keep its final instalment when the monthly
 * last-Friday anchor overshoots the payment deadline, by falling back to the
 * last Friday that still meets it. Bookings created before the rule shipped
 * were scored without it, so some of them are stored with one fewer term than
 * they now qualify for (e.g. P2 where P3 is available).
 *
 * Scope — deliberately narrow. Only bookings that have NOT committed to a
 * payment plan are touched:
 *   - paymentPlan must be empty/unset
 *   - no pNDatePaid may be recorded
 *   - bookingStatus must not be Cancelled
 *   - reservationDate must be on/after 1 Jun 2026 (snap-back is gated to the
 *     standard policy; legacy schedules must never change)
 *
 * A booking whose traveller has already been emailed a schedule keeps it. Since
 * snap-back only ever APPENDS a date, the P1/P2/P3 due dates of every booking
 * it does touch stay identical — the booking simply gains one more option.
 *
 * Usage:
 *   npx tsx scripts/backfill-installment-snapback.ts --dev            # dry run
 *   npx tsx scripts/backfill-installment-snapback.ts --dev --apply    # write
 *   npx tsx scripts/backfill-installment-snapback.ts --prod --apply
 */
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import {
  calculateInstallmentAmounts,
  generateInstallmentDueDates,
  getAvailablePaymentTerms,
  getDaysBetweenDates,
  getEligible2ndOfMonths,
  getPaymentCondition,
  toDate,
} from "../src/lib/booking-calculations";
import { SCHEDULE_POLICY_DATE_UTC } from "../src/lib/installment-schedule";

const TERM_FIELDS = [1, 2, 3, 4] as const;

interface Change {
  id: string;
  bookingId: string;
  email: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

function buildSchedule(b: any) {
  const daysBetween = getDaysBetweenDates(b.reservationDate, b.tourDate);
  const eligible = getEligible2ndOfMonths(b.reservationDate, b.tourDate);
  const paymentCondition = getPaymentCondition(b.tourDate, eligible, daysBetween);
  const availablePaymentTerms = getAvailablePaymentTerms(paymentCondition);
  const isLastMinute = paymentCondition === "Last Minute Booking";

  // No plan selected yet, so pass "" — matches createBookingData (step 2),
  // which yields the comma-joined "all available dates" form.
  const dueDates = isLastMinute
    ? { p1DueDate: "", p2DueDate: "", p3DueDate: "", p4DueDate: "" }
    : generateInstallmentDueDates(
        b.reservationDate,
        b.tourDate,
        "",
        paymentCondition,
      );

  const amounts = isLastMinute
    ? { p1Amount: "", p2Amount: "", p3Amount: "", p4Amount: "" }
    : calculateInstallmentAmounts(
        "",
        Number(b.originalTourCost) || 0,
        b.discountedTourCost != null ? Number(b.discountedTourCost) : null,
        Number(b.reservationFee) || 0,
        b.isMainBooker ?? true,
        Number(b.manualCredit) || 0,
        b.creditFrom || "",
        dueDates.p1DueDate,
        dueDates.p2DueDate,
        dueDates.p3DueDate,
        dueDates.p4DueDate,
      );

  return {
    eligible2ndofmonths: eligible,
    paymentCondition,
    availablePaymentTerms,
    ...dueDates,
    ...amounts,
  };
}

function skipReason(b: any): string | null {
  if (b.paymentPlan) return `plan already selected (${b.paymentPlan})`;

  const status = String(b.bookingStatus || "").toLowerCase();
  if (status === "cancelled") return "cancelled";

  for (const n of TERM_FIELDS) {
    if (b[`p${n}DatePaid`]) return `P${n} already paid`;
  }

  const res = toDate(b.reservationDate);
  if (!res) return "unparseable reservationDate";
  if (
    Date.UTC(res.getUTCFullYear(), res.getUTCMonth(), res.getUTCDate()) <
    SCHEDULE_POLICY_DATE_UTC
  ) {
    return "legacy policy (reserved before 1 Jun 2026)";
  }

  if (!toDate(b.tourDate)) return "unparseable tourDate";
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = initFirestore(targetFromArgv());

  console.log(
    apply
      ? "  MODE: APPLY — changes will be written\n"
      : "  MODE: DRY RUN — no writes (pass --apply to write)\n",
  );

  const snap = await db.collection("bookings").get();
  const bookings = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const changes: Change[] = [];
  const skipped: Record<string, number> = {};

  for (const b of bookings) {
    const reason = skipReason(b);
    if (reason) {
      skipped[reason] = (skipped[reason] || 0) + 1;
      continue;
    }

    const next = buildSchedule(b);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(next)) {
      const current = b[key] ?? "";
      const normalizedCurrent = current === null ? "" : current;
      const normalizedNext = value === null ? "" : value;
      if (String(normalizedCurrent) !== String(normalizedNext)) {
        before[key] = normalizedCurrent;
        after[key] = normalizedNext;
      }
    }

    if (Object.keys(after).length > 0) {
      changes.push({
        id: b.id,
        bookingId: b.bookingId || "",
        email: b.emailAddress || "",
        before,
        after,
      });
    }
  }

  console.log(`Scanned ${bookings.length} bookings.`);
  console.log(`Skipped:`);
  for (const [reason, count] of Object.entries(skipped).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`   ${String(count).padStart(5)}  ${reason}`);
  }
  console.log(`\n${changes.length} booking(s) would change:\n`);

  for (const c of changes) {
    console.log(`${c.bookingId || c.id}  |  ${c.email}`);
    for (const key of Object.keys(c.after)) {
      console.log(
        `   ${key}: ${JSON.stringify(c.before[key])}  ->  ${JSON.stringify(c.after[key])}`,
      );
    }
    console.log("");
  }

  if (!apply) {
    console.log("Dry run complete — nothing written.");
    return;
  }

  let written = 0;
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    for (const c of changes.slice(i, i + 400)) {
      batch.update(db.collection("bookings").doc(c.id), {
        ...c.after,
        updatedAt: new Date(),
      });
      written += 1;
    }
    await batch.commit();
  }

  console.log(`Wrote ${written} booking(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
