#!/usr/bin/env tsx
/**
 * Recomputes payment fields for bookings affected by the manual-credit bugs
 * fixed in payment-calculation-helpers.ts / paid.ts / remaining-balance.ts:
 *
 *   1. A manual credit applied to the last term of a plan (or to a term while
 *      another term was already paid) wasn't actually deducted from that
 *      term's due amount.
 *   2. `paid` / `remainingBalance` double-handled the credit once the
 *      credited term was paid, undercounting how much was really settled and
 *      leaving `remainingBalance` stuck above zero (and `bookingStatus` stuck
 *      on "Pending") even though the booking was effectively fully paid.
 *
 * This targets specific bookings by their human-readable `bookingId`, not
 * every booking with a manual credit — run scripts/audit-... first (or add
 * more ids to TARGET_BOOKING_IDS) to widen the sweep.
 *
 * Dry run by default; --apply writes. Follows the same conventions as
 * fix-booking-money-types.ts (explicit --prod/--dev, rollback snapshot
 * written before any write).
 *
 * Usage:
 *   npm run fix:manual-credit -- --prod
 *   npm run fix:manual-credit -- --prod --apply
 */

import path from "path";
import { writeFileSync } from "fs";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import {
  allocateInstallmentAmountsWithPaidLocks,
  getPaymentPlanTerms,
  toNumber,
  roundCurrency,
} from "../src/app/functions/columns/payment-calculation-helpers";
import getFullPaymentRemainingFunction from "../src/app/functions/columns/full-payment/full-payment-amount";
import getTotalPaidAmountFunction from "../src/app/functions/columns/payment-setting/paid";
import getRemainingBalanceFunction from "../src/app/functions/columns/payment-setting/remaining-balance";
import bookingStatusFunction from "../src/app/functions/columns/payment-setting/booking-status";

const TARGET_BOOKING_IDS = ["SB-VNE-20261115-CP003", "SB-PHSS-J-20261108-KD001"];

// Reconciles a specific out-of-band Stripe payment (made via a Dashboard
// Payment Link, not this app's per-installment checkout, so it never wrote a
// stripePayments doc) with what an admin had manually — and incorrectly —
// typed into the grid. Source of truth: Stripe payment intent
// pi_3TzEy9Fv3pifuM661A8kIKD9, £475.00 GBP, paid 31 Jul 2026 11:51 UTC.
const MANUAL_FIELD_OVERRIDES: Record<string, Record<string, unknown>> = {
  "SB-VNE-20261115-CP003": {
    p1Amount: 475,
    p1DatePaid: new Date("2026-07-31T11:51:00Z"),
  },
};

const APPLY = process.argv.includes("--apply");
const { db, projectId } = initFirestore(targetFromArgv());
console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

type FieldChange = { field: string; from: unknown; to: unknown };
type BookingChange = { docId: string; bookingId: string; changes: FieldChange[] };

function computeCorrectedFields(booking: any): Record<string, unknown> {
  const isMainBooker = booking.isMainBooker !== false;
  const discCost = toNumber(booking.discountedTourCost);
  const origCost = toNumber(booking.originalTourCost);
  const baseCost = discCost > 0 ? discCost : origCost;
  const reservationFee = toNumber(booking.reservationFee);
  const total = baseCost - reservationFee;

  const plan = (booking.paymentPlan || "").trim();
  const terms = getPaymentPlanTerms(plan);

  const result: Record<string, unknown> = {};

  if (plan === "Full Payment" || booking.paymentCondition === "Last Minute Booking") {
    const newFullPaymentAmount = getFullPaymentRemainingFunction(
      booking.tourPackageName,
      plan,
      isMainBooker,
      toNumber(booking.discountedTourCost),
      toNumber(booking.originalTourCost),
      reservationFee,
      toNumber(booking.manualCredit),
      booking.paymentCondition,
    );
    result.fullPaymentAmount = newFullPaymentAmount;
  } else if (terms > 0) {
    const allocations = allocateInstallmentAmountsWithPaidLocks(
      total,
      terms,
      booking.creditFrom,
      booking.manualCredit,
      [booking.p1Amount, booking.p2Amount, booking.p3Amount, booking.p4Amount],
      [booking.p1DatePaid, booking.p2DatePaid, booking.p3DatePaid, booking.p4DatePaid],
    );
    ["p1Amount", "p2Amount", "p3Amount", "p4Amount"].forEach((field, i) => {
      if (i < terms) result[field] = roundCurrency(allocations[i] ?? 0);
    });
  }

  const newFullPaymentAmount = (result.fullPaymentAmount as number) ?? toNumber(booking.fullPaymentAmount);
  const newP1 = (result.p1Amount as number) ?? toNumber(booking.p1Amount);
  const newP2 = (result.p2Amount as number) ?? toNumber(booking.p2Amount);
  const newP3 = (result.p3Amount as number) ?? toNumber(booking.p3Amount);
  const newP4 = (result.p4Amount as number) ?? toNumber(booking.p4Amount);

  const newPaid = getTotalPaidAmountFunction(
    booking.tourPackageName,
    reservationFee,
    booking.creditFrom,
    booking.manualCredit,
    booking.fullPaymentDatePaid,
    newFullPaymentAmount,
    booking.p1DatePaid,
    newP1,
    booking.p2DatePaid,
    newP2,
    booking.p3DatePaid,
    newP3,
    booking.p4DatePaid,
    newP4,
    booking.p1LateFeesPenalty,
    booking.p2LateFeesPenalty,
    booking.p3LateFeesPenalty,
    booking.p4LateFeesPenalty,
  );
  result.paid = newPaid;

  const newRemainingBalance = getRemainingBalanceFunction(
    booking.tourPackageName,
    isMainBooker,
    toNumber(booking.discountedTourCost),
    toNumber(booking.originalTourCost),
    reservationFee,
    booking.creditFrom,
    booking.manualCredit,
    plan,
    booking.fullPaymentDatePaid,
    newFullPaymentAmount,
    booking.p1DatePaid,
    newP1,
    booking.p2DatePaid,
    newP2,
    booking.p3DatePaid,
    newP3,
    booking.p4DatePaid,
    newP4,
    booking.p1LateFeesPenalty,
    booking.p2LateFeesPenalty,
    booking.p3LateFeesPenalty,
    booking.p4LateFeesPenalty,
  );
  result.remainingBalance = newRemainingBalance;

  result.bookingStatus = bookingStatusFunction(
    booking.reasonForCancellation,
    plan,
    newRemainingBalance,
    booking.fullPaymentDatePaid,
    booking.p1DatePaid,
    booking.p2DatePaid,
    booking.p3DatePaid,
    booking.p4DatePaid,
  );

  return result;
}

