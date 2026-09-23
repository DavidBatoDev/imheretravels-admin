/**
 * 074 — Reservation Email: fix broken images and drop the duplicate Stripe CTA.
 *
 * WHY
 * ───
 * Manual QA of `emailTemplates/BnRGgT6E8SVrXZH961LT` (2026-09-23) showed:
 *
 *  1. The logo (header + signature) points at the old WordPress upload
 *     `imheretravels.com/wp-content/uploads/2025/04/ImHereTravels-Logo.png`,
 *     which now returns 403 — every customer sees a broken image. The banner
 *     fallback (used when a tour has no cover image) points at a WordPress
 *     upload that also 403s. The other live templates already host these on
 *     Firebase Storage, so this reuses those URLs.
 *
 *  2. The "PM3 – Stripe Payment" bullet with its "Pay securely online with
 *     Stripe" button. Since migration 071 that button links to the booking
 *     status page — the same place as the "View Booking Status & Pay Online"
 *     button beneath it. Two buttons to one destination read as two options.
 *     The booking status page is where travellers pick a plan and pay, so the
 *     Stripe bullet goes and the remaining CTA gets a clear lead-in.
 *
 * Patches the live document surgically; the repo copy is a developer copy.
 *
 * Idempotent: skipped when the marker is present.
 * Reversible: previous `content` stashed in `_migration074`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run074
 *   npx tsx migrations/migrate.ts 074
 *   npx tsx migrations/migrate.ts rollback074
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "074-reservation-email-images-and-pay-cta";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "BnRGgT6E8SVrXZH961LT";
const BACKUP_FIELD = "_migration074";

export const MARKER = "<!-- migration074: booking-status pay CTA -->";

// Same assets the "Reservation Confirmed" templates already use.
export const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/imheretravels-a3f81.firebasestorage.app/o/images%2F1768292814673_%F0%9F%9A%A3%20Logo%20Center%20(Row%20For%20Content%20Columns).png?alt=media&token=476fb69b-4cd5-4c56-901a-9190c15685f0";
export const BANNER_FALLBACK_URL =
  "https://firebasestorage.googleapis.com/v0/b/imheretravels-a3f81.firebasestorage.app/o/images%2F1767334951959_b0f582526af6adb523ad1036d0b0a6ff3437ea61.jpg?alt=media&token=c56af73d-0bfa-492d-8680-e1588d72d1b6";

const OLD_LOGO_URL =
  "https://imheretravels.com/wp-content/uploads/2025/04/ImHereTravels-Logo.png";
const OLD_BANNER_URL =
  "https://imheretravels.com/wp-content/uploads/2024/05/siargao-header-1.webp";

// The whole <ul> holding the PM3 / Stripe bullet, inside the payment-methods box.
const STRIPE_LIST =
  /[ \t]*<ul style="[^"]*">\s*<li>\s*<strong>PM3 – Stripe Payment \(Credit\/Debit Cards\)<\/strong>:<br \/>[\s\S]*?<\/li>\s*<\/ul>\s*/;

// Lead-in sentence of the remaining booking-status CTA (whitespace-tolerant).
const OLD_LEAD_IN =
  /Or you can Select your desired plan here,\s+view booking status and\s+pay with this link:/;
export const NEW_LEAD_IN =
  `${MARKER}\n` +
  "                    Choose your payment plan, view your booking status and pay\n" +
  "                    securely online by card here:";

// The divider above that paragraph separated it from the Stripe bullet.
const OLD_DIVIDER = /\s*padding-top: 15px;\s*border-top: 1px solid #ddd;/;

export function patchTemplate(content: string): string {
  if (content.includes(MARKER)) return content;

  const checks: Array<[string, boolean]> = [
    ["old logo URL", content.includes(OLD_LOGO_URL)],
    ["old banner fallback URL", content.includes(OLD_BANNER_URL)],
    ["PM3 Stripe list", STRIPE_LIST.test(content)],
    ["booking-status lead-in", OLD_LEAD_IN.test(content)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (missing.length) {
    throw new Error(`Anchor(s) not found: ${missing.join(", ")}`);
  }

  return content
    .split(OLD_LOGO_URL)
    .join(LOGO_URL)
    .replace(OLD_BANNER_URL, BANNER_FALLBACK_URL)
    .replace(STRIPE_LIST, "")
    .replace(OLD_DIVIDER, "")
    .replace(OLD_LEAD_IN, NEW_LEAD_IN);
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
    patched = patchTemplate(content);
  } catch (err) {
    console.error(`  ❌ Could not patch template:`, err);
    return {
      message: `${MIGRATION_ID} aborted — anchor not found`,
      details: { updated: 0, errors: 1 },
    };
  }

  console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);
  console.log(
    `  🖼️  wp-content references remaining: ${(patched.match(/wp-content/g) || []).length}`,
  );
  if (dryRun) {
    const i = patched.indexOf("Choose Your Payment Method");
    console.log("\n--- payment box ---\n" + patched.slice(i, i + 1400));
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

  console.log(`\n✅ Images fixed and Stripe CTA removed.`);
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
