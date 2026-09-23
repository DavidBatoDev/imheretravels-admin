/**
 * 080 — Cancellation Email: cover cancellations on or after the tour start.
 *
 * WHY
 * ───
 * T&C §12: "59 days or fewer before tour start, or after tour start: No refund".
 * The Cancellation Email (`emailTemplates/wQK3bh1S9KJdfQJG7cEI`) only had policy
 * wording for daysBeforeTour > 0, so an after-start cancellation got no policy
 * line, and the intro read "which was 0 days before your tour date".
 *
 * `generate-cancellation-email.ts` now computes the day count from the dates and
 * passes `daysKnown` and `cancelledAfterTourStart`, so 0 no longer doubles as
 * "couldn't read it". This template change depends on that functions deploy;
 * before it, both new variables are undefined and every new branch stays hidden.
 *
 * WHAT IT DOES
 * ────────────
 *  1. Intro: after-start cancellations say so instead of "N days before".
 *     When the day count is unknown, the timing clause is dropped.
 *  2. Policy: new "on or after the tour start date — no refund" branch.
 *  3. Policy summary box: "59 days or less, or after tour start: No refund".
 *
 * Idempotent via marker. Reversible: previous content in `_migration080`.
 *
 *   npx tsx migrations/migrate.ts dry-run080 | 080 | rollback080
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "080-cancellation-after-tour-start";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "wQK3bh1S9KJdfQJG7cEI";
const BACKUP_FIELD = "_migration080";
export const MARKER = "<!-- migration080 -->";

const EDITS: Array<{ name: string; find: RegExp; replace: string }> = [
  {
    name: "intro timing sentence",
    find: /You requested to cancel your booking on <strong>\{\{ cancellationRequestDate \}\}<\/strong>,\s*which was <strong>\{\{ daysBeforeTour \}\} days before your tour date<\/strong>\.\s*Based on our cancellation timeline, your booking falls under the\s*<strong style="color: #e74c3c;">\{\{ timingWindow \}\}<\/strong> cancellation window\./,
    replace:
      `${MARKER}You requested to cancel your booking on <strong>{{ cancellationRequestDate }}</strong>` +
      `{% if cancelledAfterTourStart %}, <strong>on or after your tour start date</strong>.` +
      `{% elif daysKnown == false %}.` +
      `{% else %}, which was <strong>{{ daysBeforeTour }} days before your tour date</strong>.` +
      ` Based on our cancellation timeline, your booking falls under the` +
      ` <strong style="color: #e74c3c;">{{ timingWindow }}</strong> cancellation window.{% endif %}`,
  },
  {
    name: "after-start policy branch",
    find: /(\{% elif daysBeforeTour > 0 %\}\s*<strong>Policy Applied:<\/strong> Cancellations made less than 60 days in advance[\s\S]*?and all payments made\.)(\s*\{% endif %\})/,
    replace:
      "$1\n                    {% elif cancelledAfterTourStart %}\n" +
      "                    <strong>Policy Applied:</strong> Cancellations made on or after the tour start date\n" +
      "                    are non-refundable as per our cancellation policy. This includes your reservation fee\n" +
      "                    (£{{ cancelledRefundAmount }}) and all payments made.$2",
  },
  {
    name: "policy summary line",
    find: /<li><strong>59 days or less:<\/strong> No refund<\/li>/,
    replace:
      "<li><strong>59 days or less, or after tour start:</strong> No refund</li>",
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
