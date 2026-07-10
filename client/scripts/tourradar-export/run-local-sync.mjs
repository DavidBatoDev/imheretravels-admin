#!/usr/bin/env node
/**
 * Run the TourRadar review sync from a local machine.
 *
 * WHY THIS EXISTS: TourRadar serves a generic anti-bot challenge page (HTTP 202, a fixed
 * ~2KB body, identical across every tour) to requests from Cloud Functions' datacenter IP
 * range. The scrape works reliably from an ordinary residential/office connection — this
 * script runs the exact same sync logic the Cloud Function runs
 * (functions/src/scheduled-sync-tourradar-reviews.ts → runTourRadarSync), just from here.
 *
 * The daily Cloud Scheduler trigger is disabled (config/tourradar-reviews-sync.enabled =
 * false) so it stops firing on a call that can never succeed. This script is the supported
 * way to keep TourRadar reviews current until either TourRadar grants API/export access or
 * the block is otherwise resolved — see docs/proyekto-tour-review-system.md, Feature 2.6.
 *
 * Safety, same guarantees as the Cloud Function:
 *   - Duplicates are impossible (deterministic `tourradar_{reviewId}` doc id, content merge).
 *   - A tour is pruned only when its scrape is provably complete; a failed/partial scrape
 *     changes nothing for that tour.
 *   - Pruning is a soft delete (`deletedOnTourRadarAt` + hidden), never a hard delete.
 *
 * Revalidation is DELIBERATELY OFF. `admin/client/.env.local`'s WWW_REVALIDATE_URL has
 * pointed at production www before while Firebase pointed at dev — this script targets dev
 * only and must not be able to touch the production ISR cache. If you need www to pick up
 * a change immediately, hide/unhide the affected review once in the admin UI (which uses
 * the app's own, correctly-scoped revalidation path) or wait for its normal ISR window.
 *
 * Auth: dev service account by default. For production (only once TourRadar access is
 * fixed and you intend a real prod sync):
 *   TR_SERVICE_ACCOUNT=/abs/path/prod-key.json node …/run-local-sync.mjs --production
 *
 * Usage:
 *   node admin/client/scripts/tourradar-export/run-local-sync.mjs --dry-run
 *   node admin/client/scripts/tourradar-export/run-local-sync.mjs --production
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_ROOT = path.resolve(__dirname, "../../functions");

/**
 * `firebase-admin` is installed separately under `admin/client/node_modules` AND
 * `functions/node_modules` — two independent copies with independent internal app
 * registries. The compiled sync module (`functions/lib/...js`) resolves its own copy from
 * `functions/node_modules`, so the app used here MUST be initialized through that SAME
 * copy, or `runTourRadarSync`'s `admin.firestore()` calls fail with "app does not exist".
 * Anchoring `createRequire` to `functions/package.json` forces that resolution.
 */
const functionsRequire = createRequire(path.join(FUNCTIONS_ROOT, "package.json"));
const { initializeApp, getApps, cert } = functionsRequire("firebase-admin/app");
const { getFirestore } = functionsRequire("firebase-admin/firestore");

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

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
    });
  }

  // Hard stop, not a warning: this script must never be able to reach prod www even if
  // someone's shell happens to have a stray REVALIDATE_SECRET exported.
  delete process.env.REVALIDATE_SECRET;
  delete process.env.WWW_REVALIDATE_URL;

  console.log(`\n📡 TourRadar sync (local — the scrape doesn't work from Cloud Functions)`);
  console.log(`   project: ${serviceAccount.project_id}`);
  console.log(`   mode:    ${isDryRun ? "DRY RUN (writes config.dryRun=true)" : "LIVE"}\n`);

  // Compiled output from `npm run build` in functions/. Rebuild it if this import fails —
  // this script intentionally does not invoke tsc itself, so it never masks a build error.
  let mod;
  try {
    const modPath = path.join(FUNCTIONS_ROOT, "lib/scheduled-sync-tourradar-reviews.js");
    mod = await import(pathToFileURL(modPath).href);
  } catch (e) {
    console.error(
      `❌ Couldn't load the compiled sync function. Run "npm run build" in admin/client/functions first.\n`,
      e,
    );
    process.exit(1);
  }

  const db = getFirestore();
  await db
    .doc("config/tourradar-reviews-sync")
    .set({ enabled: true, dryRun: isDryRun, defaultStatus: "published" }, { merge: true });

  const res = await mod.runTourRadarSync("manual");

  console.log(`\nok: ${res.ok}`);
  if (res.skipped) console.log(`skipped: ${res.skipped}`);
  for (const t of res.perTour ?? []) {
    const status = t.complete ? "✅" : "⚠️ ";
    console.log(
      `  ${status} ${t.tourName || t.tourSlug}  ${t.fetched}/${t.total}` +
        `  +${t.created} ~${t.updated} =${t.unchanged} -${t.softDeleted}` +
        (t.error ? `  (${t.error})` : ""),
    );
  }
  if (!res.ok) {
    console.log(
      `\n⚠️  Not every tour completed. Nothing was deleted for the incomplete ones — ` +
        `re-run later, or check the per-tour messages above.`,
    );
  }
  // Restore config.dryRun to false so a leftover dry-run flag never silently no-ops the
  // (currently disabled) Cloud Scheduler trigger if it's ever re-enabled.
  await db.doc("config/tourradar-reviews-sync").set({ dryRun: false }, { merge: true });

  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
