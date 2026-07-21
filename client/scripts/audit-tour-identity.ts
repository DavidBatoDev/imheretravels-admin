#!/usr/bin/env tsx
/**
 * READ-ONLY audit of tour identity integrity and booking linkage.
 *
 * Bookings store `tourCode` and `tourPackageName` as denormalised strings, not a
 * tourPackages document id (see `Booking` in src/types/bookings.ts). Any report
 * that groups by either field therefore breaks silently when two tours share a
 * code/name, or when a tour is renamed and its historical bookings stop
 * matching. This script surfaces both, plus leftover duplication artifacts.
 *
 * The target project is explicit (--dev / --prod). READ-ONLY.
 *
 * Usage: npm run audit:tour-identity -- --prod
 */

import path from "path";
import { writeFileSync } from "fs";
import {
  validateTourForPublish,
  hasCopyMarker,
} from "../src/lib/tour-publish-validation";
import { initFirestore, targetFromArgv } from "./lib/firebase-target";

const { db, projectId, label: ENV_LABEL } = initFirestore(targetFromArgv());
console.log("  read-only: this script never writes\n");

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const loose = (v: unknown) => norm(v).replace(/[^a-z0-9]+/g, "");

type Row = Record<string, any>;

const findings: { severity: "high" | "medium" | "low"; check: string; detail: string; rows?: Row[] }[] = [];
const add = (severity: "high" | "medium" | "low", check: string, detail: string, rows?: Row[]) =>
  findings.push({ severity, check, detail, rows });

/** Group values by a key, returning only the keys with more than one member. */
function collisions<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return new Map([...map].filter(([, v]) => v.length > 1));
}

