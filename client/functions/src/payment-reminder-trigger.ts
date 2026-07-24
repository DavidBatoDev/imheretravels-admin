import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import EmailTemplateService from "./email-template-service";
import { EmailTemplateLoader } from "./email-template-loader";
import GmailApiService from "./gmail-api-service";
import { buildBookingStatusUrl } from "./booking-status-url";
import { google } from "googleapis";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

type SheetColumn = {
  id: string;
  columnName: string;
  dataType: string;
  function?: string;
  arguments?: Array<{
    name: string;
    type?: string;
    value?: any;
    columnReference?: string;
    columnReferences?: string[];
  }>;
};

// Minimal column definitions needed for payment reminders
// These match the coded columns in client/src/app/functions/columns
const PAYMENT_REMINDER_COLUMNS: SheetColumn[] = [
  { id: "bookingId", columnName: "Booking ID", dataType: "TEXT" },
  { id: "fullName", columnName: "Full Name", dataType: "TEXT" },
  { id: "emailAddress", columnName: "Email Address", dataType: "EMAIL" },
  { id: "tourPackageName", columnName: "Tour Package Name", dataType: "TEXT" },
  { id: "tourDate", columnName: "Tour Date", dataType: "DATE" },
  { id: "paymentCondition", columnName: "Payment Plan", dataType: "DROPDOWN" },
  {
    id: "paymentCondition",
    columnName: "Payment Method",
    dataType: "DROPDOWN",
  },
  { id: "paid", columnName: "Paid", dataType: "NUMBER" },
  {
    id: "remainingBalance",
    columnName: "Remaining Balance",
    dataType: "NUMBER",
  },
  {
    id: "useDiscountedTourCost",
    columnName: "Use Discounted Tour Cost?",
    dataType: "CHECKBOX",
  },
  {
    id: "originalTourCost",
    columnName: "Original Tour Cost",
    dataType: "NUMBER",
  },
  {
    id: "discountedTourCost",
    columnName: "Discounted Tour Cost",
    dataType: "NUMBER",
  },
  {
    id: "sentInitialReminderLink",
    columnName: "Sent Initial Reminder Link",
    dataType: "TEXT",
  },
  { id: "p1Amount", columnName: "P1 Amount", dataType: "NUMBER" },
  { id: "p1DueDate", columnName: "P1 Due Date", dataType: "DATE" },
  { id: "p1DatePaid", columnName: "P1 Date Paid", dataType: "DATE" },
  {
    id: "p1ScheduledReminderDate",
    columnName: "P1 Scheduled Reminder Date",
    dataType: "DATE",
  },
  {
    id: "p1ScheduledReminderLink",
    columnName: "P1 Scheduled Reminder Link",
    dataType: "TEXT",
  },
  {
    id: "p1ScheduledEmailLink",
    columnName: "P1 Scheduled Email Link",
    dataType: "TEXT",
  },
  {
    id: "p1CalendarEventId",
    columnName: "P1 Calendar Event ID",
    dataType: "TEXT",
  },
  {
    id: "p1CalendarEventLink",
    columnName: "P1 Calendar Event Link",
    dataType: "TEXT",
  },
  { id: "p2Amount", columnName: "P2 Amount", dataType: "NUMBER" },
  { id: "p2DueDate", columnName: "P2 Due Date", dataType: "DATE" },
  { id: "p2DatePaid", columnName: "P2 Date Paid", dataType: "DATE" },
  {
    id: "p2ScheduledReminderDate",
    columnName: "P2 Scheduled Reminder Date",
    dataType: "DATE",
  },
  {
    id: "p2ScheduledReminderLink",
    columnName: "P2 Scheduled Reminder Link",
    dataType: "TEXT",
  },
  {
    id: "p2ScheduledEmailLink",
    columnName: "P2 Scheduled Email Link",
    dataType: "TEXT",
  },
  {
    id: "p2CalendarEventId",
    columnName: "P2 Calendar Event ID",
    dataType: "TEXT",
  },
  {
    id: "p2CalendarEventLink",
    columnName: "P2 Calendar Event Link",
    dataType: "TEXT",
  },
  { id: "p3Amount", columnName: "P3 Amount", dataType: "NUMBER" },
  { id: "p3DueDate", columnName: "P3 Due Date", dataType: "DATE" },
  { id: "p3DatePaid", columnName: "P3 Date Paid", dataType: "DATE" },
  {
    id: "p3ScheduledReminderDate",
    columnName: "P3 Scheduled Reminder Date",
    dataType: "DATE",
  },
  {
    id: "p3ScheduledReminderLink",
    columnName: "P3 Scheduled Reminder Link",
    dataType: "TEXT",
  },
  {
    id: "p3ScheduledEmailLink",
    columnName: "P3 Scheduled Email Link",
    dataType: "TEXT",
  },
  {
    id: "p3CalendarEventId",
    columnName: "P3 Calendar Event ID",
    dataType: "TEXT",
  },
  {
    id: "p3CalendarEventLink",
    columnName: "P3 Calendar Event Link",
    dataType: "TEXT",
  },
  { id: "p4Amount", columnName: "P4 Amount", dataType: "NUMBER" },
  { id: "p4DueDate", columnName: "P4 Due Date", dataType: "DATE" },
  { id: "p4DatePaid", columnName: "P4 Date Paid", dataType: "DATE" },
  {
    id: "p4ScheduledReminderDate",
    columnName: "P4 Scheduled Reminder Date",
    dataType: "DATE",
  },
  {
    id: "p4ScheduledReminderLink",
    columnName: "P4 Scheduled Reminder Link",
    dataType: "TEXT",
  },
  {
    id: "p4ScheduledEmailLink",
    columnName: "P4 Scheduled Email Link",
    dataType: "TEXT",
  },
  {
    id: "p4CalendarEventId",
    columnName: "P4 Calendar Event ID",
    dataType: "TEXT",
  },
  {
    id: "p4CalendarEventLink",
    columnName: "P4 Calendar Event Link",
    dataType: "TEXT",
  },
];

