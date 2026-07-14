// functions/src/scheduled-sync-tourradar-reviews.ts
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { randomUUID } from "node:crypto";
import {
  fetchTourReviews,
  type FetchDiagnostics,
  type TourRadarReview,
} from "./tourradar-reviews-fetch";

/**
 * Scheduled import of TourRadar reviews into the `tourReviews` collection
 * (source: "tourradar"). Replaces the manual two-script run in
 * `admin/client/scripts/tourradar-export/`.
 *
 * Which tours are imported is data, not code: every `tourPackages` doc carrying a
 * `tourRadarTourId` is synced. (That field is the `{id}` in `tourradar.com/t/{id}` —
 * NOT `tourRadarWidgetId`, which is a separate Widget Center identifier.)
 *
 * IDEMPOTENCY / NO DUPLICATES
 * The doc id is the deterministic `tourradar_{reviewId}`, and existing docs are updated
 * with a content-only merge. Re-running can therefore never insert a duplicate, and it
 * never clobbers an admin's moderation (status / tour assignment).
 *
 * WHY THIS DOES NOT HARD-DELETE
 * The original script pruned by deleting every `source == "tourradar"` doc missing from
 * the freshly-scraped feed. That is safe only when a human is reading `--dry-run` output.
 * Unattended, a single rate-limited or truncated scrape would permanently destroy real
 * reviews, their re-hosted media and their moderation state. So instead:
 *
 *   1. A tour is pruned ONLY when its scrape is `complete` (we collected at least the
 *      review count TourRadar itself advertises). A partial or failed scrape prunes nothing.
 *   2. Pruning is a SOFT delete — `deletedOnTourRadarAt` + `status: "hidden"`. Nothing is
 *      destroyed; an admin can see and restore it. This mirrors `deletedOnGoogleAt`.
 *
 * A review that reappears in a later scrape has its soft-delete cleared automatically.
 */

const REVIEWS_COLLECTION = "tourReviews";
const TOURS_COLLECTION = "tourPackages";
const LOGS_COLLECTION = "tourradar-reviews-logs";
const CONFIG_DOC = "config/tourradar-reviews-sync";

type ReviewStatus = "published" | "hidden" | "pending";

interface SyncConfig {
  enabled: boolean;
  dryRun: boolean;
  defaultStatus: ReviewStatus;
}

interface SiteTour {
  id: string;
  slug: string;
  name: string;
  tourRadarTourId: string;
}

/** What one tour's sync did — surfaced per-run in the admin panel. */
export interface PerTourResult {
  tourRadarTourId: string;
  tourSlug: string;
  tourName: string;
  fetched: number;
  total: number;
  complete: boolean;
  created: number;
  updated: number;
  unchanged: number;
  softDeleted: number;
  restored: number;
  errors: number;
  /** Present when the scrape failed or truncated — also the reason no prune ran. */
  error?: string;
  prunedSkippedReason?: string;
  /** What the tour page actually returned. Only recorded when the scrape fell short. */
  diagnostics?: FetchDiagnostics;
}

async function loadConfig(db: admin.firestore.Firestore): Promise<SyncConfig> {
  const defaults: SyncConfig = {
    enabled: true,
    dryRun: false,
    defaultStatus: "published", // TourRadar reviews are already public on TourRadar
  };
  try {
    const snap = await db.doc(CONFIG_DOC).get();
    if (!snap.exists) return defaults;
    const d = snap.data() as Partial<SyncConfig>;
    return {
      enabled: d.enabled !== false,
      dryRun: d.dryRun === true,
      defaultStatus: (d.defaultStatus as ReviewStatus) || defaults.defaultStatus,
    };
  } catch {
    return defaults;
  }
}

/** Every tour that declares a TourRadar tour id. */
async function loadTours(db: admin.firestore.Firestore): Promise<SiteTour[]> {
  const snap = await db.collection(TOURS_COLLECTION).get();
  const out: SiteTour[] = [];
  for (const d of snap.docs) {
    const t = d.data();
    const trId = String(t.tourRadarTourId ?? "").trim();
    if (!trId || !t.slug) continue;
    out.push({
      id: d.id,
      slug: t.slug,
      name: t.name ?? t.title ?? "",
      tourRadarTourId: trId,
    });
  }
  return out;
}

/**
 * A stable, unique destination filename for a media URL:
 *  - /s3/review/1440/464506_69bfc04fc8a3c.jpg  → 464506_69bfc04fc8a3c.jpg
 *  - /moments/video/mp4/aa/bb/cc/dd/ee/input.mp4 → aa-bb-cc-dd-ee.mp4
 */
