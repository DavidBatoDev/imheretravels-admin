import { Timestamp } from "firebase/firestore";
import { db } from "./firebase-config";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";

// ============================================================================
// MIGRATION CONFIGURATION
// ============================================================================

const MIGRATION_ID = "006-conditional-email-templates";
const COLLECTION_NAME = "emailTemplates";

// ============================================================================
// MIGRATION DATA - Conditional Email Template
// ============================================================================

const conditionalEmailTemplate = {
  name: "Reservation Email Template - Conditional",
  subject: "Your Adventure Awaits - Booking Confirmed!",
  content: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reservation Email Template</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; margin: 0;">
    <div class="email-header" style="width: 100%; margin: 0 auto; margin-bottom: 10px;">
        <img src="https://imheretravels.com/wp-content/uploads/2024/05/siargao-header-1.webp" alt="ImHereTravels Banner" style="width: 100%; max-width: 636px; height: auto; display: block; margin: 0 auto;">
    </div>
    <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
        <p style="font-size: 16px; color: #333333;">Hi <strong>{{fullName}}</strong>,</p>

        <!-- Refund Details (for Invalid bookings) -->
        <? if ({{availablePaymentTerms}} === "Invalid") { ?>
            <!-- Custom Thank You Message for Invalid Booking -->
            <p style="font-size: 16px; color: #333333;">Thank you for choosing ImHereTravels. We truly appreciate your interest in our <strong>{{tourPackage}}</strong>.</p>
            
            <!-- Refund Details Section -->
            <h3 style="color: red;">Refund Details for Your Booking</h3>
            
            <p style="font-size: 16px;">Unfortunately, we're unable to process your booking because the tour is scheduled to begin within 48 hours. Due to the limited time, we're not able to complete the necessary arrangements to ensure a smooth and quality travel experience for you.</p>
            <p style="font-size: 16px;">We'd love to help you explore other options. You may rebook a different tour with a later start date by reaching out to us directly, and we'll be happy to assist.</p>
            <p style="font-size: 16px; color: #333333;">
                Regarding your deposit of <strong style="color: red;">£{{reservationFee}}</strong>, please let us know your preferred refund method. Kindly send us your bank details so we can process the refund promptly.
            </p>
            <p style="font-size: 16px;">Thank you for your understanding, and we hope to assist you on your next adventure.</p>

            <p style="font-size: 16px; color: #333333;">Best regards,</p>
            <p style="font-size: 16px; color: #333333;"><strong>The ImHereTravels Team</strong></p>
            <div style="text-align: left; margin-top: 20px;">
                <img src="https://imheretravels.com/wp-content/uploads/2025/04/ImHereTravels-Logo.png" alt="ImHereTravels Logo" style="width: 120px; height: auto; display: block;">
            </div>
        <? } ?>

        <!-- Payment Terms Rendering -->
        <? if ({{availablePaymentTerms}} !== "Invalid" && {{availablePaymentTerms}} !== "Full payment required within 48hrs" && {{availablePaymentTerms}} !== "P1" && {{availablePaymentTerms}} !== "P2" && {{availablePaymentTerms}} !== "P3" && {{availablePaymentTerms}} !== "P4" && {{availablePaymentTerms}} !== "") { ?>
            <!-- Thank You Message -->
            <p style="font-size: 16px; color: #333333;">
                Thank you for booking with <strong style="color: red;">ImHereTravels!</strong>
            </p>
            <p style="font-size: 16px; color: #333333;">
                Your deposit of <span style="color: red;"><strong>£{{reservationFee}}</strong></span> has been received, and we're thrilled to have you join us for an unforgettable adventure!
            </p>
        <? } ?>

        <!-- Final Payment Scenario -->
        <? if ({{availablePaymentTerms}} === "Full payment required within 48hrs") { ?>
            <!-- Thank You Message -->
            <p style="font-size: 16px; color: #333333;">Thank you for booking with <strong style="color: red;">ImHereTravels!</strong></p>
            <p style="font-size: 16px; color: #333333;">We're holding your spot for <strong>{{tourPackage}}</strong>, but your reservation isn't confirmed yet.</p>

            <!-- Booking Details -->
            <h2 style="color: red; font-size: 24px; margin-top: 0;">Booking Details</h2>
            <table cellpadding="5" style="border-collapse: collapse; width: 100%; max-width: 600px; color: #333333; margin-bottom: 20px;">
                <tr><td><strong>Traveler Name:</strong></td><td>{{fullName}}</td></tr>
                
                <!-- Conditional rendering for Main Booker -->
                <? if ({{bookingType}} === "Group Booking" || {{bookingType}} === "Duo Booking") { ?>
                    <tr><td><strong>Main Booker:</strong></td><td>{{mainBooker}}</td></tr>
                <? } ?>

                <tr><td><strong>Tour Name:</strong></td><td>{{tourPackage}}</td></tr>
                <tr><td><strong>Tour Date:</strong></td><td>{{tourDate}}</td></tr>
                <tr><td><strong>Return Date:</strong></td><td>{{returnDate}}</td></tr>
                <tr><td><strong>Tour Duration:</strong></td><td>{{tourDuration}}</td></tr>
                <tr><td><strong>Booking Type:</strong></td><td>{{bookingType}}</td></tr>
                
                <!-- Conditional rendering for Booking ID and Group ID -->
                <? if ({{bookingType}} === "Group Booking" || {{bookingType}} === "Duo Booking") { ?>
                    <tr><td><strong>Booking ID:</strong></td><td>{{bookingId}}</td></tr>
                    <tr><td><strong>Group ID:</strong></td><td>{{groupId}}</td></tr>
                <? } ?>
            </table>

            <p style="font-size: 16px; color: #333333;">
                We've received your deposit of <span style="color: red;"><strong>£{{reservationFee}}</strong></span> — thank you! You're now ready for the next step to finalize your booking.
            </p>
            <h3 style="font-size: 18px; color: red; margin-top: 20px;">
                ⚠️ Final Payment Required Within 48 Hours
            </h3>
            <p style="font-size: 16px; color: #333333;">
                Your tour is less than 30 days away, so monthly payment plans are no longer available. To secure your spot, the remaining balance must be fully paid within 48 hours.
            </p>

            <div style="padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 16px; border-collapse: collapse; table-layout: fixed; border: 1px solid black;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Payment Terms</th>
                            <th align="left" style="padding: 10px; width: 30%; border: 1px solid black;">Amount</th>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Due Date(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">Full payment</td>
                            <td style="padding: 10px; border: 1px solid black;">£{{remainingBalance}}</td>
                            <td style="padding: 10px; border: 1px solid black;">{{fullPaymentDueDate}}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="font-size: 14px; font-style: italic; color: #333333;">
                    Note: All deposits are non-refundable. Please settle the full balance on or before the due date to avoid cancellations. Don't forget to send us a proof of payment/screenshot to confirm your booking.
                </p>
            </div>
        <? } ?>

        <!-- P1 Payment Scenario -->
        <? if ({{availablePaymentTerms}} === "P1") { ?>
            <!-- Thank You Message for P1 -->
            <p style="font-size: 16px; color: #333333;">Thank you for booking with <strong style="color: red;">ImHereTravels!</strong></p>
            <p style="font-size: 16px; color: #333333;">We've received your deposit of <span style="color: red;"><strong>£{{reservationFee}}</strong></span> — and your spot is nearly secured! We just need the remaining balance to finalize your booking.</p>

            <!-- Booking Details for P1 -->
            <h2 style="color: red; font-size: 24px; margin-top: 0;">Booking Details</h2>
            <table cellpadding="5" style="border-collapse: collapse; width: 100%; max-width: 600px; color: #333333; margin-bottom: 20px;">
                <tr><td><strong>Traveler Name:</strong></td><td>{{fullName}}</td></tr>
                <tr><td><strong>Tour Name:</strong></td><td>{{tourPackage}}</td></tr>
                <tr><td><strong>Tour Date:</strong></td><td>{{tourDate}}</td></tr>
                <tr><td><strong>Return Date:</strong></td><td>{{returnDate}}</td></tr>        
                <tr><td><strong>Tour Duration:</strong></td><td>{{tourDuration}}</td></tr>
                <tr><td><strong>Booking Type:</strong></td><td>{{bookingType}}</td></tr>
                <tr><td><strong>Booking ID:</strong></td><td>{{bookingId}}</td></tr>
                <!-- Conditional rendering for Group ID -->
                <? if ({{bookingType}} === "Group Booking" || {{bookingType}} === "Duo Booking") { ?>
                    <tr><td><strong>Group ID:</strong></td><td>{{groupId}}</td></tr>
                <? } ?>
            </table>

            <!-- Payment Terms for P1 -->
            <h3 style="font-size: 20px; color: red;">Final Payment Due Soon</h3>
            <p style="font-size: 16px; color: #333333;">There is only one available payment plan for your tour, so the remaining balance must be paid in full on <strong>{{p1DueDate}}</strong>.</p>

            <!-- Payment Plan Details for P1 -->
            <div style="padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 16px; border-collapse: collapse; table-layout: fixed; border: 1px solid black;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Payment Terms</th>
                            <th align="left" style="padding: 10px; width: 30%; border: 1px solid black;">Amount</th>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Due Date(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P1 – Full payment</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1Amount}} - £{{reservationFee}}</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1DueDate}}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="font-size: 14px; font-style: italic; color: #333333;">
                    Note: All deposits are non-refundable. Please settle the full balance on or before the due date to avoid cancellations. Don't forget to send us a proof of payment/screenshot to confirm your booking.
                </p>
            </div>
        <? } ?>

        <!-- P2 Payment Scenario -->
        <? if ({{availablePaymentTerms}} === "P2") { ?>
            <!-- Thank You Message for P2 -->
            <p style="font-size: 16px; color: #333333;">Thank you for booking with <strong style="color: red;">ImHereTravels!</strong></p>
            <p style="font-size: 16px; color: #333333;">We've received your deposit of <span style="color: red;"><strong>£{{reservationFee}}</strong></span>, and your spot is almost confirmed. You now have the option to pay the balance in full or in two monthly payments.</p>

            <!-- Booking Details for P2 -->
            <h2 style="color: red; font-size: 24px; margin-top: 0;">Booking Details</h2>
            <table cellpadding="5" style="border-collapse: collapse; width: 100%; max-width: 600px; color: #333333; margin-bottom: 20px;">
                <tr><td><strong>Traveler Name:</strong></td><td>{{fullName}}</td></tr>
                <tr><td><strong>Tour Name:</strong></td><td>{{tourPackage}}</td></tr>
                <tr><td><strong>Tour Date:</strong></td><td>{{tourDate}}</td></tr>
                <tr><td><strong>Return Date:</strong></td><td>{{returnDate}}</td></tr>        
                <tr><td><strong>Tour Duration:</strong></td><td>{{tourDuration}}</td></tr>
                <tr><td><strong>Booking Type:</strong></td><td>{{bookingType}}</td></tr>
                <tr><td><strong>Booking ID:</strong></td><td>{{bookingId}}</td></tr>
                <!-- Conditional rendering for Group ID -->
                <? if ({{bookingType}} === "Group Booking" || {{bookingType}} === "Duo Booking") { ?>
                    <tr><td><strong>Group ID:</strong></td><td>{{groupId}}</td></tr>
                <? } ?>
            </table>

            <!-- Payment Terms for P2 -->
            <h3 style="font-size: 20px; color: red;">Choose Your Payment Plan</h3>
            <p style="font-size: 16px; color: #333333;">Based on your tour schedule, you have 2 available payment plans. You can choose the payment plan that works best for you.</p>

            <!-- Payment Plan Details for P2 -->
            <div style="padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 16px; border-collapse: collapse; table-layout: fixed; border: 1px solid black;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Payment Terms</th>
                            <th align="left" style="padding: 10px; width: 30%; border: 1px solid black;">Amount</th>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Due Date(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P1 – Full payment</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1Amount}}</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1DueDate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P2 – Two payments</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p2Amount}} /month</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p2DueDate}}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="font-size: 14px; font-style: italic; color: #333333;">
                    Note: All deposits are non-refundable. Please settle the full balance on or before the due date to avoid cancellations. Don't forget to send us a proof of payment/screenshot to confirm your booking.
                </p>
            </div>
        <? } ?>

        <!-- P3 Payment Scenario -->
        <? if ({{availablePaymentTerms}} === "P3") { ?>
            <!-- Thank You Message for P3 -->
            <p style="font-size: 16px; color: #333333;">Thank you for booking with <strong style="color: red;">ImHereTravels!</strong></p>
            <p style="font-size: 16px; color: #333333;">We've received your deposit of <span style="color: red;"><strong>£{{reservationFee}}</strong></span>, and your spot is almost confirmed. You now have the option to pay the balance in full or in three monthly payments.</p>

            <!-- Booking Details for P3 -->
            <h2 style="color: red; font-size: 24px; margin-top: 0;">Booking Details</h2>
            <table cellpadding="5" style="border-collapse: collapse; width: 100%; max-width: 600px; color: #333333; margin-bottom: 20px;">
                <tr><td><strong>Traveler Name:</strong></td><td>{{fullName}}</td></tr>
                <tr><td><strong>Tour Name:</strong></td><td>{{tourPackage}}</td></tr>
                <tr><td><strong>Tour Date:</strong></td><td>{{tourDate}}</td></tr>
                <tr><td><strong>Return Date:</strong></td><td>{{returnDate}}</td></tr>        
                <tr><td><strong>Tour Duration:</strong></td><td>{{tourDuration}}</td></tr>
                <tr><td><strong>Booking Type:</strong></td><td>{{bookingType}}</td></tr>
                <tr><td><strong>Booking ID:</strong></td><td>{{bookingId}}</td></tr>
                <!-- Conditional rendering for Group ID -->
                <? if ({{bookingType}} === "Group Booking" || {{bookingType}} === "Duo Booking") { ?>
                    <tr><td><strong>Group ID:</strong></td><td>{{groupId}}</td></tr>
                <? } ?>
            </table>

            <!-- Payment Terms for P3 -->
            <h3 style="font-size: 20px; color: red;">Choose Your Payment Plan</h3>
            <p style="font-size: 16px; color: #333333;">Based on your tour schedule, you have 3 available payment plans. You can choose the payment plan that works best for you.</p>

            <!-- Payment Plan Details for P3 -->
            <div style="padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 16px; border-collapse: collapse; table-layout: fixed; border: 1px solid black;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Payment Terms</th>
                            <th align="left" style="padding: 10px; width: 30%; border: 1px solid black;">Amount</th>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Due Date(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P1 – Full payment</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1Amount}}</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1DueDate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P2 – Two payments</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p2Amount}} /month</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p2DueDate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P3 – Three payments</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p3Amount}} /month</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p3DueDate}}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="font-size: 14px; font-style: italic; color: #333333;">
                    Note: All deposits are non-refundable. Please settle the full balance on or before the due date to avoid cancellations. Don't forget to send us a proof of payment/screenshot to confirm your booking.
                </p>
            </div>
        <? } ?>

        <!-- P4 Payment Scenario -->
        <? if ({{availablePaymentTerms}} === "P4") { ?>
            <!-- Thank You Message for P4 -->
            <p style="font-size: 16px; color: #333333;">Thank you for booking with <strong style="color: red;">ImHereTravels!</strong></p>
            <p style="font-size: 16px; color: #333333;">We've received your deposit of <span style="color: red;"><strong>£{{reservationFee}}</strong></span>, and your spot is almost confirmed. You now have the option to pay the balance in full or in four monthly payments.</p>

            <!-- Booking Details for P4 -->
            <h2 style="color: red; font-size: 24px; margin-top: 0;">Booking Details</h2>
            <table cellpadding="5" style="border-collapse: collapse; width: 100%; max-width: 600px; color: #333333; margin-bottom: 20px;">
                <tr><td><strong>Traveler Name:</strong></td><td>{{fullName}}</td></tr>
                <tr><td><strong>Tour Name:</strong></td><td>{{tourPackage}}</td></tr>
                <tr><td><strong>Tour Date:</strong></td><td>{{tourDate}}</td></tr>
                <tr><td><strong>Return Date:</strong></td><td>{{returnDate}}</td></tr>        
                <tr><td><strong>Tour Duration:</strong></td><td>{{tourDuration}}</td></tr>
                <tr><td><strong>Booking Type:</strong></td><td>{{bookingType}}</td></tr>
                <tr><td><strong>Booking ID:</strong></td><td>{{bookingId}}</td></tr>
                <!-- Conditional rendering for Group ID -->
                <? if ({{bookingType}} === "Group Booking" || {{bookingType}} === "Duo Booking") { ?>
                    <tr><td><strong>Group ID:</strong></td><td>{{groupId}}</td></tr>
                <? } ?>
            </table>

            <!-- Payment Terms for P4 -->
            <h3 style="font-size: 20px; color: red;">Choose Your Payment Plan</h3>
            <p style="font-size: 16px; color: #333333;">Based on your tour schedule, you have 4 available payment plans. You can choose the payment plan that works best for you.</p>

            <!-- Payment Plan Details for P4 -->
            <div style="padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 16px; border-collapse: collapse; table-layout: fixed; border: 1px solid black;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Payment Terms</th>
                            <th align="left" style="padding: 10px; width: 30%; border: 1px solid black;">Amount</th>
                            <th align="left" style="padding: 10px; width: 35%; border: 1px solid black;">Due Date(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P1 – Full payment</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1Amount}}</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p1DueDate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P2 – Two payments</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p2Amount}} /month</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p2DueDate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P3 – Three payments</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p3Amount}} /month</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p3DueDate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid black;">P4 – Four payments</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p4Amount}} /month</td>
                            <td style="padding: 10px; border: 1px solid black;">{{p4DueDate}}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="font-size: 14px; font-style: italic; color: #333333;">
                    Note: All deposits are non-refundable. Please settle the full balance on or before the due date to avoid cancellations. Don't forget to send us a proof of payment/screenshot to confirm your booking.
                </p>
            </div>
        <? } ?>

        <? if ({{availablePaymentTerms}} !== 'Invalid' && {{availablePaymentTerms}} !== '') { ?>
            <h3 style="font-size: 20px; color: red;">Choose Your Payment Method</h3>
            <div style="background-color: #fff9c4; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                <ul style="font-size: 16px; color: #333333; margin-bottom: 20px; list-style-type: disc; padding-left: 20px;">
                    <li><strong>PM3 – Stripe Payment (Credit/Debit Cards)</strong>:<br>
                        <a href="https://buy.stripe.com/7sY5kD5NF2uBfGj1NJco03g" target="_blank" style="background-color: #28a745; color: white; text-decoration: none; font-weight: bold; padding: 8px 16px; border-radius: 4px; display: inline-block; margin-top: 5px;">Pay securely online with Stripe</a>
                    </li>
                </ul>
            </div>
            <p style="font-size: 16px; color: #333333;">We can't wait to welcome you to {{tourPackage}} — it's going to be an unforgettable adventure!</p>
            <p style="font-size: 16px; color: #333333;">Best regards,</p>
            <p style="font-size: 16px; color: #333333;"><strong>The ImHereTravels Team</strong></p>

            <div style="text-align: left; margin-top: 20px;">
                <img src="https://imheretravels.com/wp-content/uploads/2025/04/ImHereTravels-Logo.png" alt="ImHereTravels Logo" style="width: 120px; height: auto; display: block;">
            </div>
        <? } ?>

        <p style="font-size: 12px; color: #666666; text-align: center;">You can reply to this email if you have any questions — we'll get back to you soon.</p>
    </div>
