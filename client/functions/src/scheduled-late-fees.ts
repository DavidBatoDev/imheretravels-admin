import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import EmailTemplateService from "./email-template-service";
import GmailApiService from "./gmail-api-service";
import { buildBookingStatusUrl } from "./booking-status-url";

if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

type LateFeesConfig = {
  enabled?: boolean;
  penaltyPercent?: number;
  graceDays?: number;
  effectiveDate?: any;
};

const TERM_KEYS = ["p1", "p2", "p3", "p4"] as const;

function asDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const parsed = value.toDate();
      return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
    }

    if (typeof value.seconds === "number") {
      const parsed = new Date(value.seconds * 1000);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value._seconds === "number") {
      const parsed = new Date(value._seconds * 1000);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function parseTermDueDate(dueDateRaw: any, termIndex: number): Date | null {
  if (!dueDateRaw) return null;

  if (typeof dueDateRaw === "string" && dueDateRaw.includes(",")) {
    const parts = dueDateRaw.split(",").map((part) => part.trim());
    const partStart = termIndex * 2;
    const partEnd = partStart + 1;

    if (parts.length > partEnd) {
      const merged = `${parts[partStart]}, ${parts[partEnd]}`;
      return asDate(merged);
    }
  }

  return asDate(dueDateRaw);
}

function formatGBP(value: number): string {
  return `£${value.toFixed(2)}`;
}

function getTermLabel(termKey: string): string {
  return termKey.toUpperCase();
}

function getGmailSentUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#sent/${messageId}`;
}

