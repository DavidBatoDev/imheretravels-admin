#!/usr/bin/env node
/**
 * One-off: set `tourRadarTourId` on the tourPackages docs that are listed on TourRadar.
 *
 * This is the field the scheduled import reads to decide which tours to sync
 * (functions/src/scheduled-sync-tourradar-reviews.ts). It is the `{id}` in
 * `tourradar.com/t/{id}` — NOT `tourRadarWidgetId`, which is a Widget Center identifier.
 *
 * The mapping below is the union of the two lists that previously disagreed:
 * fetch-tourradar-reviews.mjs (5 tours) and www/lib/tourradar-links.ts (4 — Sri Lanka
 * was missing, so its cards had no outbound link).
 *
 * Auth: dev service account by default. Pass a prod key explicitly:
 *   TR_SERVICE_ACCOUNT=/abs/path/prod-key.json node …/set-tourradar-tour-ids.mjs --production
 *
 * Usage:
 *   node admin/client/scripts/tourradar-export/set-tourradar-tour-ids.mjs --dry-run
 *   node admin/client/scripts/tourradar-export/set-tourradar-tour-ids.mjs --production
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** site tour slug → TourRadar tour id */
const TOUR_RADAR_IDS = {
  "india-discovery-tour": "321149",
  "vietnam-expedition": "324172",
  "philippine-sunrise": "298995",
  "philippine-sunset": "298994",
  "sri-lanka-wander-tour": "323687",
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isProduction = args.includes("--production");
  if (!isDryRun && !isProduction) {
    console.error("❌ Specify --dry-run or --production");
    process.exit(1);
  }

  const keyPath =
    process.env.TR_SERVICE_ACCOUNT ||
    path.resolve(__dirname, "../../keys/dev-project-service-account.json");
  const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(`\n🔗 Setting tourRadarTourId`);
  console.log(`   project: ${serviceAccount.project_id}`);
  console.log(`   mode:    ${isDryRun ? "DRY RUN (no writes)" : "WRITING"}\n`);

  const snap = await db.collection("tourPackages").get();
  const bySlug = new Map();
  for (const d of snap.docs) {
    const t = d.data();
    if (t.slug) bySlug.set(t.slug, { ref: d.ref, data: t });
  }

  let set = 0;
  let unchanged = 0;
  const missing = [];

  for (const [slug, trId] of Object.entries(TOUR_RADAR_IDS)) {
    const tour = bySlug.get(slug);
    if (!tour) {
      missing.push(slug);
      continue;
    }
    if (String(tour.data.tourRadarTourId ?? "") === trId) {
      console.log(`   = ${slug} already ${trId}`);
      unchanged++;
      continue;
    }
    console.log(`   ${isDryRun ? "[DRY] would set" : "→ set"} ${slug} = ${trId}`);
    if (!isDryRun) await tour.ref.set({ tourRadarTourId: trId }, { merge: true });
    set++;
  }

  console.log("\n" + "=".repeat(56));
  console.log(`${isDryRun ? "Would set" : "Set"}: ${set}   Unchanged: ${unchanged}`);
  if (missing.length) {
    console.error(`❌ Slugs not found in tourPackages: ${missing.join(", ")}`);
  }
  console.log("=".repeat(56));
  if (isDryRun) console.log("\n⚠️  DRY RUN — re-run with --production to write.\n");
  process.exit(missing.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
