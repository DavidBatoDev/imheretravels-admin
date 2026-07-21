import type { TourPackage } from "@/types/tours";
import { hostedCodeBase } from "./hosted-tour-code";

/**
 * Pre-publish safeguards for tour pages.
 *
 * Duplicating a tour mints placeholder identity values — "{name} (Copy)",
 * "{code}-COPY", "{slug}-copy" (see `duplicateTour` in tours-service). Renaming
 * the duplicate also auto-files the old "-copy" slug into `previousSlugs`, so
 * the marker can survive a rename. None of those may reach a live page, and the
 * identity fields must stay unique across the whole collection because they
 * drive www URLs, redirects and booking links.
 *
 * These checks run when the admin publishes (status → active, or a scheduled
 * publish is set); drafts are left alone so a work-in-progress duplicate can be
 * saved freely.
 */

export type PublishIssueKind = "copy" | "duplicate" | "similar";
export type PublishIssueSeverity = "blocking" | "warning";

export interface PublishIssue {
  /** `data-field` anchor used to scroll to and highlight the offending input. */
  field: string;
  /** Human label matching what the admin sees in the editor. */
  label: string;
  /** The offending value, as typed. */
  value: string;
  kind: PublishIssueKind;
  severity: PublishIssueSeverity;
  message: string;
  /** Name of the tour this value collides with (uniqueness issues only). */
  conflictsWith?: string;
  /** The same value with the copy marker stripped (copy issues only). */
  suggestion?: string;
}

/** Identity fields checked for copy markers, in the order they're reported. */
const IDENTITY_FIELDS: { path: string; label: string }[] = [
  { path: "name", label: "Tour Name" },
  { path: "tourCode", label: "Tour Code" },
  { path: "slug", label: "URL Slug" },
  { path: "previousSlugs", label: "Previous Slugs (redirect to this tour)" },
  { path: "bookingSlug", label: "Booking Slug Override" },
  { path: "url", label: "Direct URL" },
  { path: "seo.title", label: "SEO Title" },
];

/**
 * Matches "copy"/"duplicate" as a standalone token so real words survive —
 * "copyright" and "Copycat" have no boundary after the token and don't match,
 * while "(Copy 2)", "-COPY", "_copy" and "abc-copy-3" all do.
 *
 * The trailing `\d*` catches hand-typed run-on variants like "ARW-COPY2" that
 * a strict separator rule would miss; letters still terminate the match, which
 * is what keeps "copyright" clean.
 *
 * The leading boundary is kept on purpose: dropping it would catch "ARWCOPY2"
 * but also "microscopy"/"endoscopy". A false positive blocks a publish outright,
 * whereas that miss is both unreachable from `duplicateTour` (which always emits
 * a separator) and obvious on sight.
 */
const COPY_MARKER = /(?:^|[^a-z0-9])(?:copy|duplicate)\d*(?:[^a-z0-9]|$)/i;

export const hasCopyMarker = (value: unknown): boolean =>
  typeof value === "string" && COPY_MARKER.test(value);

/** Best-effort cleanup of a copy marker, offered as a suggestion in the modal. */
export function stripCopyMarker(value: string): string {
  return value
    // "Name (Copy)" / "Name (Copy 2)" / "Name (duplicate)"
    .replace(/\s*[([]\s*(?:copy|duplicate)\s*\d*\s*[)\]]\s*/gi, " ")
    // "abc-copy", "ABC_COPY_2", "name copy 3"
    .replace(/[-_\s]+(?:copy|duplicate)(?:[-_\s]*\d+)?(?![a-z0-9])/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[-_]+$/, "");
}

/** Case-insensitive comparison key. */
const norm = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Punctuation-insensitive key — "Brazil's Treasures" ≡ "brazils-treasures". */
const loose = (value: unknown): string => norm(value).replace(/[^a-z0-9]+/g, "");

/** Levenshtein distance, capped early so long strings stay cheap. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** Shape the validator needs — satisfied by both form values and TourPackage. */
export interface TourIdentityValues {
  name?: string;
  tourCode?: string;
  slug?: string;
  bookingSlug?: string;
  url?: string;
  seo?: { title?: string; description?: string };
  previousSlugs?: { slug: string; redirect: boolean }[];
}

