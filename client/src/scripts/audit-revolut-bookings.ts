#!/usr/bin/env tsx

/**
 * READ-ONLY audit of Revolut payment-method usage in the `bookings` collection.
 *
 * Answers, before any data is changed:
 *   1. How many people selected Revolut as their payment method (total)?
 *   2. How many are AFFECTED  — still owe money / will pay on future dates?
 *   3. How many are CONFIRMED via Revolut (settled records that stay as-is)?
 *
 * This script ONLY reads (getDocs). It never writes to Firestore. It writes a
 * CSV + summary JSON to ./exports for review.
 *
 * Usage (from admin/client):
 *   npm run audit-revolut
 *   or: npx tsx src/scripts/audit-revolut-bookings.ts
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../migrations/firebase-config";

// ---------------------------------------------------------------------------
// Parsing helpers (mirror admin/client/src/app/functions/columns/payment-setting/booking-status.ts)
// ---------------------------------------------------------------------------

/** Parse a possibly-string / Firestore-timestamp value into a Date (or null). */
function toDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  // Firestore Timestamp instance (client SDK) exposes .toDate()
  if (typeof d?.toDate === "function") {
    const x = d.toDate();
    return x instanceof Date && !isNaN(x.getTime()) ? x : null;
  }
  // Serialized timestamp shapes
  if (typeof d === "object" && typeof d.seconds === "number") {
    return new Date(d.seconds * 1000);
  }
  if (typeof d === "string") {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof d === "number") {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Parse a possibly-string currency value into a number (strip "£", ",", etc.). */
function toNum(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function isNonEmptyString(v: any): boolean {
  return typeof v === "string" && v.trim() !== "";
}

const fmtDate = (d: Date | null): string =>
  d ? d.toISOString().slice(0, 10) : "";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type Bucket = "Affected" | "Confirmed" | "Cancelled" | "Other";
type SubBucket = "future-due" | "overdue" | "undated" | "";

interface Row {
  id: string;
  bookingId: string;
  fullName: string;
  emailAddress: string;
  isMainBooker: boolean;
  groupId: string;
  paymentMethod: string;
  bookingStatusStored: string;
  paymentPlan: string;
  remainingBalance: number;
  paid: number;
  hasPayment: boolean;
  reasonForCancellation: string;
  bucket: Bucket;
  subBucket: SubBucket;
  nextUnpaidDueDate: string; // earliest unpaid installment / full-payment due date
}

const NOW = new Date();
// Balances are in whole currency units; treat anything within a penny of zero
// (incl. tiny negative rounding dust from installment splits) as fully settled.
const EPS = 0.01;

function classify(data: any): Row {
  const paymentMethodRaw = (data.paymentMethod ?? "").toString().trim();
  const rem = toNum(data.remainingBalance);
  const paid = toNum(data.paid);
  const cancelled = isNonEmptyString(data.reasonForCancellation);
  const storedConfirmed =
    (data.bookingStatus ?? "").toString().trim() === "Confirmed";

  // Collect installment + full-payment due / date-paid pairs (resilient to key drift).
  const keys = Object.keys(data);
  const dueDateKeys = keys.filter((k) => /^p\dDueDate$/i.test(k)).sort();

  // Has any payment actually been recorded? (matches the app's "≥1 payment" rule)
  const datePaidValues = [
    data.fullPaymentDatePaid,
    ...keys.filter((k) => /^p\dDatePaid$/i.test(k)).map((k) => data[k]),
  ];
  const hasPayment = datePaidValues.some((v) => toDate(v) !== null);

  // App-computed "Booking Confirmed": balance fully settled with ≥1 payment made.
  const computedConfirmed = rem <= EPS && hasPayment;
  const confirmed = computedConfirmed || storedConfirmed;

  // Earliest still-unpaid due date (installments where pX is unpaid, plus full payment).
  const unpaidDueDates: Date[] = [];
  for (const dk of dueDateKeys) {
    const idx = dk.match(/^p(\d)DueDate$/i)?.[1];
    const paidKey = idx ? `p${idx}DatePaid` : "";
    const isPaid = paidKey ? toDate(data[paidKey]) !== null : false;
    const due = toDate(data[dk]);
    if (!isPaid && due) unpaidDueDates.push(due);
  }
  if (toDate(data.fullPaymentDatePaid) === null) {
    const fullDue = toDate(data.fullPaymentDueDate);
    if (fullDue) unpaidDueDates.push(fullDue);
  }
  const nextUnpaid =
    unpaidDueDates.length > 0
      ? new Date(Math.min(...unpaidDueDates.map((d) => d.getTime())))
      : null;

  // Bucket (evaluate in priority order: cancelled -> confirmed -> affected -> other).
  let bucket: Bucket;
  let subBucket: SubBucket = "";
  if (cancelled) {
    bucket = "Cancelled";
  } else if (confirmed) {
    bucket = "Confirmed";
  } else if (rem > EPS) {
    bucket = "Affected";
    subBucket = !nextUnpaid ? "undated" : nextUnpaid > NOW ? "future-due" : "overdue";
  } else {
    bucket = "Other";
  }

  return {
    id: data.id,
    bookingId: (data.bookingId ?? data.id ?? "").toString(),
    fullName:
      (data.fullName ||
        `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
        "").toString(),
    emailAddress: (data.emailAddress ?? "").toString(),
    isMainBooker: data.isMainBooker === true,
    groupId: (data.groupId ?? "").toString(),
    paymentMethod: paymentMethodRaw,
    bookingStatusStored: (data.bookingStatus ?? "").toString(),
    paymentPlan: (data.paymentPlan ?? "").toString(),
    remainingBalance: rem,
    paid,
    hasPayment,
    reasonForCancellation: (data.reasonForCancellation ?? "").toString(),
    bucket,
    subBucket,
    nextUnpaidDueDate: fmtDate(nextUnpaid),
  };
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function toCsv(rows: Row[]): string {
  const headers: (keyof Row)[] = [
    "bookingId",
    "fullName",
    "emailAddress",
    "isMainBooker",
    "groupId",
    "paymentMethod",
    "bookingStatusStored",
    "paymentPlan",
    "remainingBalance",
    "paid",
    "hasPayment",
    "reasonForCancellation",
    "bucket",
    "subBucket",
    "nextUnpaidDueDate",
  ];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "(unknown)";
  console.log("🔎 Revolut booking audit (READ-ONLY)");
  console.log(`📦 Firestore project: ${projectId}`);
  console.log(`🕒 'Today' for future/overdue split: ${fmtDate(NOW)}\n`);

  const snapshot = await getDocs(collection(db, "bookings"));
  console.log(`✅ Fetched ${snapshot.size} documents from "bookings"\n`);

  const all: Row[] = [];
  // Payment-method tallies across ALL bookings (for context).
  const byMethod: Record<string, number> = {};

  snapshot.forEach((doc) => {
    const data = { id: doc.id, ...doc.data() };
    const row = classify(data);
    all.push(row);
    const key = row.paymentMethod === "" ? "(blank)" : row.paymentMethod;
    byMethod[key] = (byMethod[key] || 0) + 1;
  });

  const isRevolut = (r: Row) => r.paymentMethod.toLowerCase() === "revolut";
  const revolut = all.filter(isRevolut);

  const affected = revolut.filter((r) => r.bucket === "Affected");
  const futureDue = affected.filter((r) => r.subBucket === "future-due");
  const overdue = affected.filter((r) => r.subBucket === "overdue");
  const undated = affected.filter((r) => r.subBucket === "undated");
  const confirmed = revolut.filter((r) => r.bucket === "Confirmed");
  const cancelled = revolut.filter((r) => r.bucket === "Cancelled");
  const other = revolut.filter((r) => r.bucket === "Other");

  const guests = revolut.filter((r) => !r.isMainBooker).length;
  const mains = revolut.filter((r) => r.isMainBooker).length;

  // Flag any anomalies worth a human look (stored "Confirmed" yet money still owed).
  const confirmedButOwing = confirmed.filter((r) => r.remainingBalance > 0);

  // ---- Console report ----
  console.log("═══ Payment method across ALL bookings ═══");
  Object.entries(byMethod)
    .sort((a, b) => b[1] - a[1])
    .forEach(([m, c]) => console.log(`   ${m.padEnd(12)} ${c}`));

  console.log("\n═══ REVOLUT breakdown ═══");
  console.log(`   Total selected Revolut .......... ${revolut.length}`);
  console.log(`     • main bookers ................ ${mains}`);
  console.log(`     • guests ...................... ${guests}`);
  console.log(`   AFFECTED (owe money, not done) .. ${affected.length}`);
  console.log(`     • future-due .................. ${futureDue.length}`);
  console.log(`     • overdue-unpaid .............. ${overdue.length}`);
  console.log(`     • outstanding, no due date .... ${undated.length}`);
  console.log(`   CONFIRMED (record — do NOT touch) ${confirmed.length}`);
  console.log(`   CANCELLED ....................... ${cancelled.length}`);
  console.log(`   OTHER / incomplete .............. ${other.length}`);

  const sum =
    affected.length + confirmed.length + cancelled.length + other.length;
  console.log(
    `\n   Sanity: ${affected.length}+${confirmed.length}+${cancelled.length}+${other.length} = ${sum} (== total Revolut ${revolut.length}? ${
      sum === revolut.length ? "OK" : "MISMATCH"
    })`
  );
  if (confirmedButOwing.length > 0) {
    console.log(
      `\n   ⚠ ${confirmedButOwing.length} booking(s) counted as Confirmed via stored status but still have remainingBalance > 0 — review in CSV.`
    );
  }

  // ---- Export artifacts ----
  const exportsDir = join(process.cwd(), "exports");
  if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  // Full Revolut detail (all buckets), sorted affected-first then by due date.
  const order: Record<Bucket, number> = {
    Affected: 0,
    Confirmed: 1,
    Cancelled: 2,
    Other: 3,
  };
  const detail = [...revolut].sort(
    (a, b) =>
      order[a.bucket] - order[b.bucket] ||
      a.nextUnpaidDueDate.localeCompare(b.nextUnpaidDueDate)
  );
  const csvPath = join(exportsDir, `revolut-audit-${ts}.csv`);
  writeFileSync(csvPath, toCsv(detail));

  const summary = {
    generatedAt: NOW.toISOString(),
    project: projectId,
    totalBookings: snapshot.size,
    paymentMethodCounts: byMethod,
    revolut: {
      total: revolut.length,
      mainBookers: mains,
      guests,
      affected: {
        total: affected.length,
        futureDue: futureDue.length,
        overdue: overdue.length,
        undated: undated.length,
      },
      confirmed: confirmed.length,
      confirmedButStillOwing: confirmedButOwing.length,
      cancelled: cancelled.length,
      other: other.length,
    },
  };
  const jsonPath = join(exportsDir, `revolut-audit-summary-${ts}.json`);
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  console.log(`\n📁 Detail CSV : ${csvPath}`);
  console.log(`📁 Summary    : ${jsonPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Audit failed:", error);
    process.exit(1);
  });
