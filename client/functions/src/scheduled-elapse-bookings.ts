import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

/**
 * Daily: mark bookings "Elapsed" once their tour has ENDED (return date,
 * fallback tour date) with a balance still owing, preserving the status
 * being replaced in `statusBeforeElapsed`.
 *
 * Why a scheduled job: bookingStatus is a grid column that only recomputes
 * when a row is edited, so nothing would ever flip on its own. The column
 * function (booking-status.ts) also returns "Elapsed" for the same inputs,
 * so a later edit cannot undo this stamp.
 *
 * Rules — keep in sync with admin/client/scripts/stamp-elapsed.ts:
 *   - skip cancelled (reasonForCancellation set, or status contains "cancelled")
 *   - skip already "Elapsed"
 *   - tour ended: returnDate < today (fallback tourDate)
 *   - owing: remainingBalance > 0
 *
 * Emails: bookingStatus is not a trigger field and paymentProgress is left
 * alone, so onPaymentComplete / onGuestInvitationTrigger cannot fire.
 * Late fees and payment reminders both skip Elapsed bookings.
 */
const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
};

export const elapseBookingsDaily = onSchedule(
  {
    schedule: "30 2 * * *", // after applyLateFeesDaily (02:00), same zone
    region: "asia-southeast1",
    timeZone: "Asia/Manila",
    timeoutSeconds: 300,
  },
  async () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const snap = await db.collection("bookings").get();
    let stamped = 0;
    let batch = db.batch();
    let inBatch = 0;

    for (const doc of snap.docs) {
      const b = doc.data();
      const status = String(b.bookingStatus ?? "");
      const cancelled =
        String(b.reasonForCancellation ?? "").trim() !== "" ||
        status.toLowerCase().includes("cancelled");
      if (cancelled) continue;
      if (status.trim().toLowerCase() === "elapsed") continue;

      const end = asDate(b.returnDate) ?? asDate(b.tourDate);
      if (!end || !(end < startOfToday)) continue;

      const owed = Number(b.remainingBalance) || 0;
      if (owed <= 0) continue;

      batch.update(doc.ref, {
        bookingStatus: "Elapsed",
        statusBeforeElapsed: status,
        elapsedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      stamped++;
      if (++inBatch >= 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
      logger.info(`Elapsed: ${b.bookingId ?? doc.id} (${b.fullName ?? "?"}) owed ${owed}, was "${status}"`);
    }
    if (inBatch > 0) await batch.commit();

    logger.info(`elapseBookingsDaily: scanned ${snap.size}, stamped ${stamped}`);
  },
);
