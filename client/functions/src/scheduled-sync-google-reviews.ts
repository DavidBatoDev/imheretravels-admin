// functions/src/scheduled-sync-google-reviews.ts
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { google } from "googleapis";
import {
  GoogleReview,
  ReviewStatus,
  mapGoogleReview,
  buildNewReviewFields,
  buildUpdateFields,
} from "./google-reviews-map";

/**
 * Scheduled Cloud Function that imports Google reviews for the owned business
 * listing into the `tourReviews` collection (source: "google").
 *
 * Uses the Google Business Profile API (accounts.locations.reviews.list on the
 * legacy mybusiness.googleapis.com/v4 surface, which is NOT in the googleapis
 * discovery bundle — so we mint an access token via OAuth2 and fetch() directly).
 *
 * Google reviews arrive with no tour association: they land with empty tour
 * fields and auto-publish (default status "published"), so they show on the
 * community hub immediately and on a tour page once an admin assigns a tour
 * (see assignReviewTour in the admin app). They never count toward a tour's
 * star average or JSON-LD (enforced on the www side).
 *
 * Idempotent: deterministic doc id `google_${reviewId}` + a merge that only
 * refreshes content when Google's updateTime advanced, never clobbering an
 * admin's status/assignment.
 *
 * PREREQUISITE: the GBP API requires a one-time access approval and a verified
 * location. Until then reviews.list returns 403 — this function logs a warning
 * and returns without throwing, so scheduled runs are harmless while pending.
 */

const REVIEWS_COLLECTION = "tourReviews";
const LOGS_COLLECTION = "google-reviews-logs";
const CONFIG_DOC = "config/google-reviews-sync";
const PAGE_SIZE = 50;

interface SyncConfig {
  enabled: boolean;
  dryRun: boolean;
  defaultStatus: ReviewStatus;
}

async function loadConfig(db: admin.firestore.Firestore): Promise<SyncConfig> {
  const defaults: SyncConfig = {
    enabled: true,
    dryRun: false,
    defaultStatus: "published", // auto-publish (decided with the user)
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

/** Mint a fresh access token for the business.manage scope. */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GBP_CLIENT_ID;
  const clientSecret = process.env.GBP_CLIENT_SECRET;
  const refreshToken = process.env.GBP_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    logger.warn(
      "[syncGoogleReviews] GBP_CLIENT_ID/SECRET/REFRESH_TOKEN not set — skipping.",
    );
    return null;
  }
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "urn:ietf:wg:oauth:2.0:oob",
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2Client.getAccessToken();
  return token || null;
}

/** Fetch ALL reviews for the configured location, following pagination. */
async function fetchAllGoogleReviews(token: string): Promise<GoogleReview[]> {
  const accountId = process.env.GBP_ACCOUNT_ID;
  const locationId = process.env.GBP_LOCATION_ID;
  if (!accountId || !locationId) {
    logger.warn(
      "[syncGoogleReviews] GBP_ACCOUNT_ID/GBP_LOCATION_ID not set — skipping.",
    );
    return [];
  }

  const base =
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}` +
    `/locations/${locationId}/reviews`;

  const all: GoogleReview[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(base);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 403 is expected until the GBP API access request is approved — warn,
      // don't throw, so the scheduled run stays harmless.
      logger.warn(
        `[syncGoogleReviews] reviews.list responded ${res.status}. ` +
          `${res.status === 403 ? "GBP API access likely not yet approved. " : ""}` +
          body.slice(0, 300),
      );
      break;
    }

    const data = (await res.json()) as {
      reviews?: GoogleReview[];
      nextPageToken?: string;
      totalReviewCount?: number;
      averageRating?: number;
    };
    if (Array.isArray(data.reviews)) all.push(...data.reviews);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

async function revalidateWww(): Promise<void> {
  const url =
    process.env.WWW_REVALIDATE_URL ||
    "https://www.imheretravels.com/api/revalidate";
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    logger.warn("[syncGoogleReviews] REVALIDATE_SECRET not set — skipping revalidation.");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ all: true }),
      signal: controller.signal,
    });
    if (!res.ok) logger.warn(`[syncGoogleReviews] revalidation responded ${res.status}`);
    else logger.info("✅ Triggered www revalidation");
  } catch (error) {
    logger.warn(
      "[syncGoogleReviews] failed to reach www revalidation endpoint:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

const ts = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

/** Convert numeric epoch fields in a field map to Firestore Timestamps. */
function withTimestamps(fields: Record<string, unknown>): Record<string, unknown> {
  const out = { ...fields };
  for (const key of ["createdAt", "updatedAt", "externalUpdatedAt"]) {
    if (typeof out[key] === "number") out[key] = ts(out[key] as number);
  }
  return out;
}

export const syncGoogleReviews = onSchedule(
  {
    schedule: "0 */6 * * *", // every 6 hours
    timeZone: "UTC",
    region: "asia-southeast1",
    timeoutSeconds: 300,
  },
  async () => {
    const db = admin.firestore();
    const config = await loadConfig(db);
    if (!config.enabled) {
      logger.info("[syncGoogleReviews] disabled via config — skipping.");
      return;
    }

    logger.info("⭐ Syncing Google reviews…");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let newlyPublished = 0;

    try {
      const token = await getAccessToken();
      if (!token) return;

      const reviews = await fetchAllGoogleReviews(token);
      logger.info(`[syncGoogleReviews] fetched ${reviews.length} review(s).`);

      const nowMs = Date.now();
      // Chunk into batches of <=500 writes.
      let batch = db.batch();
      let ops = 0;
      const flush = async () => {
        if (ops > 0 && !config.dryRun) await batch.commit();
        batch = db.batch();
        ops = 0;
      };

      const seenDocIds = new Set<string>();

      for (const raw of reviews) {
        const mapped = mapGoogleReview(raw);
        if (!mapped) {
          skipped += 1;
          continue;
        }
        seenDocIds.add(mapped.docId);
        const ref = db.collection(REVIEWS_COLLECTION).doc(mapped.docId);
        const existing = await ref.get();

        if (!existing.exists) {
          const fields = withTimestamps(
            buildNewReviewFields(mapped, config.defaultStatus, nowMs),
          );
          if (!config.dryRun) batch.set(ref, fields, { merge: true });
          created += 1;
          if (config.defaultStatus === "published") newlyPublished += 1;
          ops += 1;
        } else {
          const update = buildUpdateFields(mapped, existing.data() ?? {}, nowMs);
          if (update) {
            if (!config.dryRun) batch.set(ref, withTimestamps(update), { merge: true });
            updated += 1;
            // A content refresh on an already-published review is publicly visible.
            if ((existing.data()?.status ?? "") === "published") newlyPublished += 1;
            ops += 1;
          } else {
            skipped += 1;
          }
        }

        if (ops >= 450) await flush();
      }
      await flush();

      logger.info(
        `[syncGoogleReviews] done. created=${created} updated=${updated} ` +
          `skipped=${skipped} dryRun=${config.dryRun}`,
      );

      if (!config.dryRun) {
        await db.collection(LOGS_COLLECTION).add({
          ranAt: ts(nowMs),
          fetched: reviews.length,
          created,
          updated,
          skipped,
          defaultStatus: config.defaultStatus,
        });
        if (newlyPublished > 0) await revalidateWww();
      }
    } catch (error) {
      logger.error("[syncGoogleReviews] error:", error);
    }
  },
);
