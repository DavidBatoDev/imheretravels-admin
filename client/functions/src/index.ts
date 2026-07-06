/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";

// Import our functions
export { sendVerificationEmail } from "./send-verification-email";
export { verifyEmail } from "./verify-email";
export { onGenerateEmailDraftChanged } from "./generate-reservation-email"; // Trigger for generating reservation email draft
export { onSendReservationEmailChanged } from "./send-reservation-email"; // Trigger for sending reservation email
export { onGenerateCancellationDraftChanged } from "./generate-cancellation-email"; // Trigger for generating cancellation email draft
export { onSendCancellationEmailChanged } from "./send-cancellation-email"; // Trigger for sending cancellation email
export { EmailTemplateLoader } from "./email-template-loader";
export { onPaymentComplete } from "./on-payment-complete"; // Trigger for payment completion (confirmed bookings)
export { sendBookingConfirmationEmail } from "./send-booking-confirmation-email"; // Callable function to send confirmation email
export { sendBookingStatusConfirmation } from "./send-booking-status-confirmation"; // Callable function to send booking status confirmation with QR code
export { sendGuestInvitationEmails } from "./send-guest-invitations"; // Callable function to send guest invitation emails
export { onGuestInvitationTrigger } from "./on-guest-invitation-trigger"; // Trigger: auto-create + send guest invitation when paymentProgress reaches 50%
export { onStripePaymentSuccess } from "./on-stripe-payment-success"; // Trigger for Stripe payment success notifications
// export { getDraftSubject } from "./get-draft-subject";
// export { getEmailDetails } from "./get-email-details";
// export { deleteGmailDraft } from "./delete-gmail-draft";
// Export only the scheduled email processor (cron job)
// Other email functions have been migrated to Next.js API routes
export { processScheduledEmails } from "./scheduled-emails";
// Export payment reminder trigger
export { onPaymentReminderEnabled } from "./payment-reminder-trigger";
// Follow-up emails for abandoned bookings + marketing contact capture (runs every 10 min)
export { sendAbandonedBookingFollowUps } from "./scheduled-abandoned-booking-followups";
// Export price history tracking function
export { onTourPackagePriceUpdate } from "./on-tour-package-price-update";
export { applyLateFeesDaily } from "./scheduled-late-fees";
// Publishes tours whose scheduledPublishAt time has passed (runs every 15 min)
export { publishScheduledTours } from "./scheduled-publish-tours";
export { exportProdFirestoreCollections } from "./scheduled-prod-firestore-export";

// export { telegramBot } from "./telegram-bot";
// export {
//   onTypeScriptFunctionUpdated,
//   onTypeScriptFunctionUpdatedSimple,
// } from "./recompute-on-function-update";
// export { testRecompute } from "./test-recompute";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
