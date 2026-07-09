/**
 * Seed the Firestore runtime config for the Google reviews sync:
 *   config/google-reviews-sync = { enabled: true, dryRun: true, defaultStatus: "published" }
 *
 * dryRun:true makes the FIRST sync a safe read-only run. Flip it to false (here or
 * in the Firebase console) once the dry run looks right. See GOOGLE_REVIEWS_SETUP.md.
 *
 * Run:  npm run gbp:config              → seeds with dryRun:true
 *       npm run gbp:config -- --live    → sets dryRun:false (go live)
 *
 * Targets whatever project firebase-admin resolves to: the dev service-account key
 * at admin/client/keys/dev-project-service-account.json if present, else ADC
 * (GOOGLE_APPLICATION_CREDENTIALS / the `firebase use` project).
 */
import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env") });
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const CONFIG_DOC = "config/google-reviews-sync";
const dryRun = !process.argv.includes("--live");

function init() {
  if (getApps().length) return;
  const keyPath = resolve(__dirname, "../../keys/dev-project-service-account.json");
  if (existsSync(keyPath)) {
    const sa = JSON.parse(readFileSync(keyPath, "utf-8"));
    initializeApp({ credential: cert(sa) });
    console.log(`Using dev service account (project: ${sa.project_id})`);
  } else {
    initializeApp(); // ADC / firebase-selected project
    console.log("Using application default credentials");
  }
}

async function main() {
  init();
  const db = getFirestore();
  const [collection, docId] = CONFIG_DOC.split("/");
  await db
    .collection(collection)
    .doc(docId)
    .set({ enabled: true, dryRun, defaultStatus: "published" }, { merge: true });
  console.log(
    `Wrote ${CONFIG_DOC} = { enabled: true, dryRun: ${dryRun}, defaultStatus: "published" }`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
