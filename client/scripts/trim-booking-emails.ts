#!/usr/bin/env tsx
/**
 * Trims stray whitespace / invisible characters from booking email fields.
 *
 * Emails pasted into the admin sheet with a leading space (e.g.
 * " ciara.murphy.henze@gmail.com") still receive Gmail emails, but Stripe
 * rejects them, so the guest sees "Invalid email address" and cannot pay.
 * New writes are now normalised (src/lib/email-normalize.ts); this repairs the
 * bookings saved before that.
 *
 * Only `emailAddress` / `email` are touched. Each write re-reads the booking in
 * a transaction and skips it if the value changed since the dry run.
 *
 * Dry run by default. --apply saves a rollback snapshot, then writes.
 *   npx tsx scripts/trim-booking-emails.ts --dev|--prod [--apply]
 *   npx tsx scripts/trim-booking-emails.ts --dev|--prod --rollback <file> [--apply]
 *
 * Credentials come from keys/<target>-project-service-account.json (the
 * .env.local loader only carries one project's admin key).
 */

import path from "path";
import { readFileSync, writeFileSync } from "fs";
import admin from "firebase-admin";
import { targetFromArgv } from "./lib/firebase-target";
import {
  BOOKING_EMAIL_FIELDS,
  isValidEmail,
  normalizeEmail,
} from "../src/lib/email-normalize";

const APPLY = process.argv.includes("--apply");
const rollbackIdx = process.argv.indexOf("--rollback");
const ROLLBACK_FILE = rollbackIdx >= 0 ? process.argv[rollbackIdx + 1] : null;

const target = targetFromArgv();
const creds = require(
  path.resolve(__dirname, `../keys/${target}-project-service-account.json`),
);
admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();
const projectId: string = creds.project_id;

console.log("=".repeat(72));
console.log(`  TARGET: ${target.toUpperCase()}  (${projectId})`);
console.log(`  mode:   ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
if (ROLLBACK_FILE) console.log(`  rollback from: ${ROLLBACK_FILE}`);
console.log("=".repeat(72) + "\n");

type Change = { field: string; from: string; to: string };
type Planned = { docId: string; bookingId: string; changes: Change[] };

async function planTrim(): Promise<Planned[]> {
  const snap = await db.collection("bookings").get();
  const planned: Planned[] = [];
  for (const doc of snap.docs) {
    const b = doc.data();
    const changes: Change[] = [];
    for (const field of BOOKING_EMAIL_FIELDS) {
      const from = b[field];
      if (typeof from !== "string") continue;
      const to = normalizeEmail(from);
      if (to !== from) changes.push({ field, from, to });
    }
    if (changes.length) planned.push({ docId: doc.id, bookingId: b.bookingId, changes });
  }
  console.log(`Scanned ${snap.size} bookings.`);
  return planned;
}

/** Reverses a snapshot written by --apply: puts `from` back where `to` is still stored. */
function planRollback(file: string): Planned[] {
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  if (snapshot.project !== projectId) {
    throw new Error(
      `Rollback file is for ${snapshot.project}, but target is ${projectId}.`,
    );
  }
  return (snapshot.planned as Planned[]).map((p) => ({
    ...p,
    changes: p.changes.map((c) => ({ field: c.field, from: c.to, to: c.from })),
  }));
}

async function main() {
  const planned = ROLLBACK_FILE ? planRollback(ROLLBACK_FILE) : await planTrim();

  for (const p of planned) {
    console.log(`${p.bookingId}  (doc ${p.docId})`);
    for (const c of p.changes) {
      const note = ROLLBACK_FILE || isValidEmail(c.to) ? "" : "   ⚠ still not a valid email";
      console.log(`    ${c.field.padEnd(13)} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}${note}`);
    }
  }
  console.log(`\n${planned.length} booking(s) affected.`);

  if (!APPLY || planned.length === 0) {
    if (!APPLY) console.log("DRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  if (!ROLLBACK_FILE) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rollbackPath = path.resolve(__dirname, `rollback-trim-booking-emails-${stamp}.json`);
    writeFileSync(rollbackPath, JSON.stringify({ project: projectId, takenAt: stamp, planned }, null, 2));
    console.log(`Rollback snapshot -> ${rollbackPath}`);
  }

  let written = 0;
  for (const p of planned) {
    const ref = db.doc(`bookings/${p.docId}`);
    const result = await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (!current) return "missing";
      const stale = p.changes.find((c) => current[c.field] !== c.from);
      if (stale) return `skipped: ${stale.field} is now ${JSON.stringify(current[stale.field])}`;
      tx.update(ref, Object.fromEntries(p.changes.map((c) => [c.field, c.to])));
      return "updated";
    });
    if (result === "updated") written++;
    console.log(`  ${p.bookingId}: ${result}`);
  }
  console.log(`\n${written}/${planned.length} booking(s) written.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
