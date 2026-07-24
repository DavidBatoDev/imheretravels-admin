/**
 * 071 — Point every "Pay securely online" button at the traveller's own booking
 *       status page instead of one shared Stripe payment link.
 *
 * WHY
 * ───
 * Three live templates hardcoded the SAME Stripe payment link:
 *
 *     https://buy.stripe.com/7sY5kD5NF2uBfGj1NJco03g
 *
 *   • DisPYJPnL01OmomT8Mch  Initial Payment Reminder
 *   • GEB3llGzftDaWRFXj8qz  Scheduled Reminder Email
 *   • BnRGgT6E8SVrXZH961LT  Reservation Email
 *
 * One link for every customer, every tour and every instalment. It cannot know
 * who is paying, which booking they are paying for, or how much is due, so a
 * traveller clicking it lands on a generic checkout disconnected from their
 * booking — and any payment made there has to be reconciled by hand.
 *
 * Each booking already has an `access_token` and a personal booking status page
 * at `/booking-status/<token>`, which shows their real balance, their plan, and
 * a Pay Now flow that creates a correctly-attributed Stripe checkout. That is
 * where these buttons should go.
 *
 * WHAT IT DOES
 * ────────────
 * Replaces the hardcoded href with `{{ bookingStatusUrl }}` and wraps each
 * button in `{% if bookingStatusUrl %}` so a booking without a token renders a
 * short fallback line instead of a dead link. The Cloud Functions that render
 * these templates now supply `bookingStatusUrl` (see `booking-status-url.ts`).
 *
 * DEPLOY ORDER MATTERS: deploy the functions BEFORE running this migration.
 * A patched template rendered by an old function would produce an empty href.
 *
 * Idempotent: templates with no Stripe link left are skipped.
 * Reversible: previous `content` stashed in `_migration071`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run071   # preview
 *   npx tsx migrations/migrate.ts 071           # apply
 *   npx tsx migrations/migrate.ts rollback071   # undo
 */

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "071-pay-link-to-booking-status";
const COLLECTION_NAME = "emailTemplates";
const BACKUP_FIELD = "_migration071";

// The one generic link that every template shared.
const HARDCODED_STRIPE_LINK = /https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g;

const FALLBACK_NOTE =
  '<span style="font-size: 13px; color: #666666;">Your payment link will be sent to you separately.</span>';

/**
 * Swap the href and guard the button.
 *
 * Anchors are located by the hardcoded URL itself rather than by surrounding
 * markup, because the three templates wrap the button differently (table cell,
 * div, list item) and their indentation differs.
 */
export function patchTemplate(content: string): {
  patched: string;
  linksReplaced: number;
  guarded: number;
} {
  const linksReplaced = (content.match(HARDCODED_STRIPE_LINK) || []).length;
  if (linksReplaced === 0) {
    return { patched: content, linksReplaced: 0, guarded: 0 };
  }

  let patched = content.replace(HARDCODED_STRIPE_LINK, "{{ bookingStatusUrl }}");

  // Wrap each button in a bookingStatusUrl guard. The anchor runs from the
  // <a ...{{ bookingStatusUrl }}...> opening tag to its matching </a>.
  let guarded = 0;
  const anchorRe =
    /<a\b[^>]*href="\{\{ bookingStatusUrl \}\}"[\s\S]*?<\/a>/g;
  patched = patched.replace(anchorRe, (anchor) => {
    guarded++;
    return `{% if bookingStatusUrl %}${anchor}{% else %}${FALLBACK_NOTE}{% endif %}`;
  });

  return { patched, linksReplaced, guarded };
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const snap = await getDocs(collection(db, COLLECTION_NAME));
  console.log(`📚 ${snap.size} email templates`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let totalLinks = 0;

  for (const d of snap.docs) {
    const data = d.data() as Record<string, any>;
    const content = String(data.content || "");
    const name = data.name || d.id;

    const { patched, linksReplaced, guarded } = patchTemplate(content);

    if (linksReplaced === 0) {
      skipped++;
      continue;
    }

    totalLinks += linksReplaced;
    console.log(
      `  ✏️  "${name}" (${d.id}) — ${linksReplaced} Stripe link(s) → {{ bookingStatusUrl }}, ${guarded} button(s) guarded`,
    );

    if (guarded !== linksReplaced) {
      console.warn(
        `      ⚠️  ${linksReplaced} link(s) but only ${guarded} anchor(s) matched — check this template by hand.`,
      );
    }

    if (dryRun) {
      updated++;
      continue;
    }

    try {
      await updateDoc(doc(db, COLLECTION_NAME, d.id), {
        content: patched,
        [BACKUP_FIELD]: { content },
        updatedAt: Timestamp.now(),
        migratedBy: MIGRATION_ID,
      });
      updated++;
    } catch (err) {
      errors++;
      console.error(`  ❌ Failed to update "${name}" (${d.id}):`, err);
    }
  }

  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
  } else {
    console.log(`\n✅ Repointed ${totalLinks} pay button(s) across ${updated} template(s).`);
  }
  console.log(
    `📊 ${updated} template(s) ${dryRun ? "would be " : ""}updated, ${skipped} untouched, ${errors} errors.`,
  );

  return {
    message: `${MIGRATION_ID} ${dryRun ? "dry-run" : "completed"}`,
    details: { updated, skipped, totalLinks, errors },
  };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);

  const snap = await getDocs(collection(db, COLLECTION_NAME));

  let restored = 0;
  let errors = 0;

  for (const d of snap.docs) {
    const data = d.data() as Record<string, any>;
    const backup = data[BACKUP_FIELD] as { content?: string } | undefined;
    if (!backup?.content) continue;

    try {
      await updateDoc(doc(db, COLLECTION_NAME, d.id), {
        content: backup.content,
        [BACKUP_FIELD]: deleteField(),
        updatedAt: Timestamp.now(),
      });
      restored++;
    } catch (err) {
      errors++;
      console.error(`  ❌ Failed to roll back ${d.id}:`, err);
    }
  }

  console.log(`\n✅ Restored ${restored} template(s).`);
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored, errors },
  };
}
