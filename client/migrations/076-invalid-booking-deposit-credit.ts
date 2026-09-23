/**
 * 076 — Reservation Email, Invalid branch: the deposit is non-refundable
 *       rebooking credit, not a refund.
 *
 * WHY
 * ───
 * The Invalid branch of `emailTemplates/BnRGgT6E8SVrXZH961LT` (tour starts in
 * under 3 days) told the traveller to send bank details so we could "process
 * the refund promptly". The Terms and Conditions say otherwise, in two places:
 *   §9  "A deposit of £200, £250, or £300 is required at booking — non-refundable"
 *   §12 "Reservation fee is non-refundable but can be used for rebooking"
 * Flagged by the user during QA of the 075 redesign on 2026-09-23.
 *
 * WHAT IT DOES
 * ────────────
 * Replaces the refund card in the Invalid branch with one that says the
 * deposit is non-refundable (linking the Terms) and is held as credit towards a
 * rebooking, and invites the traveller to reply to pick a new date. The repo
 * file `functions/emails/reservationEmail.html` carries the same change, so it
 * stays the truthful copy of the live template (see 075).
 *
 * Idempotent: skipped when the marker is present.
 * Reversible: previous `content` stashed in `_migration076`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run076
 *   npx tsx migrations/migrate.ts 076
 *   npx tsx migrations/migrate.ts rollback076
 */

import * as fs from "fs";
import * as path from "path";
import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "076-invalid-booking-deposit-credit";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "BnRGgT6E8SVrXZH961LT";
const BACKUP_FIELD = "_migration076";

export const MARKER =
  "<!-- migration076: deposit is non-refundable rebooking credit -->";

const TEMPLATE_FILE = path.resolve(
  __dirname,
  "..",
  "functions",
  "emails",
  "reservationEmail.html",
);

// From the refund heading to the closing sentence of the Invalid branch.
const OLD_BLOCK =
  /<h3 style="color: #c0392b;[^"]*">Refund Details for Your Booking<\/h3>[\s\S]*?Thank you for your understanding, and we hope to assist you on your\s+next adventure\.\s*<\/p>/;

const NEW_BLOCK_RE =
  /<h3 style="color: #c0392b;[^"]*">About Your Booking and Deposit<\/h3>[\s\S]*?welcoming you on your next adventure\.\s*<\/p>/;

/** The replacement is lifted from the repo file so the two never diverge. */
export function loadNewBlock(): string {
  const repo = fs.readFileSync(TEMPLATE_FILE, "utf8");
  const m = repo.match(NEW_BLOCK_RE);
  if (!m || !m[0].includes(MARKER)) {
    throw new Error(
      `${TEMPLATE_FILE} does not contain the new Invalid-branch block with the 076 marker.`,
    );
  }
  return m[0];
}

export function patchTemplate(content: string, newBlock: string): string {
  if (content.includes(MARKER)) return content;
  if (!OLD_BLOCK.test(content)) {
    throw new Error(
      'Could not find the "Refund Details for Your Booking" block in the Invalid branch.',
    );
  }
  const patched = content.replace(OLD_BLOCK, newBlock);
  if (/refund/i.test(patched.replace(/non-refundable/gi, ""))) {
    throw new Error("Template still mentions a refund after patching.");
  }
  return patched;
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
    console.log("  ⏭️  Already applied — nothing to do.");
    return {
      message: `${MIGRATION_ID} — already up to date`,
      details: { updated: 0, errors: 0 },
    };
  }

  let patched: string;
  try {
    patched = patchTemplate(content, loadNewBlock());
  } catch (err) {
    console.error(`  ❌ Could not patch template:`, err);
    return {
      message: `${MIGRATION_ID} aborted`,
      details: { updated: 0, errors: 1 },
    };
  }

  console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);
  if (dryRun) {
    const i = patched.indexOf("About Your Booking and Deposit");
    console.log("\n--- new Invalid block ---\n" + patched.slice(i - 100, i + 1500));
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    return {
      message: `${MIGRATION_ID} dry-run`,
      details: { updated: 1, errors: 0 },
    };
  }

  try {
    await updateDoc(ref, {
      content: patched,
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

  console.log(`\n✅ Invalid branch now matches the Terms and Conditions.`);
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
