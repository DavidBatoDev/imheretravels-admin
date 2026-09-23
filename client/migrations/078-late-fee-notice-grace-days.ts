/**
 * 078 — Late Fee Notice: state the grace period that triggered the fee.
 *
 * WHY
 * ───
 * From 24 Sep 2026 the late fee applies 2 days after an instalment's due date
 * for new bookings; bookings reserved before that keep 3 days
 * (src/lib/late-fee-policy.ts). The Terms and Conditions were updated to say
 * so. The Late Fee Notice never said when the fee applies, so a traveller had
 * no way to tell which rule their booking is on.
 *
 * WHAT IT DOES
 * ────────────
 * Adds one paragraph after the intro ("Please review the updated payment
 * details below…"):
 *
 *     Under our Terms and Conditions, a one-time late fee of 3% is added when
 *     an instalment is still unpaid {{ graceDays }} days after its due date.
 *
 * `graceDays` is passed per booking by the nightly checker, Process Now and
 * Send Notice. The paragraph is wrapped in `{% if graceDays %}` so the email
 * still renders cleanly if something sends it without the variable (e.g. the
 * old Cloud Function before it is redeployed).
 *
 * Patches every `emailTemplates` doc named "Late Fee Notice" surgically — the
 * repo copy (functions/emails/latePaymentNotice.html) has drifted from the live
 * template, so it is never uploaded wholesale.
 *
 * Idempotent: skipped when the marker is already present.
 * Reversible: previous `content` stashed in `_migration078`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run078   # preview
 *   npx tsx migrations/migrate.ts 078           # apply
 *   npx tsx migrations/migrate.ts rollback078   # undo
 */

import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "078-late-fee-notice-grace-days";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_NAME = "Late Fee Notice";
const BACKUP_FIELD = "_migration078";

/** Present only after this migration has run. */
export const MARKER = "<!-- late-fee-grace-days -->";

// Whitespace-tolerant: the live template may wrap this sentence across lines.
const INTRO_END =
  /settle the overdue\s+amount as soon as possible to avoid further issues\s+with your\s+reservation\.\s*<\/p>/;

export const GRACE_PARAGRAPH = [
  "",
  "",
  "      {% if graceDays %}",
  `      ${MARKER}`,
  '      <p style="font-size: 15px; color: #555555; margin: 0 0 16px 0; line-height: 1.6;">',
  "        Under our Terms and Conditions, a one-time late fee of 3% is added when an instalment is still unpaid",
  "        <strong>{{ graceDays }} days</strong> after its due date.",
  "      </p>",
  "      {% endif %}",
].join("\n");

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;

  const match = INTRO_END.exec(content);
  if (!match) {
    throw new Error(
      'Could not find the end of the "Please review the updated payment details" paragraph.',
    );
  }

  const at = match.index + match[0].length;
  return content.slice(0, at) + GRACE_PARAGRAPH + content.slice(at);
}

async function getTemplateDocs() {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION_NAME),
      where("name", "==", TEMPLATE_NAME),
    ),
  );
  return snap.docs;
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const docs = await getTemplateDocs();
  if (docs.length === 0) {
    console.error(`❌ No "${TEMPLATE_NAME}" template found.`);
    return {
      message: `${MIGRATION_ID} aborted — template missing`,
      details: { updated: 0, errors: 1 },
    };
  }

  let updated = 0;
  let errors = 0;

  for (const templateDoc of docs) {
    const data = templateDoc.data() as Record<string, any>;
    const content = String(data.content || "");
    console.log(
      `📧 ${templateDoc.id} (status: ${data.status ?? "—"}) — ${content.length} chars`,
    );

    if (content.includes(MARKER)) {
      console.log("  ⏭️  Already has the grace-days paragraph — nothing to do.");
      continue;
    }

    let patched: string;
    try {
      patched = patchTemplate(content);
    } catch (err) {
      console.error(`  ❌ Could not patch template:`, err);
      errors += 1;
      continue;
    }

    console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);
    if (dryRun) {
      const i = patched.indexOf("{% if graceDays %}");
      console.log("\n--- new paragraph ---\n" + patched.slice(i - 200, i + 420));
      updated += 1;
      continue;
    }

    try {
      await updateDoc(templateDoc.ref, {
        content: patched,
        [BACKUP_FIELD]: { content },
        updatedAt: Timestamp.now(),
        migratedBy: MIGRATION_ID,
      });
      updated += 1;
    } catch (err) {
      console.error(`  ❌ Failed to update template:`, err);
      errors += 1;
    }
  }

  if (dryRun) console.log(`\n🧪 DRY RUN complete — no changes written.`);
  else console.log(`\n✅ Late Fee Notice now states the grace period.`);

  return {
    message: dryRun ? `${MIGRATION_ID} dry-run` : `${MIGRATION_ID} completed`,
    details: { updated, errors },
  };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);

  let restored = 0;
  let errors = 0;

  for (const templateDoc of await getTemplateDocs()) {
    const data = templateDoc.data() as Record<string, any>;
    const backup = data[BACKUP_FIELD] as { content?: string } | undefined;
    if (!backup?.content) continue;

    try {
      await updateDoc(templateDoc.ref, {
        content: backup.content,
        [BACKUP_FIELD]: deleteField(),
        updatedAt: Timestamp.now(),
      });
      restored += 1;
    } catch (err) {
      console.error(`  ❌ Failed to roll back ${templateDoc.id}:`, err);
      errors += 1;
    }
  }

  console.log(
    restored
      ? `\n✅ Restored ${restored} template(s).`
      : "  ℹ️  No backup found — nothing to roll back.",
  );
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored, errors },
  };
}
