#!/usr/bin/env tsx
/**
 * Backfills a stable `tourId` onto every booking.
 *
 * Bookings currently reference their tour only through the denormalised strings
 * `tourCode` and `tourPackageName`. Both drift: renaming a tour orphans its
 * historical bookings (in prod, only 110/211 still resolve by name), and codes
 * are reused across near-identical tours. A document id never drifts, so every
 * report can join on it instead.
 *
 * Resolution order per booking:
 *   1. exact tourCode match (case-insensitive)  → the reliable key today
 *   2. exact tourPackageName match              → catches typo'd codes
 *   3. unresolved                               → reported, never guessed
 *
 * Dry run by default; --apply writes. The target project is explicit (--dev /
 * --prod) rather than inherited from whichever .env.local block happens to be
 * uncommented — that block has been flipped mid-session before.
 *
 * Usage:
 *   npm run backfill:booking-tour-id -- --dev             # dry run
 *   npm run backfill:booking-tour-id -- --prod --apply
 */

import admin from "firebase-admin";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const APPLY = process.argv.includes("--apply");
const { db } = initFirestore(targetFromArgv());
console.log(`  mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

type Resolution = {
  bookingId: string;
  tourCode: string;
  tourPackageName: string;
  tourId: string | null;
  tourName: string | null;
  via: "tourCode" | "tourPackageName" | "unresolved";
};

async function main() {
  const [tourSnap, bookingSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
  ]);

  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Only unambiguous keys are usable — a key owned by two tours resolves to nothing.
  const uniqueIndex = (key: (t: any) => string) => {
    const counts = new Map<string, any[]>();
    for (const t of tours) {
      const k = key(t);
      if (k) counts.set(k, [...(counts.get(k) ?? []), t]);
    }
    return new Map([...counts].filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]]));
  };

  const byCode = uniqueIndex((t) => norm(t.tourCode));
  const byName = uniqueIndex((t) => norm(t.name));

  const resolutions: Resolution[] = bookings.map((b) => {
    const viaCode = byCode.get(norm(b.tourCode));
    if (viaCode)
      return { bookingId: b.id, tourCode: b.tourCode, tourPackageName: b.tourPackageName, tourId: viaCode.id, tourName: viaCode.name, via: "tourCode" };
    const viaName = byName.get(norm(b.tourPackageName));
    if (viaName)
      return { bookingId: b.id, tourCode: b.tourCode, tourPackageName: b.tourPackageName, tourId: viaName.id, tourName: viaName.name, via: "tourPackageName" };
    return { bookingId: b.id, tourCode: b.tourCode, tourPackageName: b.tourPackageName, tourId: null, tourName: null, via: "unresolved" };
  });

  // ── Mapping table, grouped by the (code, name) pair bookings actually carry ──
  const groups = new Map<string, { code: string; name: string; count: number; r: Resolution }>();
  for (const r of resolutions) {
    const k = `${norm(r.tourCode)}||${norm(r.tourPackageName)}`;
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { code: r.tourCode, name: r.tourPackageName, count: 1, r });
  }

  console.log("\nBOOKING → TOUR MAPPING");
  console.log("-".repeat(110));
  console.log(
    "n".padStart(4) + "  " + "booking tourCode".padEnd(10) + "booking tourPackageName".padEnd(42) + "resolves to".padEnd(42) + "via",
  );
  console.log("-".repeat(110));
  for (const g of [...groups.values()].sort((a, b) => b.count - a.count)) {
    console.log(
      String(g.count).padStart(4) +
        "  " +
        String(g.code ?? "—").padEnd(10) +
        String(g.name ?? "—").slice(0, 41).padEnd(42) +
        String(g.r.tourName ?? "*** UNRESOLVED ***").slice(0, 41).padEnd(42) +
        g.r.via,
    );
  }

  // ── Ambiguity: one tour absorbing several distinct booking product names ────
  const absorbed = new Map<string, Set<string>>();
  for (const g of groups.values()) {
    if (!g.r.tourId) continue;
    const set = absorbed.get(g.r.tourId) ?? new Set<string>();
    set.add(g.name);
    absorbed.set(g.r.tourId, set);
  }
  const merges = [...absorbed].filter(([, names]) => names.size > 1);
  if (merges.length) {
    console.log("\n⚠  TOURS ABSORBING MULTIPLE BOOKING NAMES — confirm these are the same product:");
    for (const [tourId, names] of merges) {
      const t = tours.find((x) => x.id === tourId);
      console.log(`   ${t?.name} (${t?.tourCode})`);
      for (const n of names) console.log(`      ← "${n}"`);
    }
  }

  const unresolved = resolutions.filter((r) => !r.tourId);
  if (unresolved.length) {
    console.log(`\n⚠  UNRESOLVED (${unresolved.length}) — these keep no tourId:`);
    for (const r of unresolved) console.log(`   ${r.bookingId}  code=${r.tourCode}  name="${r.tourPackageName}"`);
  }

  const byVia = resolutions.reduce<Record<string, number>>((acc, r) => {
    acc[r.via] = (acc[r.via] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nSummary: ${JSON.stringify(byVia)} of ${bookings.length} bookings.`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write tourId.");
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  const writable = resolutions.filter((r) => r.tourId);
  let written = 0;
  for (let i = 0; i < writable.length; i += 400) {
    const batch = db.batch();
    for (const r of writable.slice(i, i + 400)) {
      batch.update(db.doc(`bookings/${r.bookingId}`), {
        tourId: r.tourId,
        tourIdResolvedVia: r.via,
      });
    }
    await batch.commit();
    written += Math.min(400, writable.length - i);
    console.log(`  committed ${written}/${writable.length}`);
  }
  console.log(`\nWROTE tourId on ${written} booking(s); ${unresolved.length} left untouched.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
