import "server-only";

import { adminDb } from "@/lib/firebase-admin-db";
import { firstFreeRow } from "@/lib/booking-row-math";

/**
 * Server twin of `@/lib/booking-row-queries` on firebase-admin, for API routes
 * and server libs. The browser version uses the client SDK, which has no
 * signed-in user on the server and fails once Firestore rules deny
 * unauthenticated access. Callers catch that and fall back to 0, so every new
 * booking would silently get row 1.
 */
const BOOKINGS = "bookings";

/** See `getLastContiguousBookingRow` in booking-row-queries.ts. */
export async function getLastContiguousBookingRow(): Promise<number> {
  const bookings = adminDb().collection(BOOKINGS);

  const numericRows = bookings.where("row", ">=", 1);
  const [maxSnap, countSnap] = await Promise.all([
    numericRows.orderBy("row", "desc").limit(1).get(),
    numericRows.count().get(),
  ]);

  const maxRow = maxSnap.empty ? 0 : maxSnap.docs[0].data().row;
  if (Number.isInteger(maxRow) && maxRow > 0 && countSnap.data().count === maxRow) {
    return maxRow;
  }

  const snapshot = await bookings.select("row").get();
  return firstFreeRow(snapshot.docs.map((doc) => doc.get("row"))) - 1;
}

/** Number of bookings for a tour package, counted server-side. */
export async function countBookingsForTourPackage(tourPackageName: string): Promise<number> {
  const snapshot = await adminDb()
    .collection(BOOKINGS)
    .where("tourPackageName", "==", tourPackageName)
    .count()
    .get();
  return snapshot.data().count;
}
