#!/usr/bin/env tsx
/**
 * Every tour — normal and hosted — with its document id, code and gross revenue.
 *
 * Bookings join on `tourId` (falling back to `tourCode` for anything predating
 * the backfill). Gross counts non-cancelled bookings only, using the discounted
 * price where the booking opted into one.
 *
 * READ-ONLY.
 *
 * Usage: npm run report:all-tours -- --prod
 */

import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

async function main() {
  const { db } = initFirestore(targetFromArgv());

  const [tourSnap, bookingSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
  ]);
  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const rows = tours.map((t) => {
    const mine = bookings.filter((b) =>
      b.tourId ? b.tourId === t.id : norm(b.tourCode) === norm(t.tourCode),
    );
    const live = mine.filter((b) => !/cancelled/i.test(String(b.bookingStatus ?? "")));
    const gross = live.reduce(
      (s, b) =>
        s +
        (b.useDiscountedTourCost && b.discountedTourCost != null
          ? num(b.discountedTourCost)
          : num(b.originalTourCost)),
      0,
    );
    return {
      name: t.name ?? "—",
      id: t.id,
      code: t.tourCode ?? "—",
      hosted: t.isHosted === true,
      status: t.status ?? "—",
      bookings: live.length,
      gross,
    };
  });

  rows.sort((a, b) => b.gross - a.gross || String(a.name).localeCompare(String(b.name)));

  console.log(
    "\n" +
      "tour".padEnd(44) +
      "tourId".padEnd(24) +
      "code".padEnd(9) +
      "type".padEnd(8) +
      "status".padEnd(10) +
      "bookings".padStart(9) +
      "gross".padStart(11),
  );
  console.log("-".repeat(115));
  for (const r of rows) {
    console.log(
      String(r.name).slice(0, 43).padEnd(44) +
        r.id.padEnd(24) +
        String(r.code).padEnd(9) +
        (r.hosted ? "hosted" : "normal").padEnd(8) +
        String(r.status).padEnd(10) +
        String(r.bookings).padStart(9) +
        money(r.gross).padStart(11),
    );
  }
  console.log("-".repeat(115));

  const tot = rows.reduce((a, r) => ({ b: a.b + r.bookings, g: a.g + r.gross }), { b: 0, g: 0 });
  const hosted = rows.filter((r) => r.hosted);
  const hTot = hosted.reduce((a, r) => ({ b: a.b + r.bookings, g: a.g + r.gross }), { b: 0, g: 0 });
  console.log(
    "TOTAL".padEnd(93) + String(tot.b).padStart(9) + money(tot.g).padStart(11),
  );
  console.log(
    `  of which hosted (${hosted.length} tours)`.padEnd(93) +
      String(hTot.b).padStart(9) +
      money(hTot.g).padStart(11),
  );

  const unmatched = bookings.filter(
    (b) => !tours.some((t) => (b.tourId ? b.tourId === t.id : norm(b.tourCode) === norm(t.tourCode))),
  );
  console.log(`\n${bookings.length} bookings total; ${unmatched.length} match no tour.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
