import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: { __fake: true } }));

// In-memory bookings; the Firestore mock evaluates the few query shapes
// booking-row-queries uses against it.
let rows: unknown[] = [];

type Q = { filters: Array<[string, string, unknown]>; order?: string; lim?: number };

vi.mock("firebase/firestore", () => ({
  collection: () => ({ filters: [] }) as Q,
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
  orderBy: (f: string, dir: string) => ({ order: `${f}:${dir}` }),
  limit: (n: number) => ({ lim: n }),
  query: (base: Q, ...parts: any[]) => {
    const q: Q = { ...base, filters: [...base.filters] };
    for (const p of parts) {
      if (p.where) q.filters.push(p.where);
      if (p.order) q.order = p.order;
      if (p.lim) q.lim = p.lim;
    }
    return q;
  },
  getDocs: async (q: Q) => {
    let docs = rows.map((row, i) => ({ id: String(i), row }));
    for (const [, op, v] of q.filters) {
      // Firestore range filters only match values of the same type
      if (op === ">=") docs = docs.filter((d) => typeof d.row === "number" && d.row >= (v as number));
    }
    if (q.order === "row:desc") {
      // Firestore type order: numbers < strings, so strings come first desc
      const rank = (x: unknown) => (typeof x === "string" ? 1 : 0);
      docs.sort((a, b) => rank(b.row) - rank(a.row) || (b.row as number) - (a.row as number));
    }
    if (q.lim) docs = docs.slice(0, q.lim);
    return {
      empty: docs.length === 0,
      docs: docs.map((d) => ({ data: () => ({ row: d.row }) })),
      forEach: (fn: (d: unknown) => void) =>
        docs.forEach((d) => fn({ data: () => ({ row: d.row }) })),
    };
  },
  getCountFromServer: async (q: Q) => {
    let docs = rows;
    for (const [, op, v] of q.filters) {
      if (op === ">=") docs = docs.filter((r) => typeof r === "number" && r >= (v as number));
    }
    return { data: () => ({ count: docs.length }) };
  },
}));

import { firstFreeRow, getLastContiguousBookingRow } from "./booking-row-queries";

/** Reference: the original full-scan implementation. */
function original(allRows: unknown[]): number {
  const existing = new Set<number>();
  allRows.forEach((r) => {
    if (r && typeof r === "number") existing.add(r);
  });
  if (existing.size === 0) return 0;
  let next = 1;
  while (existing.has(next)) next++;
  return next - 1;
}

describe("getLastContiguousBookingRow", () => {
  beforeEach(() => {
    rows = [];
  });

  const cases: Array<[string, unknown[]]> = [
    ["empty", []],
    ["contiguous", [1, 2, 3, 4]],
    ["unordered", [3, 1, 2]],
    ["gap", [1, 2, 4, 5]],
    ["gap at start", [2, 3]],
    ["missing rows", [1, undefined, 2, null]],
    ["string row sorts above numbers", [1, 2, 3, "99"]],
    ["duplicates", [1, 1, 2]],
    ["non-integer", [1, 2.5]],
  ];

  it.each(cases)("matches the original full scan: %s", async (_name, data) => {
    rows = data;
    expect(await getLastContiguousBookingRow()).toBe(original(data));
  });
});

describe("firstFreeRow", () => {
  const range = (a: number, b: number) =>
    Array.from({ length: b - a + 1 }, (_, i) => a + i);

  it("does not get stuck on duplicates (prod: 215 x2 kept handing out 216)", () => {
    // The old sort-and-compare loop returned 216 here, and kept returning
    // 216 as each new booking added another duplicate.
    const rows = [...range(1, 215), 215, ...range(217, 242), 216, 216, 216];
    expect(firstFreeRow(rows)).toBe(243);
  });

  it("still reuses a real gap", () => {
    expect(firstFreeRow([1, 2, 4, 4, 5])).toBe(3);
  });

  it("ignores non-numeric and missing rows", () => {
    expect(firstFreeRow([1, "2", null, undefined, 0, 2])).toBe(3);
    expect(firstFreeRow([])).toBe(1);
  });
});
