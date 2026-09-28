#!/usr/bin/env tsx
/**
 * One-off: record two facts Bella confirmed on 2026-09-28, both backed by Stripe.
 *
 * 1. Grace Dervan (SB-IHF-20260301-GD029) paid for a private room.
 *    Stripe: £849 balance AND £350 on 8 Jan 2026, same card.
 *    → add-on "Private room" £350 paid 2026-01-08; the £849 balance payment is
 *      re-dated from the tour date (a placeholder) to 2026-01-08; paid = £1,349.
 *
 * 2. Madison Tom (SB-PHSR-20260804-MT022) — IHT cancelled the tour and the
 *    £150 deposit was refunded. Stripe: refund £150 on 1 Aug 2026.
 *    → cancellationRequestDate = 2026-08-01 (refund date; the true request can't
 *      be later), refundableAmount = £150 (what the Refundable Amount column
 *      computes for an IHT cancellation once a date exists).
 *
 * Email safety: none of these fields is a trigger (triggers need a flag to flip
 * false→true or paymentProgress to newly reach 100%); paymentProgress is not
 * touched. Dates are stored at UTC midnight like the rest of the book.
 *
 * Usage: npx tsx scripts/apply-bella-answers-2026-09-28.ts --prod [--apply]
 */
import fs from "fs";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const APPLY = process.argv.includes("--apply");
const utc = (y: number, m: number, d: number) => admin.firestore.Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d)));
const fmt = (v: any) => (v?.toDate ? v.toDate().toISOString().slice(0, 10) : v === undefined ? "(unset)" : JSON.stringify(v));

type Change = { id: string; name: string; check: (b: any) => string | null; update: Record<string, unknown> };

const CHANGES: Change[] = [
  {
    id: "fXRULNQ9xywMhnSKJg02",
    name: "Grace Dervan",
    check: (b) =>
      Array.isArray(b.addOns) && b.addOns.length ? "already has add-ons"
      : Number(b.fullPaymentAmountPaid) !== 849 ? `expected fullPaymentAmountPaid 849, found ${b.fullPaymentAmountPaid}`
      : null,
    update: {
      addOns: [
        {
          id: "ao_grace_private_room",
          item: "Private room",
          amount: 350,
          datePaid: "2026-01-08",
          notes: "Paid by card on 8 Jan 2026 together with the £849 balance (Stripe). Confirmed by Bella 28 Sep 2026.",
        },
      ],
      fullPaymentDatePaid: utc(2026, 1, 8),
      paid: 1349,
    },
  },
  {
    id: "lYwwppCzBD4jO9q0VU9O",
    name: "Madison Tom",
    check: (b) =>
      !String(b.reasonForCancellation ?? "").startsWith("IHT") ? `expected an IHT cancellation reason, found "${b.reasonForCancellation}"`
      : b.cancellationRequestDate ? "cancellationRequestDate already set"
      : null,
    update: {
      cancellationRequestDate: utc(2026, 8, 1),
      refundableAmount: 150,
    },
  },
];

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log(APPLY ? "  MODE: APPLY\n" : "  MODE: DRY RUN (no writes)\n");
  const before: Record<string, unknown> = {};

  for (const c of CHANGES) {
    const snap = await db.collection("bookings").doc(c.id).get();
    if (!snap.exists) throw new Error(`${c.id} not found`);
    const b = snap.data()!;
    if (b.fullName !== c.name) throw new Error(`Safety: ${c.id} is "${b.fullName}", expected "${c.name}"`);
    const problem = c.check(b);
    if (problem) throw new Error(`Safety (${c.name}): ${problem}`);
    before[c.id] = b;
    console.log(`${c.name}  ${b.bookingId}`);
    for (const [k, v] of Object.entries(c.update)) console.log(`  ${k.padEnd(24)} ${fmt(b[k]).slice(0, 40).padEnd(42)} -> ${fmt(v).slice(0, 90)}`);
  }

  if (!APPLY) { console.log("\nDry run. --apply to write."); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(`rollback-bella-answers-${stamp}.json`, JSON.stringify(before, null, 2));
  const batch = db.batch();
  for (const c of CHANGES) batch.update(db.collection("bookings").doc(c.id), { ...c.update, updatedAt: admin.firestore.Timestamp.now() });
  await batch.commit();
  console.log(`\nApplied. Rollback snapshot: rollback-bella-answers-${stamp}.json`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
