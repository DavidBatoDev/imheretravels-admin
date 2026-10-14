// Pure row-number helpers, shared by the browser and server booking-row queries.

/**
 * Smallest positive row number not already taken. Duplicated rows count once
 * — sorting and comparing positions instead (the old client logic) treats
 * every duplicate as a "gap" and keeps handing out the same row.
 */
export function firstFreeRow(rows: ReadonlyArray<unknown>): number {
  const taken = new Set<number>();
  for (const row of rows) {
    if (row && typeof row === "number") taken.add(row);
  }
  let next = 1;
  while (taken.has(next)) next++;
  return next;
}