// Helper function to format GBP currency
function formatGBP(value: number | string | null | undefined): string {
  if (!value) return "£0.00";
  return `£${Number(value).toFixed(2)}`;
}

// Helper function to format dates
function formatDate(dateValue: any): string {
  if (!dateValue) return "";

  try {
    let date: Date | null = null;

    // Handle Firestore Timestamp objects
    if (dateValue && typeof dateValue === "object" && dateValue._seconds) {
      date = new Date(dateValue._seconds * 1000);
    }
    // Handle string dates
    else if (typeof dateValue === "string" && dateValue.trim() !== "") {
      date = new Date(dateValue);
    }
    // Handle Date objects
    else if (dateValue instanceof Date) {
      date = dateValue;
    }

    // Validate the date before formatting
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

// Helper function to get Gmail sent URL
function getGmailSentUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#sent/${messageId}`;
}

// Helper function to create Google Calendar event
async function createCalendarEvent(
  term: string,
  dueDate: string,
  fullName: string,
  tourPackage: string,
  bookingId: string,
  guestEmail: string,
): Promise<{ eventId: string; eventLink: string }> {
  try {
    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob",
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const firstName = fullName.split(" ")[0];
    const title = `Hi ${firstName}, ${term} Payment Due – ${tourPackage}`;
    const description = [
      `Hi ${fullName},`,
      `This is a reminder for your ${term} payment on ${dueDate} for the tour: ${tourPackage}`,
      `Booking ID: ${bookingId}`,
      `You'll receive a popup and email reminder 3 days before the due date.`,
      `Thank you, ImHereTravels`,
    ].join("\n");

    // Create calendar event
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        start: {
          date: dueDate, // yyyy-MM-dd format
          timeZone: "Asia/Manila",
        },
        end: {
          date: dueDate,
          timeZone: "Asia/Manila",
        },
        attendees: [
          {
            email: guestEmail,
            displayName: fullName,
          },
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 4320 }, // 3 days before (72 hours)
          ],
        },
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false,
        colorId: "11", // Red color
      },
      sendUpdates: "all", // Send invites to attendees
    });

    logger.info(`Created calendar event for ${term}: ${event.data.id}`);

    return {
      eventId: event.data.id || "",
      eventLink: event.data.htmlLink || "",
    };
  } catch (error) {
    logger.error(`Error creating calendar event for ${term}:`, error);
    throw error;
  }
}

