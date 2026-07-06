// functions/src/scheduled-abandoned-booking-followups.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp, getApps } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import GmailApiService from "./gmail-api-service";
import EmailTemplateService from "./email-template-service";
import { EmailTemplateLoader } from "./email-template-loader";
import {
  MarketingContact,
  getMarketingContact,
  normalizeEmail,
  upsertMarketingContact,
  markContactFollowUpSent,
} from "./marketing-contacts";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

type FollowUpStage = "first" | "second";

const ABANDONED_STATUSES = ["reserve_pending", "pending"];
const PAID_STATUSES = ["reserve_paid", "terms_selected", "succeeded"];
const MAX_SENDS_PER_RUN = 50;
const CROSS_DRAFT_DEDUPE_DAYS = 7;

const TEMPLATE_NAMES: Record<FollowUpStage, string> = {
  first: "abandonedBookingFollowUp1",
  second: "abandonedBookingFollowUp2",
};

const DEFAULT_SUBJECTS: Record<FollowUpStage, (vars: TemplateVars) => string> =
  {
    first: (vars) =>
      `${vars.firstName}, need a hand completing your ${vars.tourPackageName} booking?`,
    second: (vars) =>
      `Still thinking it over? Your spot on ${vars.tourPackageName} is waiting`,
  };

interface TemplateVars {
  firstName: string;
  tourPackageName: string;
  tourDate: string;
  reservationFee: string;
  resumeUrl: string;
  unsubscribeUrl: string;
  tourPackageCoverImage: string;
  currentYear: string;
}