async function main() {
  const [tourSnap, bookingSnap, hostSnap] = await Promise.all([
    db.collection("tourPackages").get(),
    db.collection("bookings").get(),
    // Singular — matches RESIDENT_HOSTS_COLLECTION in src/app/api/resident-hosts/route.ts.
    db.collection("residentHost").get().catch(() => null),
  ]);

  const tours = tourSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const hosts = hostSnap ? hostSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) : [];

  const hosted = tours.filter((t) => t.isHosted === true);
  console.log(
    `\nLoaded ${tours.length} tours (${hosted.length} hosted), ${bookings.length} bookings, ${hosts.length} resident hosts.\n`,
  );

  // ── 1. Leftover duplication artifacts ──────────────────────────────────────
  const copyRows: Row[] = [];
  for (const t of tours) {
    const fields: [string, string][] = [
      ["name", t.name],
      ["tourCode", t.tourCode],
      ["slug", t.slug],
      ["bookingSlug", t.bookingSlug],
      ["url", t.url],
      ["seo.title", t.seo?.title],
      ...((t.previousSlugs ?? []).map((p: any) => ["previousSlugs", p.slug]) as [string, string][]),
    ];
    for (const [field, value] of fields) {
      if (hasCopyMarker(value)) {
        copyRows.push({ tour: t.name, id: t.id, status: t.status, field, value });
      }
    }
  }
  if (copyRows.length) {
    add(
      "high",
      "Leftover copy markers",
      `${copyRows.length} field(s) still carry a duplication marker.`,
      copyRows,
    );
  }

  // ── 2. Identity collisions between tours ───────────────────────────────────
  const codeDupes = collisions(tours, (t) => norm(t.tourCode));
  for (const [code, group] of codeDupes) {
    add(
      "high",
      "Duplicate tourCode",
      `"${code}" is used by ${group.length} tours — bookings grouped by tourCode merge them.`,
      group.map((t) => ({ id: t.id, name: t.name, status: t.status, tourCode: t.tourCode })),
    );
  }

  const nameDupes = collisions(tours, (t) => norm(t.name));
  for (const [name, group] of nameDupes) {
    add(
      "high",
      "Duplicate tour name",
      `"${name}" is used by ${group.length} tours — bookings resolve by name.`,
      group.map((t) => ({ id: t.id, name: t.name, status: t.status, slug: t.slug })),
    );
  }

  // Every URL a tour answers to, current or redirecting.
  const urlOwners = new Map<string, { id: string; name: string; kind: string }[]>();
  for (const t of tours) {
    const entries = [
      ...(t.slug ? [[t.slug, "slug"]] : []),
      ...((t.previousSlugs ?? []).map((p: any) => [p.slug, "previousSlug"]) as [string, string][]),
    ] as [string, string][];
    for (const [slug, kind] of entries) {
      const k = norm(slug);
      if (!k) continue;
      urlOwners.set(k, [...(urlOwners.get(k) ?? []), { id: t.id, name: t.name, kind }]);
    }
  }
  for (const [slug, owners] of urlOwners) {
    if (owners.length > 1) {
      add(
        "high",
        "URL claimed by multiple tours",
        `/${slug} is claimed by ${owners.length} tours — the redirect is ambiguous.`,
        owners,
      );
    }
  }

  // ── 3. Near-misses (publish-gate warnings, applied collection-wide) ────────
  const nearRows: Row[] = [];
  for (const t of tours) {
    const issues = validateTourForPublish(t as any, tours as any, t.id);
    for (const i of issues.filter((x) => x.kind === "similar")) {
      nearRows.push({ tour: t.name, id: t.id, field: i.field, value: i.value, conflictsWith: i.conflictsWith, note: i.message });
    }
  }
  if (nearRows.length) {
    add("medium", "Near-identical identity values", `${nearRows.length} value(s) sit within typo distance of another tour.`, nearRows);
  }

  // ── 4. Booking → tour linkage ──────────────────────────────────────────────
  const byCode = new Map<string, any[]>();
  const byName = new Map<string, any[]>();
  for (const t of tours) {
    if (norm(t.tourCode)) byCode.set(norm(t.tourCode), [...(byCode.get(norm(t.tourCode)) ?? []), t]);
    if (norm(t.name)) byName.set(norm(t.name), [...(byName.get(norm(t.name)) ?? []), t]);
  }

  const tourById = new Map(tours.map((t) => [t.id, t]));

  const unresolved: Row[] = [];
  const noTourId: Row[] = [];
  const danglingTourId: Row[] = [];
  const ambiguous: Row[] = [];
  let staleCode = 0;
  let staleName = 0;

  for (const b of bookings) {
    const code = norm(b.tourCode);
    const name = norm(b.tourPackageName);
    const codeHits = code ? (byCode.get(code) ?? []) : [];
    const nameHits = name ? (byName.get(name) ?? []) : [];

    // A booking's stored code/name going stale is EXPECTED — they are snapshots
    // of what the trip was called when sold, deliberately preserved. Only count
    // them, don't flag them.
    if (code && codeHits.length === 0) staleCode++;
    if (name && nameHits.length === 0) staleName++;

    const linked = b.tourId ? tourById.get(b.tourId) : undefined;
    if (b.tourId && !linked) {
      danglingTourId.push({ booking: b.id, tourId: b.tourId, tourPackageName: b.tourPackageName });
      continue;
    }
    if (linked) continue; // resolves cleanly — nothing more to check

    // No tourId: fall back to code/name, and flag whatever can't be resolved.
    noTourId.push({ booking: b.id, tourCode: b.tourCode, tourPackageName: b.tourPackageName });
    if (codeHits.length > 1 || nameHits.length > 1) {
      ambiguous.push({
        booking: b.id,
        tourCode: b.tourCode,
        tourPackageName: b.tourPackageName,
        codeMatches: codeHits.length,
        nameMatches: nameHits.length,
      });
    } else if (codeHits.length === 0 && nameHits.length === 0) {
      unresolved.push({ booking: b.id, tourCode: b.tourCode, tourPackageName: b.tourPackageName });
    }
  }

  if (unresolved.length)
    add("high", "Bookings that resolve to no tour at all", `${unresolved.length} booking(s) have no tourId and neither their code nor name matches a tour.`, unresolved.slice(0, 50));
  if (danglingTourId.length)
    add("high", "Bookings whose tourId points at a deleted tour", `${danglingTourId.length} booking(s) reference a tourPackages doc that no longer exists.`, danglingTourId.slice(0, 50));
  if (ambiguous.length)
    add("high", "Bookings that resolve to multiple tours", `${ambiguous.length} booking(s) have no tourId and match more than one tour.`, ambiguous.slice(0, 50));
  if (noTourId.length)
    add("medium", "Bookings without a tourId", `${noTourId.length} booking(s) still rely on code/name matching. Run backfill-booking-tour-id.`, noTourId.slice(0, 20));

  console.log(
    `\nHistorical drift (expected, not a problem): ${staleCode} booking(s) hold a tourCode and ` +
      `${staleName} hold a tour name that no current tour uses.\nThese are preserved records of what ` +
      `the trip was called when sold; they resolve through tourId.`,
  );

  // ── 5. Hosted-tour tracking ────────────────────────────────────────────────
  // Join on tourId; the name/code strings are historical snapshots that drift.
  const bookingsPerTour = new Map<string, number>();
  for (const b of bookings) {
    let id: string | undefined = b.tourId;
    if (!id) {
      const hits = byCode.get(norm(b.tourCode)) ?? byName.get(norm(b.tourPackageName)) ?? [];
      if (hits.length === 1) id = hits[0].id;
    }
    if (id) bookingsPerTour.set(id, (bookingsPerTour.get(id) ?? 0) + 1);
  }

  const hostedTable = hosted.map((t) => ({
    tour: t.name,
    tourCode: t.tourCode,
    status: t.status,
    bookings: bookingsPerTour.get(t.id) ?? 0,
    // ResidentHost stores `displayName`/`pageTitle` — there is no `name` field.
    attachedToHost:
      hosts.find((h) => (h.attachedTourIds ?? []).includes(t.id))?.displayName ?? "—",
  }));

  // Resident-host attachments pointing at tours that aren't flagged hosted.
  const attachmentIssues: Row[] = [];
  for (const h of hosts) {
    // ResidentHost stores `displayName`/`pageTitle` — there is no `name` field.
    const hostName = h.displayName ?? h.pageTitle ?? h.slug ?? h.id;
    for (const id of h.attachedTourIds ?? []) {
      const t = tours.find((x) => x.id === id);
      if (!t) {
        attachmentIssues.push({ host: hostName, attachedTourId: id, problem: "tour no longer exists" });
      } else if (t.isHosted !== true) {
        attachmentIssues.push({ host: hostName, tour: t.name, attachedTourId: id, problem: "attached but not flagged isHosted" });
      }
    }
  }
  // Hosted tours nobody hosts.
  const unattachedHosted = hosted
    .filter((t) => !hosts.some((h) => (h.attachedTourIds ?? []).includes(t.id)))
    .map((t) => ({ tour: t.name, tourCode: t.tourCode, status: t.status, problem: "isHosted but attached to no resident host" }));

  if (attachmentIssues.length)
    add("medium", "Resident-host attachment mismatches", `${attachmentIssues.length} attachment(s) are inconsistent.`, attachmentIssues);
  if (unattachedHosted.length)
    add("medium", "Hosted tours with no host", `${unattachedHosted.length} hosted tour(s) have no resident host attached.`, unattachedHosted);

  // ── Report ─────────────────────────────────────────────────────────────────
  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  if (!findings.length) {
    console.log("No issues found.\n");
  }
  for (const f of findings) {
    console.log(`\n[${f.severity.toUpperCase()}] ${f.check}`);
    console.log(`  ${f.detail}`);
    for (const row of f.rows ?? []) {
      console.log(
        "    · " +
          Object.entries(row)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join("  "),
      );
    }
  }

  console.log("\n" + "─".repeat(72));
  console.log("HOSTED TOURS");
  console.log("─".repeat(72));
  if (!hostedTable.length) console.log("  (none flagged isHosted)");
  for (const r of hostedTable) {
    console.log(
      `  ${String(r.tour).padEnd(38)} ${String(r.tourCode ?? "—").padEnd(10)} ${String(r.status).padEnd(9)} ${String(r.bookings).padStart(4)} bookings   host: ${r.attachedToHost}`,
    );
  }

  const out = path.resolve(__dirname, "..", "..", "..", "tour-identity-audit.json");
  writeFileSync(out, JSON.stringify({ projectId, env: ENV_LABEL, findings, hostedTable }, null, 2));
  console.log(`\nFull report → ${out}`);

  const high = findings.filter((f) => f.severity === "high").length;
  console.log(`\n${findings.length} finding(s); ${high} high severity.\n`);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
