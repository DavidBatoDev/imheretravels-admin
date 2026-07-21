#!/usr/bin/env tsx
/**
 * Per-hosted-tour booking and revenue report.
 *
 * Joins bookings to tours by `tourCode` (99.5% coverage in prod) rather than
 * `tourPackageName` (52%) — see scripts/audit-tour-identity.ts. Every figure is
 * shown alongside the name-based number the admin UI currently reports, so the
 * gap is visible rather than silent.
 *
 * READ-ONLY.
 *
 * Usage:
 *   npm run report:hosted-tours -- --prod
 *   npm run report:hosted-tours -- --dev
 */

import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Money fields are not consistently typed in Firestore — some bookings store
 * costs as strings ("1299"), sometimes with currency symbols or commas. Adding
 * those raw concatenates instead of summing, so every read goes through here.
 * Non-numeric values are counted, not silently treated as zero.
 */
const badTypes = new Map<string, number>();
const num = (v: unknown, field: string): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    badTypes.set(field, (badTypes.get(field) ?? 0) + 1);
    return Number.isFinite(n) ? n : 0;
  }
  badTypes.set(`${field} (${typeof v})`, (badTypes.get(`${field} (${typeof v})`) ?? 0) + 1);
  return 0;
};

async function main() {
  const { db } = initFirestore(targetFromArgv());

  const [tourSnap, bookingSnap, hostSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
    db.collection("residentHost").get().catch(() => null),
  ]);

  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const hosts = hostSnap ? hostSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) : [];

  const hosted = tours.filter((t) => t.isHosted === true);

  const rows = hosted.map((t) => {
    // Join on tourId. tourCode is only a fallback for bookings predating the
    // backfill — and it drifts the moment a code is standardised, which is
    // exactly why the id exists.
    const mine = bookings.filter((b) =>
      b.tourId ? b.tourId === t.id : norm(b.tourCode) === norm(t.tourCode),
    );
    const live = mine.filter((b) => b.bookingStatus !== "Cancelled");
    const cancelled = mine.length - live.length;

    const gross = live.reduce(
      (sum, b) =>
        sum +
        (b.useDiscountedTourCost && b.discountedTourCost != null
          ? num(b.discountedTourCost, "discountedTourCost")
          : num(b.originalTourCost, "originalTourCost")),
      0,
    );
    const collected = live.reduce((sum, b) => sum + num(b.paid, "paid"), 0);
    const outstanding = live.reduce((sum, b) => sum + num(b.remainingBalance, "remainingBalance"), 0);

    return {
      tour: t.name,
      code: t.tourCode,
      status: t.status,
      // ResidentHost stores `displayName`/`pageTitle` — there is no `name` field.
      host: hosts.find((h) => (h.attachedTourIds ?? []).includes(t.id))?.displayName ?? "—",
      byName: bookings.filter((b) => norm(b.tourPackageName) === norm(t.name)).length,
      live: live.length,
      cancelled,
      gross,
      collected,
      outstanding,
      currency: t.pricing?.currency ?? "GBP",
    };
  });

  rows.sort((a, b) => b.gross - a.gross);

  console.log(`\n${hosted.length} hosted tour(s) of ${tours.length}; ${bookings.length} bookings total.\n`);
  console.log(
    "tour".padEnd(42) + "code".padEnd(8) + "host".padEnd(14) +
      "byName".padStart(7) + "actual".padStart(8) + "canc".padStart(6) +
      "gross".padStart(11) + "collected".padStart(11) + "outstanding".padStart(12),
  );
  console.log("-".repeat(121));

  for (const r of rows) {
    console.log(
      String(r.tour).slice(0, 41).padEnd(42) +
        String(r.code ?? "—").padEnd(8) +
        String(r.host).slice(0, 13).padEnd(14) +
        String(r.byName).padStart(7) +
        String(r.live).padStart(8) +
        String(r.cancelled).padStart(6) +
        money(r.gross).padStart(11) +
        money(r.collected).padStart(11) +
        money(r.outstanding).padStart(12),
    );
  }

  console.log("-".repeat(121));
  const tot = rows.reduce(
    (a, r) => ({
      byName: a.byName + r.byName,
      live: a.live + r.live,
      gross: a.gross + r.gross,
      collected: a.collected + r.collected,
      outstanding: a.outstanding + r.outstanding,
    }),
    { byName: 0, live: 0, gross: 0, collected: 0, outstanding: 0 },
  );
  console.log(
    "TOTAL".padEnd(64) +
      String(tot.byName).padStart(7) +
      String(tot.live).padStart(8) +
      "".padStart(6) +
      money(tot.gross).padStart(11) +
      money(tot.collected).padStart(11) +
      money(tot.outstanding).padStart(12),
  );

  console.log(
    `\n"byName" is the old name-based join the admin used to do; "actual" is the tourId join.` +
      `\nBookings the name-based join misses: ${tot.live - tot.byName} across hosted tours.`,
  );

  if (badTypes.size) {
    console.log(`\n⚠  Money fields stored as strings (coerced for this report, but any raw`);
    console.log(`   arithmetic on them concatenates instead of summing):`);
    for (const [field, count] of [...badTypes].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(count).padStart(4)}×  ${field}`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
