import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const BOOKINGS = "bookings";

/**
 * Returns the next-available booking row minus 1 (callers add +1), filling
 * gaps left by deleted rows.
 *
 * Fast path: when the number of rows equals the highest row there are no
 * gaps, so the answer is the highest row — two cheap queries (1 doc read + a
 * count aggregation) instead of downloading every booking. Only when a gap
 * exists do we fall back to scanning all rows.
 */
export async function getLastContiguousBookingRow(): Promise<number> {
  const bookingsRef = collection(db, BOOKINGS);

  // Both queries are restricted to numeric rows (a range filter on a number
  // excludes strings/timestamps, which would otherwise sort above numbers).
  const numericRows = query(bookingsRef, where("row", ">=", 1));
  const [maxSnap, countSnap] = await Promise.all([
    getDocs(query(numericRows, orderBy("row", "desc"), limit(1))),
    getCountFromServer(numericRows),
  ]);

  const maxRow = maxSnap.empty ? 0 : maxSnap.docs[0].data().row;
  // Fast path only when rows are exactly 1..maxRow (integers, one per row).
  if (
    Number.isInteger(maxRow) &&
    maxRow > 0 &&
    countSnap.data().count === maxRow
  ) {
    return maxRow;
  }

  // Gap somewhere — find the smallest free row.
  const snapshot = await getDocs(bookingsRef);
  return firstFreeRow(snapshot.docs.map((doc) => doc.data().row)) - 1;
}

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

/** Number of bookings for a tour package, counted server-side. */
export async function countBookingsForTourPackage(
  tourPackageName: string,
): Promise<number> {
  const snapshot = await getCountFromServer(
    query(
      collection(db, BOOKINGS),
      where("tourPackageName", "==", tourPackageName),
    ),
  );
  return snapshot.data().count;
}

/**
 * Row number for a brand-new booking: the smallest free row (gaps from
 * deleted rows are reused). Reads Firestore, so it also sees bookings other
 * admins created a moment ago.
 */
export async function getNextBookingRow(): Promise<number> {
  return (await getLastContiguousBookingRow()) + 1;
}
