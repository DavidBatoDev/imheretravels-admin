/**
 * Shared tour lookup for the price column functions.
 *
 * These functions were resolving the tour purely by `tourPackageName`, which is
 * a snapshot written when the booking was made. Renaming a tour orphans every
 * historical booking (in prod that is 101 of 211), and the functions return ""
 * on no-match — so an unlocked recalculation would blank the price.
 *
 * `lockPricing` currently masks this (all 101 orphans are locked, so the
 * functions short-circuit before the lookup), but that is luck, not design.
 * Resolving by id → code → name removes the dependency on a mutable label.
 */

export interface TourIdentityContext {
  /** tourPackages document id — stable across renames. */
  tourId?: string;
  /** Tour code as stored on the booking; also drifts, but less often than name. */
  tourCode?: string;
}

const norm = (v: unknown): string =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

/**
 * Finds the tour package for a booking, preferring the most stable key
 * available. Returns undefined when nothing matches.
 */
export function resolveTourPackage<T extends Record<string, any>>(
  tourPackages: T[],
  tourPackageName: string | undefined,
  context?: TourIdentityContext,
): T | undefined {
  if (!tourPackages?.length) return undefined;

  // 1. Document id — never drifts.
  const id = context?.tourId;
  if (id) {
    const byId = tourPackages.find((pkg) => (pkg as any).id === id);
    if (byId) return byId;
  }

  // 2. Tour code — stable unless deliberately restandardised.
  const code = norm(context?.tourCode);
  if (code && code !== "xxx") {
    const byCode = tourPackages.find((pkg) => norm(pkg.tourCode) === code);
    if (byCode) return byCode;
  }

  // 3. Display name — the original behaviour, kept as a last resort.
  const name = norm(tourPackageName);
  if (name) {
    const byName = tourPackages.find((pkg) => norm(pkg.name) === name);
    if (byName) return byName;
  }

  return undefined;
}
