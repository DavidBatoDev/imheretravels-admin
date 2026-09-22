#!/usr/bin/env tsx
/**
 * Close out a booking as paid in full WITHOUT firing any customer email, and/or
 * clear a spurious manual credit. Generalised from fix-toby-wise-full-payment.ts.
 *
 * What it does (only the parts that apply):
 *   - clears manualCredit / creditFrom when --clear-credit is given
 *   - dates the single remaining open term (P1–P4) when --date-open-term is given
 *     (YYYY-MM-DD; use the real payment date from Stripe/Revolut)
 *   - recomputes paid / paidTerms / remainingBalance / paymentProgress / bookingStatus
 *   - if paymentProgress would newly become "100%", pre-writes the confirmedBookings
 *     guard so onPaymentComplete returns at its first check and sends nothing
 *
 * Safety: refuses unless --expect-name matches, unless the instalments + reservation
 * fee already equal the tour cost, and unless at most ONE term is open.
 * Writes a rollback JSON before touching anything. Dry run unless --apply.
 *
 * Usage:
 *   npx tsx scripts/close-out-booking.ts --prod --id <docId> --expect-name "Sam Hernandez" \
 *       --clear-credit --date-open-term 2026-02-10            (dry run)
 *   ...same... --apply                                          (writes)
 */
import fs from "fs";
import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const argv = process.argv;
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };

const APPLY = flag("apply");
const DOC_ID = opt("id");
const EXPECT_NAME = opt("expect-name");
const CLEAR_CREDIT = flag("clear-credit");
const DATE_OPEN = opt("date-open-term");
// --set-amounts P3=310,P4=150  → overwrite term amounts to what was actually paid/owed
const SET_AMOUNTS: Record<number, number> = Object.fromEntries(
  (opt("set-amounts") ?? "")
    .split(",")
    .filter(Boolean)
    .map((kv) => {
      const m = kv.trim().match(/^P([1-4])=(\d+(?:\.\d+)?)$/);
      if (!m) throw new Error(`--set-amounts entry "${kv}" must look like P3=310`);
      return [Number(m[1]), Number(m[2])];
    })
);

