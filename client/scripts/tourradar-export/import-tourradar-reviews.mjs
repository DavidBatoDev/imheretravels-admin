#!/usr/bin/env node
/**
 * Import the extracted TourRadar reviews (tourradar-reviews.json) into the
 * `tourReviews` Firestore collection as federated reviews (source: "tourradar").
 *
 * Each review is mapped to its matching site tour (TourRadar uses "Philippines"
 * plural and there are several "Philippine Sunset" variants on the site, so we
 * use an explicit override map rather than fuzzy matching). Imported reviews:
 *   - source/externalSource "tourradar", verified:false, assigned:true
 *   - status "published"  → show immediately on the tour page + hub
 *   - rating/date/body preserved; excluded from the tour star average + JSON-LD
 *     on the www side (see isExternalSource in www/types/review.ts).
 *
 * Idempotent: deterministic doc id `tourradar_<hash(tourId|reviewer|date|body)>`
 * so re-runs skip already-imported reviews (and never clobber admin moderation).
 *
 * Auth: uses admin/client/keys/dev-project-service-account.json by default
 * (→ imheretravels-dev). For production, pass a prod key:
 *   TR_SERVICE_ACCOUNT=/abs/path/prod-service-account.json node …/import-tourradar-reviews.mjs --production
 *
 * Usage:
 *   node admin/client/scripts/tourradar-export/import-tourradar-reviews.mjs --dry-run
 *   node admin/client/scripts/tourradar-export/import-tourradar-reviews.mjs --production
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TourRadar tour name → site tour slug. Explicit to avoid mismatching the
// several "Philippine Sunset" variants. Extend when TourRadar lists new tours.
const TR_NAME_TO_SLUG = {
  "India Discovery": "india-discovery-tour",
  "Philippines Sunset": "philippine-sunset",
  "Philippines Sunrise": "philippine-sunrise",
  "Sri Lanka Wander": "sri-lanka-wander-tour",
  "Vietnam Expedition": "vietnam-expedition",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const toDisplayDate = (ms) =>
  ms ? `${MONTHS[new Date(ms).getUTCMonth()]} ${new Date(ms).getUTCFullYear()}` : "";

function splitName(full) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() ?? "";
  const last = parts.join(" ").trim();
  return { first, last: last || undefined };
}

function stableId(r) {
  const h = createHash("sha1")
    .update(`tourradar|${r.tourId}|${r.reviewer}|${r.date}|${r.body}`)
    .digest("hex")
    .slice(0, 16);
  return `tourradar_${h}`;
}

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
  console.log(`\n📦 TourRadar → tourReviews import`);
  console.log(`   project: ${serviceAccount.project_id}`);
  console.log(`   mode:    ${isDryRun ? "DRY RUN (no writes)" : "PRODUCTION (will write)"}\n`);

  const reviews = JSON.parse(
    readFileSync(path.resolve(__dirname, "tourradar-reviews.json"), "utf-8"),
  );

  // Build slug → {id,slug,name} from live tourPackages.
  const toursSnap = await db.collection("tourPackages").get();
  const bySlug = new Map();
  for (const d of toursSnap.docs) {
    const t = d.data();
    if (t.slug) bySlug.set(t.slug, { id: d.id, slug: t.slug, name: t.name ?? t.title ?? "" });
  }

  // Resolve + validate the tour mapping up front.
  const trTours = [...new Set(reviews.map((r) => r.tour))];
  const resolved = {};
  const unmapped = [];
  for (const name of trTours) {
    const slug = TR_NAME_TO_SLUG[name];
    const tour = slug && bySlug.get(slug);
    if (!tour) unmapped.push(name);
    else resolved[name] = tour;
  }
  console.log("🔗 Tour mapping:");
  for (const name of trTours) {
    const t = resolved[name];
    const n = reviews.filter((r) => r.tour === name).length;
    console.log(`   ${name}  →  ${t ? `${t.name} (${t.slug})` : "❌ UNMAPPED"}   [${n} reviews]`);
  }
  if (unmapped.length) {
    console.error(`\n❌ Unmapped TourRadar tours: ${unmapped.join(", ")}. Add them to TR_NAME_TO_SLUG.`);
    process.exit(1);
  }

  let created = 0, skipped = 0, errors = 0;
  const now = Timestamp.now();

  for (const r of reviews) {
    const tour = resolved[r.tour];
    const id = stableId(r);
    const ref = db.collection("tourReviews").doc(id);
    try {
      const existing = await ref.get();
      if (existing.exists) {
        skipped++;
        continue;
      }
      const createdMs = r.date ? Date.parse(r.date) || now.toMillis() : now.toMillis();
      const { first, last } = splitName(r.reviewer);
      const doc = {
        tourId: tour.id,
        tourSlug: tour.slug,
        tourName: tour.name,
        rating: Number(r.stars) || 5,
        bodyMarkdown: r.body,
        reviewerFirstName: first,
        ...(last ? { reviewerLastName: last } : {}),
        reviewerFullName: r.reviewer,
        status: "published",
        source: "tourradar",
        externalSource: "tourradar",
        externalId: id,
        verified: false,
        assigned: true,
        createdAt: Timestamp.fromMillis(createdMs),
        updatedAt: now,
        externalUpdatedAt: Timestamp.fromMillis(createdMs),
        displayDate: toDisplayDate(createdMs),
      };
      if (isDryRun) {
        console.log(`[DRY] ${id} — ${first} · ${tour.slug} · ${r.stars}★ · "${r.body.slice(0, 44)}…"`);
      } else {
        await ref.set(doc);
      }
      created++;
    } catch (e) {
      errors++;
      console.error(`❌ ${id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`${isDryRun ? "Would create" : "Created"}: ${created}   Skipped(existing): ${skipped}   Errors: ${errors}`);
  console.log("=".repeat(60));
  if (isDryRun) console.log("\n⚠️  DRY RUN — re-run with --production to write.\n");
  else console.log("\n✅ Done. Ping the www /api/revalidate so the site refreshes.\n");
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
