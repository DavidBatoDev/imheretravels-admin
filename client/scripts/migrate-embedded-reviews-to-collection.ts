/**
 * Migration Script: Seed the `tourReviews` collection from embedded reviews
 *
 * Reviews historically lived as an embedded `details.reviews[]` array on each
 * `tourPackages` document. They now live in a dedicated top-level `tourReviews`
 * collection (moderation, photos, verified-booking linkage, user submissions).
 *
 * This one-off script reads every `tourPackages` doc and creates one
 * `tourReviews` document per embedded review, denormalizing tourId/slug/name.
 * It is idempotent: each migrated review gets a deterministic doc id
 * (`{tourId}__embedded__{index}`) so re-runs skip already-migrated rows.
 *
 * The embedded `details.reviews[]` array is left in place for safe rollback;
 * the web read path stops using it separately (see web/lib/reviews-firestore.ts).
 *
 * Usage:
 *   npx ts-node client/scripts/migrate-embedded-reviews-to-collection.ts --dry-run
 *   npx ts-node client/scripts/migrate-embedded-reviews-to-collection.ts --production
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as path from "path";

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  const serviceAccountPath = path.resolve(
    __dirname,
    "../keys/dev-project-service-account.json"
  );
  console.log(`🔑 Using service account key file: ${serviceAccountPath}`);
  initializeApp({ credential: cert(serviceAccountPath) });
}
const db = getFirestore();

interface EmbeddedReview {
  rating?: number | string;
  date?: string;
  body?: string;
  reviewerName?: string;
  reviewerLocation?: string;
  reviewerAvatar?: string;
}

interface MigrationStats {
  toursProcessed: number;
  reviewsCreated: number;
  reviewsSkipped: number; // already migrated or blank
  errorCount: number;
  errors: Array<{ tourId: string; error: string }>;
}

/** Split a display name ("Flynn Deanne") into first + last. */
function splitName(full: string): { first: string; last?: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts.shift() ?? "";
  const last = parts.join(" ").trim();
  return { first, last: last || undefined };
}

async function migrateReviews(isDryRun: boolean): Promise<MigrationStats> {
  const mode = isDryRun ? "DRY RUN" : "PRODUCTION";
  console.log("\n" + "=".repeat(80));
  console.log("📝 EMBEDDED-REVIEWS → tourReviews COLLECTION MIGRATION");
  console.log("=".repeat(80));
  console.log(
    `Mode: ${mode} ${
      isDryRun ? "(no changes will be made)" : "(will modify database)"
    }`
  );
  console.log("=".repeat(80) + "\n");

  const stats: MigrationStats = {
    toursProcessed: 0,
    reviewsCreated: 0,
    reviewsSkipped: 0,
    errorCount: 0,
    errors: [],
  };

  const toursSnap = await db.collection("tourPackages").get();
  stats.toursProcessed = toursSnap.size;
  console.log(`📊 Found ${toursSnap.size} tour packages to scan.\n`);

  for (const tourDoc of toursSnap.docs) {
    const tourId = tourDoc.id;
    const data = tourDoc.data() as Record<string, any>;
    const embedded: EmbeddedReview[] = data?.details?.reviews ?? [];

    if (!Array.isArray(embedded) || embedded.length === 0) continue;

    const tourSlug: string = data.slug ?? tourId;
    const tourName: string = data.name ?? data.title ?? "";

    for (let i = 0; i < embedded.length; i++) {
      const r = embedded[i];
      const body = (r.body ?? "").trim();
      const reviewerName = (r.reviewerName ?? "").trim();

      // Skip blank placeholder rows (same rule the www read path used).
      if (!body || !reviewerName) {
        stats.reviewsSkipped++;
        continue;
      }

      const reviewId = `${tourId}__embedded__${i}`;
      const ref = db.collection("tourReviews").doc(reviewId);

      try {
        const existing = await ref.get();
        if (existing.exists) {
          stats.reviewsSkipped++;
          console.log(`⏭️  ${reviewId} already migrated — skipping`);
          continue;
        }

        const { first, last } = splitName(reviewerName);
        const rating =
          typeof r.rating === "number" ? r.rating : Number(r.rating) || 5;

        const now = Timestamp.now();
        const reviewDoc = {
          tourId,
          tourSlug,
          tourName,
          rating,
          bodyMarkdown: body,
          reviewerFirstName: first,
          ...(last ? { reviewerLastName: last } : {}),
          ...(r.reviewerLocation
            ? { reviewerLocation: r.reviewerLocation }
            : {}),
          ...(r.reviewerAvatar ? { reviewerAvatar: r.reviewerAvatar } : {}),
          status: "published" as const,
          source: "admin" as const,
          verified: false,
          createdAt: now,
          updatedAt: now,
          ...(r.date ? { displayDate: r.date } : {}),
        };

        if (isDryRun) {
          console.log(
            `[DRY RUN] Would create ${reviewId} — "${body.slice(0, 40)}…" by ${first}`
          );
        } else {
          await ref.set(reviewDoc);
          console.log(`✅ Created ${reviewId} — by ${first} (${tourName})`);
        }
        stats.reviewsCreated++;
      } catch (error) {
        stats.errorCount++;
        const msg = error instanceof Error ? error.message : String(error);
        stats.errors.push({ tourId: reviewId, error: msg });
        console.error(`❌ Error migrating ${reviewId}:`, msg);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("📋 MIGRATION SUMMARY");
  console.log("=".repeat(80));
  console.log(`Tours scanned:            ${stats.toursProcessed}`);
  console.log(
    `✅ ${isDryRun ? "Would create" : "Created"}:            ${stats.reviewsCreated}`
  );
  console.log(`⏭️  Skipped:               ${stats.reviewsSkipped}`);
  console.log(`❌ Errors:                ${stats.errorCount}`);
  console.log("=".repeat(80));

  if (stats.errors.length > 0) {
    console.log("\n⚠️  Errors encountered:");
    stats.errors.forEach(({ tourId, error }) =>
      console.log(`  - ${tourId}: ${error}`)
    );
  }

  if (isDryRun) {
    console.log(
      "\n⚠️  THIS WAS A DRY RUN - NO CHANGES WERE MADE. Re-run with --production to apply.\n"
    );
  } else {
    console.log("\n✅ Migration completed. Next: ping the www /api/revalidate.\n");
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isProduction = args.includes("--production");

  if (!isDryRun && !isProduction) {
    console.error("❌ ERROR: You must specify either --dry-run or --production");
    console.error(
      "\nUsage:\n  npx ts-node client/scripts/migrate-embedded-reviews-to-collection.ts --dry-run\n  npx ts-node client/scripts/migrate-embedded-reviews-to-collection.ts --production"
    );
    process.exit(1);
  }

  try {
    await migrateReviews(isDryRun);
    console.log("✅ Script completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }
}

main();