async function main() {
  const bookingChanges: BookingChange[] = [];

  for (const bookingId of TARGET_BOOKING_IDS) {
    const snap = await db.collection("bookings").where("bookingId", "==", bookingId).get();
    if (snap.empty) {
      console.log(`!! No booking found with bookingId = ${bookingId} — skipping.`);
      continue;
    }

    for (const doc of snap.docs) {
      const booking = doc.data();
      console.log("=".repeat(72));
      console.log(`  ${bookingId}  (doc ${doc.id})`);
      console.log("=".repeat(72));
      console.log("  current:", {
        paymentPlan: booking.paymentPlan,
        creditFrom: booking.creditFrom,
        manualCredit: booking.manualCredit,
        discountedTourCost: booking.discountedTourCost,
        originalTourCost: booking.originalTourCost,
        reservationFee: booking.reservationFee,
        fullPaymentAmount: booking.fullPaymentAmount,
        p1Amount: booking.p1Amount,
        p2Amount: booking.p2Amount,
        p3Amount: booking.p3Amount,
        p4Amount: booking.p4Amount,
        paid: booking.paid,
        remainingBalance: booking.remainingBalance,
        bookingStatus: booking.bookingStatus,
      });

      const overrides = MANUAL_FIELD_OVERRIDES[bookingId] ?? {};
      const changes: FieldChange[] = [];

      // Manual overrides (reconciling a specific out-of-band payment) apply
      // first; downstream amounts are then recomputed from the corrected data.
      for (const [field, to] of Object.entries(overrides)) {
        changes.push({ field, from: booking[field], to });
      }
      const patchedBooking = { ...booking, ...overrides };

      const corrected = computeCorrectedFields(patchedBooking);
      for (const [field, to] of Object.entries(corrected)) {
        const from = booking[field];
        const fromNum = typeof from === "number" ? roundCurrency(from) : from;
        const toNum = typeof to === "number" ? roundCurrency(to) : to;
        if (fromNum !== toNum) {
          changes.push({ field, from, to });
        }
      }

      if (changes.length === 0) {
        console.log("  No change — already correct.\n");
        continue;
      }

      console.log("  PLANNED CHANGES:");
      for (const c of changes) {
        console.log(`    ${c.field.padEnd(18)} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
      }
      console.log("");

      bookingChanges.push({ docId: doc.id, bookingId, changes });
    }
  }

  if (!APPLY) {
    console.log(`DRY RUN — nothing written. Re-run with --apply.`);
    return;
  }
  if (bookingChanges.length === 0) {
    console.log(`Nothing to apply.`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackPath = path.resolve(__dirname, `rollback-manual-credit-${stamp}.json`);
  writeFileSync(
    rollbackPath,
    JSON.stringify({ project: projectId, takenAt: stamp, bookingChanges }, null, 2),
  );
  console.log(`Rollback snapshot -> ${rollbackPath}`);

  for (const b of bookingChanges) {
    const fields: Record<string, unknown> = {};
    for (const c of b.changes) fields[c.field] = c.to;
    await db.doc(`bookings/${b.docId}`).update(fields);
    console.log(`  updated ${b.bookingId} (doc ${b.docId})`);
  }

  console.log(`\nWrote corrected fields for ${bookingChanges.length} booking(s).`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
