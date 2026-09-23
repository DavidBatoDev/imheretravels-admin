import { NextResponse } from "next/server";
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  Timestamp,
  doc,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import EmailTemplateService from "@/services/email-template-service";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { getLateFeeGraceDays } from "@/lib/late-fee-policy";

type LateFeesConfig = {
  enabled?: boolean;
  penaltyPercent?: number;
  graceDays?: number;
  effectiveDate?: any;
};

type TermKey = "p1" | "p2" | "p3" | "p4";
const TERM_KEYS: TermKey[] = ["p1", "p2", "p3", "p4"];

function asDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const parsed = value.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime())
        ? parsed
        : null;
    }

    if (typeof value.seconds === "number") {
      const parsed = new Date(value.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value._seconds === "number") {
      const parsed = new Date(value._seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
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
      return asDate(`${parts[partStart]}, ${parts[partEnd]}`);
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

export async function POST() {
  try {
    const configRef = doc(db, "config", "late-fees");
    const configSnapshot = await getDocs(
      query(
        collection(db, "config"),
        where("__name__", "==", "late-fees"),
        limit(1),
      ),
    );

    if (configSnapshot.empty) {
      return NextResponse.json(
        {
          success: false,
          error: "late-fees config is missing",
        },
        { status: 400 },
      );
    }

    const config = configSnapshot.docs[0].data() as LateFeesConfig;
    const enabled = config.enabled !== false;

    if (!enabled) {
      return NextResponse.json({
        success: true,
        message: "late-fees config is disabled; skipped",
        applied: 0,
        scheduled: 0,
      });
    }

    const effectiveDate = asDate(config.effectiveDate);
    if (!effectiveDate) {
      return NextResponse.json(
        {
          success: false,
          error: "late-fees effectiveDate is invalid",
        },
        { status: 400 },
      );
    }

    const penaltyPercent = Number(config.penaltyPercent ?? 3);
    const now = new Date();

    const templateSnapshot = await getDocs(
      query(
        collection(db, "emailTemplates"),
        where("name", "==", "Late Fee Notice"),
        limit(5),
      ),
    );

    const templateDoc =
      templateSnapshot.docs.find(
        (entry) => entry.data()?.status === "active",
      ) || templateSnapshot.docs[0];

    const templateData = templateDoc?.data() ?? null;
    const gmailService = new GmailApiService();

    const bookingsSnapshot = await getDocs(
      query(
        collection(db, "bookings"),
        where("reservationDate", ">=", Timestamp.fromDate(effectiveDate)),
      ),
    );

    let appliedCount = 0;
    let emailedCount = 0;

    for (const bookingDoc of bookingsSnapshot.docs) {
      const booking = bookingDoc.data() as Record<string, any>;
      const bookingRef = bookingDoc.ref;

      const graceDays = getLateFeeGraceDays(
        booking.reservationDate,
        config.graceDays,
      );

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
        const bookingStatusUrl = booking.access_token
          ? `https://admin.imheretravels.com/booking-status/${booking.access_token}`
          : "";

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
          graceDays,
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

        const nowTimestamp = Timestamp.now();

        const applied = await runTransaction(db, async (transaction) => {
          const freshSnapshot = await transaction.get(bookingRef);
          const freshData = (freshSnapshot.data() || {}) as Record<string, any>;

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

          const freshRemainingBalance = Number(freshData.remainingBalance || 0);
          const freshUpdatedRemaining = Number(
            (freshRemainingBalance + penaltyAmount).toFixed(2),
          );
          const totalLateFees =
            Number(freshData.totalLateFees || 0) + penaltyAmount;

          transaction.update(bookingRef, {
            [`${termKey}LateFeesPenalty`]: penaltyAmount,
            [`${termKey}LateFeeAppliedAt`]: nowTimestamp,
            remainingBalance: freshUpdatedRemaining,
            totalLateFees: Number(totalLateFees.toFixed(2)),
            updatedAt: nowTimestamp,
          });

          return true;
        });

        if (applied) {
          appliedCount += 1;
          try {
            if (!booking.emailAddress) {
              console.warn(
                `Late fee applied but no recipient email for booking ${bookingDoc.id} term ${termLabel}`,
              );
              continue;
            }

            const sendResult = await gmailService.sendEmail({
              to: booking.emailAddress,
              subject,
              htmlContent,
            });

            await updateDoc(bookingRef, {
              [`${termKey}LateFeesNoticeLink`]: getGmailSentUrl(
                sendResult.messageId,
              ),
              [`${termKey}LateFeeNoticeSentAt`]: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });

            await addDoc(collection(db, "lateFeeNotices"), {
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
              sentEmailLink: getGmailSentUrl(sendResult.messageId),
              sentAt: Timestamp.now(),
              source: "manual-process-now",
              createdAt: Timestamp.now(),
              lastModified: Timestamp.now(),
            });

            emailedCount += 1;
          } catch (sendError) {
            console.error(
              `Late fee email send failed for booking ${bookingDoc.id} term ${termLabel}`,
              sendError,
            );
          }
        }
      }
    }

    await runTransaction(db, async (transaction) => {
      transaction.update(configRef, {
        updatedAt: Timestamp.now(),
      });
    });

    return NextResponse.json({
      success: true,
      message: "Late fee processing completed",
      scannedBookings: bookingsSnapshot.size,
      applied: appliedCount,
      scheduled: emailedCount,
      emailed: emailedCount,
    });
  } catch (error) {
    console.error("Error in late-fees process-now:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process late fees now",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
