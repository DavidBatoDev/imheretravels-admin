#!/usr/bin/env tsx

/**
 * Migrate AFFECTED Revolut bookings to Stripe.
 *
 * Revolut is discontinued. Bookings that still owe money (outstanding balance,
 * not cancelled, not already settled/confirmed) have their `paymentMethod`
 * switched from "Revolut" to "Stripe", and the change is logged as a
 * bookingVersions snapshot (the app's audit trail) — visible in version history.
 *
 * SETTLED ("Confirmed") and CANCELLED Revolut bookings are LEFT UNTOUCHED
 * (historical records). Selection logic mirrors audit-revolut-bookings.ts.
 *
 * SAFE BY DEFAULT: dry-run unless `--apply` is passed.
 *
 * Usage (from admin/client):
 *   npm run migrate-revolut-to-stripe            # dry-run, writes nothing
 *   npm run migrate-revolut-to-stripe -- --apply # APPLIES to production
 */

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../migrations/firebase-config";

const APPLY = process.argv.includes("--apply");
const EPS = 0.01; // treat balances within a penny of zero as settled
const NEW_METHOD = "Stripe";
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
// Source method to migrate from (default Revolut). e.g. `-- --from Ulster`
const OLD_METHOD = argValue("--from") || "Revolut";

// ---- parsing helpers (kept in sync with audit-revolut-bookings.ts) ----
function toDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d?.toDate === "function") {
    const x = d.toDate();
    return x instanceof Date && !isNaN(x.getTime()) ? x : null;
  }
  if (typeof d === "object" && typeof d.seconds === "number")
    return new Date(d.seconds * 1000);
  if (typeof d === "string" || typeof d === "number") {
    const p = new Date(d);
    return isNaN(p.getTime()) ? null : p;
  }
  return null;
}
function toNum(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
const isNonEmptyString = (v: any) => typeof v === "string" && v.trim() !== "";

/** Recursively strip `undefined` (Firestore rejects it). */
function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(removeUndefined) as any;
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    // Leave Firestore Timestamps and other class instances intact
    if (typeof (obj as any).toDate === "function") return obj;
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) {
      if (v !== undefined) out[k] = removeUndefined(v as any);
    }
    return out;
  }
  return obj;
}

/** True if this booking uses OLD_METHOD and is AFFECTED (must migrate). */
function isAffectedSource(data: any): boolean {
  if (
    (data.paymentMethod ?? "").toString().trim().toLowerCase() !==
    OLD_METHOD.toLowerCase()
  )
    return false;
  if (isNonEmptyString(data.reasonForCancellation)) return false; // cancelled
  const rem = toNum(data.remainingBalance);
  const storedConfirmed =
    (data.bookingStatus ?? "").toString().trim() === "Confirmed";
  const hasPayment =
    [
      data.fullPaymentDatePaid,
      ...Object.keys(data)
        .filter((k) => /^p\dDatePaid$/i.test(k))
        .map((k) => data[k]),
    ].some((v) => toDate(v) !== null);
  const confirmed = (rem <= EPS && hasPayment) || storedConfirmed;
  return !confirmed && rem > EPS;
}

async function main() {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "(unknown)";
  console.log(
    `\n🔁 ${OLD_METHOD} → ${NEW_METHOD} migration  [${APPLY ? "APPLY (writes live)" : "DRY-RUN (no writes)"}]`
  );
  console.log(`📦 Firestore project: ${project}\n`);

  const snapshot = await getDocs(collection(db, "bookings"));
  const affected: { id: string; data: any }[] = [];
  let totalSource = 0;
  snapshot.forEach((d) => {
    const data: any = { id: d.id, ...d.data() };
    if (
      (data.paymentMethod ?? "").toString().trim().toLowerCase() ===
      OLD_METHOD.toLowerCase()
    )
      totalSource++;
    if (isAffectedSource(data)) affected.push({ id: d.id, data });
  });

  console.log(
    `Total ${OLD_METHOD} bookings: ${totalSource} | affected (to migrate): ${affected.length}\n`
  );
  affected.forEach((b, i) => {
    const name = b.data.fullName || `${b.data.firstName ?? ""} ${b.data.lastName ?? ""}`.trim();
    console.log(
      `  ${String(i + 1).padStart(2)}. ${b.data.bookingId || b.id}  ${name}  ` +
        `(plan ${b.data.paymentPlan || "?"}, balance ${toNum(b.data.remainingBalance)})  ` +
        `${OLD_METHOD} → ${NEW_METHOD}`
    );
  });

  // Safety guards.
  if (affected.length === 0) {
    console.log("\nNothing to migrate. Done.");
    return;
  }
  if (affected.length > 20) {
    console.error(
      `\n⛔ Refusing to proceed: ${affected.length} bookings is more than expected (~8). Investigate before applying.`
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN only — no documents were modified. Re-run with \`-- --apply\` to write these changes.`
    );
    return;
  }

  console.log(`\n✍️  Applying changes + writing version-history snapshots...\n`);
  let ok = 0;
  for (const b of affected) {
    try {
      // 1) Switch the payment method on the booking.
      await updateDoc(doc(db, "bookings", b.id), { paymentMethod: NEW_METHOD });

      // 2) Log the change as a bookingVersions snapshot (audit trail).
      const updatedSnapshot = removeUndefined({
        ...b.data,
        paymentMethod: NEW_METHOD,
      });
      const versionSnapshot = {
        bookingId: b.id,
        versionNumber: Date.now() + Math.floor(Math.random() * 1000),
        branchId: `main-${b.id}`,
        documentSnapshot: updatedSnapshot,
        metadata: {
          createdAt: Timestamp.now(),
          createdBy: "system-migration",
          createdByName: "Revolut discontinuation",
          changeType: "update" as const,
          changeDescription:
            "Revolut discontinued — payment method switched to Stripe; outstanding balance to be settled via Stripe.",
          isRestorePoint: false,
        },
        changes: [
          {
            fieldPath: "paymentMethod",
            fieldName: "Payment Method",
            oldValue: OLD_METHOD,
            newValue: NEW_METHOD,
            dataType: "string",
          },
        ],
        branchInfo: {
          isMainBranch: true,
          hasChildBranches: false,
          childBranchIds: [],
        },
      };
      await addDoc(collection(db, "bookingVersions"), versionSnapshot);

      ok++;
      console.log(`  ✅ ${b.data.bookingId || b.id}`);
    } catch (err) {
      console.error(`  ❌ ${b.data.bookingId || b.id}:`, err);
    }
  }
  console.log(`\nDone. Migrated ${ok}/${affected.length} booking(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  });