// Helper function to generate subject line based on payment plan and term
function getPaymentReminderSubject(
  paymentPlan: string,
  term: string,
  tourPackage: string,
  dueDate: string,
): string {
  const termNumber = parseInt(term.replace("P", ""));
  const planNumber = parseInt(paymentPlan.replace("P", ""));

  // P1 only - single payment
  if (paymentPlan === "P1" || planNumber === 1) {
    return `Reminder – Your Final Installment for ${tourPackage} is Due on ${dueDate}`;
  }

  // For multi-payment plans
  if (termNumber === planNumber) {
    // Final installment
    return `Reminder – Your Final Installment for ${tourPackage} is Due on ${dueDate}`;
  } else if (termNumber === 1) {
    // First installment
    return `Your 1st Installment for ${tourPackage} is Due on ${dueDate}`;
  } else if (termNumber === 2) {
    // Second installment
    return `Reminder – Your 2nd Installment for ${tourPackage} is Due on ${dueDate}`;
  } else if (termNumber === 3) {
    // Third installment
    return `Reminder – Your 3rd Installment for ${tourPackage} is Due on ${dueDate}`;
  }

  // Default fallback
  return `Reminder – Your Payment for ${tourPackage} is Due on ${dueDate}`;
}

// Helper function to get applicable payment terms based on payment plan
function getApplicableTerms(paymentPlan: string): string[] {
  const allTerms = ["P1", "P2", "P3", "P4"];

  if (paymentPlan === "P2") {
    return allTerms.slice(0, 2);
  } else if (paymentPlan === "P3") {
    return allTerms.slice(0, 3);
  } else if (paymentPlan === "P4") {
    return allTerms;
  }

  // Default to P1 only
  return ["P1"];
}

// Helper function to get column value by column name
function getColumnValue(
  booking: Record<string, any>,
  columnName: string,
  columns: SheetColumn[],
): any {
  const column = columns.find((col) => col.columnName === columnName);
  if (!column) return undefined;
  return booking[column.id];
}

/**
 * Firestore trigger that runs when a booking document is updated
 * Detects when enablePaymentReminder changes to true and:
 * 1. Sends an initial summary email
 * 2. Creates scheduled reminder emails for P1-P4 payment terms
 */
