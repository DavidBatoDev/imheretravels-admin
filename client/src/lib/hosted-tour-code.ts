/**
 * Hosted-tour code convention: `{BASE}-{HOST INITIALS}`.
 *
 *   India Holi Festival with Dev              IHF   → IHF-D
 *   Philippine Sunset with Jess               PHSSJ → PHSS-J
 *   Tanzania Exploration with Danielle & Erin TXPDE → TXP-DE
 *   Brazil's Treasures with Breanna           BZT-B → BZT-B
 *   Philippines Sunset with Roxana            PHSSR → PHSS-R
 *
 * The host's initials come from the part of the tour name after "with", which
 * is how these tours are already named. The base is the existing code with any
 * previously-appended initials stripped, so re-running is idempotent and the
 * unsuffixed codes (PHSS, TXP) survive round-trips.
 *
 * Shared by the Settings-panel auto-fill and the standardisation migration so
 * the rule has exactly one definition.
 */

/** Extracts the host segment of a hosted tour's name, e.g. "Danielle & Erin". */
export function hostSegment(tourName: string | undefined | null): string {
  if (!tourName) return "";
  const m = tourName.match(/\bwith\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

/**
 * "Danielle & Erin" → "DE", "Dev" → "D", "Jess" → "J".
 * Only the first letter of each person's first name is used.
 */
export function hostInitials(tourName: string | undefined | null): string {
  const segment = hostSegment(tourName);
  if (!segment) return "";
  return segment
    .split(/\s*(?:&|\+|,|\band\b)\s*/i)
    .map((person) => person.trim().split(/\s+/)[0] ?? "")
    .map((firstName) => firstName.replace(/[^a-z]/gi, "").charAt(0).toUpperCase())
    .filter(Boolean)
    .join("");
}

/**
 * Strips a trailing host suffix so the base survives repeated derivations.
 * Only removes the suffix when it matches the initials we just computed —
 * a code like "IHF" keeps its "F" because the initials are "D".
 */
function stripHostSuffix(code: string, initials: string): string {
  if (!initials) return code;
  const escaped = initials.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return code.replace(new RegExp(`[-_\\s]?${escaped}$`, "i"), "");
}

/**
 * Derives the standardised code for a hosted tour. Returns the current code
 * unchanged when the name carries no "with <host>" part — there's nothing to
 * derive from, and guessing would be worse than leaving it alone.
 */
export function deriveHostedTourCode(
  tourName: string | undefined | null,
  currentCode: string | undefined | null,
): string {
  const code = (currentCode ?? "").trim();
  const initials = hostInitials(tourName);
  if (!initials) return code;

  const base = stripHostSuffix(code, initials).replace(/[-_\s]+$/, "");
  if (!base) return code;

  return `${base}-${initials}`;
}

/**
 * If `code` is the standard hosted code for `tourName`, returns the base it was
 * built on ("ARW-J" + "…with Juan" → "ARW"); otherwise null.
 *
 * Lets callers recognise a deliberate `{BASE}-{INITIALS}` code so it isn't
 * mistaken for a near-duplicate of the parent tour it's derived from.
 */
export function hostedCodeBase(
  tourName: string | undefined | null,
  code: string | undefined | null,
): string | null {
  const initials = hostInitials(tourName);
  if (!initials) return null;

  const trimmed = (code ?? "").trim();
  const suffix = `-${initials}`;
  if (trimmed.length <= suffix.length) return null;
  if (!trimmed.toUpperCase().endsWith(suffix.toUpperCase())) return null;

  return trimmed.slice(0, trimmed.length - suffix.length);
}

/** True when the code already follows the convention for this tour name. */
export function isStandardHostedCode(
  tourName: string | undefined | null,
  currentCode: string | undefined | null,
): boolean {
  const initials = hostInitials(tourName);
  if (!initials) return true; // nothing to enforce
  return (currentCode ?? "").trim() === deriveHostedTourCode(tourName, currentCode);
}
