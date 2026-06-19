import { Timestamp } from "firebase/firestore";
import { db } from "./firebase-config";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";

// ============================================================================
// MIGRATION CONFIGURATION
// ============================================================================

const MIGRATION_ID = "009-initial-payment-reminder-template";
const COLLECTION_NAME = "emailTemplates";

// ============================================================================
// MIGRATION DATA - Initial Payment Reminder Template
// ============================================================================

const initialPaymentReminderTemplate = {
  name: "Initial Payment Reminder",
  subject: "Payment Reminder - Action Required",
  content: `<!-- initialPaymentReminder.html -->
<div style="font-family: Arial, sans-serif; font-size: 14px;">

  <p>Hi <?= fullName ?>,</p>

  <p>
    Thank you for selecting your payment method and plan. We're excited to have you join us for <?= tourPackage ?>!
  </p>

  <p>Please take a moment to review the details below and ensure everything looks correct:</p>

<ul>
    <li><strong>Tour:</strong> <?= tourPackage ?></li>
    <li><strong>Payment Plan:</strong> <?= paymentPlan ?></li>
    <li><strong>Payment Method:</strong> <?= paymentMethod ?>
      <? if (paymentMethod === "Stripe") { ?>
        <br><a href="https://buy.stripe.com/7sY5kD5NF2uBfGj1NJco03g" target="_blank" style="background-color: #28a745; color: white; text-decoration: none; font-weight: bold; padding: 8px 16px; border-radius: 4px; display: inline-block; margin-top: 8px;">Pay securely online with Stripe</a>
      <? } else { ?>
        <ul>
          <li>[Details will be provided separately]</li>
        </ul>
      <? } ?>
    </li>
  </ul>

  <p>
    We've outlined your payment terms and due dates below. To ensure you don't miss any payments, please click 'Yes' to add the payment due date reminders directly to your calendar.
  </p>

  <h3 style="color: #d00;">Payment Tracker</h3>

  <table style="border-collapse: collapse; width: 100%; max-width: 600px; font-size: 14px; border: 1px solid #ddd;" cellpadding="8" cellspacing="0">
    <thead>
      <tr style="background-color: #f8f9fa;">
        <th style="border: 1px solid #ddd; text-align: left; font-weight: bold; padding: 10px;">Payment Term</th>
        <th style="border: 1px solid #ddd; text-align: left; font-weight: bold; padding: 10px;">Amount</th>
        <th style="border: 1px solid #ddd; text-align: left; font-weight: bold; padding: 10px;">Due Date</th>
        <th style="border: 1px solid #ddd; text-align: left; font-weight: bold; padding: 10px;">Add to Calendar</th>
      </tr>
    </thead>
    <tbody>
      <? for (let i = 0; i < terms.length; i++) { ?>
        <tr>
          <td style="border: 1px solid #ddd; padding: 10px;"><?= terms[i] ?></td>
          <td style="border: 1px solid #ddd; padding: 10px;"><?= amounts[i] || "" ?></td>
          <td style="border: 1px solid #ddd; padding: 10px;"><?= dueDates[i] || "" ?></td>
          <td style="border: 1px solid #ddd; padding: 10px;">
            <? if (calendarLinks[i]) { ?>
              <a href="<?= calendarLinks[i] ?>" target="_blank" style="color: #007bff; text-decoration: none;">Calendar link</a>
            <? } else { ?>
              -
            <? } ?>
          </td>
        </tr>
      <? } ?>
      <tr style="background-color: #f8f9fa;">
        <td style="border: 1px solid #ddd; padding: 10px; font-weight: bold;">Total</td>
        <td style="border: 1px solid #ddd; padding: 10px; font-weight: bold;" colspan="3"><?= remainingBalance ?></td>
      </tr>
    </tbody>
  </table>

  <br>

  <p><strong>You'll receive a reminder 3 days before each payment is due</strong>, ensuring you have plenty of time to stay on track. We've also added the payment due dates to your calendar for easy reference.</p>

  <p>If you need any assistance or have questions, feel free to reach out to us.</p>

  <p>
    Warm regards,<br>
    <strong>The ImHereTravels Team</strong><br>
  </p>

  <div style="margin-top: 20px;">
    <img src="https://imheretravels.com/wp-content/uploads/2025/04/ImHereTravels-Logo.png" alt="ImHereTravels Logo" style="width: 120px;">
  </div>
</div>`,
  variables: [
    "fullName",
    "tourPackage",
    "paymentPlan",
    "paymentMethod",
    "terms",
    "amounts",
    "dueDates",
    "calendarLinks",
    "remainingBalance",
  ],
  variableDefinitions: [
    {
      id: "1",
      name: "fullName",
      type: "string",
      description: "Full name of the recipient",
    },
    {
      id: "2",
      name: "tourPackage",
      type: "string",
      description: "Name of the tour package",
    },
    {
      id: "3",
      name: "paymentPlan",
      type: "string",
      description:
        "Type of payment plan (e.g., Single Installment, Two Installments)",
    },
    {
      id: "4",
      name: "paymentMethod",
      type: "string",
      description: "Payment method selected (Stripe, Revolut, Ulster, etc.)",
    },
    {
      id: "5",
      name: "terms",
      type: "array",
      arrayElementType: "string",
      description: "Array of payment term descriptions",
    },
    {
      id: "6",
      name: "amounts",
      type: "array",
      arrayElementType: "number",
      description: "Array of payment amounts",
    },
    {
      id: "7",
      name: "dueDates",
      type: "array",
      arrayElementType: "string",
      description: "Array of payment due dates",
    },
    {
      id: "8",
      name: "calendarLinks",
      type: "array",
      arrayElementType: "string",
      description: "Array of calendar links for each payment",
    },
    {
      id: "9",
      name: "remainingBalance",
      type: "number",
      description: "Total remaining balance to be paid",
    },
  ],
  status: "active" as const,
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
    const templateName = initialPaymentReminderTemplate.name;

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
              initialPaymentReminderTemplate
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
        `📝 No existing email templates found. Creating initial payment reminder template...`
      );

      if (!dryRun) {
        try {
          await addDoc(
            collection(db, COLLECTION_NAME),
            initialPaymentReminderTemplate
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
      `�� Results: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`
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
    const templateName = initialPaymentReminderTemplate.name;
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