/** Every slug a tour answers to — its own plus any redirecting old ones. */
const slugsOf = (tour: TourIdentityValues): string[] => [
  ...(tour.slug ? [tour.slug] : []),
  ...(tour.previousSlugs ?? []).map((p) => p.slug).filter(Boolean),
];

function readField(values: TourIdentityValues, path: string): string {
  if (path === "seo.title") return values.seo?.title ?? "";
  return (values as any)[path] ?? "";
}

/**
 * Collects everything that should stop a tour going live.
 *
 * @param values      the tour being published (form values or a saved tour)
 * @param otherTours  every other tour, for uniqueness checks. Pass `null` to
 *                    run copy-marker checks only (e.g. the fetch failed) —
 *                    those need no collection-wide context.
 * @param selfId      id of the tour being published, excluded from `otherTours`
 */
export function validateTourForPublish(
  values: TourIdentityValues,
  otherTours: TourPackage[] | null,
  selfId?: string,
): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const others = otherTours ? otherTours.filter((t) => t.id !== selfId) : null;

  /**
   * Is this value already spoken for by another tour?
   *
   * Stripping "(Copy)" almost always lands on the value the tour was duplicated
   * FROM, so a suggestion has to be checked for availability before it's
   * offered — otherwise it just trades a copy error for a collision error.
   */
  const takenBy = (field: string, value: string): TourPackage | undefined => {
    if (!others || !norm(value)) return undefined;
    switch (field) {
      case "name":
        return others.find((t) => norm(t.name) === norm(value));
      case "tourCode":
        return others.find((t) => norm(t.tourCode) === norm(value));
      case "slug":
      case "bookingSlug":
        return others.find((t) => slugsOf(t).some((s) => norm(s) === norm(value)));
      case "url":
        return others.find((t) => norm((t as any).url) === norm(value));
      default:
        return undefined; // seo.title carries no uniqueness rule
    }
  };

  // ── 1. Copy markers left over from duplication ────────────────────────────
  for (const { path, label } of IDENTITY_FIELDS) {
    if (path === "previousSlugs") {
      for (const prev of values.previousSlugs ?? []) {
        if (!hasCopyMarker(prev.slug)) continue;
        issues.push({
          field: "previousSlugs",
          label,
          value: `/${prev.slug}`,
          kind: "copy",
          severity: "blocking",
          message:
            'Left over from duplicating a tour. Remove this redirect — a live page must not advertise a "copy" URL.',
        });
      }
      continue;
    }

    const value = readField(values, path);
    if (!hasCopyMarker(value)) continue;

    const stripped = stripCopyMarker(value);
    const usable = stripped && stripped !== value ? stripped : undefined;
    const owner = usable ? takenBy(path, usable) : undefined;

    issues.push({
      field: path,
      label,
      value,
      kind: "copy",
      severity: "blocking",
      message: owner
        ? // When the stripped value IS the owner's name, naming it twice reads
          // badly ('"X", which X already uses') — say what it actually is.
          norm(usable) === norm(owner.name)
          ? `Still carries the placeholder marker from duplication, and simply removing it gives "${usable}" — the tour this was copied from. Give this duplicate its own value.`
          : `Still carries the placeholder marker from duplication, and simply removing it gives "${usable}", which ${owner.name || "another tour"} already uses. Give this duplicate its own value.`
        : "Still carries the placeholder marker added when this tour was duplicated. Replace it with the real value before publishing.",
      // Only offered when it's actually free — otherwise following it would
      // just swap this error for a duplicate-value error.
      // `conflictsWith` is left unset on purpose — the message above already
      // names the owner, and the UI appends "Conflicts with …" when it's set.
      suggestion: owner ? undefined : usable,
    });
  }

  if (!others) return issues;

  // ── 2. Exact collisions with another tour ─────────────────────────────────
  const clash = (
    field: string,
    label: string,
    value: string,
    match: (t: TourPackage) => boolean,
    what: string,
  ) => {
    if (!norm(value)) return;
    const hit = others.find(match);
    if (!hit) return;
    issues.push({
      field,
      label,
      value,
      kind: "duplicate",
      severity: "blocking",
      message: `Already used as ${what}. These must be unique across all tours.`,
      conflictsWith: hit.name || hit.slug || hit.id,
    });
  };

  clash(
    "name",
    "Tour Name",
    values.name ?? "",
    (t) => norm(t.name) === norm(values.name),
    "another tour's name",
  );
  clash(
    "tourCode",
    "Tour Code",
    values.tourCode ?? "",
    (t) => norm(t.tourCode) === norm(values.tourCode),
    "another tour's code",
  );
  clash(
    "slug",
    "URL Slug",
    values.slug ?? "",
    (t) => slugsOf(t).some((s) => norm(s) === norm(values.slug)),
    "another tour's URL or redirect",
  );

  // Each redirect must also point somewhere unambiguous.
  for (const prev of values.previousSlugs ?? []) {
    const hit = others.find((t) =>
      slugsOf(t).some((s) => norm(s) === norm(prev.slug)),
    );
    if (!hit) continue;
    issues.push({
      field: "previousSlugs",
      label: "Previous Slugs (redirect to this tour)",
      value: `/${prev.slug}`,
      kind: "duplicate",
      severity: "blocking",
      message:
        "Another tour already answers to this URL, so the redirect is ambiguous. Remove it here or from the other tour.",
      conflictsWith: hit.name || hit.slug || hit.id,
    });
  }

  // ── 3. Near-misses — surfaced as warnings, publishable after confirming ───
  const nearMiss = (
    field: string,
    label: string,
    value: string,
    candidatesOf: (t: TourPackage) => string[],
    what: string,
  ) => {
    const key = loose(value);
    // Too short to compare meaningfully without drowning the admin in noise.
    if (key.length < 4) return;
    const already = issues.some(
      (i) => i.field === field && i.severity === "blocking",
    );
    if (already) return;

    for (const other of others) {
      for (const candidate of candidatesOf(other)) {
        const otherKey = loose(candidate);
        if (!otherKey) continue;
        if (otherKey === key) {
          // Identical once punctuation and casing are ignored.
          issues.push({
            field,
            label,
            value,
            kind: "similar",
            severity: "warning",
            message: `Differs from ${what} ("${candidate}") only by punctuation or capitalisation.`,
            conflictsWith: other.name || other.slug || other.id,
          });
          return;
        }
        if (editDistance(key, otherKey, 2) <= 2) {
          issues.push({
            field,
            label,
            value,
            kind: "similar",
            severity: "warning",
            message: `Nearly identical to ${what} ("${candidate}"). Check this isn't an accidental duplicate.`,
            conflictsWith: other.name || other.slug || other.id,
          });
          return;
        }
      }
    }
  };

  nearMiss("name", "Tour Name", values.name ?? "", (t) => [t.name], "another tour's name");

  /**
   * Hosted codes are deliberately built from their parent's: "Argentina's
   * Wonders with Juan" is ARW-J precisely because the parent is ARW. Comparing
   * them by edit distance flags the convention itself, so the derived base and
   * any sibling sharing it are excluded before the near-miss check runs.
   */
  const myBase = hostedCodeBase(values.name, values.tourCode);
  nearMiss(
    "tourCode",
    "Tour Code",
    values.tourCode ?? "",
    (t) => {
      const theirBase = hostedCodeBase(t.name, t.tourCode);
      // Looking at a hosted tour derived from mine (PHSS seeing PHSS-R). The
      // relationship is symmetric, so the parent must stay quiet too.
      if (theirBase && loose(theirBase) === loose(values.tourCode)) return [];
      if (myBase) {
        // The parent this code was derived from.
        if (loose(t.tourCode) === loose(myBase)) return [];
        // A sibling hosted tour built on the same base (PHSS-J vs PHSS-R).
        if (theirBase && loose(theirBase) === loose(myBase)) return [];
      }
      return [t.tourCode];
    },
    "another tour's code",
  );
  nearMiss("slug", "URL Slug", values.slug ?? "", (t) => slugsOf(t), "another tour's URL");

  // A booking slug that shadows another tour's URL sends reservations astray.
  if (norm(values.bookingSlug)) {
    const hit = others.find((t) =>
      slugsOf(t).some((s) => norm(s) === norm(values.bookingSlug)),
    );
    if (hit) {
      issues.push({
        field: "bookingSlug",
        label: "Booking Slug Override",
        value: values.bookingSlug!,
        kind: "similar",
        severity: "warning",
        message:
          "Matches another tour's URL, so reservation links may point at the wrong tour.",
        conflictsWith: hit.name || hit.slug || hit.id,
      });
    }
  }

  return issues;
}

export const hasBlockingIssue = (issues: PublishIssue[]): boolean =>
  issues.some((i) => i.severity === "blocking");