export const applyLateFeesDaily = onSchedule(
  {
    schedule: "0 2 * * *",
    region: "asia-southeast1",
    timeZone: "Asia/Manila",
  },
  async () => {
    try {
      const configRef = db.collection("config").doc("late-fees");
      const configSnap = await configRef.get();

      if (!configSnap.exists) {
        logger.info("late-fees config is missing; skipping run");
        return;
      }

      const config = configSnap.data() as LateFeesConfig;
      const enabled = config.enabled !== false;

      if (!enabled) {
        logger.info("late-fees config is disabled; skipping run");
        return;
      }

      const effectiveDate = asDate(config.effectiveDate);
      if (!effectiveDate) {
        logger.warn("late-fees effectiveDate is invalid; skipping run");
        return;
      }

      const penaltyPercent = Number(config.penaltyPercent ?? 3);
      const graceDays = Number(config.graceDays ?? 3);
      const now = new Date();

      const templateSnap = await db
        .collection("emailTemplates")
        .where("name", "==", "Late Fee Notice")
        .limit(5)
        .get();

      const templateDoc =
        templateSnap.docs.find((doc) => doc.data()?.status === "active") ||
        templateSnap.docs[0];

      const templateData = templateDoc?.data();
      const gmailService = new GmailApiService();

      const bookingsSnap = await db
        .collection("bookings")
        .where("reservationDate", ">=", Timestamp.fromDate(effectiveDate))
        .get();

      logger.info(`Late-fee checker processing ${bookingsSnap.size} bookings`);

      let appliedCount = 0;
      let emailedCount = 0;

      for (const bookingDoc of bookingsSnap.docs) {
        const booking = bookingDoc.data();
        const bookingRef = bookingDoc.ref;

        for (let index = 0; index < TERM_KEYS.length; index++) {
          const termKey = TERM_KEYS[index];
          const termLabel = getTermLabel(termKey);
          const termAmount = Number(booking[`${termKey}Amount`] || 0);
          const dueDate = parseTermDueDate(booking[`${termKey}DueDate`], index);
          const datePaid = asDate(booking[`${termKey}DatePaid`]);

          if (!dueDate || termAmount <= 0 || datePaid) {
            continue;
          }

          const graceCutoff = new Date(dueDate.getTime());
          graceCutoff.setDate(graceCutoff.getDate() + graceDays);

          if (now < graceCutoff) {
            continue;
          }

          const existingPenalty = Number(
            booking[`${termKey}LateFeesPenalty`] || 0,
          );
          const existingAppliedAt = booking[`${termKey}LateFeeAppliedAt`];

          if (existingPenalty > 0 || existingAppliedAt) {
            continue;
          }

          const penaltyAmount = Number(
            ((termAmount * penaltyPercent) / 100).toFixed(2),
          );
          const remainingBalance = Number(booking.remainingBalance || 0);
          const updatedRemainingBalance = Number(
            (remainingBalance + penaltyAmount).toFixed(2),
          );
          const daysOverdue = Math.max(
            0,
            Math.floor(
              (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
            ),
          );

          const bookingCode =
            booking.bookingId || booking.bookingCode || bookingDoc.id;
          const bookingStatusUrl = buildBookingStatusUrl(booking.access_token);

          const templateVariables = {
            fullName: booking.fullName || "Customer",
            paymentTerm: termLabel,
            bookingCode,
            tourPackageName: booking.tourPackageName || "",
            originalAmount: formatGBP(termAmount),
            lateFeeAmount: formatGBP(penaltyAmount),
            dueDate: dueDate.toLocaleDateString("en-CA", {
              timeZone: "Asia/Manila",
            }),
            daysOverdue,
            updatedRemainingBalance: formatGBP(updatedRemainingBalance),
            bookingStatusUrl,
          };

          const subjectTemplate =
            templateData?.subject ||
            "Action Required: Late Fee Applied to {{ paymentTerm }}";
          const htmlTemplate =
            templateData?.content ||
            "<p>Hi {{ fullName }}, a late fee of {{ lateFeeAmount }} was applied to {{ paymentTerm }}.</p>";

          const subject = EmailTemplateService.processTemplate(
            subjectTemplate,
            templateVariables,
          );
          const htmlContent = EmailTemplateService.processTemplate(
            htmlTemplate,
            templateVariables,
          );

          const currentTimestamp = Timestamp.now();

          const applied = await db.runTransaction(async (txn) => {
            const freshSnap = await txn.get(bookingRef);
            const freshData = freshSnap.data() || {};

            const freshDueDate = parseTermDueDate(
              freshData[`${termKey}DueDate`],
              index,
            );
            const freshDatePaid = asDate(freshData[`${termKey}DatePaid`]);
            const freshPenalty = Number(
              freshData[`${termKey}LateFeesPenalty`] || 0,
            );
            const freshAppliedAt = freshData[`${termKey}LateFeeAppliedAt`];

            if (
              !freshDueDate ||
              freshDatePaid ||
              freshPenalty > 0 ||
              freshAppliedAt
            ) {
              return false;
            }

            const freshGraceCutoff = new Date(freshDueDate.getTime());
            freshGraceCutoff.setDate(freshGraceCutoff.getDate() + graceDays);
            if (now < freshGraceCutoff) {
              return false;
            }

            const freshRemainingBalance = Number(
              freshData.remainingBalance || 0,
            );
            const freshUpdatedRemaining = Number(
              (freshRemainingBalance + penaltyAmount).toFixed(2),
            );
            const totalLateFees =
              Number(freshData.totalLateFees || 0) + penaltyAmount;

            txn.update(bookingRef, {
              [`${termKey}LateFeesPenalty`]: penaltyAmount,
              [`${termKey}LateFeeAppliedAt`]: currentTimestamp,
              remainingBalance: freshUpdatedRemaining,
              totalLateFees: Number(totalLateFees.toFixed(2)),
              updatedAt: currentTimestamp,
            });

            return true;
          });

          if (applied) {
            appliedCount += 1;
            try {
              if (!booking.emailAddress) {
                logger.warn(
                  `Late fee applied but no recipient email for booking ${bookingDoc.id} term ${termLabel}`,
                );
                continue;
              }

              const sendResult = await gmailService.sendEmail({
                to: booking.emailAddress,
                subject,
                htmlContent,
              });

              const noticeUrl = getGmailSentUrl(sendResult.messageId);
              await bookingRef.update({
                [`${termKey}LateFeesNoticeLink`]: noticeUrl,
                [`${termKey}LateFeeNoticeSentAt`]: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });

              await db.collection("lateFeeNotices").add({
                bookingDocumentId: bookingDoc.id,
                bookingId:
                  booking.bookingId || booking.bookingCode || bookingDoc.id,
                paymentTerm: termLabel,
                recipientName: booking.fullName || "",
                recipientEmail: booking.emailAddress || "",
                tourPackageName: booking.tourPackageName || "",
                originalAmount: termAmount,
                lateFeeAmount: penaltyAmount,
                dueDate: dueDate.toLocaleDateString("en-CA", {
                  timeZone: "Asia/Manila",
                }),
                daysOverdue,
                updatedRemainingBalance,
                status: "sent",
                sentEmailLink: noticeUrl,
                sentAt: Timestamp.now(),
                source: "daily-checker",
                createdAt: Timestamp.now(),
                lastModified: Timestamp.now(),
              });

              emailedCount += 1;
            } catch (sendError) {
              logger.error(
                `Late fee email send failed for booking ${bookingDoc.id} term ${termLabel}`,
                sendError,
              );
            }
            logger.info(
              `Applied late fee for booking ${bookingDoc.id} term ${termLabel}`,
            );
          }
        }
      }

      await configRef.update({
        updatedAt: Timestamp.now(),
      });

      logger.info(
        `Late-fee checker completed. applied=${appliedCount}, emailed=${emailedCount}`,
      );
    } catch (error) {
      logger.error("Error in late-fee checker:", error);
    }
  },
);
