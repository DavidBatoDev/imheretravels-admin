import { describe, it, expect, vi } from "vitest";

// The columns index pulls in firebase-utils, which initialises Firebase auth
// at import time. Same mock shape as create-bookings-from-payment.test.ts.
vi.mock("@/lib/firebase", () => {
  const fake = { __fake: true };
  return {
    app: fake, auth: fake, db: fake, storage: fake,
    functions: fake, functionsUsCentral: fake,
    getDbInstance: () => fake, getAuthInstance: () => fake, getStorageInstance: () => fake,
  };
});

import { allBookingSheetColumns } from "@/app/functions/columns";

/**
 * Simulates what BookingsDataGrid does at runtime: every function column's
 * `arguments[].columnReference` must resolve to a real column by name, or the
 * argument is passed as undefined and the per-slot cash path silently never
 * runs.
 */
describe("column registry — per-slot cash columns are live", () => {
  const byName = new Map(allBookingSheetColumns.map((c) => [c.data.columnName, c]));

  it.each([
    "Reservation Amount Paid",
    "P1 Amount Paid",
    "P2 Amount Paid",
    "P3 Amount Paid",
    "P4 Amount Paid",
    "Full Payment Amount Paid",
  ])("%s exists, is an editable currency column, and has an order", (name) => {
    const col = byName.get(name);
    expect(col, `${name} missing from allBookingSheetColumns`).toBeDefined();
    expect(col!.data.dataType).toBe("currency");
    expect(col!.data.includeInForms).toBe(true);
    expect(col!.data.order).toBeTypeOf("number");
  });

  // Pre-existing dangling reference (not part of the per-slot work): the
  // P-amount / remaining-balance / full-payment columns name a column
  // "Use Discounted Tour Cost?" that does not exist, so that argument has
  // always arrived as undefined and the functions fall back to
  // discountedTourCost > 0. Pinned here so any NEW dangling reference fails.
  const KNOWN_DANGLING = new Set(["Use Discounted Tour Cost?"]);

  it.each([
    ["P1 Amount", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid"]],
    ["P2 Amount", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid"]],
    ["P3 Amount", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid"]],
    ["P4 Amount", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid"]],
    ["Paid", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid", "Full Payment Amount Paid"]],
    ["Paid Terms", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid", "Full Payment Amount Paid"]],
    ["Remaining Balance", ["Reservation Amount Paid", "P1 Amount Paid", "P2 Amount Paid", "P3 Amount Paid", "P4 Amount Paid", "Full Payment Amount Paid"]],
    ["Full Payment Amount", ["Reservation Amount Paid"]],
  ] as const)("%s: per-slot argument references resolve to real columns", (name, expectedRefs) => {
    const col = byName.get(name);
    expect(col, `${name} missing`).toBeDefined();
    const refs = (col!.data.arguments ?? []).map((a) => a.columnReference).filter(Boolean) as string[];
    // 1. the new per-slot references are declared…
    expect(refs).toEqual(expect.arrayContaining([...expectedRefs]));
    // 2. …and every one of them resolves (this is what the grid does at runtime)
    const unresolvedNew = expectedRefs.filter((r) => !byName.has(r));
    expect(unresolvedNew, `per-slot references not in registry on ${name}`).toEqual([]);
    // 3. no NEW dangling references beyond the known pre-existing one
    const unresolvedOther = refs.filter((r) => r !== "ID" && !byName.has(r) && !KNOWN_DANGLING.has(r));
    expect(unresolvedOther, `new dangling argument references on ${name}`).toEqual([]);
  });

  it("each *Amount Paid column sits right after its *Amount column", () => {
    const order = (n: string) => byName.get(n)!.data.order!;
    for (const n of ["P1", "P2", "P3", "P4"]) expect(order(`${n} Amount Paid`)).toBeGreaterThan(order(`${n} Amount`));
    expect(order("Reservation Amount Paid")).toBeGreaterThan(order("Reservation Fee"));
    expect(order("Full Payment Amount Paid")).toBeGreaterThan(order("Full Payment Amount"));
  });
});
