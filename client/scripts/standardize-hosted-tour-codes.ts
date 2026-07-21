#!/usr/bin/env tsx
/**
 * Brings every hosted tour's `tourCode` onto the `{BASE}-{HOST INITIALS}`
 * convention, using the same derivation the Settings panel auto-fill uses.
 *
 * MUST run after scripts/backfill-booking-tour-id.ts. Bookings historically
 * resolve to their tour by `tourCode`; renaming codes first would orphan them.
 * Existing bookings keep their original code as a historical record — this only
 * touches tourPackages.
 *
 * Dry run by default; --apply writes.
 *
 * Usage:
 *   npm run standardize:hosted-codes -- --prod
 *   npm run standardize:hosted-codes -- --prod --apply
 */

import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import { deriveHostedTourCode } from "../src/lib/hosted-tour-code";

const APPLY = process.argv.includes("--apply");
const { db } = initFirestore(targetFromArgv());
console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

async function main() {
  const [tourSnap, bookingSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
  ]);
  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const missingTourId = bookings.filter((b) => !b.tourId).length;
  if (missingTourId > 0) {
    console.error(
      `REFUSING: ${missingTourId} booking(s) have no tourId. Run backfill-booking-tour-id first —\n` +
        `renaming codes now would orphan them.`,
    );
    process.exit(1);
  }

  const hosted = tours.filter((t) => t.isHosted === true);
  const changes = hosted
    .map((t) => ({ t, next: deriveHostedTourCode(t.name, t.tourCode) }))
    .filter((c) => c.next && c.next !== c.t.tourCode);

  console.log(`${hosted.length} hosted tour(s); ${changes.length} need a code change.\n`);
  for (const { t, next } of changes) {
    const affected = bookings.filter((b) => b.tourId === t.id).length;
    console.log(`  ${String(t.name).padEnd(44)} ${String(t.tourCode).padEnd(8)} → ${next.padEnd(8)}  (${affected} booking(s) keep their old code)`);
  }
  for (const t of hosted.filter((t) => !changes.some((c) => c.t.id === t.id))) {
    console.log(`  ${String(t.name).padEnd(44)} ${String(t.tourCode).padEnd(8)}   already standard`);
  }

  // A rename must not collide with a code another tour already holds.
  const taken = new Map(tours.map((t) => [String(t.tourCode ?? "").toLowerCase(), t]));
  for (const { t, next } of changes) {
    const clash = taken.get(next.toLowerCase());
    if (clash && clash.id !== t.id) {
      console.error(`\nREFUSING: "${next}" is already used by "${clash.name}".`);
      process.exit(1);
    }
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written.");
    return;
  }
  if (!changes.length) {
    console.log("\nNothing to do.");
    return;
  }

  const batch = db.batch();
  for (const { t, next } of changes) {
    batch.update(db.doc(`tourPackages/${t.id}`), {
      tourCode: next,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
  await batch.commit();
  console.log(`\nWROTE ${changes.length} tour code(s).`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
