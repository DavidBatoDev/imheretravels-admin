#!/usr/bin/env tsx
/**
 * Delete a duplicate booking document, safely.
 *
 * Refuses unless:
 *   - --expect-name matches the booking's fullName
 *   - --keep <docId> exists and is the SAME guest (email), tour and tour date
 *     (i.e. the booking being deleted really is a duplicate of one we keep)
 *   - the booking being deleted has no confirmedBookings record and no
 *     PENDING scheduled emails (sent ones are history and are left alone)
 *
 * Writes a full rollback snapshot (the document itself) before deleting.
 * There are no onDelete Cloud Function triggers on bookings, so deleting
 * fires nothing. Dry run unless --apply.
 *
 * Usage:
 *   npx tsx scripts/delete-duplicate-booking.ts --prod --id <dup> --keep <kept> --expect-name "Clare Bradford" [--apply]
 */
import fs from "fs";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const opt = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes("--apply");
const DUP = opt("id");
const KEEP = opt("keep");
const NAME = opt("expect-name");
const d10 = (v: any) => (v?.toDate ? v.toDate().toISOString().slice(0, 10) : String(v ?? ""));

async function main() {
  if (!DUP || !KEEP || !NAME) throw new Error('Required: --id <dup> --keep <kept> --expect-name "<name>"');
  if (DUP === KEEP) throw new Error("--id and --keep must differ");
  const { db } = initFirestore(targetFromArgv());
  console.log(APPLY ? "  MODE: APPLY\n" : "  MODE: DRY RUN (no writes)\n");

  const [dupSnap, keepSnap] = await Promise.all([db.collection("bookings").doc(DUP).get(), db.collection("bookings").doc(KEEP).get()]);
  if (!dupSnap.exists) throw new Error(`Booking ${DUP} not found`);
  if (!keepSnap.exists) throw new Error(`Booking to keep ${KEEP} not found`);
  const dup: any = dupSnap.data(), keep: any = keepSnap.data();

  if (dup.fullName !== NAME) throw new Error(`Safety: expected "${NAME}", found "${dup.fullName}"`);
  const same = (k: string, f = (v: any) => String(v ?? "").toLowerCase().trim()) => f(dup[k]) === f(keep[k]);
  for (const [k, f] of [["emailAddress", undefined], ["tourPackageName", undefined], ["tourDate", d10]] as const) {
    if (!same(k, f as any)) throw new Error(`Safety: ${k} differs between duplicate and kept booking`);
  }

  const cb = await db.collection("confirmedBookings").where("bookingDocumentId", "==", DUP).get();
  if (!cb.empty) throw new Error(`Safety: duplicate has ${cb.size} confirmedBookings record(s)`);
  const se = await db.collection("scheduledEmails").where("bookingId", "==", DUP).get();
  const pending = se.docs.filter((d) => d.data().status === "pending");
  if (pending.length) throw new Error(`Safety: duplicate has ${pending.length} PENDING scheduled email(s); cancel them first`);
  const subs = await dupSnap.ref.listCollections();

  console.log(`DELETE  ${DUP}  ${dup.bookingId}  "${dup.bookingStatus}"  paid=${dup.paid} progress=${dup.paymentProgress}`);
  console.log(`KEEP    ${KEEP}  ${keep.bookingId}  "${keep.bookingStatus}"  paid=${keep.paid} progress=${keep.paymentProgress}`);
  console.log(`  same guest/tour/date: yes · confirmedBookings: 0 · scheduledEmails: ${se.size} (pending 0, kept as history) · subcollections: ${subs.map((c) => c.id).join(",") || "none"}`);
  if (subs.length) throw new Error("Safety: duplicate has subcollections; handle them explicitly");

  if (!APPLY) { console.log("\nDry run. --apply to delete."); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `rollback-deleted-${DUP}-${stamp}.json`;
  fs.writeFileSync(file, JSON.stringify({ collection: "bookings", id: DUP, data: dup }, null, 2));
  await dupSnap.ref.delete();
  const gone = !(await db.collection("bookings").doc(DUP).get()).exists;
  console.log(`\nDeleted: ${gone}. Snapshot: ${file} (restore by writing 'data' back to bookings/${DUP}).`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