</body>
</html>`,
  status: "active" as const,
  variables: [
    "{{fullName}}",
    "{{tourPackage}}",
    "{{reservationFee}}",
    "{{availablePaymentTerms}}",
    "{{bookingType}}",
    "{{tourDate}}",
    "{{returnDate}}",
    "{{tourDuration}}",
    "{{bookingId}}",
    "{{groupId}}",
    "{{mainBooker}}",
    "{{p1DueDate}}",
    "{{p1Amount}}",
    "{{p2Amount}}",
    "{{p2DueDate}}",
    "{{p3Amount}}",
    "{{p3DueDate}}",
    "{{p4Amount}}",
    "{{p4DueDate}}",
    "{{remainingBalance}}",
    "{{fullPaymentDueDate}}",
  ],
  bccGroups: [],
  metadata: {
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "system",
    usedCount: 0,
  },
};

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

export async function runMigration(dryRun: boolean = false): Promise<{
  success: boolean;
  message: string;
  details?: {
    created: number;
    skipped: number;
    errors: string[];
  };
}> {
  console.log(`🚀 Starting migration: ${MIGRATION_ID}`);
  console.log(`📊 Dry run mode: ${dryRun ? "ON" : "OFF"}`);

  const results = {
    created: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // Check if template already exists
    const existingTemplates = await getDocs(collection(db, COLLECTION_NAME));
    const templateName = conditionalEmailTemplate.name;

    if (existingTemplates.size > 0) {
      console.log(
        `⚠️  Found ${existingTemplates.size} existing email templates. Checking for conflicts...`
      );

      // Check for template name conflicts
      const conflictQuery = query(
        collection(db, COLLECTION_NAME),
        where("name", "==", templateName)
      );
      const conflictDocs = await getDocs(conflictQuery);

      if (conflictDocs.size > 0) {
        console.log(
          `⚠️  Template "${templateName}" already exists, skipping...`
        );
        results.skipped++;
      } else {
        if (!dryRun) {
          try {
            await addDoc(
              collection(db, COLLECTION_NAME),
              conditionalEmailTemplate
            );
            console.log(`✅ Created email template: ${templateName}`);
            results.created++;
          } catch (error) {
            const errorMsg = `Failed to create template "${templateName}": ${
              error instanceof Error ? error.message : "Unknown error"
            }`;
            console.error(`❌ ${errorMsg}`);
            results.errors.push(errorMsg);
          }
        } else {
          console.log(
            `🔍 [DRY RUN] Would create email template: ${templateName}`
          );
          results.created++;
        }
      }
    } else {
      console.log(
        `📝 No existing email templates found. Creating conditional template...`
      );

      if (!dryRun) {
        try {
          await addDoc(
            collection(db, COLLECTION_NAME),
            conditionalEmailTemplate
          );
          console.log(`✅ Created email template: ${templateName}`);
          results.created++;
        } catch (error) {
          const errorMsg = `Failed to create template "${templateName}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      } else {
        console.log(
          `🔍 [DRY RUN] Would create email template: ${templateName}`
        );
        results.created++;
      }
    }

    const success = results.errors.length === 0;
    const message = dryRun
      ? `Migration dry run completed. Would create ${results.created} templates, skip ${results.skipped}.`
      : `Migration completed successfully. Created ${results.created} templates, skipped ${results.skipped}.`;

    console.log(
      `🎯 Migration ${success ? "SUCCESS" : "COMPLETED WITH ERRORS"}`
    );
    console.log(
      `📊 Results: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`
    );

    return {
      success,
      message,
      details: results,
    };
  } catch (error) {
    const errorMsg = `Migration failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    console.error(`❌ ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
    };
  }
}

