/**
 * 070 — Add travel-party details to the "Reservation Confirmed" email template.
 *
 * WHY
 * ───
 * `sendBookingStatusConfirmation` renders its email from the Firestore document
 * `emailTemplates/C8PKdv5BgAlTSFCm6wS3`, so template changes only take effect
 * once they are written there.
 *
 * Two gaps this closes, both from the Duo-booking investigation:
 *   • The primary booker on a Duo/Group booking pays for the whole party in one
 *     charge, but each booking stores only its per-person split — so "Amount
 *     Paid" showed £250 for a £500 payment. A new "Reservation Fee Paid" row
 *     shows the real figure and how many travellers it covers, or, for a guest,
 *     who paid it for them.
 *   • The email never said who else was travelling. A new "Your Travel Party"
 *     block lists every traveller with their own plan, paid amount and balance,
 *     plus party totals for the main booker.
 * The per-person rows are also relabelled "Your …" on group bookings so they
 * read unambiguously beside the party totals.
 *
 * IT ALSO CORRECTS THE CURRENCY
 * ─────────────────────────────
 * The live template rendered every amount with € while the business prices,
 * charges and reports in GBP — `stripePayments.amountGBP`, `currency: "GBP"`,
 * and the admin's own `getCurrencySymbol` all say £. Customers were being shown
 * the wrong currency for a sterling charge. Every € in the template becomes £.
 *
 * WHY IT PATCHES INSTEAD OF UPLOADING THE FILE
 * ────────────────────────────────────────────
 * `functions/emails/reservationConfirmationWithQR.html` is a developer copy and
 * has DRIFTED from the live document — beyond the currency, the repo file
 * carries a "Final Payment Deadline" section the live one does not. Uploading
 * the file wholesale would quietly ship that unrelated change too. So this
 * migration reads the live content and applies only the edits described here.
 *
 * Individual bookings are unaffected — every new block is gated on
 * `isGroupBooking`, which the Cloud Function sets to false for them.
 *
 * The subject also changes from "Booking Confirmed" to "Reservation Confirmed".
 * The sent subject is built in the Cloud Function, not the template; the stored
 * `subject` field is synced here for the admin Mail Templates UI.
 *
 * Idempotent: re-running detects the markers and does nothing.
 * Reversible: the previous `content`/`subject` are stashed in `_migration070`.
 *
 * HOW TO RUN
 * ──────────
 *   cd admin/client
 *   npx tsx migrations/migrate.ts dry-run070   # preview
 *   npx tsx migrations/migrate.ts 070           # apply
 *   npx tsx migrations/migrate.ts rollback070   # undo
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

const MIGRATION_ID = "070-reservation-confirmed-template";
const COLLECTION_NAME = "emailTemplates";
const TEMPLATE_DOC_ID = "C8PKdv5BgAlTSFCm6wS3";
const BACKUP_FIELD = "_migration070";

const NEW_SUBJECT = "Reservation Confirmed - {{ tourPackage }}";

// Marker that tells us the template has already been patched.
const PATCH_MARKER = "Reservation Fee Paid";

// The business charges in GBP end to end, so the email must say so.
const CURRENCY = "£";
const WRONG_CURRENCIES = /[€$]/g;

/** The Payment Summary block, from its comment up to the QR code section. */
const PAYMENT_SUMMARY_RE =
  /<!--\s*Payment Summary\s*-->([\s\S]*?)(?=<!--\s*QR Code Section\s*-->)/;

function reservationFeeRow(currency: string): string {
  return `                    {% if isGroupBooking %}
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 10px 0; color: #666666; font-weight: 500; width: 50%;">Reservation Fee Paid</td>
                        <td style="padding: 10px 0; color: #4caf50; font-weight: bold; text-align: right;">${currency}{{ reservationFeePaid }}{% if isMainBooker %}<br /><span style="color: #999999; font-weight: normal; font-size: 12px;">covers {{ partySize }} travellers</span>{% elif reservationFeePaidBy %}<br /><span style="color: #999999; font-weight: normal; font-size: 12px;">paid by {{ reservationFeePaidBy }}</span>{% endif %}</td>
                    </tr>
                    {% endif %}
`;
}

