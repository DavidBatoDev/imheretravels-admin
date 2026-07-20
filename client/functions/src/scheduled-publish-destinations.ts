// functions/src/scheduled-publish-destinations.ts
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

/**
 * Scheduled Cloud Function that publishes destinations whose `scheduledPublishAt`
 * time has passed.
 *
 * An admin sets `scheduledPublishAt` (a future Timestamp) on a destination while
 * leaving its status as "draft" or "archived". Once that time arrives this job
 * flips the destination to "active" and clears the schedule, so the destination
 * landing page goes live on the public site without anyone manually saving it.
 *
 * Runs every 15 minutes. A Firestore `where("scheduledPublishAt", "<=", now)`
 * only matches docs where the field exists as a Timestamp, so destinations
 * without a schedule are never touched.
 *
 * Optional revalidation: if WWW_REVALIDATE_URL + REVALIDATE_SECRET are set, the
 * job pings the public site's on-demand revalidation endpoint so the newly
 * active destination appears immediately instead of after the ISR window.
 */
export const publishScheduledDestinations = onSchedule(
  {
    schedule: "*/15 * * * *", // Every 15 minutes
    timeZone: "UTC",
    region: "asia-southeast1",
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    logger.info("⏰ Checking for destinations scheduled to publish...");

    try {
      const dueQuery = db
        .collection("destinations")
        .where("scheduledPublishAt", "<=", now);

      const snapshot = await dueQuery.get();

      if (snapshot.empty) {
        logger.info("No destinations due to publish.");
        return;
      }

      let publishedCount = 0;
      const batch = db.batch();

      snapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Already active → just clear the (now redundant) schedule.
        if (data.status === "active") {
          batch.update(doc.ref, {
            scheduledPublishAt: admin.firestore.FieldValue.delete(),
            "metadata.updatedAt": now,
          });
          return;
        }

        batch.update(doc.ref, {
          status: "active",
          scheduledPublishAt: admin.firestore.FieldValue.delete(),
          "metadata.updatedAt": now,
        });
        publishedCount += 1;
        logger.info(
          `Publishing destination ${doc.id} (${data.slug || data.name || "unknown"})`,
        );
      });

      await batch.commit();

      logger.info(
        `✅ Publish-scheduler done. published=${publishedCount}, processed=${snapshot.size}`,
      );

      if (publishedCount > 0) {
        await revalidateWww();
      }
    } catch (error) {
      logger.error("Error in publishScheduledDestinations:", error);
    }
  },
);

/**
 * Best-effort ping to the public site's revalidation endpoint. No-ops (with a
 * warning) when env isn't configured; never throws so a failure can't break the
 * scheduled run.
 */
async function revalidateWww(): Promise<void> {
  const url =
    process.env.WWW_REVALIDATE_URL ||
    "https://www.imheretravels.com/api/revalidate";
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    logger.warn(
      "[publishScheduledDestinations] REVALIDATE_SECRET not set — skipping www revalidation.",
    );
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ all: true }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn(
        `[publishScheduledDestinations] revalidation responded ${res.status}`,
      );
    } else {
      logger.info("✅ Triggered www revalidation");
    }
  } catch (error) {
    logger.warn(
      "[publishScheduledDestinations] failed to reach www revalidation endpoint:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    clearTimeout(timeout);
  }
}
