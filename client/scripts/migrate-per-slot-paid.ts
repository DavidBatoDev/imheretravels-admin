#!/usr/bin/env tsx
/**
 * Backfill per-slot cash fields (*AmountPaid) from the legacy model, and
 * report which manual credits can be converted automatically vs. need a
 * human decision. Dry run by default; --apply writes ONLY the bookings in the
 * "auto" bucket. Manual-review bookings are never touched by this script.
 *
 * Buckets
 *   auto    – no manual credit: pNAmountPaid = pNAmount on paid terms,
 *             reservationAmountPaid = reservationFee. Pure relabel, no
 *             number changes anywhere.
 *   auto    – credit whose schedule is already reduced by it (post-Aug-2026
 *             behaviour): credit is added to the source slot's AmountPaid.
 *   review  – credit whose schedule was NOT reduced (pre-fix data). Toby,
 *             Rachel and Sam all turned out to be spurious credits, not
 *             overpayments, so these must be reconciled against Stripe /
 *             Revolut / Bella one by one. Listed with the Stripe total
 *             where the guest's email is visible.
 *
 * Usage: npx tsx scripts/migrate-per-slot-paid.ts --prod [--apply]
 */
import fs from "fs";
import path from "path";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const APPLY = process.argv.includes("--apply");
const n = (v: any) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const has = (v: any) => !!(v && (v.toDate || String(v).trim()));
const gbp = (x: number) => `£${x.toFixed(2)}`;

const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const stripeKey = raw.split(/\r?\n/).filter((l) => /^\s*STRIPE_LIVE_KEY\s*=/.test(l))
  .map((l) => l.replace(/^\s*STRIPE_LIVE_KEY\s*=\s*/, "").replace(/^["']|["']$/g, ""))[0];

async function stripeNetByEmail(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!stripeKey) return map;
  let after: string | undefined;
  const gte = Math.floor(new Date("2025-06-01T00:00:00Z").getTime() / 1000);
  for (let i = 0; i < 60; i++) {
    const u = new URL("https://api.stripe.com/v1/charges");
    u.searchParams.set("limit", "100"); u.searchParams.set("created[gte]", String(gte));
    if (after) u.searchParams.set("starting_after", after);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${stripeKey}` } });
    if (!r.ok) break;
    const b: any = await r.json();
    for (const c of b.data ?? []) {
      if (c.status !== "succeeded") continue;
      const e = (c.billing_details?.email || c.receipt_email || "").toLowerCase().trim();
      if (e) map.set(e, r2((map.get(e) ?? 0) + (c.amount - (c.amount_refunded ?? 0)) / 100));
    }
    if (!b.has_more || !b.data?.length) break;
    after = b.data[b.data.length - 1].id;
  }
  return map;
}

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log(APPLY ? "  MODE: APPLY (writes 'auto' bucket only)\n" : "  MODE: DRY RUN (no writes)\n");

  const snap = await db.collection("bookings").get();
  const stripe = await stripeNetByEmail();
  const auto: { id: string; name: string; update: Record<string, number>; note: string }[] = [];
  const review: any[] = [];
  let alreadyMigrated = 0;

  for (const d of snap.docs) {
    const b: any = d.data();
    if (["reservationAmountPaid", "p1AmountPaid", "p2AmountPaid", "p3AmountPaid", "p4AmountPaid", "fullPaymentAmountPaid"].some((k) => b[k] !== undefined && b[k] !== null && b[k] !== "")) {
      alreadyMigrated++;
      continue;
    }

    const plan = String(b.paymentPlan ?? "");
    const terms = plan === "Full Payment" ? 0 : ({ P1: 1, P2: 2, P3: 3, P4: 4 }[plan] ?? 0);
    const credit = n(b.manualCredit);
    const source = String(b.creditFrom ?? "").trim();

    // Base relabel: paid === asked
    const update: Record<string, number> = {};
    if (has(b.reservationDate) && n(b.reservationFee) > 0) update.reservationAmountPaid = n(b.reservationFee);
    for (let i = 1; i <= terms; i++) if (has(b[`p${i}DatePaid`])) update[`p${i}AmountPaid`] = n(b[`p${i}Amount`]);
    if (plan === "Full Payment" && has(b.fullPaymentDatePaid)) update.fullPaymentAmountPaid = n(b.fullPaymentAmount);

    if (credit <= 0) {
      if (Object.keys(update).length) auto.push({ id: d.id, name: b.fullName, update, note: "no credit, relabel only" });
      continue;
    }

    // Has a credit: was the schedule reduced by it?
    const cost = n(b.discountedTourCost) || n(b.originalTourCost);
    const due = r2(cost - n(b.reservationFee));
    const scheduleTotal = plan === "Full Payment" ? n(b.fullPaymentAmount) : [1, 2, 3, 4].slice(0, terms).reduce((s, i) => s + n(b[`p${i}Amount`]), 0);
    const reduced = Math.abs(scheduleTotal - (due - credit)) < 0.02;
    const sourceKey = source === "Reservation" ? "reservationAmountPaid" : source === "Full Payment" ? "fullPaymentAmountPaid" : /^P[1-4]$/.test(source) ? `p${source[1]}AmountPaid` : null;
    const sourcePaid = sourceKey ? update[sourceKey] !== undefined : false;

    if (reduced && sourceKey && sourcePaid) {
      update[sourceKey] = r2(update[sourceKey] + credit);
      auto.push({ id: d.id, name: b.fullName, update, note: `credit ${gbp(credit)} from ${source} → added to ${sourceKey}` });
    } else {
      const email = String(b.emailAddress ?? "").toLowerCase();
      const recorded = r2(n(b.reservationFee) + [1, 2, 3, 4].slice(0, terms).reduce((s, i) => s + (has(b[`p${i}DatePaid`]) ? n(b[`p${i}Amount`]) : 0), 0));
      review.push({
        id: d.id, name: b.fullName, plan, credit, from: source || "(blank)",
        why: !reduced ? "schedule not reduced (pre-fix)" : "source term not paid",
        recordedCash: recorded, stripeNet: stripe.get(email) ?? "(none)", tourCost: cost,
        status: String(b.bookingStatus ?? "").slice(0, 26),
      });
    }
  }

  console.log(`Bookings: ${snap.size}  already migrated: ${alreadyMigrated}  auto: ${auto.length}  review: ${review.length}\n`);
  console.log("=== AUTO (credit converted) ===");
  console.table(auto.filter((a) => !a.note.startsWith("no credit")).map((a) => ({ name: a.name, note: a.note })));
  console.log(`+ ${auto.filter((a) => a.note.startsWith("no credit")).length} bookings with no credit (pure relabel, paid === asked)\n`);
  console.log("=== REVIEW (do NOT auto-convert — reconcile each against Stripe/Revolut/Bella) ===");
  console.table(review);

  if (!APPLY) { console.log("\nDry run. --apply writes the 'auto' bucket only."); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(`rollback-per-slot-paid-${stamp}.json`, JSON.stringify(auto.map((a) => ({ id: a.id, fieldsAdded: Object.keys(a.update) })), null, 2));
  let batch = db.batch(); let k = 0;
  for (const a of auto) {
    batch.update(db.collection("bookings").doc(a.id), a.update);
    if (++k % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`\nWrote ${auto.length} bookings. Rollback = delete the listed fields (rollback-per-slot-paid-${stamp}.json).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
