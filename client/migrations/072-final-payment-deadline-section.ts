/**
 * 072 — Ship the "Final Payment Deadline" section in the Reservation Confirmed
 *       email, closing the last repo/Firestore divergence.
 *
 * WHY
 * ───
 * `send-booking-status-confirmation.ts` has always computed and passed a
 * `finalPaymentDeadline` variable (two calendar months before the tour date),
 * and the repo copy `functions/emails/reservationConfirmationWithQR.html`
 * contains a section that renders it — but that section was never written to
 * the live Firestore template. So the function has been shipping the value into
 * a template that ignores it, and the repo file has been describing an email
 * customers never received.
 *
 * That divergence is the last thing keeping the repo copy from being a truthful
 * record of the live template. Rather than delete authored, wired-up work, this
 * ships it: customers get told when their balance is due, which is information
 * they need and the codebase already intended to give them.
 *
 * WHAT IT DOES
 * ────────────
 * Inserts the deadline block immediately before the "Next Steps" section of
 * `emailTemplates/C8PKdv5BgAlTSFCm6wS3`, guarded by
 * `{% if finalPaymentDeadline %}` so a booking with an unparseable tour date
 * renders nothing rather than an empty sentence.
 *
 * Run AFTER 070 (which adds the travel-party block to the same document).
 *
 * Idempotent: skipped when the section is already present.
 * Reversible: previous `content` stashed in `_migration072`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run072   # preview
 *   npx tsx migrations/migrate.ts 072           # apply
 *   npx tsx migrations/migrate.ts rollback072   # undo
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "072-final-payment-deadline-section";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "C8PKdv5BgAlTSFCm6wS3";
const BACKUP_FIELD = "_migration072";

const MARKER = "Final Payment Deadline";

// Anchored on the Next Steps comment; the block goes immediately above it.
const NEXT_STEPS_ANCHOR = /([ \t]*<!--\s*Next Steps\s*-->)/;

const DEADLINE_BLOCK = `            <!-- Payment Policy Notice -->
            {% if finalPaymentDeadline %}
            <div style="
                                            background-color: #fdf2f2;
                                            padding: 15px 20px;
                                            border-radius: 12px;
                                            margin: 25px 0;
                                            border-left: 5px solid #c0392b;
                                            ">
                <h4 style="color: #c0392b; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">⚠️ Final Payment Deadline</h4>
                <p style="font-size: 13px; color: #333333; margin: 0;">
                    Your full tour balance must be received no later than
                    <strong>{{ finalPaymentDeadline }}</strong> — 2 months before your departure date.
                    Any outstanding balance after this date may result in your booking being cancelled.
                </p>
            </div>
            {% endif %}
`;

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;

  if (!NEXT_STEPS_ANCHOR.test(content)) {
    throw new Error(
      "Could not find the '<!-- Next Steps -->' anchor to insert the deadline section above.",
    );
  }

  return content.replace(NEXT_STEPS_ANCHOR, `${DEADLINE_BLOCK}$1`);
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
    console.log("  ⏭️  Deadline section already present — nothing to do.");
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

  console.log(`\n✅ Final Payment Deadline section added.`);
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
