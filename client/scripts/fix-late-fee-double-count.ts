#!/usr/bin/env tsx
/**
 * Repairs bookings where a paid installment's late fee was double-counted.
 *
 * The Stripe webhook used to write the full charge (base + late fee) into
 * pNAmount / pNAmountPaid, while the fee also stays in pNLateFeesPenalty. The
 * fee was then counted twice in Paid and the balance was too low by the same
 * amount (e.g. SB-PHSS-R-20270218-OA001: P1 £257.24 instead of £249.75).
 *
 * Detection: the term is paid, has a late fee, and its stripePayments doc has
 * baseAmount + lateFeeAmount = the stored pNAmount. The fix sets pNAmount and
 * pNAmountPaid back to baseAmount, then recomputes paid and remainingBalance.
 *
 * This is a dry run by default. --apply writes the changes, after it saves a rollback snapshot.
 *   npx tsx scripts/fix-late-fee-double-count.ts --prod [--apply]
 */

import path from "path";
import { writeFileSync } from "fs";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import {
  hasPaidDate,
  roundCurrency,
  toNumber,
} from "../src/app/functions/columns/payment-calculation-helpers";
import getTotalPaidAmountFunction from "../src/app/functions/columns/payment-setting/paid";
import getRemainingBalanceFunction from "../src/app/functions/columns/payment-setting/remaining-balance";

const APPLY = process.argv.includes("--apply");
const { db, projectId } = initFirestore(targetFromArgv());
console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

const TERMS = ["p1", "p2", "p3", "p4"] as const;
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

function recompute(b: any) {
  const pn = (f: string) => TERMS.map((t) => b[`${t}${f}`]);
  const [p1d, p2d, p3d, p4d] = pn("DatePaid");
  const [p1a, p2a, p3a, p4a] = pn("Amount");
  const [p1f, p2f, p3f, p4f] = pn("LateFeesPenalty");
  const [p1p, p2p, p3p, p4p] = pn("AmountPaid");
  const paid = getTotalPaidAmountFunction(
    b.tourPackageName, b.reservationFee, b.creditFrom, b.manualCredit,
    b.fullPaymentDatePaid, b.fullPaymentAmount,
    p1d, p1a, p2d, p2a, p3d, p3a, p4d, p4a,
    p1f, p2f, p3f, p4f,
    b.reservationAmountPaid, p1p, p2p, p3p, p4p, b.fullPaymentAmountPaid,
    b.addOns,
  );
  const remainingBalance = getRemainingBalanceFunction(
    b.tourPackageName, b.useDiscountedTourCost, b.discountedTourCost, b.originalTourCost,
    b.reservationFee, b.creditFrom, b.manualCredit, b.paymentPlan,
    b.fullPaymentDatePaid, b.fullPaymentAmount,
    p1d, p1a, p2d, p2a, p3d, p3a, p4d, p4a,
    p1f, p2f, p3f, p4f,
    b.reservationAmountPaid, p1p, p2p, p3p, p4p, b.fullPaymentAmountPaid,
    b.addOns,
  );
  return { paid, remainingBalance };
}

async function main() {
  const snap = await db.collection("bookings").get();
  const planned: { docId: string; bookingId: string; changes: Record<string, [unknown, unknown]> }[] = [];

  for (const doc of snap.docs) {
    const b = doc.data();
    // Fully settled bookings already absorbed the extra charge in later terms
    // (per-slot allocation shrank them) — rewriting P-amounts would reopen a
    // phantom balance, so leave them alone.
    if (toNumber(b.remainingBalance) <= 0) continue;
    const patch: Record<string, unknown> = {};

    for (const t of TERMS) {
      const fee = toNumber(b[`${t}LateFeesPenalty`]);
      const amount = toNumber(b[`${t}Amount`]);
      if (fee <= 0 || !hasPaidDate(b[`${t}DatePaid`])) continue;

      const pays = await db
        .collection("stripePayments")
        .where("booking.documentId", "==", doc.id)
        .where("payment.installmentTerm", "==", t)
        .get();
      const match = pays.docs
        .map((d) => d.data().payment ?? {})
        .find((p) => {
          const base = toNumber(p.baseAmount);
          return base > 0 && near(base + toNumber(p.lateFeeAmount), amount);
        });
      if (!match) continue;

      const base = roundCurrency(toNumber(match.baseAmount));
      patch[`${t}Amount`] = base;
      if (near(toNumber(b[`${t}AmountPaid`]), amount)) patch[`${t}AmountPaid`] = base;
    }

    if (Object.keys(patch).length === 0) continue;

    const next = recompute({ ...b, ...patch });
    patch.paid = next.paid;
    patch.remainingBalance = next.remainingBalance;

    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(patch)) changes[k] = [b[k], v];
    planned.push({ docId: doc.id, bookingId: b.bookingId, changes });

    console.log(`${b.bookingId}  ${b.fullName ?? ""}  (doc ${doc.id})`);
    for (const [k, [from, to]] of Object.entries(changes)) {
      console.log(`    ${k.padEnd(18)} ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    }
  }

  console.log(`\n${planned.length} booking(s) affected.`);
  if (!APPLY || planned.length === 0) {
    if (!APPLY) console.log("DRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackPath = path.resolve(__dirname, `rollback-late-fee-double-count-${stamp}.json`);
  writeFileSync(rollbackPath, JSON.stringify({ project: projectId, takenAt: stamp, planned }, null, 2));
  console.log(`Rollback snapshot -> ${rollbackPath}`);

  for (const p of planned) {
    const fields: Record<string, unknown> = {};
    for (const [k, [, to]] of Object.entries(p.changes)) fields[k] = to;
    await db.doc(`bookings/${p.docId}`).update(fields);
    console.log(`  updated ${p.bookingId}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