interface RunStats {
  candidates: number;
  firstSent: number;
  secondSent: number;
  skipped: number;
  errors: string[];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Escape user-derived values before Nunjucks rendering — the shared
 * EmailTemplateService runs with autoescape disabled. This escapes HTML
 * entities for the email body (which is text/html). Subject values must
 * be sanitized separately for SMTP header injection.
 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitize user-derived values for use in email headers (e.g. Subject).
 * Removes CR/LF and other SMTP-unsafe characters to prevent header injection.
 */
function sanitizeHeaderValue(value: string): string {
  return String(value)
    .replace(/[\r\n]/g, " ") // Remove CR/LF that would break headers
    .replace(/[^\x20-\x7E]/g, "?"); // Replace non-ASCII with ?
}

function formatTourDate(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatReservationFee(amount: unknown): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `£${value.toFixed(2)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasRealBooking(data: FirebaseFirestore.DocumentData): boolean {
  const documentId = data.booking?.documentId;
  return Boolean(documentId) && documentId !== "" && documentId !== "PENDING";
}

function isAbandonedStatus(data: FirebaseFirestore.DocumentData): boolean {
  const status = data.payment?.status || data.status;
  return ABANDONED_STATUSES.includes(status);
}

/**
 * Determine which follow-up (if any) a draft is due for.
 * The second email additionally waits out the first→second gap relative to
 * the first send, so a draft discovered late never gets both emails
 * back-to-back.
 */
function getDueStage(
  data: FirebaseFirestore.DocumentData,
  now: Timestamp,
  firstDelayMinutes: number,
  secondDelayMinutes: number
): FollowUpStage | null {
  const createdAt: Timestamp | undefined = data.timestamps?.createdAt;
  if (!createdAt) return null;

  const ageMinutes = (now.toMillis() - createdAt.toMillis()) / 60000;
  const followUps = data.followUps || {};

  if (followUps.suppressedReason) return null;

  if (
    followUps.first?.sentAt &&
    !followUps.second &&
    ageMinutes >= secondDelayMinutes
  ) {
    const sinceFirstMinutes =
      (now.toMillis() - followUps.first.sentAt.toMillis()) / 60000;
    if (sinceFirstMinutes >= secondDelayMinutes - firstDelayMinutes) {
      return "second";
    }
    return null;
  }

  if (!followUps.first && ageMinutes >= firstDelayMinutes) {
    return "first";
  }

  return null;
}

/**
 * Hybrid template resolution: prefer the admin-editable Firestore
 * emailTemplates doc (looked up by name so it works on both the dev and prod
 * projects), fall back to the HTML file bundled with the functions code.
 */
async function resolveTemplate(
  stage: FollowUpStage,
  vars: TemplateVars,
  // Subject is a plain-text header, so it must use un-HTML-escaped names
  // (otherwise "Danielle & Erin" becomes "Danielle &amp; Erin"). Body keeps
  // the escaped `vars`. Defaults to `vars` for backward compatibility.
  subjectVars: TemplateVars = vars
): Promise<{ subject: string; htmlContent: string }> {
  const templateName = TEMPLATE_NAMES[stage];
  let rawHtml = "";
  let rawSubject = "";

  try {
    const templateQuery = await db
      .collection("emailTemplates")
      .where("name", "==", templateName)
      .limit(1)
      .get();

    if (!templateQuery.empty) {
      const templateData = templateQuery.docs[0].data();
      const status = templateData.status;
      if (
        templateData.content &&
        (status === undefined || status === "active")
      ) {
        rawHtml = templateData.content;
        rawSubject = templateData.subject || "";
        logger.info(`Using Firestore emailTemplates "${templateName}"`);
      }
    }
  } catch (error) {
    logger.warn(
      `Failed to fetch emailTemplates "${templateName}", falling back to file:`,
      error
    );
  }

  if (!rawHtml) {
    // Empty data object returns the raw template for Nunjucks processing
    rawHtml = EmailTemplateLoader.loadTemplate(templateName, {} as any);
    logger.info(`Using bundled file template "${templateName}"`);
  }

  const htmlContent = EmailTemplateService.processTemplate(rawHtml, vars);
  const subject = rawSubject
    ? EmailTemplateService.processTemplate(rawSubject, subjectVars)
    : DEFAULT_SUBJECTS[stage](subjectVars);

  return { subject, htmlContent };
}

async function fetchTourCoverImage(packageId: string): Promise<string> {
  if (!packageId) return "";
  try {
    const tourDoc = await db.collection("tourPackages").doc(packageId).get();
    return tourDoc.exists ? tourDoc.data()?.media?.coverImage || "" : "";
  } catch (error) {
    logger.warn(`Failed to fetch tour cover image for ${packageId}:`, error);
    return "";
  }
}

/**
 * True when this email already completed a reservation payment for the same
 * tour on another stripePayments doc (e.g. paid in a second tab).
 */
async function hasPaidElsewhere(
  email: string,
  packageId: string,
  excludeDocId: string
): Promise<boolean> {
  try {
    const snapshot = await db
      .collection("stripePayments")
      .where("customer.email", "==", email)
      .get();

    return snapshot.docs.some((doc) => {
      if (doc.id === excludeDocId) return false;
      const data = doc.data();
      if (packageId && data.tour?.packageId !== packageId) return false;
      const status = data.payment?.status || data.status;
      return PAID_STATUSES.includes(status) || hasRealBooking(data);
    });
  } catch (error) {
    logger.warn(`Cross-doc paid check failed for ${email}:`, error);
    return false;
  }
}

async function markSuppressed(
  docRef: FirebaseFirestore.DocumentReference,
  reason: string
): Promise<void> {
  try {
    // Deliberately does NOT touch timestamps.updatedAt so the abandoned
    // payments cleanup job's activity check is unaffected.
    await docRef.update({ "followUps.suppressedReason": reason });
  } catch (error) {
    logger.warn(`Failed to mark ${docRef.id} suppressed (${reason}):`, error);
  }
}

async function createSentNotification(input: {
  stage: FollowUpStage;
  paymentDocId: string;
  travelerName: string;
  tourPackageName: string;
  email: string;
}): Promise<void> {
  try {
    await db.collection("notifications").add({
      type: "abandoned_followup_sent",
      title: "Abandoned Booking Follow-Up Sent",
      body: `${input.stage === "first" ? "1-hour" : "1-day"} follow-up sent to ${
        input.travelerName || input.email
      } — ${input.tourPackageName || "Tour"}`,
      data: {
        stripePaymentDocId: input.paymentDocId,
        travelerName: input.travelerName,
        tourPackageName: input.tourPackageName,
        stage: input.stage,
      },
      targetType: "global",
      targetUserIds: [],
      createdAt: new Date(),
      readBy: {},
    });
  } catch (error) {
    logger.warn("Failed to create follow-up notification:", error);
    // Fail silently — a missing notification must not block the send flow
  }
}

/**
 * Scheduled Cloud Function that emails customers who started the reservation
 * booking form but never paid the reservation fee ("abandoned bookings").
 *
 * - Email #1 after ABANDONED_FOLLOWUP_FIRST_MINUTES (default 60): friendly
 *   "can we help?" with a resume link back to the payment step.
 * - Email #2 after ABANDONED_FOLLOWUP_SECOND_MINUTES (default 1440): a second
 *   nudge, only if email #1 was sent and the draft is still unpaid.
 *
 * Every emailed customer is also captured into the marketingContacts
 * collection (with an unsubscribe token) BEFORE the stripePayments draft is
 * deleted by the 7-day cleanupAbandonedPayments job.
 *
 * Controlled at runtime by the config/abandoned-followups doc:
 *   { enabled: boolean, dryRun: boolean } — missing doc means enabled.
 *
 * Send markers are written under `followUps` and never touch
 * `timestamps.updatedAt`, so cleanupAbandonedPayments behavior is unchanged.
 */
export const sendAbandonedBookingFollowUps = onSchedule(
  {
    schedule: "*/10 * * * *", // Every 10 minutes
    timeZone: "UTC",
    region: "asia-southeast1",
    timeoutSeconds: 540, // Allows ~50 sends × 10s each (8-10 network calls per send)
  },
  async () => {
    const now = Timestamp.now();
    const stats: RunStats = {
      candidates: 0,
      firstSent: 0,
      secondSent: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // 1. Runtime config gate (kill switch / dry run without redeploy)
      const configDoc = await db
        .collection("config")
        .doc("abandoned-followups")
        .get();
      const config = configDoc.exists ? configDoc.data() || {} : {};

      if (config.enabled === false) {
        logger.info("⏭️ Abandoned-booking follow-ups disabled via config");
        return;
      }
      const dryRun = config.dryRun === true;

      // 2. Resolve env-configurable thresholds
      const firstDelayMinutes = parsePositiveInt(
        process.env.ABANDONED_FOLLOWUP_FIRST_MINUTES,
        60
      );
      const secondDelayMinutes = parsePositiveInt(
        process.env.ABANDONED_FOLLOWUP_SECOND_MINUTES,
        1440
      );
      const maxAgeHours = parsePositiveInt(
        process.env.ABANDONED_FOLLOWUP_MAX_AGE_HOURS,
        72
      );
      const baseUrl = (
        process.env.PUBLIC_FORM_BASE_URL ||
        process.env.FRONTEND_URL ||
        "https://admin.imheretravels.com"
      ).replace(/\/+$/, "");

      logger.info(
        `📨 Abandoned-booking follow-up run (first=${firstDelayMinutes}m, second=${secondDelayMinutes}m, maxAge=${maxAgeHours}h, dryRun=${dryRun})`
      );

      // 3. Query candidates (composite index payment.status+timestamps.createdAt)
      const minCreatedAt = Timestamp.fromMillis(
        now.toMillis() - maxAgeHours * 60 * 60 * 1000
      );
      const maxCreatedAt = Timestamp.fromMillis(
        now.toMillis() - firstDelayMinutes * 60 * 1000
      );

      const snapshot = await db
        .collection("stripePayments")
        .where("payment.status", "in", ABANDONED_STATUSES)
        .where("timestamps.createdAt", ">=", minCreatedAt)
        .where("timestamps.createdAt", "<=", maxCreatedAt)
        .limit(200)
        .get();

      if (snapshot.empty) {
        logger.info("✅ No abandoned payment drafts in the window");
        await writeRunLog(now, stats, dryRun);
        return;
      }

      // 4. In-memory filtering + stage computation
      const dueByEmail = new Map<
        string,
        { doc: DocumentSnapshot; stage: FollowUpStage }
      >();

      for (const doc of snapshot.docs) {
        const data = doc.data();

        if (hasRealBooking(data) || !isAbandonedStatus(data)) {
          stats.skipped++;
          continue;
        }
        if (data.booking?.isGuest === true) {
          stats.skipped++;
          continue;
        }
        const email = data.customer?.email;
        if (!email || !isValidEmail(email)) {
          stats.skipped++;
          continue;
        }

        const stage = getDueStage(
          data,
          now,
          firstDelayMinutes,
          secondDelayMinutes
        );
        if (!stage) {
          stats.skipped++;
          continue;
        }

        // One email per customer per run — keep the newest draft
        const key = normalizeEmail(email);
        const existing = dueByEmail.get(key);
        const createdAt = data.timestamps?.createdAt?.toMillis() || 0;
        const existingCreatedAt =
          existing?.doc.data()?.timestamps?.createdAt?.toMillis() || 0;
        if (!existing || createdAt > existingCreatedAt) {
          dueByEmail.set(key, { doc, stage });
        }
      }

      stats.candidates = dueByEmail.size;
      logger.info(`🔍 ${stats.candidates} candidate customer(s) due`);

      // 5. Per-candidate processing — one failure never halts the batch
      let sends = 0;
      for (const [, candidate] of dueByEmail) {
        if (sends >= MAX_SENDS_PER_RUN) {
          logger.warn(
            `⏸️ Send cap of ${MAX_SENDS_PER_RUN} reached — remaining candidates handled next run`
          );
          break;
        }

        const docRef = candidate.doc.ref;
        try {
          // Fresh re-read closes the paid-in-another-tab / concurrent-run race
          const fresh = await docRef.get();
          if (!fresh.exists) {
            stats.skipped++;
            continue;
          }
          const data = fresh.data()!;

          if (hasRealBooking(data) || !isAbandonedStatus(data)) {
            stats.skipped++;
            continue;
          }
          const stage = getDueStage(
            data,
            now,
            firstDelayMinutes,
            secondDelayMinutes
          );
          if (!stage || stage !== candidate.stage) {
            stats.skipped++;
            continue;
          }

          const email: string = data.customer.email;

          // Same customer completed this tour on another doc → suppress
          if (
            await hasPaidElsewhere(email, data.tour?.packageId || "", fresh.id)
          ) {
            logger.info(`⏭️ ${fresh.id}: paid elsewhere (${email})`);
            if (!dryRun) await markSuppressed(docRef, "paid_elsewhere");
            stats.skipped++;
            continue;
          }

          if (dryRun) {
            logger.info(
              `🧪 [dry-run] Would send ${stage} follow-up to ${email} for "${data.tour?.packageName}" (doc ${fresh.id})`
            );
            sends++;
            continue;
          }

          // Capture the lead BEFORE sending — even a failed send keeps the contact
          let contact: MarketingContact;
          if (stage === "first") {
            contact = await upsertMarketingContact({
              email,
              firstName: data.customer?.firstName || "",
              lastName: data.customer?.lastName || "",
              tourInterest: {
                packageId: data.tour?.packageId || "",
                packageName: data.tour?.packageName || "",
                date: data.tour?.date || "",
              },
              stripePaymentId: fresh.id,
            });
          } else {
            const existingContact = await getMarketingContact(email);
            contact =
              existingContact ||
              (await upsertMarketingContact({
                email,
                firstName: data.customer?.firstName || "",
                lastName: data.customer?.lastName || "",
                tourInterest: {
                  packageId: data.tour?.packageId || "",
                  packageName: data.tour?.packageName || "",
                  date: data.tour?.date || "",
                },
                stripePaymentId: fresh.id,
              }));
          }

          if (contact.status === "unsubscribed") {
            logger.info(`⏭️ ${fresh.id}: contact unsubscribed (${email})`);
            await markSuppressed(docRef, "unsubscribed");
            stats.skipped++;
            continue;
          }

          // Cross-draft dedupe: don't send another "first" email to the same
          // person within 7 days (survives draft deletion via the contact doc)
          if (stage === "first" && contact.followUp?.lastFirstSentAt) {
            const daysSince =
              (now.toMillis() -
                contact.followUp.lastFirstSentAt.toMillis()) /
              (24 * 60 * 60 * 1000);
            if (daysSince < CROSS_DRAFT_DEDUPE_DAYS) {
              logger.info(
                `⏭️ ${fresh.id}: first follow-up already sent to ${email} ${daysSince.toFixed(1)}d ago`
              );
              await markSuppressed(docRef, "recently_emailed");
              stats.skipped++;
              continue;
            }
          }

          // Build template variables (user-derived values escaped — the
          // shared Nunjucks environment has autoescape disabled)
          const coverImage = await fetchTourCoverImage(
            data.tour?.packageId || ""
          );
          const firstName = sanitizeHeaderValue(
            data.customer?.firstName || "there"
          );
          const tourPackageName = sanitizeHeaderValue(
            data.tour?.packageName || "your tour"
          );
          const vars: TemplateVars = {
            firstName: escapeHtml(firstName),
            tourPackageName: escapeHtml(tourPackageName),
            tourDate: escapeHtml(formatTourDate(data.tour?.date)),
            reservationFee: formatReservationFee(data.payment?.amount),
            resumeUrl: `${baseUrl}/reservation-booking-form?paymentid=${fresh.id}&resume=1`,
            unsubscribeUrl: `${baseUrl}/unsubscribe?token=${contact.unsubscribeToken}`,
            tourPackageCoverImage: coverImage,
            currentYear: new Date().getFullYear().toString(),
          };

          // Subject line is plain text, so reuse the sanitized-but-unescaped
          // names (keeps "Danielle & Erin" intact instead of "&amp;").
          const subjectVars: TemplateVars = {
            ...vars,
            firstName,
            tourPackageName,
            tourDate: formatTourDate(data.tour?.date),
          };

          const { subject, htmlContent } = await resolveTemplate(
            stage,
            vars,
            subjectVars
          );

          // Sanitize the subject for SMTP header safety (in addition to the
          // HTML entity escaping already applied to firstName/tourPackageName)
          const sanitizedSubject = sanitizeHeaderValue(subject);

          // RFC 8058 one-click target must accept a bare POST → API route,
          // while the human-visible footer link goes to the /unsubscribe page.
          const oneClickUnsubscribeUrl = `${baseUrl}/api/marketing/unsubscribe?token=${contact.unsubscribeToken}`;

          const gmailService = new GmailApiService();
          const result = await gmailService.sendEmail({
            to: email,
            subject: sanitizedSubject,
            htmlContent,
            from: "Bella | ImHereTravels <bella@imheretravels.com>",
            replyTo: "bella@imheretravels.com",
            headers: {
              "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>, <mailto:bella@imheretravels.com>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });

          // Mark after the send. Deliberately does NOT touch
          // timestamps.updatedAt (cleanup job reads it as customer activity).
          await docRef.update({
            [`followUps.${stage}`]: {
              sentAt: Timestamp.now(),
              messageId: result.messageId || "",
            },
          });
          await markContactFollowUpSent(email, stage);

          if (stage === "first") {
            stats.firstSent++;
          } else {
            stats.secondSent++;
          }
          sends++;

          logger.info(
            `✅ Sent ${stage} follow-up to ${email} for "${data.tour?.packageName}" (doc ${fresh.id})`
          );

          await createSentNotification({
            stage,
            paymentDocId: fresh.id,
            travelerName:
              `${data.customer?.firstName || ""} ${data.customer?.lastName || ""}`.trim(),
            tourPackageName: data.tour?.packageName || "",
            email,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`❌ Failed processing ${docRef.id}:`, error);
          stats.errors.push(`${docRef.id}: ${message}`);
        }
      }

      logger.info(
        `✅ Follow-up run complete: first=${stats.firstSent}, second=${stats.secondSent}, skipped=${stats.skipped}, errors=${stats.errors.length}`
      );

      await writeRunLog(now, stats, dryRun);
    } catch (error) {
      logger.error("❌ Error in sendAbandonedBookingFollowUps:", error);

      try {
        await db.collection("followup-logs").add({
          type: "abandoned-booking-followups",
          timestamp: now,
          error: error instanceof Error ? error.message : String(error),
          success: false,
        });
      } catch (logError) {
        logger.error("Failed to write followup error log:", logError);
      }

      throw error;
    }
  }
);

/** Per-run audit trail, mirroring the cleanup-logs pattern. */
async function writeRunLog(
  timestamp: Timestamp,
  stats: RunStats,
  dryRun: boolean
): Promise<void> {
  try {
    // Skip logging entirely-empty runs to avoid one doc every 10 minutes
    if (
      stats.candidates === 0 &&
      stats.firstSent === 0 &&
      stats.secondSent === 0 &&
      stats.errors.length === 0
    ) {
      return;
    }

    await db.collection("followup-logs").add({
      type: "abandoned-booking-followups",
      timestamp,
      candidates: stats.candidates,
      firstSent: stats.firstSent,
      secondSent: stats.secondSent,
      skipped: stats.skipped,
      errors: stats.errors,
      dryRun,
      success: true,
    });
  } catch (error) {
    logger.warn("Failed to write followup run log:", error);
  }
}
