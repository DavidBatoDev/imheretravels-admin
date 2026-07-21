#!/usr/bin/env tsx
/**
 * Changes a single tour's `tourCode`.
 *
 * Only the tourPackages document is touched. Existing bookings keep their own
 * `tourCode` field exactly as sold — that value is the historical record of what
 * the trip was called at the time, and reports/reviews resolve through `tourId`,
 * which does not change. Only bookings created AFTER this runs pick up the new
 * code (create-bookings-from-payment.ts reads it off the tour package).
 *
 * Guards, all fatal:
 *   - every booking must already carry a tourId, or the rename would orphan it
 *   - the new code must not collide with another tour
 *
 * Dry run by default; --apply writes.
 *
 * Usage:
 *   npm run set:tour-code -- --prod --tour <docId> --code SLWCC
 *   npm run set:tour-code -- --prod --tour <docId> --code SLWCC --apply
 */

import path from "path";
import { writeFileSync } from "fs";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const argv = process.argv;
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const APPLY = argv.includes("--apply");
const tourId = flag("tour");
const newCode = flag("code")?.trim();

if (!tourId || !newCode) {
  console.error("Usage: --tour <docId> --code <NEWCODE> [--apply] --prod|--dev");
  process.exit(1);
}

const { db, projectId } = initFirestore(targetFromArgv());
console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

async function main() {
  const ref = db.doc(`tourPackages/${tourId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No tour with id ${tourId}`);
    process.exit(1);
  }
  const tour = snap.data() as any;
  const oldCode = tour.tourCode;

  const [allTours, allBookings] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
  ]);
  const tours = allTours.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = allBookings.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  console.log(`TOUR : ${tour.name}`);
  console.log(`       ${tourId}`);
  console.log(`CODE : ${oldCode}  →  ${newCode}\n`);

  if (oldCode === newCode) {
    console.log("Already set. Nothing to do.");
    return;
  }

  // Guard: a rename is only safe once bookings resolve by id.
  const noTourId = bookings.filter((b) => !b.tourId);
  if (noTourId.length) {
    console.error(
      `REFUSING: ${noTourId.length} booking(s) have no tourId. Run backfill-booking-tour-id first —\n` +
        `renaming the code would orphan them.`,
    );
    process.exit(1);
  }

  // Guard: no collision.
  const clash = tours.find(
    (t) => t.id !== tourId && String(t.tourCode ?? "").toLowerCase() === newCode!.toLowerCase(),
  );
  if (clash) {
    console.error(`REFUSING: "${newCode}" is already used by "${clash.name}" (${clash.id}).`);
    process.exit(1);
  }

  // Report exactly what keeps the old code.
  const mine = bookings.filter((b) => b.tourId === tourId);
  const keepingOld = mine.filter((b) => String(b.tourCode ?? "") === String(oldCode ?? ""));
  console.log(`${mine.length} booking(s) belong to this tour (matched by tourId).`);
  console.log(`  ${keepingOld.length} of them store tourCode="${oldCode}" and will KEEP it — untouched.`);
  console.log(`  They stay linked through tourId, which is not changing.`);
  console.log(`  Only bookings created after this runs will carry "${newCode}".\n`);

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackPath = path.resolve(__dirname, "..", `rollback-tour-code-${stamp}.json`);
  writeFileSync(
    rollbackPath,
    JSON.stringify({ project: projectId, tourId, name: tour.name, from: oldCode, to: newCode }, null, 2),
  );
  console.log(`Rollback snapshot → ${rollbackPath}`);

  await ref.update({ tourCode: newCode, updatedAt: admin.firestore.Timestamp.now() });
  const after = (await ref.get()).data() as any;
  console.log(`\nWROTE. tourCode is now "${after.tourCode}".`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
