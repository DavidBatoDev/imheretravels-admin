/**
 * 073 — Align the Reservation Email's payment-deadline wording with the
 *       Terms and Conditions, and make it dynamic.
 *
 * WHY
 * ───
 * The "Full payment required within 48hrs" branch of
 * `emailTemplates/BnRGgT6E8SVrXZH961LT` tells the traveller:
 *
 *     "Your tour is less than 30 days away, so monthly payment plans are no
 *      longer available."
 *
 * That has been wrong since the June 2026 schedule policy. A booking is
 * "last minute" when no instalment Friday fits between reservation + 2 days
 * and the cutoff two calendar months before the tour (installment-schedule.ts),
 * and https://www.imheretravels.com/terms-and-conditions says the same:
 * "Full payment must be settled no later than 60 days (2 months) before the
 * tour start date." So a traveller whose tour is 60 days out is told it is
 * "less than 30 days away" — which is what Bella flagged.
 *
 * The "Invalid" branch has the same problem: it says the tour "is scheduled to
 * begin within 48 hours", but the rule (getPaymentCondition) is fewer than
 * 3 days between reservation and departure.
 *
 * WHAT IT DOES
 * ────────────
 *  1. Replaces the hard-coded "less than 30 days" sentence with one built from
 *     the `tourDate` variable the Cloud Function already passes, and states the
 *     actual rule (balances due 2 months before departure, per the Terms and
 *     Conditions, with a link). No day count is asserted, so the sentence is
 *     true for every booking that lands in this branch.
 *  2. Rewords the Invalid branch to "less than 3 days" to match the rule.
 *
 * Patches the live document surgically — the repo copy
 * (functions/emails/reservationEmail.html) is a developer copy and has drifted,
 * so it is never uploaded wholesale.
 *
 * Idempotent: skipped when the marker is already present.
 * Reversible: previous `content` stashed in `_migration073`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run073   # preview
 *   npx tsx migrations/migrate.ts 073           # apply
 *   npx tsx migrations/migrate.ts rollback073   # undo
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "073-reservation-email-terms-alignment";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "BnRGgT6E8SVrXZH961LT";
const BACKUP_FIELD = "_migration073";

export const TERMS_URL = "https://www.imheretravels.com/terms-and-conditions";

/** Present only after this migration has run. */
export const MARKER = "<!-- migration073: dynamic final-payment wording -->";

// Whitespace-tolerant: the live template wraps this sentence across lines.
const OLD_LAST_MINUTE =
  /Your tour is less than 30 days away,\s+so monthly payment plans are no\s+longer available\.\s+To secure your spot,\s+the remaining balance must be\s+fully paid within 48 hours\./;

export const NEW_LAST_MINUTE = [
  MARKER,
  "                Your tour departs on <strong>{{ tourDate }}</strong>, so there is no",
  "                longer time for a monthly payment plan &mdash; in line with our",
  `                <a href="${TERMS_URL}" target="_blank" style="color: #c0392b">Terms and Conditions</a>,`,
  "                the full balance is due no later than 2 months before departure.",
  "                To secure your spot, the remaining balance must be fully paid",
  "                within 48 hours.",
].join("\n");

const OLD_INVALID = /because the tour\s+is scheduled to begin within 48 hours\./;
export const NEW_INVALID =
  "because the tour\n                is scheduled to begin in less than 3 days.";

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;

  if (!OLD_LAST_MINUTE.test(content)) {
    throw new Error(
      'Could not find the "less than 30 days" sentence in the 48hrs branch.',
    );
  }
  if (!OLD_INVALID.test(content)) {
    throw new Error(
      'Could not find the "begin within 48 hours" sentence in the Invalid branch.',
    );
  }

  return content
    .replace(OLD_LAST_MINUTE, NEW_LAST_MINUTE)
    .replace(OLD_INVALID, NEW_INVALID);
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
    console.log("  ⏭️  Wording already updated — nothing to do.");
    return {
      message: `${MIGRATION_ID} — already up to date`,
      details: { updated: 0, errors: 0 },
    };
  }

  let patched: string;
  try {
    patched = patchTemplate(content);
  } catch (err) {
    console.error(`  ❌ Could not patch template:`, err);
    return {
      message: `${MIGRATION_ID} aborted — anchor not found`,
      details: { updated: 0, errors: 1 },
    };
  }

  console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);
  if (dryRun) {
    const i = patched.indexOf(MARKER);
    console.log("\n--- new 48hrs paragraph ---\n" + patched.slice(i, i + 650));
    const k = patched.indexOf("begin in less than 3 days");
    console.log("\n--- new Invalid sentence ---\n" + patched.slice(k - 120, k + 40));
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

  console.log(
    `\n✅ Reservation Email wording aligned with the Terms and Conditions.`,
  );
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

  const data = snap.data() as Record<string, any>;
  const backup = data[BACKUP_FIELD] as { content?: string } | undefined;
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