if (!DOC_ID || !EXPECT_NAME) throw new Error("Required: --id <docId> --expect-name \"<full name>\"");
if (DATE_OPEN && !/^\d{4}-\d{2}-\d{2}$/.test(DATE_OPEN)) throw new Error("--date-open-term must be YYYY-MM-DD");
if (!CLEAR_CREDIT && !DATE_OPEN && !Object.keys(SET_AMOUNTS).length) throw new Error("Nothing to do: pass --clear-credit, --date-open-term and/or --set-amounts");

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: any) => Number(v) || 0;
const has = (v: any) => !!(v && (v.toDate || String(v).trim()));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sheetDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const fmt = (x: any) => (x?.toDate ? x.toDate().toISOString().slice(0, 10) : x === "" ? '""' : String(x ?? "(unset)"));

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log(APPLY ? "  MODE: APPLY (will write)\n" : "  MODE: DRY RUN (no writes)\n");

  const ref = db.collection("bookings").doc(DOC_ID!);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Booking ${DOC_ID} not found`);
  const b = snap.data()!;
  if (b.fullName !== EXPECT_NAME) throw new Error(`Safety: expected "${EXPECT_NAME}", found "${b.fullName}"`);
  console.log(`${b.fullName}  ${b.bookingId}  [${b.bookingStatus}]  plan=${b.paymentPlan}  progress=${b.paymentProgress}`);

  const plan = String(b.paymentPlan ?? "");
  const terms = { P1: 1, P2: 2, P3: 3, P4: 4 }[plan] ?? 0;
  if (!terms) throw new Error(`Safety: only P1–P4 plans are handled (got "${plan}")`);

  const cost = r2(num(b.discountedTourCost) || num(b.originalTourCost));
  const resFee = num(b.reservationFee);
  // Effective term amounts = stored, overridden by --set-amounts
  const amt = (i: number) => (i in SET_AMOUNTS ? SET_AMOUNTS[i] : num(b[`p${i}Amount`]));
  const termsTotal = r2([1, 2, 3, 4].slice(0, terms).reduce((s, i) => s + amt(i), 0));
  if (r2(resFee + termsTotal) !== cost) {
    throw new Error(`Safety: reservationFee ${resFee} + terms ${termsTotal} = ${r2(resFee + termsTotal)} ≠ tour cost ${cost}`);
  }
  for (const i of Object.keys(SET_AMOUNTS).map(Number)) {
    if (i > terms) throw new Error(`Safety: --set-amounts P${i} but plan ${plan} has ${terms} terms`);
  }

  const openTerms = [1, 2, 3, 4].slice(0, terms).filter((i) => !has(b[`p${i}DatePaid`]));
  if (openTerms.length > 1) throw new Error(`Safety: ${openTerms.length} open terms (${openTerms.map((i) => "P" + i).join(",")}); this script handles at most one`);
  if (DATE_OPEN && openTerms.length === 0) throw new Error("Safety: --date-open-term given but no term is open");

  const update: Record<string, unknown> = { updatedAt: admin.firestore.Timestamp.now() };

  if (CLEAR_CREDIT) {
    update.manualCredit = 0;
    update.creditFrom = "";
  }
  for (const [i, v] of Object.entries(SET_AMOUNTS)) {
    update[`p${i}Amount`] = v;
    // Post-migration bookings carry per-slot cash. Correcting an amount that
    // was simply recorded wrong must correct the cash too, or the difference
    // shows up as a phantom over/underpayment.
    const paidKey = `p${i}AmountPaid`;
    if (b[paidKey] !== undefined && b[paidKey] !== null && b[paidKey] !== "") update[paidKey] = v;
  }

  let paidTermIdx = [1, 2, 3, 4].slice(0, terms).filter((i) => has(b[`p${i}DatePaid`]));
  if (DATE_OPEN) {
    const i = openTerms[0];
    const [y, m, d] = DATE_OPEN.split("-").map(Number);
    update[`p${i}DatePaid`] = admin.firestore.Timestamp.fromDate(new Date(y, m - 1, d));
    paidTermIdx = [...paidTermIdx, i];
  }

  const paidTerms = r2(paidTermIdx.reduce((s, i) => s + amt(i), 0));
  const paid = r2(resFee + paidTerms);
  const remaining = r2(cost - paid);
  const progress = `${Math.round((paidTermIdx.length / terms) * 100)}%`;
  update.paid = paid;
  update.paidTerms = paidTerms;
  update.remainingBalance = remaining;
  update.paymentProgress = progress;

  const lastPaid = paidTermIdx
    .map((i) => (update[`p${i}DatePaid`] as any)?.toDate?.() ?? b[`p${i}DatePaid`]?.toDate?.())
    .filter(Boolean)
    .sort((a: Date, c: Date) => a.getTime() - c.getTime())
    .pop() as Date | undefined;
  update.bookingStatus =
    remaining === 0 && lastPaid
      ? `Booking Confirmed — ${sheetDate(lastPaid)}`
      : `Installment ${paidTermIdx.length}/${terms}${lastPaid ? ` — last paid ${sheetDate(lastPaid)}` : ""}`;

  console.log("\n=== BOOKING CHANGES ===");
  for (const [k, v] of Object.entries(update)) {
    if (k === "updatedAt") continue;
    if (fmt(b[k]) === fmt(v)) continue;
    console.log(`  ${k.padEnd(18)} ${fmt(b[k]).padEnd(40)} ->  ${fmt(v)}`);
  }

  // ── Email guard: only needed when progress NEWLY becomes 100% ─────────────
  const newlyComplete = b.paymentProgress !== "100%" && progress === "100%";
  let guard: Record<string, unknown> | null = null;
  if (!newlyComplete) {
    console.log(`\n=== EMAIL GUARD ===\n  Not needed: progress ${b.paymentProgress} -> ${progress} is not a new 100%; onPaymentComplete will not act.`);
  } else {
    const existing = await db.collection("confirmedBookings").where("bookingDocumentId", "==", DOC_ID).limit(1).get();
    if (!existing.empty) {
      console.log(`\n=== EMAIL GUARD ===\n  confirmedBookings record already exists (${existing.docs[0].id}); trigger will skip.`);
    } else {
      const packSnap = await db.collection("preDeparturePack").get();
      const pack = packSnap.docs.find((d) => ((d.data().tourPackages as any[]) || []).some((tp) => String(tp?.tourPackageName ?? "").toLowerCase().trim() === String(b.tourPackageName).toLowerCase().trim()));
      const tp = await db.collection("tourPackages").where("name", "==", b.tourPackageName).limit(1).get();
      const tourCode = tp.empty ? "XXX" : tp.docs[0].data().tourCode || "XXX";
      const td: Date = b.tourDate.toDate();
      const formattedDate = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, "0")}-${String(td.getDate()).padStart(2, "0")}`;
      const countSnap = await db.collection("confirmedBookings").where("tourPackageName", "==", b.tourPackageName).orderBy("createdAt", "asc").get();
      guard = {
        bookingDocumentId: DOC_ID,
        bookingId: b.bookingId || "",
        tourPackageName: b.tourPackageName || "",
        tourDate: b.tourDate,
        preDeparturePackId: pack?.id ?? null,
        preDeparturePackName: pack?.data().fileName ?? null,
        status: "created",
        createdAt: admin.firestore.Timestamp.now(),
        lastModified: admin.firestore.Timestamp.now(),
        bookingReference: `IMT-${formattedDate}-${tourCode}-${String(countSnap.size + 1).padStart(4, "0")}`,
        tags: [],
        backfillNote: `Created by scripts/close-out-booking.ts on ${new Date().toISOString().slice(0, 10)} to suppress the pre-departure email; booking closed out by decision. No email was sent.`,
      };
      console.log(`\n=== EMAIL GUARD (written FIRST) ===\n  confirmedBookings/<new> ref=${guard.bookingReference} status=created pack=${guard.preDeparturePackName ?? "none"}`);
    }
  }

  if (!APPLY) { console.log("\nDry run complete. Re-run with --apply to write."); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackFile = `rollback-${DOC_ID}-${stamp}.json`;
  fs.writeFileSync(rollbackFile, JSON.stringify({ bookingDocId: DOC_ID, before: b }, null, 2));
  console.log(`\nRollback snapshot: ${rollbackFile}`);
  if (guard) { const g = await db.collection("confirmedBookings").add(guard); console.log(`Guard created: confirmedBookings/${g.id}`); }
  await ref.update(update);
  const after = (await ref.get()).data()!;
  console.log(`Booking updated.\n=== VERIFY ===\n  paid=${after.paid} paidTerms=${after.paidTerms} remaining=${after.remainingBalance} progress=${after.paymentProgress}\n  status=${after.bookingStatus}\n  manualCredit=${after.manualCredit} creditFrom="${after.creditFrom}"`);
}

main().catch((e) => { console.error(e); process.exit(1); });
