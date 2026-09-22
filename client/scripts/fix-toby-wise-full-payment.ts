#!/usr/bin/env tsx
/**
 * One-off: mark booking SB-TXP-20260718-TW008 (Toby Wise) as paid in full,
 * WITHOUT firing any customer email.
 *
 * Background
 * ----------
 * Stripe holds only the £250 reservation fee for this guest. P1–P3 were marked
 * paid off the back of manual credits that no payment backs, and the tour has
 * already run. The decision (August, 2026-09-10) is to treat him as paid in
 * full, drop the manual credit and date P4 alongside P3.
 *
 * Why the email does not fire
 * ---------------------------
 * `onPaymentComplete` (functions/src/on-payment-complete.ts) is an
 * onDocumentUpdated trigger that fires when paymentProgress newly becomes
 * "100%". In prod, config/pre-departure.automaticSends is TRUE and a
 * pre-departure pack IS mapped to "Tanzania Exploration", so a naive write
 * WOULD email the guest a pre-departure pack for a finished tour.
 *
 * The trigger's own first guard is:
 *     confirmedBookings.where("bookingDocumentId","==",id) -> if not empty, return
 * ...and that check runs BEFORE it reads the config or sends anything. So this
 * script inserts the confirmedBookings record first (exactly what the trigger
 * would have written, with status "created" = no email sent), then updates the
 * booking. The trigger fires, finds the record, and returns.
 *
 * Every other booking trigger needs a false->true flag transition
 * (sendEmail, generateEmailDraft, sendCancellationEmail,
 * generateCancellationDraft, enablePaymentReminder). This script touches none
 * of them. onGuestInvitationTrigger needs paymentProgress to newly become
 * "50%"; we go 75% -> 100%. All four of this booking's payment reminders are
 * already status "sent", so nothing is queued.
 *
 * Usage:
 *   npx tsx scripts/fix-toby-wise-full-payment.ts --prod              (dry run)
 *   npx tsx scripts/fix-toby-wise-full-payment.ts --prod --apply      (writes)
 */
import fs from "fs";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const BOOKING_DOC_ID = "OdboO04Rt4e4cfJt1RLT";
const APPLY = process.argv.includes("--apply");

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: any) => Number(v) || 0;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sheetDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