export async function rollbackMigration(): Promise<{
  success: boolean;
  message: string;
  details?: {
    deleted: number;
    errors: string[];
  };
}> {
  console.log(`🔄 Rolling back migration: ${MIGRATION_ID}`);

  const results = {
    deleted: 0,
    errors: [] as string[],
  };

  try {
    // Find and delete template created by this migration
    const templateName = conditionalEmailTemplate.name;
    const templateQuery = query(
      collection(db, COLLECTION_NAME),
      where("name", "==", templateName)
    );
    const templateDocs = await getDocs(templateQuery);

    for (const doc of templateDocs.docs) {
      try {
        await deleteDoc(doc.ref);
        console.log(`🗑️  Deleted email template: ${doc.data().name}`);
        results.deleted++;
      } catch (error) {
        const errorMsg = `Failed to delete template "${templateName}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        console.error(`❌ ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    const success = results.errors.length === 0;
    const message = `Rollback ${
      success ? "completed successfully" : "completed with errors"
    }. Deleted ${results.deleted} templates.`;

    console.log(`🎯 Rollback ${success ? "SUCCESS" : "COMPLETED WITH ERRORS"}`);
    console.log(
      `📊 Results: ${results.deleted} deleted, ${results.errors.length} errors`
    );

    return {
      success,
      message,
      details: results,
    };
  } catch (error) {
    const errorMsg = `Rollback failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    console.error(`❌ ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  id: MIGRATION_ID,
  name: "Conditional Email Templates",
  description:
    "Add conditional email template with dynamic rendering based on payment terms and booking type",
  run: runMigration,
  rollback: rollbackMigration,
  data: conditionalEmailTemplate,
};
