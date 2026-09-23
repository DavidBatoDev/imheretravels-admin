/**
 * 079 — Fixes from the 2026-09-23 Terms-and-Conditions sweep of live templates.
 *
 * WHAT IT DOES
 * ────────────
 * Booking Confirmed - With Pre Departure Pack (DqdAH8Vez5tl1mJffTMI), sent from
 * the admin bookings page to fully paid travellers:
 *   • "You're going to the Philippines!" was hard-coded, so Vietnam and India
 *     travellers were told they were going to the Philippines. Now names the tour.
 *   • Fixes the visible "/li>" typo on the WhatsApp line.
 *   • Replaces "Please do not reply" (the email comes from Bella's inbox and every
 *     other template invites replies) with an invitation to reply.
 *
 * Initial Payment Reminder (DisPYJPnL01OmomT8Mch):
 *   • The green "Pay securely online with Stripe" button already links to the
 *     booking status page; it is relabelled "View Booking Status & Pay Online"
 *     and restyled to match the other emails. It is this email's only pay link,
 *     so it is relabelled rather than removed.
 *
 * Scheduled Reminder Email (GEB3llGzftDaWRFXj8qz):
 *   • Removes the "Pay securely online with Stripe" button. It duplicated the
 *     "View Booking & Pay" block lower down, which uses the same URL and the same
 *     condition (both come from the booking's access_token). The "payment link
 *     will be sent separately" fallback stays for bookings without a link.
 *   • "Please send us proof of payment once you've made the transfer" dates from
 *     bank transfers. Card payments go through the booking status page now.
 *
 * Patches each live document surgically. Every anchor must be found or the
 * whole migration aborts before writing anything.
 *
 * Idempotent: each template is skipped when its marker is present.
 * Reversible: each previous `content` is stashed in `_migration079`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run079
 *   npx tsx migrations/migrate.ts 079
 *   npx tsx migrations/migrate.ts rollback079
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "079-template-sweep-fixes";
const COLLECTION_NAME = "emailTemplates";
const BACKUP_FIELD = "_migration079";
export const MARKER = "<!-- migration079 -->";

type Edit = { name: string; find: RegExp; replace: string };
type Target = { id: string; label: string; edits: Edit[] };

const PILL =
  "display: inline-block; background-color: #e74c3c; color: white; text-decoration: none; " +
  "font-weight: bold; padding: 10px 24px; border-radius: 25px; font-size: 14px; margin-top: 8px;";

export const TARGETS: Target[] = [
  {
    id: "DqdAH8Vez5tl1mJffTMI",
    label: "Booking Confirmed - With Pre Departure Pack",
    edits: [
      {
        name: "tour name instead of 'the Philippines'",
        find: /(<p style="[^"]*">)You're going to the Philippines!(<\/p>)/,
        replace: `${MARKER}$1You're going on {{ tourPackage }}!$2`,
      },
      {
        name: "WhatsApp '/li>' typo",
        find: /(\+63 998 247 6847)\/li>/,
        replace: "$1</li>",
      },
      {
        name: "no-reply note",
        find: /This is an automated confirmation email\. Please do not reply to this message\. If you need\s+assistance, contact us using the information provided above\./,
        replace:
          "Have a question about your trip? Just reply to this email and our team will get back to you.",
      },
    ],
  },
  {
    id: "DisPYJPnL01OmomT8Mch",
    label: "Initial Payment Reminder",
    edits: [
      {
        name: "relabel Stripe button",
        find: /\{% if bookingStatusUrl %\}<a href="\{\{ bookingStatusUrl \}\}" target="_blank" style="[^"]*">Pay securely online with Stripe<\/a>/,
        replace: `{% if bookingStatusUrl %}${MARKER}<a href="{{ bookingStatusUrl }}" target="_blank" style="${PILL}">View Booking Status &amp; Pay Online</a>`,
      },
    ],
  },
  {
    id: "GEB3llGzftDaWRFXj8qz",
    label: "Scheduled Reminder Email",
    edits: [
      {
        name: "remove duplicate Stripe button",
        find: /\{% if bookingStatusUrl %\}<a href="\{\{ bookingStatusUrl \}\}" target="_blank" style="[^"]*">\s*Pay securely online with Stripe\s*<\/a>\{% else %\}/,
        replace: `${MARKER}{% if not bookingStatusUrl %}`,
      },
      {
        name: "proof-of-payment transfer wording",
        find: /Please send us <strong>proof of payment<\/strong> once you've made\s+the transfer\. You can reply directly to this email with the receipt\s+or confirmation\./,
        replace:
          "Pay securely by card from your booking status page using the button below &mdash; " +
          "payments made there are added to your booking automatically. If you paid another way, " +
          "just reply to this email with your receipt so we can update your booking.",
      },
    ],
  },
];

export function patchTemplate(content: string, target: Target): string {
  if (content.includes(MARKER)) return content;
  let out = content;
  for (const e of target.edits) {
    if (!e.find.test(out)) {
      throw new Error(`[${target.label}] anchor not found: ${e.name}`);
    }
    out = out.replace(e.find, e.replace);
  }
  return out;
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  // Read and patch everything first so a missing anchor writes nothing.
  const plans: Array<{ target: Target; before: string; after: string }> = [];
  for (const target of TARGETS) {
    const snap = await getDoc(doc(db, COLLECTION_NAME, target.id));
    if (!snap.exists()) {
      console.error(`❌ ${target.label} (${target.id}) not found.`);
      return { message: `${MIGRATION_ID} aborted`, details: { updated: 0, errors: 1 } };
    }
    const before = String((snap.data() as any).content || "");
    if (before.includes(MARKER)) {
      console.log(`  ⏭️  ${target.label}: already applied`);
      continue;
    }
    try {
      plans.push({ target, before, after: patchTemplate(before, target) });
    } catch (err) {
      console.error(`  ❌ ${(err as Error).message}`);
      return { message: `${MIGRATION_ID} aborted — nothing written`, details: { updated: 0, errors: 1 } };
    }
  }

  for (const p of plans) {
    console.log(`  ✏️  ${p.target.label}: ${p.before.length} → ${p.after.length} chars`);
  }
  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    return { message: `${MIGRATION_ID} dry-run`, details: { updated: plans.length, errors: 0 } };
  }

  let updated = 0;
  for (const p of plans) {
    await updateDoc(doc(db, COLLECTION_NAME, p.target.id), {
      content: p.after,
      [BACKUP_FIELD]: { content: p.before },
      updatedAt: Timestamp.now(),
      migratedBy: MIGRATION_ID,
    });
    updated++;
  }
  console.log(`\n✅ ${updated} template(s) updated.`);
  return { message: `${MIGRATION_ID} completed`, details: { updated, errors: 0 } };
}

export async function rollbackMigration() {
  console.log(`\n↩️  Rolling back ${MIGRATION_ID}`);
  let restored = 0;
  for (const target of TARGETS) {
    const ref = doc(db, COLLECTION_NAME, target.id);
    const snap = await getDoc(ref);
    const backup = snap.exists()
      ? ((snap.data() as any)[BACKUP_FIELD] as { content?: string } | undefined)
      : undefined;
    if (!backup?.content) continue;
    await updateDoc(ref, {
      content: backup.content,
      [BACKUP_FIELD]: deleteField(),
      updatedAt: Timestamp.now(),
    });
    restored++;
  }
  console.log(`\n✅ Restored ${restored} template(s).`);
  return { message: `${MIGRATION_ID} rolled back`, details: { restored, errors: 0 } };
}