async function main() {
  const target = targetFromArgv();
  const { db } = initFirestore(target);
  console.log(APPLY ? "  MODE: APPLY (will write)\n" : "  MODE: DRY RUN (no writes)\n");

  const ref = db.collection("bookings").doc(BOOKING_DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Booking ${BOOKING_DOC_ID} not found`);
  const b = snap.data()!;

  if (b.fullName !== "Toby Wise") {
    throw new Error(`Safety check failed: expected "Toby Wise", found "${b.fullName}"`);
  }

  // ── Target values ───────────────────────────────────────────────────────
  const cost = num(b.discountedTourCost) || num(b.originalTourCost);
  const resFee = num(b.reservationFee);
  const termsTotal = r2([1, 2, 3, 4].reduce((s, i) => s + num(b[`p${i}Amount`]), 0));

  if (r2(resFee + termsTotal) !== r2(cost)) {
    throw new Error(
      `Safety check failed: reservationFee ${resFee} + terms ${termsTotal} = ${r2(resFee + termsTotal)} != tour cost ${cost}. ` +
        `Amounts must already sum to the tour cost before marking paid in full.`
    );
  }

  const p3Paid = b.p3DatePaid;
  if (!p3Paid?.toDate) throw new Error("Safety check failed: p3DatePaid is not a Timestamp");
  if (b.p4DatePaid) throw new Error("Safety check failed: p4DatePaid is already set — nothing to do");

  const lastPaid: Date = p3Paid.toDate();
  const update: Record<string, unknown> = {
    manualCredit: 0,
    creditFrom: "",
    p4DatePaid: p3Paid, // same Timestamp instance as P3
    paid: r2(cost),
    paidTerms: termsTotal,
    remainingBalance: 0,
    paymentProgress: "100%",
    bookingStatus: `Booking Confirmed — ${sheetDate(lastPaid)}`,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  console.log("=== BOOKING CHANGES ===");
  for (const [k, v] of Object.entries(update)) {
    if (k === "updatedAt") continue;
    const before = b[k];
    const fmt = (x: any) => (x?.toDate ? x.toDate().toISOString().slice(0, 10) : x === "" ? '""' : String(x ?? "(unset)"));
    console.log(`  ${k.padEnd(18)} ${fmt(before).padEnd(38)} ->  ${fmt(v)}`);
  }

  // ── The guard record that stops onPaymentComplete from emailing ─────────
  const existing = await db
    .collection("confirmedBookings")
    .where("bookingDocumentId", "==", BOOKING_DOC_ID)
    .limit(1)
    .get();

  let guard: Record<string, unknown> | null = null;
  if (!existing.empty) {
    console.log(`\n=== EMAIL GUARD ===\n  confirmedBookings record already exists (${existing.docs[0].id}) — trigger will skip on its own.`);
  } else {
    const packSnap = await db.collection("preDeparturePack").get();
    const pack = packSnap.docs.find((d) =>
      ((d.data().tourPackages as any[]) || []).some(
        (tp) => String(tp?.tourPackageName ?? "").toLowerCase().trim() === String(b.tourPackageName).toLowerCase().trim()
      )
    );

    const tp = await db.collection("tourPackages").where("name", "==", b.tourPackageName).limit(1).get();
    const tourCode = tp.empty ? "XXX" : tp.docs[0].data().tourCode || "XXX";
    const td: Date = b.tourDate.toDate();
    const formattedDate = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, "0")}-${String(td.getDate()).padStart(2, "0")}`;
    const countSnap = await db
      .collection("confirmedBookings")
      .where("tourPackageName", "==", b.tourPackageName)
      .orderBy("createdAt", "asc")
      .get();
    const bookingReference = `IMT-${formattedDate}-${tourCode}-${String(countSnap.size + 1).padStart(4, "0")}`;

    guard = {
      bookingDocumentId: BOOKING_DOC_ID,
      bookingId: b.bookingId || "",
      tourPackageName: b.tourPackageName || "",
      tourDate: b.tourDate,
      preDeparturePackId: pack?.id ?? null,
      preDeparturePackName: pack?.data().fileName ?? null,
      status: "created", // "created" = record exists, NO email sent
      createdAt: admin.firestore.Timestamp.now(),
      lastModified: admin.firestore.Timestamp.now(),
      bookingReference,
      tags: [],
      backfillNote:
        "Created manually on 2026-09-10 to suppress the pre-departure email. Tour already completed; " +
        "booking marked paid in full by decision, not by a new payment. No email was sent.",
    };
    console.log("\n=== EMAIL GUARD (written FIRST, before the booking update) ===");
    console.log(`  confirmedBookings/<new>  ref=${bookingReference}  status=created  pack=${guard.preDeparturePackName ?? "none"}`);
    console.log("  This makes onPaymentComplete return at its first guard, so no email is sent.");
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.");
    return;
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackFile = `rollback-toby-wise-${stamp}.json`;
  fs.writeFileSync(rollbackFile, JSON.stringify({ bookingDocId: BOOKING_DOC_ID, before: b }, null, 2));
  console.log(`\nRollback snapshot written to ${rollbackFile}`);

  let guardId: string | null = null;
  if (guard) {
    const g = await db.collection("confirmedBookings").add(guard);
    guardId = g.id;
    console.log(`Guard created: confirmedBookings/${guardId}`);
  }

  await ref.update(update);
  console.log("Booking updated.");

  const after = (await ref.get()).data()!;
  console.log("\n=== VERIFY ===");
  console.log(`  paid=${after.paid}  paidTerms=${after.paidTerms}  remaining=${after.remainingBalance}`);
  console.log(`  progress=${after.paymentProgress}  status=${after.bookingStatus}`);
  console.log(`  manualCredit=${after.manualCredit}  creditFrom="${after.creditFrom}"`);
  console.log(`  p4DatePaid=${after.p4DatePaid?.toDate?.().toISOString().slice(0, 10)}`);
  console.log(
    `\nCheck the function log to confirm the skip:\n` +
      `  firebase functions:log --only onPaymentComplete -n 20\n` +
      `Expect: "Confirmed booking already exists, skipping"`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
