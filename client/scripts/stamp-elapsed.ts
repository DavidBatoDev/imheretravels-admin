#!/usr/bin/env tsx
/**
 * One-off / catch-up: stamp bookingStatus = "Elapsed" on bookings whose tour
 * has ENDED (return date, fallback tour date) with a balance still owing, and
 * preserve the status being replaced in `statusBeforeElapsed`.
 *
 * The daily Cloud Function `elapseBookingsDaily` does the same thing going
 * forward; this script exists to catch up the backlog and to re-run safely
 * (idempotent: already-Elapsed rows are skipped).
 *
 * Rules (must match functions/src/scheduled-elapse-bookings.ts):
 *   - skip if cancelled (reasonForCancellation set OR status contains "cancelled")
 *   - skip if already "Elapsed"
 *   - tour ended: returnDate < today (fallback tourDate)
 *   - owing: remainingBalance > 0  (the grid's own number)
 *
 * Emails: bookingStatus text is not a trigger. paymentProgress is untouched,
 * so onPaymentComplete / onGuestInvitationTrigger cannot fire.
 *
 * Usage: npx tsx scripts/stamp-elapsed.ts --prod [--apply]
 */
import fs from "fs";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const APPLY = process.argv.includes("--apply");
const toDate = (v: any): Date | null => (!v ? null : v.toDate ? v.toDate() : isNaN(new Date(v).getTime()) ? null : new Date(v));

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log(APPLY ? "  MODE: APPLY\n" : "  MODE: DRY RUN (no writes)\n");
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const snap = await db.collection("bookings").get();
  const targets: { id: string; name: string; before: string; owed: number; ended: string }[] = [];
  for (const d of snap.docs) {
    const b: any = d.data();
    const status = String(b.bookingStatus ?? "");
    if (String(b.reasonForCancellation ?? "").trim() || status.toLowerCase().includes("cancelled")) continue;
    if (status.trim().toLowerCase() === "elapsed") continue;
    const end = toDate(b.returnDate) ?? toDate(b.tourDate);
    if (!end || !(end < startOfToday)) continue;
    const owed = Number(b.remainingBalance) || 0;
    if (owed <= 0) continue;
    targets.push({ id: d.id, name: b.fullName, before: status, owed, ended: end.toISOString().slice(0, 10) });
  }

  console.log(`Bookings to stamp Elapsed: ${targets.length}`);
  console.table(targets.map((t) => ({ name: t.name, ended: t.ended, owed: t.owed, statusBefore: t.before || "(blank)" })));
  if (!APPLY) { console.log("\nDry run. --apply to write."); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(`rollback-elapsed-${stamp}.json`, JSON.stringify(targets, null, 2));
  const batch = db.batch();
  for (const t of targets) {
    batch.update(db.collection("bookings").doc(t.id), {
      bookingStatus: "Elapsed",
      statusBeforeElapsed: t.before,
      elapsedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
  await batch.commit();
  console.log(`\nStamped ${targets.length}. Rollback (restore bookingStatus from statusBefore): rollback-elapsed-${stamp}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
