/**
 * 081 — Cancellation Email: show paid late fees as a non-refundable line.
 *
 * WHY
 * ───
 * Late fees are never refunded when a guest cancels. The refund columns now
 * exclude them on every plan, but the email's breakdown folded them silently
 * into "Non-Refundable Amount". Guests should see why that number is higher.
 *
 * `generate-cancellation-email.ts` now passes `lateFeesPaid` ("0.00" when none).
 * Before that functions deploy the variable is undefined and the line stays
 * hidden, so this migration is safe to run first.
 *
 * WHAT IT DOES
 * ────────────
 *  Adds "(Includes £X in late payment fees, which are non-refundable)" under
 *  the admin-fee note in the refund breakdown.
 *
 * Idempotent via marker. Reversible: previous content in `_migration081`.
 *
 *   npx tsx migrations/migrate.ts dry-run081 | 081 | rollback081
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "081-cancellation-late-fees-line";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "wQK3bh1S9KJdfQJG7cEI";
const BACKUP_FIELD = "_migration081";
export const MARKER = "<!-- migration081 -->";

const EDITS: Array<{ name: string; find: RegExp; replace: string }> = [
  {
    name: "late fees line after admin fee note",
    find: /(\(Includes £\{\{ adminFee \}\} administrative fee\)\s*<\/div>\s*\{% endif %\})/,
    replace:
      `$1\n                    ${MARKER}` +
      `\n                    {% if lateFeesPaid and lateFeesPaid != "0.00" %}` +
      `\n                    <div style="margin-bottom: 10px; font-size: 13px; color: #999;">` +
      `\n                        (Includes £{{ lateFeesPaid }} in late payment fees, which are non-refundable)` +
      `\n                    </div>` +
      `\n                    {% endif %}`,
  },
];

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;
  let out = content;
  for (const e of EDITS) {
    if (!e.find.test(out)) throw new Error(`Anchor not found: ${e.name}`);
    out = out.replace(e.find, e.replace);
  }
  return out;
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);
  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { message: `${MIGRATION_ID} aborted — template missing`, details: { updated: 0, errors: 1 } };
  }
  const content = String((snap.data() as any).content || "");
  if (content.includes(MARKER)) {
    console.log("  ⏭️  Already applied.");
    return { message: `${MIGRATION_ID} — already up to date`, details: { updated: 0, errors: 0 } };
  }
  let patched: string;
  try {
    patched = patchTemplate(content);
  } catch (err) {
    console.error(`  ❌ ${(err as Error).message}`);
    return { message: `${MIGRATION_ID} aborted`, details: { updated: 0, errors: 1 } };
  }
  console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);
  if (dryRun) {
    return { message: `${MIGRATION_ID} dry-run`, details: { updated: 1, errors: 0 } };
  }
  await updateDoc(ref, {
    content: patched,
    [BACKUP_FIELD]: { content },
    updatedAt: Timestamp.now(),
    migratedBy: MIGRATION_ID,
  });
  return { message: `${MIGRATION_ID} completed`, details: { updated: 1, errors: 0 } };
}

export async function rollbackMigration() {
  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);
  const backup = snap.exists()
    ? ((snap.data() as any)[BACKUP_FIELD] as { content?: string } | undefined)
    : undefined;
  if (!backup?.content) {
    return { message: `${MIGRATION_ID} — nothing to roll back`, details: { restored: 0, errors: 0 } };
  }
  await updateDoc(ref, {
    content: backup.content,
    [BACKUP_FIELD]: deleteField(),
    updatedAt: Timestamp.now(),
  });
  return { message: `${MIGRATION_ID} rolled back`, details: { restored: 1, errors: 0 } };
}
