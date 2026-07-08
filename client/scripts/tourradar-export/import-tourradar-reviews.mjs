#!/usr/bin/env node
/**
 * Import the extracted TourRadar reviews (tourradar-reviews.json) into the
 * `tourReviews` Firestore collection as federated reviews (source: "tourradar"),
 * with FULL text, photos, videos and full dates.
 *
 * Media (photos + videos + reviewer avatar) is RE-HOSTED into Firebase Storage
 * (durable, and firebasestorage.googleapis.com is already allow-listed in the
 * www next.config) rather than hotlinked from TourRadar's CDN.
 *
 * Each review maps to its site tour via TR_NAME_TO_SLUG (explicit — TourRadar
 * uses "Philippines" plural and the site has several "Philippine …" variants).
 * Imported reviews:
 *   - source/externalSource "tourradar", verified:false, assigned:true
 *   - status "published"  → show immediately on the tour page + hub
 *   - excluded from the tour star average + JSON-LD on the www side (see
 *     isExternalSource in www/types/review.ts).
 *
 * Idempotent: deterministic doc id `tourradar_<reviewId>` (the stable TourRadar
 * review id). Re-runs UPDATE content in place and never clobber admin moderation
 * (status / assigned / tour assignment on an existing doc are preserved). Media
 * already re-hosted (same Storage path) is reused, not re-uploaded. After the
 * upsert, any older-scheme `source=="tourradar"` doc no longer in the feed is
 * pruned.
 *
 * Auth: uses admin/client/keys/dev-project-service-account.json by default
 * (→ imheretravels-dev). For production, pass a prod key:
 *   TR_SERVICE_ACCOUNT=/abs/path/prod-service-account.json node …/import-tourradar-reviews.mjs --production
 * Storage bucket defaults to `<project_id>.firebasestorage.app`; override with
 *   TR_STORAGE_BUCKET=<bucket-name>
 *
 * Usage:
 *   node admin/client/scripts/tourradar-export/import-tourradar-reviews.mjs --dry-run
 *   node admin/client/scripts/tourradar-export/import-tourradar-reviews.mjs --production
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TourRadar tour name → site tour slug. Explicit to avoid mismatching the
// several "Philippine …" variants. Extend when TourRadar lists new tours.
const TR_NAME_TO_SLUG = {
  "India Discovery": "india-discovery-tour",
  "Philippines Sunset": "philippine-sunset",
  "Philippines Sunrise": "philippine-sunrise",
  "Sri Lanka Wander": "sri-lanka-wander-tour",
  "Vietnam Expedition": "vietnam-expedition",
};

function splitName(full) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() ?? "";
  const last = parts.join(" ").trim();
  return { first, last: last || undefined };
}

// A stable, unique destination filename for a media URL:
//  - /s3/review/1440/464506_69bfc04fc8a3c.jpg  → 464506_69bfc04fc8a3c.jpg
//  - /moments/video/mp4/aa/bb/cc/dd/ee/input.mp4 → aa-bb-cc-dd-ee.mp4
function destName(url) {
  const clean = url.split("?")[0];
  const moments = clean.match(/\/moments\/[^/]+\/[^/]+\/(.+)\/[^/]+(\.[a-z0-9]+)$/i);
  if (moments) return moments[1].replace(/\//g, "-") + moments[2];
  return clean.split("/").pop();
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
  const bucketName =
    process.env.TR_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`;
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });
  }
  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log(`\n📦 TourRadar → tourReviews import`);
  console.log(`   project: ${serviceAccount.project_id}`);
  console.log(`   bucket:  ${bucket.name}`);
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

  // Re-host a remote media URL into Storage; returns the download URL.
  // Idempotent: if the object already exists, reuse its download token.
  async function reHost(url, reviewId) {
    if (!url) return null;
    const dest = `review-photos/tourradar/${reviewId}/${destName(url)}`;
    const file = bucket.file(dest);
    const encoded = encodeURIComponent(dest);
    const publicUrl = (token) =>
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
    const [exists] = await file.exists();
    if (exists) {
      const [meta] = await file.getMetadata();
      const token = meta.metadata?.firebaseStorageDownloadTokens?.split(",")[0];
      if (token) return publicUrl(token);
    }
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const token = randomUUID();
    await file.save(buffer, {
      resumable: false,
      metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
    });
    return publicUrl(token);
  }

  let created = 0, updated = 0, errors = 0, uploaded = 0;
  const now = Timestamp.now();
  const keepIds = new Set();

  for (const r of reviews) {
    const tour = resolved[r.tour];
    const id = `tourradar_${r.reviewId}`;
    keepIds.add(id);
    const ref = db.collection("tourReviews").doc(id);
    try {
      const snap = await ref.get();
      const createdMs = r.dateISO ? Date.parse(r.dateISO) || now.toMillis() : now.toMillis();

      if (isDryRun) {
        console.log(
          `[DRY] ${id} — ${r.reviewer} · ${tour.slug} · ${r.rating}★ · ` +
            `${r.photos.length}p/${r.videos.length}v · "${r.body.slice(0, 40)}…"`,
        );
        snap.exists ? updated++ : created++;
        continue;
      }

      // Re-host media into Storage.
      const photoUrls = [];
      for (const p of r.photos) {
        photoUrls.push(await reHost(p, r.reviewId));
        uploaded++;
      }
      const videoObjs = [];
      for (const v of r.videos) {
        const src = await reHost(v.src, r.reviewId);
        const poster = v.poster ? await reHost(v.poster, r.reviewId) : undefined;
        videoObjs.push(poster ? { src, poster } : { src });
        uploaded++;
      }
      const avatarUrl = r.avatar ? await reHost(r.avatar, r.reviewId) : undefined;
      const { first, last } = splitName(r.reviewer);

      // Content fields refreshed on every run.
      const content = {
        rating: Number(r.rating) || 5,
        bodyMarkdown: r.body,
        reviewerFirstName: first,
        ...(last ? { reviewerLastName: last } : {}),
        reviewerFullName: r.reviewer,
        ...(avatarUrl ? { reviewerAvatar: avatarUrl } : {}),
        ...(photoUrls.length ? { photos: photoUrls.filter(Boolean) } : {}),
        ...(videoObjs.length ? { videos: videoObjs } : {}),
        ...(r.operatorReply ? { externalReply: r.operatorReply } : {}),
        displayDate: r.displayDate,
        source: "tourradar",
        externalSource: "tourradar",
        externalId: id,
        createdAt: Timestamp.fromMillis(createdMs),
        externalUpdatedAt: Timestamp.fromMillis(createdMs),
        updatedAt: now,
      };

      if (snap.exists) {
        // Preserve admin moderation (status/assigned/tour assignment); only
        // refresh content.
        await ref.set(content, { merge: true });
        updated++;
      } else {
        await ref.set({
          ...content,
          tourId: tour.id,
          tourSlug: tour.slug,
          tourName: tour.name,
          verified: false,
          assigned: true,
          status: "published",
        });
        created++;
      }
    } catch (e) {
      errors++;
      console.error(`❌ ${id}:`, e instanceof Error ? e.message : e);
    }
  }

  // Prune any older-scheme tourradar docs (e.g. the previous hash-id imports)
  // that are no longer in the feed.
  let pruned = 0;
  const existingSnap = await db.collection("tourReviews").where("source", "==", "tourradar").get();
  for (const d of existingSnap.docs) {
    if (keepIds.has(d.id)) continue;
    if (isDryRun) {
      console.log(`[DRY] prune stale ${d.id}`);
    } else {
      await d.ref.delete();
    }
    pruned++;
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `${isDryRun ? "Would create" : "Created"}: ${created}   ` +
      `${isDryRun ? "would update" : "Updated"}: ${updated}   ` +
      `Pruned: ${pruned}   Media uploaded: ${uploaded}   Errors: ${errors}`,
  );
  console.log("=".repeat(60));
  if (isDryRun) console.log("\n⚠️  DRY RUN — re-run with --production to write.\n");
  else console.log("\n✅ Done. Ping the www /api/revalidate so the site refreshes.\n");
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
