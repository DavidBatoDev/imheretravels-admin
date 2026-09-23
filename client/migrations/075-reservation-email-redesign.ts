/**
 * 075 — Redesign the Reservation Email to match the automated
 *       "Reservation Confirmed" email.
 *
 * WHY
 * ───
 * Bella asked for the customer emails to be aligned. The post-deposit
 * Reservation Email (`emailTemplates/BnRGgT6E8SVrXZH961LT`, sent for bookings
 * entered by admins and for reservation-form bookings that still need a plan)
 * was the last one on the 2024 layout: plain tables, red headings, a signature
 * logo, no footer. The automated "Reservation Confirmed" email
 * (`C8PKdv5BgAlTSFCm6wS3`) has the current design — logo header, tour cover
 * hero, card sections, booking-status CTA, dark footer with social icons.
 *
 * This ships `functions/emails/reservationEmail.html`, rebuilt on that design.
 * Content is preserved branch for branch (Invalid / 48hrs / P1 / P2 / P3 / P4 /
 * generic), including the wording fixes from 073 and the image + CTA fixes from
 * 074. The flow is the one the booking status page supports: the email shows the
 * available plans as information and sends the traveller to the booking status
 * page to pick a plan and pay by card. There is no Stripe button.
 *
 * WHY THIS ONE UPLOADS THE FILE
 * ─────────────────────────────
 * 070–074 patched the live document surgically because the repo copy had
 * drifted. Here the whole layout changes, so the repo file IS the intended
 * content: it was rebuilt from the live content fetched on 2026-09-23 (after
 * 074), rendered through Nunjucks for every branch, and QA'd by test email.
 * From now on the repo file is the truthful record of the live template.
 *
 * Idempotent: skipped when the redesign marker is present.
 * Reversible: previous `content` stashed in `_migration075`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run075
 *   npx tsx migrations/migrate.ts 075
 *   npx tsx migrations/migrate.ts rollback075
 */

import * as fs from "fs";
import * as path from "path";
import nunjucks from "nunjucks";
import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "075-reservation-email-redesign";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "BnRGgT6E8SVrXZH961LT";
const BACKUP_FIELD = "_migration075";

export const MARKER = "migration 075 redesign";

const TEMPLATE_FILE = path.resolve(
  __dirname,
  "..",
  "functions",
  "emails",
  "reservationEmail.html",
);

const BRANCHES = [
  "Invalid",
  "Full payment required within 48hrs",
  "P1",
  "P2",
  "P3",
  "P4",
  "",
];

/** Reads the repo template and proves every branch renders before it ships. */
export function loadTemplate(): string {
  const content = fs.readFileSync(TEMPLATE_FILE, "utf8");
  if (!content.includes(MARKER)) {
    throw new Error(`${TEMPLATE_FILE} is missing the "${MARKER}" marker.`);
  }
  for (const required of [
    "{{ fullName }}",
    "{{ tourPackage }}",
    "{{ reservationFee }}",
    "{{ remainingBalance }}",
    "{{ p4DueDate }}",
    "Terms and Conditions",
    "View Booking Status",
  ]) {
    if (!content.includes(required)) {
      throw new Error(`Template is missing expected fragment: ${required}`);
    }
  }
  if (/wp-content|buy\.stripe\.com|Pay securely online with Stripe/.test(content)) {
    throw new Error("Template still references dead assets or the Stripe CTA.");
  }

  const env = new nunjucks.Environment(undefined, {
    autoescape: false,
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true,
  });
  for (const availablePaymentTerms of BRANCHES) {
    const html = env.renderString(content, {
      availablePaymentTerms,
      fullName: "Test",
      tourPackage: "Test Tour",
      bookingType: "Single Booking",
      reservationFee: "200.00",
      remainingBalance: "999.00",
      accessToken: "t",
      bookingStatusUrl: "https://admin.imheretravels.com/booking-status/t",
    });
    if (!html.includes("Hi <strong>Test</strong>")) {
      throw new Error(`Branch "${availablePaymentTerms}" did not render.`);
    }
  }
  return content;
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.error(`❌ Template ${TEMPLATE_DOC_ID} not found.`);
    return {
      message: `${MIGRATION_ID} aborted — template missing`,
      details: { updated: 0, errors: 1 },
    };
  }

  const data = snap.data() as Record<string, any>;
  const content = String(data.content || "");
  console.log(`📧 "${data.name || TEMPLATE_DOC_ID}" — ${content.length} chars`);

  if (content.includes(MARKER)) {
    console.log("  ⏭️  Redesign already live — nothing to do.");
    return {
      message: `${MIGRATION_ID} — already up to date`,
      details: { updated: 0, errors: 0 },
    };
  }

  let next: string;
  try {
    next = loadTemplate();
  } catch (err) {
    console.error(`  ❌ Template file failed validation:`, err);
    return {
      message: `${MIGRATION_ID} aborted — template invalid`,
      details: { updated: 0, errors: 1 },
    };
  }

  console.log(`  ✏️  content ${content.length} → ${next.length} chars`);
  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    return {
      message: `${MIGRATION_ID} dry-run`,
      details: { updated: 1, errors: 0 },
    };
  }

  try {
    await updateDoc(ref, {
      content: next,
      [BACKUP_FIELD]: { content },
      updatedAt: Timestamp.now(),
      migratedBy: MIGRATION_ID,
    });
  } catch (err) {
    console.error(`  ❌ Failed to update template:`, err);
    return {
      message: `${MIGRATION_ID} failed`,
      details: { updated: 0, errors: 1 },
    };
  }

  console.log(`\n✅ Reservation Email redesign is live.`);
  return {
    message: `${MIGRATION_ID} completed`,
    details: { updated: 1, errors: 0 },
  };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      message: `${MIGRATION_ID} rolled back`,
      details: { restored: 0, errors: 0 },
    };
  }

  const backup = (snap.data() as Record<string, any>)[BACKUP_FIELD] as
    | { content?: string }
    | undefined;
  if (!backup?.content) {
    console.log("  ℹ️  No backup found — nothing to roll back.");
    return {
      message: `${MIGRATION_ID} rolled back`,
      details: { restored: 0, errors: 0 },
    };
  }

  try {
    await updateDoc(ref, {
      content: backup.content,
      [BACKUP_FIELD]: deleteField(),
      updatedAt: Timestamp.now(),
    });
  } catch (err) {
    console.error(`  ❌ Failed to roll back:`, err);
    return {
      message: `${MIGRATION_ID} rollback failed`,
      details: { restored: 0, errors: 1 },
    };
  }

  console.log(`\n✅ Restored the previous template.`);
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored: 1, errors: 0 },
  };
}