function destName(url: string): string {
  const clean = url.split("?")[0];
  const moments = clean.match(/\/moments\/[^/]+\/[^/]+\/(.+)\/[^/]+(\.[a-z0-9]+)$/i);
  if (moments) return moments[1].replace(/\//g, "-") + moments[2];
  return clean.split("/").pop() ?? randomUUID();
}

/**
 * Re-host a remote media URL into Storage; returns the download URL.
 * Idempotent: an object that already exists reuses its download token rather than
 * re-uploading, so repeated runs cost one metadata read per asset.
 */
async function reHost(
  bucket: ReturnType<admin.storage.Storage["bucket"]>,
  url: string,
  reviewId: string,
): Promise<string> {
  const dest = `review-photos/tourradar/${reviewId}/${destName(url)}`;
  const file = bucket.file(dest);
  const encoded = encodeURIComponent(dest);
  const publicUrl = (token: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}` +
    `?alt=media&token=${token}`;

  const [exists] = await file.exists();
  if (exists) {
    const [meta] = await file.getMetadata();
    const token = (meta.metadata?.firebaseStorageDownloadTokens as string | undefined)
      ?.split(",")[0];
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

/**
 * True when the scraped review differs from what we already stored. Media counts stand in
 * for the media itself: the stored URLs point at Storage, the scraped ones at TourRadar,
 * so they can never compare equal.
 */
function contentChanged(r: TourRadarReview, existing: admin.firestore.DocumentData): boolean {
  return (
    (existing.bodyMarkdown ?? "") !== r.body ||
    Number(existing.rating ?? 0) !== r.rating ||
    (existing.externalReply ?? "") !== r.operatorReply ||
    (existing.displayDate ?? "") !== r.displayDate ||
    (existing.photos?.length ?? 0) !== r.photos.length ||
    (existing.videos?.length ?? 0) !== r.videos.length ||
    !existing.externalTourId // backfill rows imported before this field existed
  );
}

async function revalidateWww(paths: string[]): Promise<void> {
  const url =
    process.env.WWW_REVALIDATE_URL || "https://www.imheretravels.com/api/revalidate";
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    logger.warn("[syncTourRadarReviews] REVALIDATE_SECRET not set — skipping revalidation.");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify(paths.length ? { paths } : { all: true }),
      signal: controller.signal,
    });
    if (!res.ok) logger.warn(`[syncTourRadarReviews] revalidation responded ${res.status}`);
    else logger.info("✅ Triggered www revalidation");
  } catch (error) {
    logger.warn(
      "[syncTourRadarReviews] failed to reach www revalidation endpoint:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

const ts = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

/** Sync one tour. Never throws — failures are reported in the result. */
async function syncOneTour(
  db: admin.firestore.Firestore,
  bucket: ReturnType<admin.storage.Storage["bucket"]>,
  tour: SiteTour,
  config: SyncConfig,
  nowMs: number,
): Promise<PerTourResult> {
  const result: PerTourResult = {
    tourRadarTourId: tour.tourRadarTourId,
    tourSlug: tour.slug,
    tourName: tour.name,
    fetched: 0,
    total: 0,
    complete: false,
    created: 0,
    updated: 0,
    unchanged: 0,
    softDeleted: 0,
    restored: 0,
    errors: 0,
  };

  const fetched = await fetchTourReviews(tour.tourRadarTourId);
  result.fetched = fetched.reviews.length;
  result.total = fetched.total;
  result.complete = fetched.complete;
  if (fetched.error) result.error = fetched.error;
  // Only on failure: a healthy run's log shouldn't carry page-inspection noise.
  if (!fetched.complete && fetched.diagnostics) {
    result.diagnostics = fetched.diagnostics;
    logger.warn(
      `[syncTourRadarReviews] ${tour.slug}: ${fetched.error}`,
      fetched.diagnostics,
    );
  }

  const seenDocIds = new Set<string>();

  for (const r of fetched.reviews) {
    const docId = `tourradar_${r.reviewId}`;
    seenDocIds.add(docId);
    const ref = db.collection(REVIEWS_COLLECTION).doc(docId);

    try {
      const snap = await ref.get();
      const existing = snap.exists ? (snap.data() ?? {}) : null;
      const createdMs = r.dateISO ? Date.parse(r.dateISO) || nowMs : nowMs;

      // Nothing to do — but a previously soft-deleted review that reappeared must be restored.
      if (existing && !contentChanged(r, existing)) {
        if (existing.deletedOnTourRadarAt) {
          if (!config.dryRun) {
            await ref.set(
              {
                deletedOnTourRadarAt: admin.firestore.FieldValue.delete(),
                status: config.defaultStatus,
                updatedAt: ts(nowMs),
              },
              { merge: true },
            );
          }
          result.restored += 1;
        } else {
          result.unchanged += 1;
        }
        continue;
      }

      if (config.dryRun) {
        existing ? (result.updated += 1) : (result.created += 1);
        continue;
      }

      // Re-host media into our own Storage. Skipped when the counts already match, so a
      // steady-state run does no media work at all.
      let photoUrls: string[] = existing?.photos ?? [];
      let videoObjs: { src: string; poster?: string }[] = existing?.videos ?? [];
      if (!existing || (existing.photos?.length ?? 0) !== r.photos.length) {
        photoUrls = [];
        for (const p of r.photos) photoUrls.push(await reHost(bucket, p, r.reviewId));
      }
      if (!existing || (existing.videos?.length ?? 0) !== r.videos.length) {
        videoObjs = [];
        for (const v of r.videos) {
          const src = await reHost(bucket, v.src, r.reviewId);
          const poster = v.poster ? await reHost(bucket, v.poster, r.reviewId) : undefined;
          videoObjs.push(poster ? { src, poster } : { src });
        }
      }
      const avatarUrl =
        existing?.reviewerAvatar ||
        (r.avatar ? await reHost(bucket, r.avatar, r.reviewId) : undefined);

      const [first, ...rest] = (r.reviewer || "").trim().split(/\s+/).filter(Boolean);
      const last = rest.join(" ").trim();

      // Content fields, refreshed on every run. Deliberately excludes status/assigned/tour
      // so an admin's moderation survives.
      const content: admin.firestore.DocumentData = {
        rating: r.rating,
        bodyMarkdown: r.body,
        reviewerFirstName: first ?? "",
        ...(last ? { reviewerLastName: last } : {}),
        reviewerFullName: r.reviewer,
        ...(r.countryEmoji ? { reviewerCountryEmoji: r.countryEmoji } : {}),
        ...(avatarUrl ? { reviewerAvatar: avatarUrl } : {}),
        ...(photoUrls.length ? { photos: photoUrls } : {}),
        ...(videoObjs.length ? { videos: videoObjs } : {}),
        ...(r.operatorReply ? { externalReply: r.operatorReply } : {}),
        displayDate: r.displayDate,
        source: "tourradar",
        externalSource: "tourradar",
        externalId: docId,
        externalTourId: tour.tourRadarTourId,
        createdAt: ts(createdMs),
        externalUpdatedAt: ts(createdMs),
        updatedAt: ts(nowMs),
      };

      if (existing) {
        // A review present in the feed is by definition not deleted on TourRadar.
        // `FieldValue.delete()` is only legal on a merging write, hence not in `content`.
        const wasDeleted = Boolean(existing.deletedOnTourRadarAt);
        await ref.set(
          {
            ...content,
            ...(wasDeleted
              ? {
                  deletedOnTourRadarAt: admin.firestore.FieldValue.delete(),
                  status: config.defaultStatus,
                }
              : {}),
          },
          { merge: true },
        );
        result.updated += 1;
        if (wasDeleted) result.restored += 1;
      } else {
        await ref.set({
          ...content,
          tourId: tour.id,
          tourSlug: tour.slug,
          tourName: tour.name,
          verified: false,
          assigned: true,
          status: config.defaultStatus,
        });
        result.created += 1;
      }
    } catch (error) {
      result.errors += 1;
      logger.error(`[syncTourRadarReviews] ${docId}:`, error);
    }
  }

  // ── Prune (soft), only when we are certain we saw the whole feed ──────────────
  if (!fetched.complete) {
    result.prunedSkippedReason =
      `incomplete scrape (${result.fetched}/${result.total}) — refusing to prune`;
    logger.warn(`[syncTourRadarReviews] ${tour.slug}: ${result.prunedSkippedReason}`);
    return result;
  }
  if (result.errors > 0) {
    result.prunedSkippedReason = `${result.errors} write error(s) — refusing to prune`;
    logger.warn(`[syncTourRadarReviews] ${tour.slug}: ${result.prunedSkippedReason}`);
    return result;
  }

  // Docs belonging to this tour: matched by TourRadar tour id, or — for rows imported
  // before `externalTourId` existed — by the site slug they were assigned to.
  const [byTourId, bySlug] = await Promise.all([
    db
      .collection(REVIEWS_COLLECTION)
      .where("source", "==", "tourradar")
      .where("externalTourId", "==", tour.tourRadarTourId)
      .get(),
    db
      .collection(REVIEWS_COLLECTION)
      .where("source", "==", "tourradar")
      .where("tourSlug", "==", tour.slug)
      .get(),
  ]);

  const owned = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  for (const d of byTourId.docs) owned.set(d.id, d);
  for (const d of bySlug.docs) if (!d.data().externalTourId) owned.set(d.id, d);

  for (const d of owned.values()) {
    if (seenDocIds.has(d.id)) continue;
    if (d.data().deletedOnTourRadarAt) continue; // already flagged
    if (!config.dryRun) {
      await d.ref.set(
        { deletedOnTourRadarAt: ts(nowMs), status: "hidden", updatedAt: ts(nowMs) },
        { merge: true },
      );
    }
    result.softDeleted += 1;
  }

  return result;
}

/** Shared body for the scheduled run and the admin "Sync now" button. */
export async function runTourRadarSync(trigger: "schedule" | "manual"): Promise<{
  ok: boolean;
  perTour: PerTourResult[];
  skipped?: string;
}> {
  const db = admin.firestore();
  const config = await loadConfig(db);

  if (!config.enabled && trigger === "schedule") {
    logger.info("[syncTourRadarReviews] disabled via config — skipping.");
    return { ok: true, perTour: [], skipped: "disabled via config" };
  }

  const startedAt = Date.now();
  const bucket = admin.storage().bucket();
  const tours = await loadTours(db);

  if (tours.length === 0) {
    logger.warn("[syncTourRadarReviews] no tours carry a tourRadarTourId — nothing to sync.");
    return { ok: true, perTour: [], skipped: "no tours have a tourRadarTourId" };
  }

  logger.info(`⭐ Syncing TourRadar reviews for ${tours.length} tour(s)…`);

  const perTour: PerTourResult[] = [];
  for (const tour of tours) {
    perTour.push(await syncOneTour(db, bucket, tour, config, startedAt));
  }

  const sum = (k: keyof PerTourResult) =>
    perTour.reduce((a, t) => a + (typeof t[k] === "number" ? (t[k] as number) : 0), 0);
  const created = sum("created");
  const updated = sum("updated");
  const softDeleted = sum("softDeleted");
  const restored = sum("restored");
  const errors = sum("errors");
  const ok = errors === 0 && perTour.every((t) => t.complete);

  logger.info(
    `[syncTourRadarReviews] done. created=${created} updated=${updated} ` +
      `softDeleted=${softDeleted} restored=${restored} unchanged=${sum("unchanged")} ` +
      `errors=${errors} dryRun=${config.dryRun}`,
  );

  if (!config.dryRun) {
    await db.collection(LOGS_COLLECTION).add({
      startedAt: ts(startedAt),
      finishedAt: ts(Date.now()),
      trigger,
      ok,
      dryRun: config.dryRun,
      created,
      updated,
      unchanged: sum("unchanged"),
      softDeleted,
      restored,
      errors,
      perTour,
    });

    // Only bother www when something publicly visible moved.
    if (created + updated + softDeleted + restored > 0) {
      const paths = new Set<string>(["/reviews"]);
      for (const t of perTour) {
        if (t.created + t.updated + t.softDeleted + t.restored > 0) {
          paths.add(`/tours/${t.tourSlug}`);
        }
      }
      await revalidateWww([...paths]);
    }
  }

  return { ok, perTour };
}

export const syncTourRadarReviews = onSchedule(
  {
    // Daily. The feed changes slowly (tens of reviews across a handful of tours) and this
    // is a scrape, not an official API — a gentler cadence than the Google sync's 6-hourly.
    schedule: "30 2 * * *",
    timeZone: "UTC",
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "1GiB", // media re-hosting buffers whole files
  },
  async () => {
    try {
      await runTourRadarSync("schedule");
    } catch (error) {
      logger.error("[syncTourRadarReviews] error:", error);
    }
  },
);

/** Admin "Sync now" — same body, but requires an authenticated tour manager. */
export const syncTourRadarReviewsNow = onCall(
  { region: "asia-southeast1", timeoutSeconds: 540, memory: "1GiB", cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to run the TourRadar sync.");
    }
    const userSnap = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    if (userSnap.data()?.permissions?.canManageTours !== true) {
      throw new HttpsError("permission-denied", "You cannot manage tours.");
    }
    try {
      // A manual run ignores the `enabled` flag — the admin is asking for it explicitly.
      return await runTourRadarSync("manual");
    } catch (error) {
      logger.error("[syncTourRadarReviewsNow] error:", error);
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "TourRadar sync failed.",
      );
    }
  },
);