function travelPartyBlock(currency: string): string {
  return `            <!-- Travel Party (Duo / Group bookings only) -->
            {% if isGroupBooking and partyMembers.length %}
            <div style="
                                        background-color: #f5f5f5;
                                        padding: 20px;
                                        border-radius: 12px;
                                        margin: 25px 0;
                                        border-left: 5px solid #3f51b5;
                                        ">
                <h3 style="color: #333333; margin: 0 0 5px 0; font-size: 16px; font-weight: bold;">Your Travel Party</h3>
                <p style="font-size: 13px; color: #666666; margin: 0 0 15px 0;">
                    {{ partySize }} travellers{% if groupId %} &middot; Group {{ groupId }}{% endif %}
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    {% for member in partyMembers %}
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 10px 0; color: #333333; font-weight: 500;">
                            {{ member.name }}{% if member.isYou %} <span style="color: #3f51b5; font-size: 12px;">(you)</span>{% endif %}{% if member.isMainBooker %} <span style="color: #999999; font-size: 12px;">&middot; main booker</span>{% endif %}
                            {% if member.paymentPlan %}<br /><span style="color: #999999; font-weight: normal; font-size: 12px;">{{ member.paymentPlan }}</span>{% endif %}
                        </td>
                        <td style="padding: 10px 0; color: #666666; text-align: right; font-size: 13px;">
                            <span style="color: #4caf50;">${currency}{{ member.paid }} paid</span><br />
                            <span style="color: #e74c3c;">${currency}{{ member.remainingBalance }} due</span>
                        </td>
                    </tr>
                    {% endfor %}
                    {% if isMainBooker %}
                    <tr>
                        <td style="padding: 12px 0 0 0; color: #333333; font-weight: bold;">Party Total</td>
                        <td style="padding: 12px 0 0 0; color: #666666; text-align: right; font-size: 13px;">
                            <span style="color: #333333;">${currency}{{ partyTotalCost }} total</span><br />
                            <span style="color: #4caf50;">${currency}{{ partyTotalPaid }} paid</span><br />
                            <span style="color: #e74c3c;">${currency}{{ partyRemainingBalance }} due</span>
                        </td>
                    </tr>
                    {% endif %}
                </table>
                {% if isMainBooker %}
                <p style="font-size: 12px; color: #999999; margin: 15px 0 0 0;">
                    Everyone in your party has received their own confirmation email with their personal booking status link.
                </p>
                {% endif %}
            </div>
            {% endif %}
`;
}

/** Relabel a per-person money row as "Your …" on group bookings. */
function relabel(section: string, label: string, groupLabel: string): string {
  const re = new RegExp(`>\\s*${label}\\s*</td>`);
  if (!re.test(section)) {
    throw new Error(`Could not find the "${label}" row in the Payment Summary.`);
  }
  return section.replace(
    re,
    `>{% if isGroupBooking %}${groupLabel}{% else %}${label}{% endif %}</td>`,
  );
}

/**
 * Apply the three edits to the live template content.
 * Throws if an anchor is missing, so a drifted template fails loudly rather
 * than being half-patched.
 */
export function patchTemplate(content: string): {
  patched: string;
  currencyFixes: number;
} {
  const summaryMatch = content.match(PAYMENT_SUMMARY_RE);
  if (!summaryMatch) {
    throw new Error(
      "Could not locate the Payment Summary section (expected the '<!-- Payment Summary -->' and '<!-- QR Code Section -->' comments).",
    );
  }

  const original = summaryMatch[0];
  let section = original;

  // 1. Reservation fee row, inserted above the Payment Plan row.
  const planRowRe = /([ \t]*<tr[^>]*>\s*<td[^>]*>\s*Payment Plan\s*<\/td>)/;
  if (!planRowRe.test(section)) {
    throw new Error("Could not find the Payment Plan row to anchor against.");
  }
  section = section.replace(planRowRe, `${reservationFeeRow(CURRENCY)}$1`);

  // 2. Per-person labels become "Your …" on group bookings.
  section = relabel(section, "Payment Plan", "Your Payment Plan");
  section = relabel(section, "Total Cost", "Your Tour Cost");
  section = relabel(section, "Amount Paid", "Paid So Far (You)");
  section = relabel(section, "Balance Due", "Your Balance Due");

  // 3. Travel party block, appended after the Payment Summary section.
  section = `${section.replace(/\s*$/, "\n")}${travelPartyBlock(CURRENCY)}`;

  const patchedSection = content.replace(original, section);

  // 4. Correct the currency everywhere in the template — the charge is in GBP.
  const currencyFixes = (patchedSection.match(WRONG_CURRENCIES) || []).length;
  const patched = patchedSection.replace(WRONG_CURRENCIES, CURRENCY);

  return { patched, currencyFixes };
}