export const onPaymentReminderEnabled = onDocumentUpdated(
  {
    document: "bookings/{bookingId}",
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    try {
      const bookingId = event.params.bookingId as string;
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();

      if (!beforeData || !afterData) {
        logger.info("No data found in before or after snapshot");
        return;
      }

      logger.info(`📧 Checking payment reminder for booking: ${bookingId}`);

      // Hardcoded column IDs for payment reminder feature
      // These match the coded columns in client/src/app/functions/columns
      const enableReminderColId = "enablePaymentReminder";

      // Check if enablePaymentReminder changed from false to true
      const wasEnabled = beforeData[enableReminderColId] === true;
      const isNowEnabled = afterData[enableReminderColId] === true;

      logger.info("Payment reminder status:", {
        columnId: enableReminderColId,
        columnName: "Enable Payment Reminder",
        wasEnabled,
        isNowEnabled,
        beforeValue: beforeData[enableReminderColId],
        afterValue: afterData[enableReminderColId],
      });

      if (wasEnabled || !isNowEnabled) {
        logger.info("Payment reminder not newly enabled, skipping", {
          reason: wasEnabled ? "Already was enabled" : "Not enabled in update",
        });
        return;
      }

      // Check if we should skip triggers (during CSV import or Sheets sync)
      const configDoc = await db.collection("config").doc("import-sync").get();
      const skipTriggers =
        configDoc.exists && configDoc.data()?.skipTriggers === true;
      if (skipTriggers) {
        logger.info("⏭️ Skipping trigger - import/sync operation in progress", {
          operation: configDoc.data()?.operation,
          startedAt: configDoc.data()?.startedAt,
        });
        return;
      }

      logger.info("✅ Payment reminder newly enabled!");

      // Get booking data with column mappings
      const booking = afterData;

      // Log all available fields in the booking for debugging
      logger.info("Available booking fields:", Object.keys(booking));

      // Log payment-related fields
      logger.info("Payment-related fields:", {
        paymentCondition: booking.paymentCondition,
        availablePaymentTerms: booking.availablePaymentTerms,
      });

      // Get required booking information
      const emailAddress = getColumnValue(
        booking,
        "Email Address",
        PAYMENT_REMINDER_COLUMNS,
      );
      const fullName = getColumnValue(
        booking,
        "Full Name",
        PAYMENT_REMINDER_COLUMNS,
      );
      const tourPackage = getColumnValue(
        booking,
        "Tour Package Name",
        PAYMENT_REMINDER_COLUMNS,
      );
      const sentInitialReminderLink = getColumnValue(
        booking,
        "Sent Initial Reminder Link",
        PAYMENT_REMINDER_COLUMNS,
      );

      // Use paymentPlan from booking as primary source, fallback to availablePaymentTerms
      const paymentPlan =
        booking.paymentPlan || booking.availablePaymentTerms || "";
      // Use the paymentMethod field from booking data
      const paymentMethod = booking.paymentMethod || "Other";

      logger.info("Booking details:", {
        paymentPlan,
        paymentMethod,
        emailAddress,
        fullName,
        tourPackage,
        sentInitialReminderLink,
      });

      // Validate required fields
      if (!paymentPlan) {
        logger.warn(
          "Payment Plan (availablePaymentTerms) missing, cannot enable reminders",
        );
        return;
      }

      if (!emailAddress) {
        logger.warn("Email address missing, cannot send reminders");
        return;
      }

      // Check if initial email was already sent
      if (sentInitialReminderLink) {
        logger.info("Initial reminder email already sent, skipping");
        // Still proceed to create scheduled emails if they don't exist
      } else {
        // Send initial summary email
        logger.info("🚀 Sending initial summary email...");

        try {
          const terms = getApplicableTerms(paymentPlan);

          // Create calendar events for all terms first
          logger.info("📅 Creating calendar events for payment due dates...");
          const calendarLinks: Record<string, string> = {};
          const calendarEventIds: Record<string, string> = {};

          for (const term of terms) {
            const dueDateRaw = getColumnValue(
              booking,
              `${term} Due Date`,
              PAYMENT_REMINDER_COLUMNS,
            );
            const calendarEventId = getColumnValue(
              booking,
              `${term} Calendar Event ID`,
              PAYMENT_REMINDER_COLUMNS,
            );
            const calendarEventLink = getColumnValue(
              booking,
              `${term} Calendar Event Link`,
              PAYMENT_REMINDER_COLUMNS,
            );

            // Skip if calendar event already exists or no due date
            if (!dueDateRaw || calendarEventId || calendarEventLink) {
              logger.info(
                `Skipping calendar event for ${term} - ${
                  calendarEventId
                    ? "already exists"
                    : calendarEventLink
                      ? "link already provided"
                      : "no due date"
                }`,
              );
              continue;
            }

            try {
              const dueDate = formatDate(dueDateRaw);
              const { eventId, eventLink } = await createCalendarEvent(
                term,
                dueDate,
                fullName || "",
                tourPackage || "",
                getColumnValue(
                  booking,
                  "Booking ID",
                  PAYMENT_REMINDER_COLUMNS,
                ) || "",
                emailAddress,
              );

              calendarLinks[term] = eventLink;
              calendarEventIds[term] = eventId;

              // Update booking with calendar event ID and link
              const calendarEventIdCol = PAYMENT_REMINDER_COLUMNS.find(
                (col) => col.columnName === `${term} Calendar Event ID`,
              );
              const calendarEventLinkCol = PAYMENT_REMINDER_COLUMNS.find(
                (col) => col.columnName === `${term} Calendar Event Link`,
              );

              const updateData: Record<string, any> = {};
              if (calendarEventIdCol) {
                updateData[calendarEventIdCol.id] = eventId;
              }
              if (calendarEventLinkCol) {
                updateData[calendarEventLinkCol.id] = eventLink;
              }

              if (Object.keys(updateData).length > 0) {
                await db
                  .collection("bookings")
                  .doc(bookingId)
                  .update(updateData);
              }

              logger.info(`✅ Created and saved calendar event for ${term}`);
            } catch (calendarError) {
              logger.error(
                `Error creating calendar event for ${term}:`,
                calendarError,
              );
              // Continue with other terms even if one fails
            }
          }

          // Build term data for initial email template (array of objects for Nunjucks)
          const termData = terms.map((t) => ({
            name: t,
            amount: formatGBP(
              getColumnValue(booking, `${t} Amount`, PAYMENT_REMINDER_COLUMNS),
            ),
            dueDate: formatDate(
              getColumnValue(
                booking,
                `${t} Due Date`,
                PAYMENT_REMINDER_COLUMNS,
              ),
            ),
            calendarLink: calendarLinks[t] || "",
          }));

          // Fetch tour package to get cover image
          let tourPackageCoverImage = "";
          try {
            const tourPackageSnap = await db
              .collection("tourPackages")
              .where("name", "==", tourPackage)
              .limit(1)
              .get();

            if (!tourPackageSnap.empty) {
              const tourPackageData = tourPackageSnap.docs[0].data();
              tourPackageCoverImage = tourPackageData.media?.coverImage || "";
              logger.info(
                `Found tour package cover image: ${tourPackageCoverImage ? "yes" : "no"}`,
              );
            } else {
              logger.info(`Tour package not found for: ${tourPackage}`);
            }
          } catch (error) {
            logger.warn("Could not fetch tour package for cover image:", error);
          }

          // Prepare template variables for initial email
          const templateVariables = {
            fullName: fullName || "",
            tourPackage: tourPackage || "",
            paymentPlan: paymentPlan || "",
            paymentMethod: paymentMethod || "",
            // The traveller pays from their own booking status page, which
            // knows who they are and what is actually due.
            bookingStatusUrl: buildBookingStatusUrl(booking.access_token),
            terms: termData, // Array of objects with name, amount, dueDate, calendarLink
            remainingBalance: formatGBP(
              getColumnValue(
                booking,
                "Remaining Balance",
                PAYMENT_REMINDER_COLUMNS,
              ),
            ),
            tourPackageCoverImage,
          };

          // Fetch template from Firestore
          const templateDoc = await db
            .collection("emailTemplates")
            .doc("DisPYJPnL01OmomT8Mch")
            .get();

          if (!templateDoc.exists) {
            throw new Error(
              "Initial Payment Reminder template not found in database",
            );
          }

          const templateData = templateDoc.data();
          const rawTemplateHtml = templateData?.content || "";

          if (!rawTemplateHtml) {
            throw new Error("Template has no content");
          }

          // Process template with Nunjucks
          const htmlContent = EmailTemplateService.processTemplate(
            rawTemplateHtml,
            templateVariables,
          );

          const gmailService = new GmailApiService();
          const subject = `${fullName}, Monthly Payment Reminders for ${tourPackage}`;

          const result = await gmailService.sendEmail({
            to: emailAddress,
            subject,
            htmlContent,
            from: "Bella | ImHereTravels <bella@imheretravels.com>",
          });

          logger.info("✅ Initial email sent successfully:", result.messageId);

          // Update the booking with the sent email link
          const sentEmailLink = getGmailSentUrl(result.messageId);
          const sentInitialReminderLinkCol = PAYMENT_REMINDER_COLUMNS.find(
            (col) => col.columnName === "Sent Initial Reminder Link",
          );

          if (sentInitialReminderLinkCol) {
            await db
              .collection("bookings")
              .doc(bookingId)
              .update({
                [sentInitialReminderLinkCol.id]: sentEmailLink,
              });
            logger.info("✅ Updated Sent Initial Reminder Link field");
          }
        } catch (error) {
          logger.error("❌ Error sending initial email:", error);
          // Continue to create scheduled emails even if initial email fails
        }
      }

      // Create scheduled reminder emails for P1-P4
      logger.info("📅 Creating scheduled reminder emails...");

      const terms = getApplicableTerms(paymentPlan);
      logger.info(`Terms to process: ${terms.join(", ")}`);

      const scheduledEmailCreatedTerms: string[] = [];

      for (const term of terms) {
        try {
          const scheduledEmailLink =
            getColumnValue(
              booking,
              `${term} Scheduled Email Link`,
              PAYMENT_REMINDER_COLUMNS,
            ) || booking?.[`${term.toLowerCase()}ScheduledEmailLink`];

          const scheduledReminderLink =
            getColumnValue(
              booking,
              `${term} Scheduled Reminder Link`,
              PAYMENT_REMINDER_COLUMNS,
            ) || booking?.[`${term.toLowerCase()}ScheduledReminderLink`];

          if (scheduledEmailLink || scheduledReminderLink) {
            logger.info(
              `Scheduled email already exists for ${term}, skipping`,
              {
                reason: scheduledEmailLink
                  ? "scheduledEmailLink present"
                  : "scheduledReminderLink present",
              },
            );
            continue;
          }

          // Check if scheduled reminder date exists
          const scheduledReminderDate = getColumnValue(
            booking,
            `${term} Scheduled Reminder Date`,
            PAYMENT_REMINDER_COLUMNS,
          );

          if (!scheduledReminderDate) {
            logger.info(`No scheduled reminder date for ${term}, skipping`);
            continue;
          }

          // Get term details
          const amount = getColumnValue(
            booking,
            `${term} Amount`,
            PAYMENT_REMINDER_COLUMNS,
          );
          const dueDateRaw = getColumnValue(
            booking,
            `${term} Due Date`,
            PAYMENT_REMINDER_COLUMNS,
          );

          // Parse due date for this specific term
          // Due dates can be comma-separated: "Dec 2, 2025, Jan 2, 2026, Feb 2, 2026, Mar 2, 2026"
          let dueDate = dueDateRaw;
          if (typeof dueDateRaw === "string" && dueDateRaw.includes(",")) {
            const parts = dueDateRaw.split(",").map((p) => p.trim());
            const termIndex = parseInt(term.replace("P", "")) - 1; // P1=0, P2=1, P3=2, P4=3
            // Dates are in format: "Month Day", "Year", "Month Day", "Year"
            // For term index n, we need parts[n*2] + ", " + parts[n*2+1]
            if (parts.length > termIndex * 2 + 1) {
              dueDate = `${parts[termIndex * 2]}, ${parts[termIndex * 2 + 1]}`;
            }
          }

          // Convert scheduled reminder date to Timestamp
          let scheduledFor: Timestamp;

          logger.info(
            `Processing ${term} scheduled reminder date:`,
            scheduledReminderDate,
            `Type: ${typeof scheduledReminderDate}`,
          );

          if (
            scheduledReminderDate &&
            typeof scheduledReminderDate === "object" &&
            scheduledReminderDate._seconds
          ) {
            // Firestore Timestamp object
            scheduledFor = Timestamp.fromMillis(
              scheduledReminderDate._seconds * 1000,
            );
            logger.info(`Converted Firestore Timestamp for ${term}`);
          } else if (scheduledReminderDate instanceof Date) {
            // JavaScript Date object
            scheduledFor = Timestamp.fromDate(scheduledReminderDate);
            logger.info(`Converted Date object for ${term}`);
          } else if (typeof scheduledReminderDate === "string") {
            // String date like "2025-10-20"
            // Parse the date and set time to 9 AM (matching scheduler run time)
            const dateObj = new Date(scheduledReminderDate + "T09:00:00+08:00"); // Singapore time

            if (isNaN(dateObj.getTime())) {
              logger.warn(
                `Invalid date string format for ${term}: ${scheduledReminderDate}`,
              );
              continue;
            }

            scheduledFor = Timestamp.fromDate(dateObj);
            logger.info(
              `Converted string date for ${term}: ${scheduledReminderDate} -> ${dateObj.toISOString()}`,
            );
          } else {
            logger.warn(
              `Invalid scheduled reminder date for ${term}:`,
              scheduledReminderDate,
            );
            continue;
          }

          // Generate subject line
          const subject = getPaymentReminderSubject(
            paymentPlan,
            term,
            tourPackage || "",
            formatDate(dueDate),
          );

          // Fetch tour package to get cover image
          let tourPackageCoverImage = "";
          try {
            const tourPackageSnap = await db
              .collection("tourPackages")
              .where("name", "==", tourPackage)
              .limit(1)
              .get();

            if (!tourPackageSnap.empty) {
              const tourPackageData = tourPackageSnap.docs[0].data();
              tourPackageCoverImage = tourPackageData.media?.coverImage || "";
              logger.info(
                `Found tour package cover image: ${tourPackageCoverImage ? "yes" : "no"}`,
              );
            } else {
              logger.info(`Tour package not found for: ${tourPackage}`);
            }
          } catch (error) {
            logger.warn("Could not fetch tour package for cover image:", error);
          }

          // Always show all terms up to the payment plan (not just up to current term)
          const visibleTerms = terms;

          // The email send date - used to determine if a past-due unpaid term is "Late"
          const emailSendDate = scheduledFor.toDate();

          const getTermLatePenalty = (termLabel: string): number => {
            const rawPenalty = (booking as any)[
              `${termLabel.toLowerCase()}LateFeesPenalty`
            ];
            const parsed = Number(rawPenalty);
            return Number.isFinite(parsed) ? parsed : 0;
          };

          const termData = visibleTerms.map((t) => {
            const tDueDateRaw = getColumnValue(
              booking,
              `${t} Due Date`,
              PAYMENT_REMINDER_COLUMNS,
            );
            let tDueDate = tDueDateRaw;

            // Parse due date for each term
            if (typeof tDueDateRaw === "string" && tDueDateRaw.includes(",")) {
              const parts = tDueDateRaw.split(",").map((p) => p.trim());
              const tIndex = parseInt(t.replace("P", "")) - 1;
              if (parts.length > tIndex * 2 + 1) {
                tDueDate = `${parts[tIndex * 2]}, ${parts[tIndex * 2 + 1]}`;
              }
            }

            const dueDateFormatted = formatDate(tDueDate);
            const datePaidFormatted = formatDate(
              getColumnValue(
                booking,
                `${t} Date Paid`,
                PAYMENT_REMINDER_COLUMNS,
              ),
            );

            // A term is "Late" if unpaid and its due date passed before this email was sent
            const isLate =
              !datePaidFormatted &&
              !!dueDateFormatted &&
              new Date(dueDateFormatted) < emailSendDate;
            const penaltyValue = getTermLatePenalty(t);

            return {
              term: t,
              amount: formatGBP(
                getColumnValue(
                  booking,
                  `${t} Amount`,
                  PAYMENT_REMINDER_COLUMNS,
                ),
              ),
              dueDate: dueDateFormatted,
              datePaid: datePaidFormatted,
              isLate,
              penaltyValue,
              penaltyAmount: penaltyValue > 0 ? formatGBP(penaltyValue) : "",
            };
          });

          const totalLateFeesValueFromTerms = termData.reduce(
            (sum, item) => sum + (Number(item.penaltyValue) || 0),
            0,
          );
          const bookingTotalLateFees = Number(
            (booking as any).totalLateFees || 0,
          );
          const totalLateFeesValue =
            totalLateFeesValueFromTerms > 0
              ? totalLateFeesValueFromTerms
              : Number.isFinite(bookingTotalLateFees)
                ? bookingTotalLateFees
                : 0;
          const hasLateFeePenalties = termData.some(
            (item) => Number(item.penaltyValue) > 0,
          );
          const currentTermLatePenalty = getTermLatePenalty(term);

          // Prepare template variables
          const templateVariables = {
            fullName: fullName || "",
            tourPackage: tourPackage || "",
            paymentMethod: paymentMethod || "",
            paymentTerm: term,
            amount: formatGBP(amount),
            dueDate: formatDate(dueDate),
            lateFeePenalty: formatGBP(currentTermLatePenalty),
            lateFeePenaltyValue: currentTermLatePenalty,
            bookingId:
              getColumnValue(booking, "Booking ID", PAYMENT_REMINDER_COLUMNS) ||
              "",
            tourDate: formatDate(
              getColumnValue(booking, "Tour Date", PAYMENT_REMINDER_COLUMNS),
            ),
            reservationFee: formatGBP(
              getColumnValue(
                booking,
                "Reservation Fee",
                PAYMENT_REMINDER_COLUMNS,
              ),
            ),
            paidTerms: formatGBP(
              getColumnValue(booking, "Paid Terms", PAYMENT_REMINDER_COLUMNS),
            ),
            paid: formatGBP(
              getColumnValue(booking, "Paid", PAYMENT_REMINDER_COLUMNS),
            ),
            remainingBalance: formatGBP(
              getColumnValue(
                booking,
                "Remaining Balance",
                PAYMENT_REMINDER_COLUMNS,
              ),
            ),
            totalAmount: formatGBP(
              getColumnValue(
                booking,
                "Use Discounted Tour Cost?",
                PAYMENT_REMINDER_COLUMNS,
              )
                ? getColumnValue(
                    booking,
                    "Discounted Tour Cost",
                    PAYMENT_REMINDER_COLUMNS,
                  )
                : getColumnValue(
                    booking,
                    "Original Tour Cost",
                    PAYMENT_REMINDER_COLUMNS,
                  ),
            ),
            totalLateFees: formatGBP(totalLateFeesValue),
            totalLateFeesValue,
            hasLateFeePenalties,
            showTable: true,
            termData: termData,
            tourPackageCoverImage,
          };

          // Load raw template HTML from file
          const rawTemplateHtml = EmailTemplateLoader.loadTemplate(
            "scheduledReminderEmail",
            {} as any, // Pass empty object since we'll process with Nunjucks
          );

          // Process template with Nunjucks for conditionals and loops
          const htmlContent = EmailTemplateService.processTemplate(
            rawTemplateHtml,
            templateVariables,
          );

          // Create scheduled email document
          const scheduledEmailDoc = await db.collection("scheduledEmails").add({
            to: emailAddress,
            subject,
            htmlContent,
            from: "Bella | ImHereTravels <bella@imheretravels.com>",
            scheduledFor,
            status: "pending",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            attempts: 0,
            maxAttempts: 3,
            emailType: "payment-reminder",
            bookingId: bookingId,
            row: booking.row || null,
            templateId: "GEB3llGzftDaWRFXj8qz",
            templateVariables,
          });

          logger.info(
            `✅ Created scheduled email for ${term}: ${scheduledEmailDoc.id}`,
          );

          scheduledEmailCreatedTerms.push(term);

          // Update booking with scheduled email document ID
          const scheduledEmailLinkCol = PAYMENT_REMINDER_COLUMNS.find(
            (col) => col.columnName === `${term} Scheduled Email Link`,
          );

          if (scheduledEmailLinkCol) {
            await db
              .collection("bookings")
              .doc(bookingId)
              .update({
                [scheduledEmailLinkCol.id]: `https://admin.imheretravels.com/mail/payment-reminders?emailId=${scheduledEmailDoc.id}`,
              });
          }
        } catch (error) {
          logger.error(`❌ Error creating scheduled email for ${term}:`, error);
        }
      }

      logger.info("✅ Payment reminder setup completed successfully");

      // Create notification for payment reminder setup
      const allScheduledCreated =
        scheduledEmailCreatedTerms.length === terms.length;

      if (!allScheduledCreated) {
        logger.info(
          "Skipping notification - not all scheduled reminders were created",
          {
            created: scheduledEmailCreatedTerms,
            expected: terms,
          },
        );
      } else {
        try {
          const termsCreated = terms.join(", ");

          await db.collection("notifications").add({
            type: "payment_reminder_created",
            title: "Payment Reminders Scheduled",
            body: `Payment reminders scheduled for ${
              fullName || "customer"
            } - ${tourPackage || "Tour"} (${termsCreated})`,
            data: {
              bookingId:
                getColumnValue(
                  booking,
                  "Booking ID",
                  PAYMENT_REMINDER_COLUMNS,
                ) || bookingId,
              bookingDocumentId: bookingId,
              travelerName: fullName || "",
              tourPackageName: tourPackage || "",
              paymentPlan,
              termsCount: terms.length,
            },
            targetType: "global",
            targetUserIds: [],
            createdAt: new Date(),
            readBy: {},
          });

          logger.info("✅ Notification created for payment reminder setup");
        } catch (notificationError) {
          logger.warn("Failed to create notification:", notificationError);
          // Fail silently - don't block the reminder setup
        }
      }
    } catch (error) {
      logger.error("❌ Error in payment reminder trigger:", error);
      throw error;
    }
  },
);
