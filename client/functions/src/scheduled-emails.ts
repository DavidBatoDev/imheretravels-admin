import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import GmailApiService from "./gmail-api-service";
import EmailTemplateService from "./email-template-service";
import { buildBookingStatusUrl } from "./booking-status-url";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

// Interface for scheduled email
interface ScheduledEmail {
  id?: string;
  to: string;
  subject: string;
  htmlContent: string;
  bcc?: string[];
  cc?: string[];
  from?: string;
  replyTo?: string;
  scheduledFor: Timestamp;
  status: "pending" | "sent" | "failed" | "cancelled";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  sentAt?: Timestamp;
  messageId?: string;
  // Optional metadata
  emailType?: string;
  bookingId?: string;
  templateId?: string;
  templateVariables?: Record<string, any>;
}

type SheetColumn = {
  id: string;
  columnName: string;
  dataType: string;
};

// Helper function to get Gmail sent URL
function getGmailSentUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#sent/${messageId}`;
}

// Helper function to format currency
function formatGBP(value: any): string {
  if (!value) return "£0.00";
  return `£${Number(value).toFixed(2)}`;
}

// Helper function to parse due date for a specific term
function parseDueDateForTerm(dueDateRaw: any, termIndex: number): string {
  if (!dueDateRaw) return "";

  if (typeof dueDateRaw === "string" && dueDateRaw.includes(",")) {
    const parts = dueDateRaw.split(",").map((p) => p.trim());
    // Dates are in format: "Month Day", "Year", "Month Day", "Year"
    // For term index n, we need parts[n*2] + ", " + parts[n*2+1]
    if (parts.length > termIndex * 2 + 1) {
      return `${parts[termIndex * 2]}, ${parts[termIndex * 2 + 1]}`;
    }
  }

  return dueDateRaw;
}

// Helper function to format date
function formatDate(dateValue: any): string {
  if (!dateValue) return "";

  try {
    let date: Date | null = null;

    // Handle Firestore Timestamp objects
    if (dateValue && typeof dateValue === "object") {
      if (dateValue.seconds) {
        date = new Date(dateValue.seconds * 1000);
      } else if (dateValue.toDate && typeof dateValue.toDate === "function") {
        date = dateValue.toDate();
      }
    }
    // Handle string dates
    else if (typeof dateValue === "string" && dateValue.trim() !== "") {
      date = new Date(dateValue);
    }
    // Handle Date objects
    else if (dateValue instanceof Date) {
      date = dateValue;
    }

    // Validate and format
    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString("en-CA", {
        timeZone: "Asia/Manila",
      });
    }

    return "";
  } catch (error) {
    logger.warn("Error formatting date:", error, "Value:", dateValue);
    return "";
  }
}

