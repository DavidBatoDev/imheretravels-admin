#!/usr/bin/env tsx
/**
 * READ-ONLY audit of booking money-field types, and of the blast radius of the
 * name-based tour lookup used by the price column functions.
 *
 * Two separate defects converge on these fields:
 *
 *   1. The grid write path coerces to a number only when a column's `dataType`
 *      is "currency" (BookingsDataGrid.tsx). Every money column is declared
 *      "function", so a value typed into one is stored as a raw string.
 *
 *   2. getOriginalTourCost / getDiscountedTourCost / getReservationFee resolve
 *      the tour by NAME (`pkg.name === tourPackageName`) and return "" when no
 *      match. Tours have been renamed, so a recalculation on an affected
 *      booking silently blanks its price.
 *
 * This reports what is actually stored today and which bookings sit on the
 * landmine. It never writes.
 *
 * Usage: npm run audit:booking-money -- --prod
 */

import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const MONEY_FIELDS = [
  "originalTourCost",
  "discountedTourCost",
  "reservationFee",
  "paid",
  "remainingBalance",
  "fullPaymentAmount",
] as const;

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const typeOf = (v: unknown) =>
  v === undefined ? "undefined" : v === null ? "null" : v === "" ? "empty-string" : typeof v;

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log("  read-only: this script never writes\n");

  const [tourSnap, bookingSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
  ]);
  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const tourNames = new Set(tours.map((t) => norm(t.name)));

  // ── 1. Type distribution ───────────────────────────────────────────────────
  console.log(`TYPE DISTRIBUTION (${bookings.length} bookings)`);
  console.log("-".repeat(72));
  for (const field of MONEY_FIELDS) {
    const counts: Record<string, number> = {};
    for (const b of bookings) {
      const t = typeOf(b[field]);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const parts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}=${n}`)
      .join("  ");
    const suspect = Object.keys(counts).some((t) => t === "string" || t === "empty-string");
    console.log(`  ${suspect ? "!" : " "} ${field.padEnd(20)} ${parts}`);
  }

  // ── 2. Every non-numeric money value, in full ──────────────────────────────
  console.log(`\nNON-NUMERIC MONEY VALUES`);
  console.log("-".repeat(112));
  let bad = 0;
  for (const b of bookings) {
    for (const field of MONEY_FIELDS) {
      const v = b[field];
      if (v === undefined || typeof v === "number") continue;
      bad++;
      console.log(
        `  ${b.id}  ${field.padEnd(20)} ${JSON.stringify(v).padEnd(12)}` +
          ` code=${String(b.tourCode ?? "—").padEnd(7)} status=${String(b.bookingStatus ?? "—").padEnd(10)}` +
          ` lockPricing=${b.lockPricing === true} priceSource=${b.priceSource ?? "—"}`,
      );
      console.log(`      name="${b.tourPackageName}"`);
    }
  }
  if (!bad) console.log("  (none)");

  // ── 3. Recalculation landmine ──────────────────────────────────────────────
  // The price functions look the tour up by name. A booking whose stored name
  // no longer matches any tour resolves to "" the moment it is recalculated.
  const atRisk = bookings.filter((b) => !tourNames.has(norm(b.tourPackageName)));
  const protectedByLock = atRisk.filter((b) => b.lockPricing === true);

  console.log(`\nRECALCULATION LANDMINE`);
  console.log("-".repeat(112));
  console.log(
    `  ${atRisk.length} of ${bookings.length} bookings store a tourPackageName that matches no tour.`,
  );
  console.log(
    `  Of those, ${protectedByLock.length} have lockPricing=true (the function returns the stored value and is safe).`,
  );
  console.log(
    `  → ${atRisk.length - protectedByLock.length} would have their price blanked to "" on the next recalculation.`,
  );

  const byName = new Map<string, number>();
  for (const b of atRisk) byName.set(b.tourPackageName, (byName.get(b.tourPackageName) ?? 0) + 1);
  console.log(`\n  Grouped by stored name:`);
  for (const [name, n] of [...byName].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  "${name}"`);
  }

  // Would a tourId-based lookup save them?
  const rescuable = atRisk.filter((b) => b.tourId && tours.some((t) => t.id === b.tourId));
  console.log(
    `\n  ${rescuable.length}/${atRisk.length} of the at-risk bookings carry a valid tourId,`,
  );
  console.log(`  so resolving by tourId first would fix them without touching stored prices.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
