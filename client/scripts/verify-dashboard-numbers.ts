#!/usr/bin/env tsx
/**
 * READ-ONLY audit of the money figures shown on Dashboard and Reports.
 *
 * Runs the SAME shared finance module the UI uses
 * (src/lib/finance/booking-finance.ts) over raw Firestore bookings, prints
 * what each card should show, and flags data-quality issues that no code
 * change can fix (bookings whose `paid` field disagrees with their dated
 * instalments, cancelled bookings with no refund recorded, etc.).
 *
 * Usage: npx tsx scripts/verify-dashboard-numbers.ts --prod   (or --dev)
 */
import { initFirestore, targetFromArgv } from "./lib/firebase-target";
import {
  extractAllEvents,
  extractBookingEvents,
  sumEvents,
  monthlyNetRevenue,
  toDate,
  toISODate,
  isCancelledBooking,
  getCancellationDate,
  type RawBooking,
} from "../src/lib/finance/booking-finance";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown) => Number(v) || 0;

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log("  read-only: this script never writes\n");

  const snap = await db.collection("bookings").get();
  const B: RawBooking[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const today = new Date();
  const events = extractAllEvents(B, today);

  // ── Dashboard ───────────────────────────────────────────────────────────
  const allTime = sumEvents(events);
  const som = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonth = sumEvents(events, toISODate(som), toISODate(today));
  const months = monthlyNetRevenue(events, 6, today);
  const owing = new Set(events.filter((e) => e.expectedRevenue > 0 || e.overdueUnpaidAmount > 0).map((e) => e.bookingId)).size;

  console.log("=== DASHBOARD (all time) ===");
  console.log("Net Revenue        ", gbp(allTime.netRevenue), `  (Gross ${gbp(allTime.grossRevenue)} − Refunded ${gbp(allTime.refunded)})`);
  console.log("  This month       ", gbp(thisMonth.netRevenue));
  console.log("Avg Monthly Net    ", gbp(months.reduce((s, m) => s + m.totals.netRevenue, 0) / 6));
  console.log("Outstanding Balance", gbp(allTime.outstandingBalance), `  (Overdue ${gbp(allTime.overdueUnpaid)} + Expected ${gbp(allTime.expectedRevenue)}) owed by ${owing} active bookings`);
  console.log("Cancelled          ", B.filter(isCancelledBooking).length, `by status · ${allTime.cancelledBookings} dated · Refunded ${gbp(allTime.refunded)}`);
  console.table(months.map((m) => ({ month: toISODate(m.monthStart).slice(0, 7), netRevenue: +m.totals.netRevenue.toFixed(2), gross: +m.totals.grossRevenue.toFixed(2), refunded: m.totals.refunded })));

  // ── Reports presets ─────────────────────────────────────────────────────
  const iso = (d: Date) => toISODate(d);
  const sub = (days: number) => iso(new Date(today.getTime() - days * 86400000));
  const presets: [string, string, string][] = [
    ["Last 30 days", sub(29), iso(today)],
    ["This month", iso(som), iso(today)],
    ["Last 90 days", sub(89), iso(today)],
    ["All time", "2000-01-01", "2099-12-31"],
  ];
  console.log("\n=== REPORTS ===");
  console.table(presets.map(([name, s, e]) => { const t = sumEvents(events, s, e); return { preset: name, net: +t.netRevenue.toFixed(2), gross: +t.grossRevenue.toFixed(2), refunded: t.refunded, expected: t.expectedRevenue, overdue: +t.overdueUnpaid.toFixed(2), outstanding: +t.outstandingBalance.toFixed(2), cancelled: t.cancelledBookings }; }));

  // ── Data quality (cannot be fixed in code) ──────────────────────────────
  console.log("\n=== DATA QUALITY ===");
  const drift: Record<string, unknown>[] = [];
  for (const b of B) {
    const fromSlots = sumEvents(extractBookingEvents(b, today)).grossRevenue;
    const paid = num(b.paid);
    if (Math.abs(fromSlots - paid) > 0.01) drift.push({ id: b.id, status: b.bookingStatus, paidField: paid, fromDatedPayments: +fromSlots.toFixed(2), diff: +(paid - fromSlots).toFixed(2) });
  }
  console.log(`Bookings where the 'paid' field ≠ dated payments (Bookings page vs Dashboard/Reports): ${drift.length}, net drift ${gbp(drift.reduce((s, r) => s + (r.diff as number), 0))}`);
  console.table(drift);

  const cancelled = B.filter(isCancelledBooking);
  const noRefund = cancelled.filter((b) => num(b.refundableAmount) <= 0 && num(b.travelCreditIssued) <= 0);
  const paidNoRefund = noRefund.reduce((s, b) => s + sumEvents(extractBookingEvents(b, today)).grossRevenue, 0);
  console.log(`\nCancelled bookings with NO refund recorded: ${noRefund.length} of ${cancelled.length} — treated as fully retained (${gbp(paidNoRefund)} counted in Net Revenue).`);
  console.log(`Cancelled bookings with no cancellationRequestDate (using fallback date): ${cancelled.filter((b) => !toDate(b.cancellationRequestDate)).length}`);
  console.log(`Cancelled bookings with no usable cancellation date at all: ${cancelled.filter((b) => !getCancellationDate(b)).length}`);
  console.log(`Bookings with empty/missing status (treated as active): ${B.filter((b) => !String(b.bookingStatus ?? "").trim()).length}`);

  const rbActive = B.filter((b) => !isCancelledBooking(b)).reduce((s, b) => s + num(b.remainingBalance), 0);
  console.log(`\nremainingBalance field (active bookings, Bookings page): ${gbp(rbActive)} vs Outstanding Balance from instalments: ${gbp(allTime.outstandingBalance)} — diff ${gbp(rbActive - allTime.outstandingBalance)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