// Helper function to re-render template with fresh booking data
async function rerenderEmailTemplate(
  bookingId: string,
  templateId: string,
  templateVariables: Record<string, any>,
): Promise<{ subject: string; htmlContent: string }> {
  try {
    // Fetch fresh booking data
    const bookingDoc = await db.collection("bookings").doc(bookingId).get();

    if (!bookingDoc.exists) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    const bookingData = bookingDoc.data()!;

    // Update template variables with fresh data
    const freshVariables: Record<string, any> = {
      ...templateVariables,
      // Update key fields with fresh data
      fullName: bookingData.fullName,
      emailAddress: bookingData.emailAddress,
      tourPackageName: bookingData.tourPackageName,
      bookingId: bookingData.bookingId,
      tourDate: bookingData.tourDate,
      paid: bookingData.paid,
      remainingBalance: bookingData.remainingBalance,
      originalTourCost: bookingData.originalTourCost,
      discountedTourCost: bookingData.discountedTourCost,
      useDiscountedTourCost: bookingData.useDiscountedTourCost,
      paymentMethod: bookingData.paymentMethod || "Other",
      paymentPlan: bookingData.availablePaymentTerms || "",
      accessToken: bookingData.access_token || "",
      // The traveller pays from their own booking status page, which knows who
      // they are and what is actually due.
      bookingStatusUrl: buildBookingStatusUrl(bookingData.access_token),
    };

    // Update payment term data if applicable
    if (templateVariables.paymentTerm) {
      const term = templateVariables.paymentTerm as string;
      const termLower = term.toLowerCase();
      const termIndex = parseInt(term.replace("P", "")) - 1;

      const dueDateRaw = (bookingData as any)[`${termLower}DueDate`];
      const parsedDueDate = parseDueDateForTerm(dueDateRaw, termIndex);

      freshVariables[`${termLower}Amount`] = (bookingData as any)[
        `${termLower}Amount`
      ];
      freshVariables[`${termLower}DueDate`] = parsedDueDate;
      freshVariables[`${termLower}DatePaid`] = (bookingData as any)[
        `${termLower}DatePaid`
      ];

      // Add formatted values for display
      freshVariables.amount = formatGBP(
        (bookingData as any)[`${termLower}Amount`],
      );
      freshVariables.dueDate = formatDate(parsedDueDate);
    }

    // Update term data array if showTable is true
    if (templateVariables.showTable && templateVariables.termData) {
      const allTerms = ["P1", "P2", "P3", "P4"];

      // Determine which terms to show based on payment plan
      const paymentPlanValue =
        bookingData.availablePaymentTerms || bookingData.paymentPlan || "";
      let maxTermIndex = 0;

      if (paymentPlanValue.includes("P4")) {
        maxTermIndex = 4;
      } else if (paymentPlanValue.includes("P3")) {
        maxTermIndex = 3;
      } else if (paymentPlanValue.includes("P2")) {
        maxTermIndex = 2;
      } else if (paymentPlanValue.includes("P1")) {
        maxTermIndex = 1;
      }

      // Get all terms up to the max payment plan
      const availableTerms = allTerms.slice(0, maxTermIndex);

      // Always show all terms up to the payment plan
      const visibleTerms = availableTerms;

      // Re-render time is the send time, so use now to determine Late status
      const sendDate = new Date();

      const getTermLatePenalty = (termLabel: string): number => {
        const rawPenalty = (bookingData as any)[
          `${termLabel.toLowerCase()}LateFeesPenalty`
        ];
        const parsed = Number(rawPenalty);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      freshVariables.termData = visibleTerms.map((t) => {
        const tIndex = parseInt(t.replace("P", "")) - 1;
        const tLower = t.toLowerCase();
        const dueDateRaw = (bookingData as any)[`${tLower}DueDate`];
        const parsedDueDate = parseDueDateForTerm(dueDateRaw, tIndex);
        const dueDateStr = formatDate(parsedDueDate);
        const datePaidStr = formatDate(
          (bookingData as any)[`${tLower}DatePaid`] || "",
        );
        const isLate =
          !datePaidStr && !!dueDateStr && new Date(dueDateStr) < sendDate;
        const penaltyValue = getTermLatePenalty(t);

        return {
          term: t,
          amount: formatGBP((bookingData as any)[`${tLower}Amount`] || 0),
          dueDate: dueDateStr,
          datePaid: datePaidStr,
          isLate,
          penaltyValue,
          penaltyAmount: penaltyValue > 0 ? formatGBP(penaltyValue) : "",
        };
      });

      const totalLateFeesFromTerms = (freshVariables.termData as any[]).reduce(
        (sum, item) => sum + (Number(item.penaltyValue) || 0),
        0,
      );
      const bookingTotalLateFees = Number(
        (bookingData as any).totalLateFees || 0,
      );
      const totalLateFeesValue =
        totalLateFeesFromTerms > 0
          ? totalLateFeesFromTerms
          : Number.isFinite(bookingTotalLateFees)
            ? bookingTotalLateFees
            : 0;
      const currentTermLatePenalty = templateVariables.paymentTerm
        ? getTermLatePenalty(templateVariables.paymentTerm as string)
        : 0;

      // Add formatted totals
      freshVariables.totalAmount = formatGBP(
        bookingData.useDiscountedTourCost
          ? bookingData.discountedTourCost
          : bookingData.originalTourCost,
      );
      freshVariables.totalLateFees = formatGBP(totalLateFeesValue);
      freshVariables.totalLateFeesValue = totalLateFeesValue;
      freshVariables.hasLateFeePenalties = (
        freshVariables.termData as any[]
      ).some((item) => Number(item.penaltyValue) > 0);
      freshVariables.lateFeePenalty = formatGBP(currentTermLatePenalty);
      freshVariables.lateFeePenaltyValue = currentTermLatePenalty;
      freshVariables.reservationFee = formatGBP(bookingData.reservationFee);
      freshVariables.paidTerms = formatGBP(bookingData.paidTerms);
      freshVariables.paid = formatGBP(bookingData.paid);
      freshVariables.remainingBalance = formatGBP(bookingData.remainingBalance);
    }

    // Fetch the template from the database to ensure we're using the latest version
    const templateDoc = await db
      .collection("emailTemplates")
      .doc(templateId)
      .get();

    if (!templateDoc.exists) {
      throw new Error(`Template ${templateId} not found in database`);
    }

    const templateData = templateDoc.data();
    const rawTemplate = templateData?.content || "";

    if (!rawTemplate) {
      throw new Error(`Template ${templateId} has no content`);
    }

    logger.info(`Successfully fetched template ${templateId} from database`);

    const htmlContent = await EmailTemplateService.processTemplate(
      rawTemplate,
      freshVariables,
    );

    // Generate subject with fresh data
    const subject = `Payment Reminder - ${freshVariables.fullName} - ${
      templateVariables.paymentTerm || "Payment"
    } Due`;

    return { subject, htmlContent };
  } catch (error) {
    logger.error("Error re-rendering email template:", error);
    throw error;
  }
}

/**
 * Cloud Scheduler function that runs once daily at 9 AM to check for emails to send
 */
export const processScheduledEmails = onSchedule(
  {
    schedule: "0 9 * * *", // Run daily at 9 AM
    region: "asia-southeast1",
    timeZone: "Asia/Singapore", // Adjust to your timezone
  },
  async (event) => {
    try {
      logger.info("Processing scheduled emails...");

      // Add 1 minute buffer to ensure we catch emails scheduled for exactly 9:00 AM
      const now = Timestamp.fromDate(
        new Date(Date.now() + 60 * 1000), // Add 1 minute (60,000 milliseconds)
      );

      // Query for pending emails that should be sent now
      const query = db
        .collection("scheduledEmails")
        .where("status", "==", "pending")
        .where("scheduledFor", "<=", now)
        .limit(50); // Process max 50 emails per run since we run daily

      const snapshot = await query.get();

      if (snapshot.empty) {
        logger.info("No scheduled emails to process");
        return;
      }

      logger.info(`Found ${snapshot.docs.length} emails to process`);

      // Load booking columns once for all emails
      const columnsSnap = await db.collection("bookingSheetColumns").get();
      const columns: SheetColumn[] = columnsSnap.docs.map((doc) => ({
        id: doc.id,
        columnName: doc.data().columnName,
        dataType: doc.data().dataType,
      }));

      // Process each scheduled email
      const promises = snapshot.docs.map(async (doc) => {
        const emailData = doc.data() as ScheduledEmail;
        const emailId = doc.id;

        try {
          // Check if email status has changed (e.g., manually skipped or cancelled)
          const currentDoc = await db
            .collection("scheduledEmails")
            .doc(emailId)
            .get();
          const currentStatus = currentDoc.data()?.status;

          if (currentStatus !== "pending") {
            logger.info(
              `Email ${emailId} status changed to ${currentStatus}, skipping send`,
            );
            return;
          }

          // Check if this payment term has already been paid (AppScript logic)
          if (
            emailData.emailType === "payment-reminder" &&
            emailData.bookingId &&
            emailData.templateVariables?.paymentTerm
          ) {
            const term = emailData.templateVariables.paymentTerm as string;
            const bookingDoc = await db
              .collection("bookings")
              .doc(emailData.bookingId)
              .get();

            if (bookingDoc.exists) {
              const bookingData = bookingDoc.data()!;
              const termLower = term.toLowerCase();
              const paidDateVal = (bookingData as any)[`${termLower}DatePaid`];

              // Tour has already run: no more payment reminders.
              if (String(bookingData.bookingStatus ?? "").trim().toLowerCase() === "elapsed") {
                logger.info(`Skipping email ${emailId} - booking is Elapsed (tour ended, balance owing)`);
                await db.collection("scheduledEmails").doc(emailId).update({
                  status: "skipped",
                  updatedAt: Timestamp.now(),
                  errorMessage: "Booking elapsed: tour ended with balance owing",
                });
                return;
              }

              if (paidDateVal) {
                const paidDateStr = formatDate(paidDateVal);
                logger.info(
                  `Skipping email ${emailId} - ${term} already paid${paidDateStr ? ` on ${paidDateStr}` : ""}`,
                );

                // Update email status to skipped since payment is already made
                await db
                  .collection("scheduledEmails")
                  .doc(emailId)
                  .update({
                    status: "skipped",
                    updatedAt: Timestamp.now(),
                    errorMessage: paidDateStr
                      ? `Payment already made on ${paidDateStr}`
                      : "Payment already made",
                  });

                return;
              }
            }
          }

          // Initialize Gmail API service
          const gmailService = new GmailApiService();

          let emailSubject = emailData.subject;
          let emailHtmlContent = emailData.htmlContent;

          // Re-render template with fresh data for payment reminders
          if (
            emailData.emailType === "payment-reminder" &&
            emailData.bookingId &&
            emailData.templateId &&
            emailData.templateVariables
          ) {
            try {
              logger.info(
                `Re-rendering template for booking ${emailData.bookingId} with fresh data`,
              );
              const freshEmail = await rerenderEmailTemplate(
                emailData.bookingId,
                emailData.templateId,
                emailData.templateVariables,
              );
              emailSubject = freshEmail.subject;
              emailHtmlContent = freshEmail.htmlContent;
              logger.info(
                `Template re-rendered successfully for email ${emailId}`,
              );
            } catch (rerenderError) {
              logger.warn(
                `Failed to re-render template for email ${emailId}, using original content:`,
                rerenderError,
              );
              // Fall back to original content if re-rendering fails
            }
          }

          // Send the email
          const result = await gmailService.sendEmail({
            to: emailData.to,
            subject: emailSubject,
            htmlContent: emailHtmlContent,
            bcc: emailData.bcc,
            cc: emailData.cc,
            from: emailData.from,
            replyTo: emailData.replyTo,
          });

          const sentTimestamp = Timestamp.now();

          // Create sent attempt record
          await db
            .collection("scheduledEmails")
            .doc(emailId)
            .collection("sentAttempts")
            .add({
              attemptNumber: emailData.attempts + 1,
              status: "success",
              sentAt: sentTimestamp,
              messageId: result.messageId,
              to: emailData.to,
              subject: emailSubject,
              bcc: emailData.bcc || [],
              cc: emailData.cc || [],
              emailType: emailData.emailType,
              bookingId: emailData.bookingId,
            });

          // Update document with success status
          await db
            .collection("scheduledEmails")
            .doc(emailId)
            .update({
              status: "sent",
              sentAt: sentTimestamp,
              messageId: result.messageId,
              attempts: (emailData.attempts || 0) + 1,
              updatedAt: sentTimestamp,
            });

          logger.info(
            `Successfully sent scheduled email ${emailId} to ${emailData.to}`,
          );

          // If this is a payment reminder, update the booking with the sent email link
          if (
            emailData.emailType === "payment-reminder" &&
            emailData.bookingId &&
            emailData.templateVariables?.paymentTerm &&
            result.messageId
          ) {
            try {
              const term = emailData.templateVariables.paymentTerm as string;
              const emailLink = getGmailSentUrl(result.messageId);
              const scheduledEmailLinkCol = columns.find(
                (col) => col.columnName === `${term} Scheduled Email Link`,
              );

              if (scheduledEmailLinkCol) {
                await db
                  .collection("bookings")
                  .doc(emailData.bookingId)
                  .update({
                    [scheduledEmailLinkCol.id]: emailLink,
                  });

                logger.info(
                  `Updated ${term} Scheduled Email Link for booking ${emailData.bookingId}`,
                );
              }

              // Create notification for sent payment reminder
              try {
                const travelerName =
                  emailData.templateVariables.fullName || "Customer";
                const tourPackageName =
                  emailData.templateVariables.tourPackage || "Tour";

                await db.collection("notifications").add({
                  type: "payment_reminder_sent",
                  title: `${term} Payment Reminder Sent`,
                  body: `${term} payment reminder sent to ${travelerName} for ${tourPackageName}`,
                  data: {
                    bookingId: emailData.bookingId,
                    travelerName,
                    tourPackageName,
                    paymentTerm: term,
                    recipientEmail: emailData.to,
                    emailUrl: emailLink,
                  },
                  targetType: "global",
                  targetUserIds: [],
                  createdAt: new Date(),
                  readBy: {},
                });

                logger.info(
                  "✅ Notification created for sent payment reminder",
                );
              } catch (notificationError) {
                logger.warn(
                  "Failed to create notification:",
                  notificationError,
                );
                // Fail silently - don't block the email sending process
              }
            } catch (bookingUpdateError) {
              logger.error(
                `Error updating booking with email link:`,
                bookingUpdateError,
              );
              // Don't fail the whole process if booking update fails
            }
          }
        } catch (error) {
          logger.error(`Error sending scheduled email ${emailId}:`, error);

          const newAttempts = emailData.attempts + 1;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          // Create failed attempt record
          await db
            .collection("scheduledEmails")
            .doc(emailId)
            .collection("sentAttempts")
            .add({
              attemptNumber: newAttempts,
              status: "failed",
              attemptedAt: Timestamp.now(),
              errorMessage: errorMessage,
              to: emailData.to,
              subject: emailData.subject,
              emailType: emailData.emailType,
              bookingId: emailData.bookingId,
            });

          const updateData: Partial<ScheduledEmail> = {
            attempts: newAttempts,
            updatedAt: Timestamp.now(),
            errorMessage: errorMessage,
          };

          // Mark as failed if max attempts reached
          if (newAttempts >= emailData.maxAttempts) {
            updateData.status = "failed";
            logger.error(
              `Max attempts reached for email ${emailId}, marking as failed`,
            );
          }

          await db
            .collection("scheduledEmails")
            .doc(emailId)
            .update(updateData);
        }
      });

      await Promise.all(promises);
      logger.info("Finished processing scheduled emails");
    } catch (error) {
      logger.error("Error in processScheduledEmails:", error);
    }
  },
);