export async function runMigration(dryRun = false) {
  console.log(`\n🚀 Running ${MIGRATION_ID} (dryRun=${dryRun})`);

  const ref = doc(db, COLLECTION_NAME, TEMPLATE_DOC_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.error(
      `❌ Email template ${TEMPLATE_DOC_ID} not found in ${COLLECTION_NAME}.`,
    );
    return {
      message: `${MIGRATION_ID} aborted — template document missing`,
      details: { updated: 0, errors: 1 },
    };
  }

  const data = snap.data() as Record<string, any>;
  const content = String(data.content || "");
  console.log(`📧 Target template: "${data.name || TEMPLATE_DOC_ID}"`);
  console.log(`📄 Live content: ${content.length} chars`);

  const alreadyPatched = content.includes(PATCH_MARKER);
  const subjectCurrent = data.subject === NEW_SUBJECT;
  const currencyCorrect = !WRONG_CURRENCIES.test(content);
  WRONG_CURRENCIES.lastIndex = 0; // the /g flag makes .test() stateful

  if (alreadyPatched && subjectCurrent && currencyCorrect) {
    console.log("  ⏭️  Already patched — nothing to do.");
    return {
      message: `${MIGRATION_ID} — already up to date`,
      details: { updated: 0, errors: 0 },
    };
  }

  let patched = content;
  if (alreadyPatched) {
    console.log("  ℹ️  Content already patched; fixing currency/subject only.");
    const fixes = (content.match(WRONG_CURRENCIES) || []).length;
    if (fixes > 0) {
      patched = content.replace(WRONG_CURRENCIES, CURRENCY);
      console.log(`  ✏️  ${fixes} non-GBP currency symbol(s) → "${CURRENCY}"`);
    }
  } else {
    let currencyFixes: number;
    try {
      ({ patched, currencyFixes } = patchTemplate(content));
    } catch (err) {
      console.error(`  ❌ Could not patch template:`, err);
      return {
        message: `${MIGRATION_ID} aborted — template structure not recognised`,
        details: { updated: 0, errors: 1 },
      };
    }
    console.log(`  ✏️  content ${content.length} → ${patched.length} chars`);
    console.log(
      `  ✏️  ${currencyFixes} non-GBP currency symbol(s) → "${CURRENCY}"`,
    );
  }

  if (!subjectCurrent) {
    console.log(
      `  ✏️  subject "${data.subject || ""}" → "${NEW_SUBJECT}"`,
    );
  }

  if (dryRun) {
    console.log(`\n🧪 DRY RUN complete — no changes written.`);
    console.log(
      `   Patched preview (travel party block): ${
        patched.includes("Your Travel Party") ? "present ✓" : "MISSING ✗"
      }`,
    );
    return {
      message: `${MIGRATION_ID} dry-run`,
      details: { updated: 1, errors: 0 },
    };
  }

  try {
    await updateDoc(ref, {
      content: patched,
      subject: NEW_SUBJECT,
      [BACKUP_FIELD]: {
        content: data.content ?? "__ABSENT__",
        subject: data.subject ?? "__ABSENT__",
      },
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

  console.log(`\n✅ Reservation Confirmed template updated.`);
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
    console.log("  ℹ️  Template document not found — nothing to roll back.");
    return {
      message: `${MIGRATION_ID} rolled back`,
      details: { restored: 0, errors: 0 },
    };
  }

  const data = snap.data() as Record<string, any>;
  const backup = data[BACKUP_FIELD] as
    | { content?: string; subject?: string }
    | undefined;

  if (!backup) {
    console.log("  ℹ️  No migration backup found — nothing to roll back.");
    return {
      message: `${MIGRATION_ID} rolled back`,
      details: { restored: 0, errors: 0 },
    };
  }

  const restore: Record<string, any> = {
    [BACKUP_FIELD]: deleteField(),
    updatedAt: Timestamp.now(),
  };
  restore.content =
    backup.content === "__ABSENT__" ? deleteField() : backup.content;
  restore.subject =
    backup.subject === "__ABSENT__" ? deleteField() : backup.subject;

  try {
    await updateDoc(ref, restore);
  } catch (err) {
    console.error(`  ❌ Failed to roll back template:`, err);
    return {
      message: `${MIGRATION_ID} rollback failed`,
      details: { restored: 0, errors: 1 },
    };
  }

  console.log(`\n✅ Restored the previous Reservation Confirmed template.`);
  return {
    message: `${MIGRATION_ID} rolled back`,
    details: { restored: 1, errors: 0 },
  };
}
