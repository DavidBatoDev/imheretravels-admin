#!/usr/bin/env tsx
/**
 * Normalises booking money fields to real numbers.
 *
 * Every affected booking was created on 2025-12-19 by the legacy Google Sheets
 * import, which wrote everything as strings. Nothing created after that date is
 * affected — see scripts/audit-booking-money-types.ts.
 *
 * Conversions:
 *   "1100"  → 1100     numeric strings become numbers
 *   ""      → null     "not applicable", matching the convention already used by
 *                      the majority of rows (133 discountedTourCost and 106
 *                      fullPaymentAmount are already null). NOT 0 — zero is a
 *                      real price meaning "free".
 *
 * A string that does not round-trip exactly through Number() is reported and
 * skipped rather than guessed at.
 *
 * `paid` and `remainingBalance` are already 100% numeric and are not touched.
 *
 * Dry run by default; --apply writes.
 *
 * Usage:
 *   npm run fix:booking-money -- --prod
 *   npm run fix:booking-money -- --prod --apply
 */

import path from "path";
import { writeFileSync } from "fs";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const FIELDS = [
  "originalTourCost",
  "discountedTourCost",
  "reservationFee",
  "fullPaymentAmount",
] as const;

const APPLY = process.argv.includes("--apply");
const { db, projectId } = initFirestore(targetFromArgv());
console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

type Change = { id: string; field: string; from: unknown; to: number | null };

async function main() {
  const snap = await db.collection("bookings").get();
  const bookings = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const changes: Change[] = [];
  const skipped: { id: string; field: string; value: unknown; why: string }[] = [];

  for (const b of bookings) {
    for (const field of FIELDS) {
      const v = (b as any)[field];
      if (typeof v !== "string") continue; // numbers, null and undefined are fine

      const trimmed = v.trim();
      if (trimmed === "") {
        changes.push({ id: b.id, field, from: v, to: null });
        continue;
      }

      const n = Number(trimmed);
      // Only convert when the value round-trips exactly — no silent reshaping
      // of things like "1,100", "£999" or "12abc".
      if (!Number.isFinite(n) || String(n) !== trimmed) {
        skipped.push({ id: b.id, field, value: v, why: "does not round-trip through Number()" });
        continue;
      }
      changes.push({ id: b.id, field, from: v, to: n });
    }
  }

  const byField = new Map<string, { toNumber: number; toNull: number }>();
  for (const c of changes) {
    const e = byField.get(c.field) ?? { toNumber: 0, toNull: 0 };
    if (c.to === null) e.toNull++;
    else e.toNumber++;
    byField.set(c.field, e);
  }

  console.log(`PLANNED CHANGES  (${changes.length} field writes across ${new Set(changes.map((c) => c.id)).size} bookings)`);
  console.log("-".repeat(72));
  for (const [field, e] of byField) {
    console.log(`  ${field.padEnd(22)} ${String(e.toNumber).padStart(4)} → number   ${String(e.toNull).padStart(4)} → null`);
  }

  if (skipped.length) {
    console.log(`\n!! SKIPPED (${skipped.length}) — needs a human decision:`);
    for (const s of skipped) {
      console.log(`   ${s.id}  ${s.field} = ${JSON.stringify(s.value)}  (${s.why})`);
    }
  } else {
    console.log(`\n  No ambiguous values — every string is a clean integer or empty.`);
  }

  console.log(`\nSAMPLE (first 12):`);
  for (const c of changes.slice(0, 12)) {
    console.log(`   ${c.id}  ${c.field.padEnd(20)} ${JSON.stringify(c.from).padEnd(10)} → ${JSON.stringify(c.to)}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply.`);
    return;
  }
  if (!changes.length) {
    console.log(`\nNothing to do.`);
    return;
  }

  // Write a rollback artifact BEFORE touching anything, so the previous values
  // survive even if the batch fails partway.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackPath = path.resolve(__dirname, "..", `rollback-booking-money-${stamp}.json`);
  writeFileSync(
    rollbackPath,
    JSON.stringify({ project: projectId, takenAt: stamp, changes }, null, 2),
  );
  console.log(`\nRollback snapshot → ${rollbackPath}`);

  // Group per document so each booking is one update.
  const perDoc = new Map<string, Record<string, number | null>>();
  for (const c of changes) {
    const e = perDoc.get(c.id) ?? {};
    e[c.field] = c.to;
    perDoc.set(c.id, e);
  }

  const entries = [...perDoc];
  let written = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [id, fields] of entries.slice(i, i + 400)) {
      batch.update(db.doc(`bookings/${id}`), fields);
    }
    await batch.commit();
    written += Math.min(400, entries.length - i);
    console.log(`  committed ${written}/${entries.length}`);
  }
  console.log(`\nWROTE ${changes.length} field(s) across ${entries.length} booking(s).`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
