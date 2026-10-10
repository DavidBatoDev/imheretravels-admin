#!/usr/bin/env tsx
/**
 * Imports guest passport-form data into the server-only `guestPassportData`
 * collection (one doc per booking code).
 *
 * This data used to live in src/data/guest-passport-data.ts, which shipped it
 * inside the browser bundle of /reports/customers. It now lives in Firestore,
 * is denied to every client by firestore.rules, and is read only by
 * /api/reports/guest-passport-data behind requireStaff.
 *
 * The input file holds personal data, so it is NEVER committed: pass a path
 * outside the repo. Dry run by default; --apply writes. Re-running is safe
 * (each doc is overwritten with the same content).
 *
 * Usage:
 *   npm run import:guest-passport-data -- --dev --file C:/secure/guest-passport-data.json
 *   npm run import:guest-passport-data -- --prod --file C:/secure/guest-passport-data.json --apply
 */

import fs from "fs";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

interface GuestPassportEntry {
  source: string;
  fullName: string;
  nationality: string;
  country: string;
  birthdate: string; // YYYY-MM-DD
  gender: string;
  passportLink: string;
}

const COLLECTION = "guestPassportData";
const APPLY = process.argv.includes("--apply");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = argValue("--file");
  if (!file) throw new Error("Pass --file <path to JSON outside the repo>.");
  if (fs.realpathSync(file).replace(/\\/g, "/").includes("/admin/")) {
    throw new Error("Refusing to read personal data from inside the repo; move the file outside it.");
  }

  const entries = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, GuestPassportEntry>;
  const codes = Object.keys(entries);
  const { db } = initFirestore(targetFromArgv());
  console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`  entries: ${codes.length} -> ${COLLECTION}/{bookingCode}\n`);

  const invalid = codes.filter((c) => !c || c.includes("/") || !entries[c].passportLink);
  if (invalid.length) throw new Error(`Invalid entries: ${invalid.join(", ")}`);

  if (!APPLY) {
    console.log("  Dry run only. Re-run with --apply to write.");
    return;
  }

  for (let i = 0; i < codes.length; i += 400) {
    const batch = db.batch();
    for (const code of codes.slice(i, i + 400)) {
      batch.set(db.collection(COLLECTION).doc(code), {
        ...entries[code],
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
        importSource: "src/data/guest-passport-data.ts (removed 2026-10-10)",
      });
    }
    await batch.commit();
  }
  console.log(`  Wrote ${codes.length} documents.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
