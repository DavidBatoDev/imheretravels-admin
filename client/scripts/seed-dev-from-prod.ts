#!/usr/bin/env tsx
/**
 * Copies a collection from PROD into DEV so local development has real data.
 *
 * There is an existing scripts/sync-collection.js, but it needs service-account
 * JSON files on disk and only the dev key exists here — the prod credentials
 * live in .env.local. This reuses the same explicit-target loader as the other
 * scripts rather than materialising a prod key file.
 *
 * Direction is fixed: PROD → DEV. Writing to prod is refused outright; this is
 * a "give my local environment something to look at" tool, nothing more.
 *
 * Document ids are preserved, so anything referencing a doc by id still lines
 * up. Note that ids referencing OTHER collections (e.g. a host's
 * `attachedTourIds` → tourPackages) will dangle unless those are copied too.
 *
 * Dry run by default; --apply writes.
 *
 * Usage:
 *   npm run seed:dev -- --collection residentHost
 *   npm run seed:dev -- --collection residentHost --apply
 */

import admin from "firebase-admin";
import { loadCredentials } from "./lib/firebase-target";

const argv = process.argv;
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const collection = flag("collection");
const APPLY = argv.includes("--apply");
const WIPE = argv.includes("--wipe");

if (!collection) {
  console.error("Usage: --collection <name> [--wipe] [--apply]");
  process.exit(1);
}

const src = loadCredentials("prod");
const dest = loadCredentials("dev");

// Belt and braces: the loader picks by project id, but assert the direction so
// a future edit can't silently invert it.
if (src.projectId.includes("dev") || !dest.projectId.includes("dev")) {
  console.error(
    `REFUSING: resolved source="${src.projectId}" dest="${dest.projectId}". ` +
      `This tool only ever writes to a dev project.`,
  );
  process.exit(1);
}

const srcApp = admin.initializeApp({ credential: admin.credential.cert(src), projectId: src.projectId }, "src");
const destApp = admin.initializeApp({ credential: admin.credential.cert(dest), projectId: dest.projectId }, "dest");

console.log("=".repeat(72));
console.log(`  SEED DEV FROM PROD — collection "${collection}"`);
console.log(`  ${src.projectId}  →  ${dest.projectId}`);
console.log(`  mode: ${APPLY ? "APPLY (writes to dev)" : "DRY RUN (no writes)"}`);
console.log("=".repeat(72));

async function main() {
  const srcDb = srcApp.firestore();
  const destDb = destApp.firestore();

  const [srcSnap, destSnap] = await Promise.all([
    srcDb.collection(collection!).get(),
    destDb.collection(collection!).get(),
  ]);

  console.log(`\n${srcSnap.size} doc(s) in prod, ${destSnap.size} currently in dev.\n`);

  const srcIds = new Set(srcSnap.docs.map((d) => d.id));
  const extra = destSnap.docs.filter((d) => !srcIds.has(d.id));

  for (const d of srcSnap.docs) {
    const data = d.data() as any;
    const label = data.displayName ?? data.name ?? data.title ?? d.id;
    const exists = destSnap.docs.some((x) => x.id === d.id);
    console.log(`  ${exists ? "overwrite" : "create   "}  ${d.id}  ${label}`);
  }
  if (extra.length) {
    console.log(
      `\n  ${extra.length} doc(s) exist in dev but not prod` +
        (WIPE ? " — will be DELETED (--wipe)" : " — left alone (pass --wipe to remove)"),
    );
    for (const d of extra) console.log(`    ${d.id}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  let written = 0;
  for (let i = 0; i < srcSnap.docs.length; i += 400) {
    const batch = destDb.batch();
    for (const d of srcSnap.docs.slice(i, i + 400)) {
      batch.set(destDb.collection(collection!).doc(d.id), d.data());
    }
    await batch.commit();
    written += Math.min(400, srcSnap.docs.length - i);
  }

  if (WIPE && extra.length) {
    const batch = destDb.batch();
    for (const d of extra) batch.delete(destDb.collection(collection!).doc(d.id));
    await batch.commit();
    console.log(`Deleted ${extra.length} dev-only doc(s).`);
  }

  console.log(`\nWROTE ${written} doc(s) into ${dest.projectId}/${collection}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
