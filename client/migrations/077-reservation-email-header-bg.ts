/**
 * 077 — Reservation Email: white band behind the logo header.
 *
 * WHY
 * ───
 * QA of the 075 redesign: the automated "Reservation Confirmed" email shows its
 * logo on a white band above the grey page, because its <style> block gives
 * `.header` a white background. The redesigned Reservation Email dropped that
 * rule, so the logo sat on grey. Adding the colour inline also survives clients
 * that strip <style>.
 *
 * Patches the live document surgically; the repo file carries the same change.
 *
 * Idempotent: skipped when the header already has the white background.
 * Reversible: previous `content` stashed in `_migration077`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run077
 *   npx tsx migrations/migrate.ts 077
 *   npx tsx migrations/migrate.ts rollback077
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "077-reservation-email-header-bg";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "BnRGgT6E8SVrXZH961LT";
const BACKUP_FIELD = "_migration077";

const OLD_HEADER = '<div class="header" style="text-align: center; padding: 20px;">';
export const NEW_HEADER =
  '<div class="header" style="text-align: center; padding: 20px; background-color: #ffffff;">';

export function patchTemplate(content: string): string {
  if (content.includes(NEW_HEADER)) return content;
  if (!content.includes(OLD_HEADER)) {
    throw new Error("Could not find the logo header <div> to patch.");
  }
  return content.replace(OLD_HEADER, NEW_HEADER);
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

  if (content.includes(NEW_HEADER)) {
    console.log("  ⏭️  Header already white — nothing to do.");
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
      message: `${MIGRATION_ID} aborted`,
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

  console.log(`\n✅ Logo header now sits on a white band.`);
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
