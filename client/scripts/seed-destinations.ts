/**
 * One-off migration: seed the Firestore `destinations` collection from the
 * static registry in `www/data/destinations.ts`, so the destination landing
 * pages can be authored in the admin CMS.
 *
 * Preserves every field verbatim (hero URLs, quick facts, faqs, community grid),
 * maps the www `meta` shape → the admin `seo` shape, adds `status: "active"`,
 * an `order` field (registry position → preserves the index-page order), and
 * `metadata` stamps.
 *
 * Idempotent: upserts one doc per destination keyed by slug (doc id === slug),
 * so re-running overwrites rather than duplicating.
 *
 * Usage (from admin/client):
 *   tsx scripts/seed-destinations.ts          # dev only (guarded)
 *   tsx scripts/seed-destinations.ts --force  # allow non-dev project (e.g. prod)
 *
 * Reads NEXT_PUBLIC_FIREBASE_* from admin/client/.env.local — point that at the
 * project you intend to seed (.firebaserc default is PROD; dev needs the dev env).
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, Timestamp } from "firebase/firestore";
import { getAllDestinations } from "../../../www/data/destinations";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const FORCE = process.argv.includes("--force");

if (!firebaseConfig.projectId) {
  console.error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in admin/client/.env.local");
  process.exit(1);
}

if (firebaseConfig.projectId !== "imheretravels-dev" && !FORCE) {
  console.error(
    `Refusing to seed: NEXT_PUBLIC_FIREBASE_PROJECT_ID is "${firebaseConfig.projectId}" (not imheretravels-dev).`,
  );
  console.error("Re-run with --force if you really intend to seed this project.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/** Strip keys whose value is undefined (Firestore rejects undefined). */
function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

async function main() {
  const destinations = getAllDestinations();
  console.log(
    `Seeding ${destinations.length} destinations into "${firebaseConfig.projectId}"…`,
  );

  const now = Timestamp.now();
  const createdBy = "seed-script";

  for (let i = 0; i < destinations.length; i++) {
    const d = destinations[i];

    const docData = pruneUndefined({
      slug: d.slug,
      name: d.name,
      region: d.region,
      status: "active",
      order: i, // preserves registry order on the index page
      heroImage: d.heroImage,
      heroImageAlt: d.heroImageAlt,
      // www `meta` → admin `seo`
      seo: { title: d.meta.title, description: d.meta.description },
      description: d.description ?? [],
      tourSlugs: d.tourSlugs ?? [],
      quickFacts: d.quickFacts, // undefined when absent → pruned
      highlights: d.highlights,
      faqs: d.faqs,
      community: d.community,
      metadata: { createdAt: now, updatedAt: now, createdBy },
    });

    // Doc id === slug → idempotent upsert.
    await setDoc(doc(db, "destinations", d.slug), docData, { merge: true });
    console.log(`  ✓ ${d.slug} (${d.tourSlugs?.length ?? 0} tours)`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
