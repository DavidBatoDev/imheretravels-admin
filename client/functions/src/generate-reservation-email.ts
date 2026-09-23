import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import EmailTemplateService from "./email-template-service";
import GmailApiService from "./gmail-api-service";
import { buildBookingStatusUrl } from "./booking-status-url";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

// Helper function to generate Gmail draft URL
function getGmailDraftUrl(draftId: string, messageId: string): string {
  return `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
}

// Helper function to format dates like Google Sheets: "Dec 2, 2025"
function formatDateLikeSheets(dateValue: any): string {
  if (!dateValue) return "";

  try {
    let date: Date | null = null;

    // Handle Firestore Timestamp objects
    if (dateValue && typeof dateValue === "object" && dateValue._seconds) {
      date = new Date(dateValue._seconds * 1000);
    }
    // Handle string dates (including comma-separated dates like P2/P3/P4)
    else if (typeof dateValue === "string" && dateValue.trim() !== "") {
      const trimmedValue = dateValue.trim();

      // Check if it's already in the correct format from P2/P3/P4 functions
      // These functions already return formatted strings like "Dec 2, 2025, Jan 2, 2026"
      // If the string contains a month name (Jan, Feb, etc.), assume it's already formatted
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const hasMonthName = monthNames.some((month) =>
        trimmedValue.includes(month),
      );

      if (hasMonthName) {
        // Already formatted by P2/P3/P4 functions, return as-is
        return trimmedValue;
      }

      // Otherwise, try to parse and format the date
      date = new Date(trimmedValue);
    }
    // Handle Date objects
    else if (dateValue instanceof Date) {
      date = dateValue;
    }

    // Validate and format the date
    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
      });
    }

    return "";
  } catch (error) {
    console.warn("Error formatting date:", error, "Value:", dateValue);
    return "";
  }
}

// Helper function to parse discount rate (handles "20%" or 20 → returns 20)
function parseDiscountRate(discountRate: any): number {
  if (!discountRate) return 0;

  // If it's already a number, return it
  if (typeof discountRate === "number") {
    return discountRate;
  }

  // If it's a string like "20%", parse it
  if (typeof discountRate === "string") {
    const numericValue = parseFloat(discountRate.replace("%", ""));
    return isNaN(numericValue) ? 0 : numericValue;
  }

  return 0;
}

// Helper function to generate subject line based on payment terms
function getSubjectLine(
  availablePaymentTerms: string,
  fullName: string,
  tourPackage: string,
  isCancelled: boolean = false,
): string {
  if (isCancelled) {
    return `Important Update: Your ${tourPackage} has been Cancelled`;
  }

  switch (availablePaymentTerms) {
    case "Invalid":
      return "Action Required: Issue with your Booking - Please Review";
    case "Full payment required within 48hrs":
      return `Action Required: Complete your Booking for ${tourPackage}`;
    case "P1":
      return `Hi ${fullName}, Complete your Booking for ${tourPackage}`;
    case "P2":
      return "Choose a Payment Plan to Confirm your Tour";
    case "P3":
    case "P4":
      return `Confirm your Spot on ${tourPackage} with a Flexible Payment Plan`;
    default:
      return "Booking Confirmation: Please Review your Details";
  }
}

// Helper function to get main booker by group ID.
// Single-field equality only — adding `isMainBooker` to the query would need a
// composite index that does not exist, so the flag is filtered in memory.
async function getMainBookerByGroupId(groupId: string): Promise<string | null> {
  try {
    const bookingsSnap = await db
      .collection("bookings")
      .where("groupId", "==", groupId)
      .get();

    if (bookingsSnap.empty) return null;

    const mainDoc = bookingsSnap.docs.find(
      (d) => d.data().isMainBooker === true,
    );
    if (!mainDoc) return null;

    const booking = mainDoc.data();
    const firstName = booking.firstName || "";
    const lastName = booking.lastName || "";
    return `${firstName} ${lastName}`.trim();
  } catch (error) {
    logger.error("Error getting main booker:", error);
    return null;
  }
}

// Helper function to get BCC list from includeBcc flag
async function getBCCList(includeBcc: boolean): Promise<string[]> {
  if (!includeBcc) return [];

  try {
    const bccUsersSnap = await db.collection("bcc-users").get();
    const bccList = bccUsersSnap.docs
      .map((doc) => doc.data())
      .filter((user: any) => user.isActive === true)
      .map((user: any) => user.email)
      .filter((email: string) => email && email.trim() !== "");

    logger.info(`Found ${bccList.length} active BCC users`);
    return bccList;
  } catch (error) {
    logger.error("Error fetching BCC users:", error);
    return [];
  }
}

// Helper function to extract message ID from Gmail URL
function extractMessageIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const composeParam = urlObj.searchParams.get("compose");
    if (composeParam) return composeParam;

    const hash = urlObj.hash;
    const composeMatch = hash.match(/compose=([^&]+)/);
    if (composeMatch) return composeMatch[1];

    const pathMatch = hash.match(/#drafts\/([^?&]+)/);
    if (pathMatch) return pathMatch[1];

    return null;
  } catch (error) {
    logger.error("Error parsing draft URL:", error);
    return null;
  }
}

/**
 * Firestore trigger that runs when a booking document is updated
 * Detects when generateEmailDraft changes and:
 * - When toggled ON: Creates Gmail draft and updates emailDraftLink & subjectLineReservation
 * - When toggled OFF: Deletes Gmail draft and clears emailDraftLink & subjectLineReservation
 */
export const onGenerateEmailDraftChanged = onDocumentUpdated(
  {
    document: "bookings/{bookingId}",
    region: "asia-southeast1",
    timeoutSeconds: 300,
    memory: "1GiB",
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

      logger.info(`📧 Checking generateEmailDraft for booking: ${bookingId}`);

      // Check if generateEmailDraft changed
      const wasEnabled = beforeData.generateEmailDraft === true;
      const isNowEnabled = afterData.generateEmailDraft === true;

      logger.info("Generate email draft status:", {
        wasEnabled,
        isNowEnabled,
        beforeValue: beforeData.generateEmailDraft,
        afterValue: afterData.generateEmailDraft,
      });

      // No change detected
      if (wasEnabled === isNowEnabled) {
        logger.info("No change in generateEmailDraft status, skipping");
        return;
      }

      // Initialize Gmail API service
      const gmailService = new GmailApiService();

      // TOGGLE OFF: Delete draft and clear fields
      if (wasEnabled && !isNowEnabled) {
        logger.info("🗑️ Generate email draft toggled OFF - deleting draft");

        // Use afterData instead of beforeData to get the current emailDraftLink
        const existingDraftUrl = afterData.emailDraftLink;
        logger.info(`Existing draft URL from afterData: ${existingDraftUrl}`);

        if (existingDraftUrl) {
          try {
            // Extract message ID from the URL
            const messageId = extractMessageIdFromUrl(existingDraftUrl);
            logger.info(`Extracted message ID from URL: ${messageId}`);

            if (messageId) {
              // Find the actual draft ID using the message ID
              logger.info(`Finding draft ID for message ID: ${messageId}`);
              const draftId =
                await gmailService.findDraftIdByMessageId(messageId);

              if (draftId) {
                logger.info(`Found draft ID: ${draftId}, deleting...`);
                await gmailService.deleteDraft(draftId);
                logger.info("✅ Gmail draft deleted successfully");
              } else {
                logger.warn(
                  `Could not find draft with message ID: ${messageId}`,
                );
              }
            } else {
              logger.warn("Could not extract message ID from URL");
            }
          } catch (deleteError) {
            logger.error("❌ Error deleting Gmail draft:", deleteError);
            // Continue to clear fields even if deletion fails
          }
        } else {
          logger.info("No existing draft URL found, skipping deletion");
        } // Clear the email draft link and subject line
        await db.collection("bookings").doc(bookingId).update({
          emailDraftLink: "",
          subjectLineReservation: "",
        });

        logger.info("Email draft fields cleared successfully");
        return;
      }

      // TOGGLE ON: Create draft and update fields
      if (!wasEnabled && isNowEnabled) {
        logger.info("✅ Generate email draft toggled ON - creating draft");

        const bookingData = afterData;

        // Validate email
        const email = (bookingData.emailAddress as string)?.trim();
        if (!email || !email.includes("@")) {
          logger.warn(`Invalid email address: "${email}"`);
          return;
        }

        // Delete existing draft if it exists
        const existingDraftUrl = bookingData.emailDraftLink;
        if (existingDraftUrl) {
          try {
            // Extract message ID from the URL
            const messageId = extractMessageIdFromUrl(existingDraftUrl);
            if (messageId) {
              // Find the actual draft ID using the message ID
              logger.info(
                "Finding existing draft to delete before creating new one",
              );
              const draftId =
                await gmailService.findDraftIdByMessageId(messageId);

              if (draftId) {
                logger.info(`Deleting existing draft with ID: ${draftId}`);
                await gmailService.deleteDraft(draftId);
                logger.info("Existing draft deleted successfully");
              }
            }
          } catch (deleteError) {
            logger.error("Error deleting existing draft:", deleteError);
          }
        }

        // Get template data
        const templateDoc = await db
          .collection("emailTemplates")
          .doc("BnRGgT6E8SVrXZH961LT")
          .get();

        if (!templateDoc.exists) {
          logger.error("Email template not found");
          return;
        }

        const templateData = templateDoc.data()!;

        // Extract booking data for template variables
        const fullName = bookingData.fullName || "";
        const bookingIdValue = bookingData.bookingId || "";
        const groupId = bookingData.groupId || "";
        const tourPackage = bookingData.tourPackageName || "";
        const tourDateRaw = bookingData.tourDate;
        const returnDateRaw = bookingData.returnDate;
        const tourDuration = bookingData.tourDuration || "";
        const bookingType = bookingData.bookingType || "";
        const reservationFee = bookingData.reservationFee || 0;
        const eventName = bookingData.eventName || "";
        const discountType = bookingData.discountType || "";
        const discountRate = bookingData.discountRate || "";
        const originalTourCost = bookingData.originalTourCost || 0;
        const discountedTourCost = bookingData.discountedTourCost || 0;
        const remainingBalance = bookingData.remainingBalance || 0;
        const fullPaymentAmount = bookingData.fullPaymentAmount || 0;
        const fullPaymentDueDate = bookingData.fullPaymentDueDate;
        const p1Amount = bookingData.p1Amount || 0;
        const p1DueDate = bookingData.p1DueDate;
        const p2Amount = bookingData.p2Amount || 0;
        const p2DueDate = bookingData.p2DueDate;
        const p3Amount = bookingData.p3Amount || 0;
        const p3DueDate = bookingData.p3DueDate;
        const p4Amount = bookingData.p4Amount || 0;
        const p4DueDate = bookingData.p4DueDate;
        const availablePaymentTerms = bookingData.availablePaymentTerms || "";

        // Compute final payment deadline: 2 calendar months before tour date
        const tourDateObj = (() => {
          const raw = tourDateRaw;
          if (!raw) return null;
          if (typeof raw === "object" && (raw as any)._seconds)
            return new Date((raw as any)._seconds * 1000);
          if (raw instanceof Date) return raw;
          if (typeof raw === "string") {
            const d = new Date(raw.trim());
            return isNaN(d.getTime()) ? null : d;
          }
          return null;
        })();
        const finalPaymentDeadline = tourDateObj
          ? formatDateLikeSheets(
              new Date(
                tourDateObj.getFullYear(),
                tourDateObj.getMonth() - 2,
                tourDateObj.getDate(),
              ),
            )
          : "";
        const reasonForCancellation = bookingData.reasonForCancellation || "";
        const accessToken = bookingData.access_token || "";

        // Determine if this is a cancellation email
        const isCancelled =
          availablePaymentTerms === "Cancelled" || !!reasonForCancellation;

        // Generate subject line
        const subject = getSubjectLine(
          availablePaymentTerms,
          fullName,
          tourPackage,
          isCancelled,
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

        // Get main booker for group bookings
        let mainBooker = fullName;
        if (
          (bookingType === "Group Booking" || bookingType === "Duo Booking") &&
          groupId
        ) {
          const mainBookerResult = await getMainBookerByGroupId(groupId);
          mainBooker = mainBookerResult || fullName;
        }

        // Prepare template variables
        const parsedDiscountRate = parseDiscountRate(discountRate);
        const normalizedDiscountType = String(discountType).toLowerCase();
        const originalCostNumber = Number(originalTourCost) || 0;
        const discountedCostNumber = Number(discountedTourCost) || 0;
        const formattedDiscountRate = parsedDiscountRate.toFixed(2);

        const templateVariables: Record<string, any> = {
          fullName,
          mainBooker,
          tourPackage,
          tourDate: formatDateLikeSheets(tourDateRaw),
          returnDate: formatDateLikeSheets(returnDateRaw),
          availablePaymentTerms,
          tourDuration,
          bookingType,
          bookingId: bookingIdValue,
          groupId,
          reservationFee: Number(reservationFee).toFixed(2),
          eventName: eventName || "",
          discountType: discountType || "",
          discountRate: parsedDiscountRate,
          discountDisplayText: normalizedDiscountType.includes("amount")
            ? `£${formattedDiscountRate}`
            : `${formattedDiscountRate}%`,
          hasDiscount: !!(
            eventName &&
            parsedDiscountRate > 0 &&
            (discountedCostNumber === 0 ||
              originalCostNumber > discountedCostNumber)
          ),
          originalTourCost: Number(originalTourCost).toFixed(2),
          discountedTourCost: Number(discountedTourCost).toFixed(2),
          discountSavings: Number(
            originalTourCost - discountedTourCost,
          ).toFixed(2),
          remainingBalance: Number(remainingBalance).toFixed(2),
          fullPaymentAmount: Number(fullPaymentAmount).toFixed(2),
          fullPaymentDueDate: formatDateLikeSheets(fullPaymentDueDate),
          p1Amount: Number(p1Amount).toFixed(2),
          p1DueDate: formatDateLikeSheets(p1DueDate),
          p2Amount: Number(p2Amount).toFixed(2),
          p2DueDate: formatDateLikeSheets(p2DueDate),
          p3Amount: Number(p3Amount).toFixed(2),
          p3DueDate: formatDateLikeSheets(p3DueDate),
          p4Amount: Number(p4Amount).toFixed(2),
          p4DueDate: formatDateLikeSheets(p4DueDate),
          finalPaymentDeadline,
          isCancelled,
          cancelledRefundAmount: isCancelled
            ? Number(reservationFee).toFixed(2)
            : "",
          tourPackageCoverImage,
          accessToken,
          // The traveller pays from their own booking status page, which knows
          // who they are and what is actually due.
          bookingStatusUrl: buildBookingStatusUrl(accessToken),
          currentYear: new Date().getFullYear(),
        };

        // Process template content
        let processedHtml: string;
        try {
          processedHtml = EmailTemplateService.processTemplate(
            templateData.content,
            templateVariables,
          );
          logger.info(
            `Template processed successfully, HTML length: ${processedHtml.length}`,
          );
        } catch (templateError) {
          logger.error(`Template processing error:`, templateError);
          return;
        }

        // Get BCC list
        const includeBcc = bookingData.includeBccReservation === true;
        const bccList = await getBCCList(includeBcc);

        if (bccList.length > 0) {
          logger.info(
            `Including ${bccList.length} BCC recipients in email draft`,
          );
        }

        // Create Gmail draft
        try {
          const gmailDraftResult = await gmailService.createDraft({
            to: email,
            subject: subject,
            htmlContent: processedHtml,
            bcc: bccList,
            from: "Bella | ImHereTravels <bella@imheretravels.com>",
          });

          logger.info(
            `Gmail draft created successfully: ${gmailDraftResult.draftId}`,
          );

          // Generate the Gmail draft URL
          const draftUrl = getGmailDraftUrl(
            gmailDraftResult.draftId,
            gmailDraftResult.messageId,
          );

          // Update booking with draft URL and subject
          await db.collection("bookings").doc(bookingId).update({
            emailDraftLink: draftUrl,
            subjectLineReservation: subject,
          });

          logger.info(
            `✅ Email draft created and booking updated with URL and subject`,
          );
        } catch (gmailError) {
          logger.error("Error creating Gmail draft:", gmailError);
          // Don't throw error, just log it
        }
      }
    } catch (error) {
      logger.error("❌ Error in onGenerateEmailDraftChanged:", error);
      // Don't throw error to prevent retries
    }
  },
);
