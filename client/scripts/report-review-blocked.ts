#!/usr/bin/env tsx
/**
 * Bookings whose review eligibility was severed by a tour code/name change.
 *
 * www resolves a traveller's booking to a tour by exact tourCode OR exact
 * normalised tourPackageName (www/lib/booking-tour-match.ts). Both are snapshots
 * taken at booking time, so standardising a tour code orphans the history.
 *
 * Reports every booking that the OLD (code/name) matcher missed but the NEW
 * (tourId-first) matcher resolves, with the full context needed to decide who
 * to contact.
 *
 * READ-ONLY.
 *
 * Usage: npm run report:review-blocked -- --prod
 */

import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The matcher exactly as it behaved before the tourId fix. */
function oldMatch(b: any, t: any): boolean {
  const bC = norm(b.tourCode);
  const tC = norm(t.tourCode);
  if (bC && tC && bC !== "xxx" && tC !== "xxx" && bC === tC) return true;
  const bN = norm(b.tourPackageName);
  const tN = norm(t.name);
  return !!(bN && tN && bN === tN);
}

/** Mirrors isEligibleBookingStatus on www. */
const isEligible = (s: unknown) => /confirmed|completed/i.test(String(s ?? ""));

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (v: any) => toDate(v)?.toISOString().slice(0, 10) ?? "—";

async function main() {
  const { db } = initFirestore(targetFromArgv());
  console.log("  read-only\n");

  const [tourSnap, bookingSnap, reviewSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
    db.collection("tourReviews").get().catch(() => null),
  ]);
  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const reviews = reviewSnap ? reviewSnap.docs.map((d) => d.data() as any) : [];
  const reviewedBookingIds = new Set(reviews.map((r) => String(r.bookingId ?? "")));

  const now = Date.now();

  const blocked = bookings
    .map((b) => {
      const oldTour = tours.find((t) => oldMatch(b, t));
      const newTour = tours.find((t) => b.tourId && t.id === b.tourId);
      return { b, oldTour, newTour };
    })
    .filter((x) => !x.oldTour && x.newTour);

  const groups = new Map<string, typeof blocked>();
  for (const x of blocked) {
    const k = `${x.newTour!.name} — ${x.newTour!.tourCode} — ${x.newTour!.id}`;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }

  console.log(`${blocked.length} bookings lost their tour link.\n`);

  for (const [key, list] of groups) {
    const [name, code, id] = key.split(" — ");
    console.log("═".repeat(120));
    console.log(`TOUR: ${name}`);
    console.log(`      tourId=${id}   current code=${code}`);
    const storedCodes = [...new Set(list.map((x) => x.b.tourCode))].join(", ");
    const storedNames = [...new Set(list.map((x) => x.b.tourPackageName))];
    console.log(`      bookings stored code(s): ${storedCodes}`);
    storedNames.forEach((n) => console.log(`      bookings stored name   : "${n}"`));
    console.log(`      → neither matched "${name}" / "${code}", so www returned wrong_tour`);
    console.log("═".repeat(120));

    const sorted = [...list].sort(
      (a, z) => (toDate(a.b.tourDate)?.getTime() ?? 0) - (toDate(z.b.tourDate)?.getTime() ?? 0),
    );

    console.log(
      "  " +
        "traveller".padEnd(26) +
        "email".padEnd(34) +
        "travel".padEnd(12) +
        "booked".padEnd(12) +
        "eligible".padEnd(9) +
        "travelled".padEnd(10) +
        "reviewed".padEnd(9) +
        "status",
    );
    console.log("  " + "-".repeat(116));

    let actionable = 0;
    for (const { b } of sorted) {
      const travelled = (toDate(b.tourDate)?.getTime() ?? Infinity) <= now;
      const elig = isEligible(b.bookingStatus);
      const reviewed = reviewedBookingIds.has(String(b.bookingId ?? b.id));
      const canReviewNow = elig && travelled && !reviewed;
      if (canReviewNow) actionable++;
      console.log(
        "  " +
          String(b.fullName ?? "—").slice(0, 25).padEnd(26) +
          String(b.emailAddress ?? "—").slice(0, 33).padEnd(34) +
          fmt(b.tourDate).padEnd(12) +
          fmt(b.reservationDate).padEnd(12) +
          (elig ? "yes" : "no").padEnd(9) +
          (travelled ? "yes" : "not yet").padEnd(10) +
          (reviewed ? "yes" : "no").padEnd(9) +
          String(b.bookingStatus ?? "—"),
      );
    }
    console.log(
      `\n  ${list.length} bookings — ${actionable} are blocked RIGHT NOW ` +
        `(eligible + travelled + not yet reviewed). The rest are cancelled, mid-installment, or not yet travelled.\n`,
    );
  }

  const totals = blocked.reduce(
    (acc, { b }) => {
      const travelled = (toDate(b.tourDate)?.getTime() ?? Infinity) <= now;
      const elig = isEligible(b.bookingStatus);
      const reviewed = reviewedBookingIds.has(String(b.bookingId ?? b.id));
      if (elig) acc.eligible++;
      if (elig && travelled && !reviewed) acc.actionable++;
      if (elig && !travelled) acc.future++;
      return acc;
    },
    { eligible: 0, actionable: 0, future: 0 },
  );

  console.log("─".repeat(120));
  console.log(`SUMMARY`);
  console.log(`  ${blocked.length} bookings lost their tour link`);
  console.log(`  ${totals.eligible} are review-eligible (Confirmed/Completed)`);
  console.log(`  ${totals.actionable} are blocked right now — eligible, already travelled, no review yet`);
  console.log(`  ${totals.future} are eligible but haven't travelled yet (would have been blocked later)`);
  console.log(`  ${blocked.length - totals.eligible} were never eligible (cancelled / mid-installment)`);
  console.log(`\n  tourReviews in this project: ${reviews.length}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
