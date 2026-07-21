import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Firestore stand-in. Keyed by `${collection}/${id}`.
type DocRef = { __path: string; id: string; collectionPath: string };
const store = new Map<string, Record<string, any>>();
const addedDocs: Array<{ collectionPath: string; data: Record<string, any> }> =
  [];
let autoIdCounter = 0;

const makeDocRef = (collectionPath: string, id: string): DocRef => ({
  __path: `${collectionPath}/${id}`,
  id,
  collectionPath,
});

vi.mock("@/lib/firebase", () => ({
  db: { __fake: true },
}));

vi.mock("firebase/firestore", () => {
  return {
    // Refs
    collection: (_db: unknown, collectionPath: string) => ({
      __collection: true,
      collectionPath,
    }),
    doc: (_db: unknown, collectionPath: string, id: string) =>
      makeDocRef(collectionPath, id),

    // Queries — we don't filter, we just remember the collection
    query: (collectionRef: any, ..._constraints: any[]) => ({
      __query: true,
      collectionPath: collectionRef.collectionPath,
    }),
    where: (field: string, op: string, value: unknown) => ({
      __where: true,
      field,
      op,
      value,
    }),

    // Reads
    getDoc: async (ref: DocRef) => {
      const data = store.get(ref.__path);
      return {
        exists: () => data !== undefined,
        data: () => data,
        id: ref.id,
      };
    },
    getDocs: async (q: { collectionPath: string }) => {
      // For bookings count queries, return empty: no bookings yet
      const docs: any[] = [];
      for (const [path, data] of store.entries()) {
        if (path.startsWith(`${q.collectionPath}/`)) {
          docs.push({ id: path.split("/")[1], data: () => data });
        }
      }
      return {
        size: docs.length,
        empty: docs.length === 0,
        forEach: (cb: (d: any) => void) => docs.forEach(cb),
        docs,
      };
    },

    // Writes
    addDoc: async (collectionRef: any, data: Record<string, any>) => {
      autoIdCounter += 1;
      const id = `auto-${autoIdCounter}`;
      const path = `${collectionRef.collectionPath}/${id}`;
      store.set(path, data);
      addedDocs.push({ collectionPath: collectionRef.collectionPath, data });
      return makeDocRef(collectionRef.collectionPath, id);
    },
    updateDoc: async (ref: DocRef, updates: Record<string, any>) => {
      const existing = store.get(ref.__path) || {};
      // Apply dot-notation updates shallowly enough for our needs
      const merged: Record<string, any> = { ...existing };
      for (const [key, value] of Object.entries(updates)) {
        if (key.includes(".")) {
          const [head, ...rest] = key.split(".");
          merged[head] = merged[head] || {};
          let cursor: any = merged[head];
          for (let i = 0; i < rest.length - 1; i++) {
            cursor[rest[i]] = cursor[rest[i]] || {};
            cursor = cursor[rest[i]];
          }
          cursor[rest[rest.length - 1]] = value;
        } else {
          merged[key] = value;
        }
      }
      store.set(ref.__path, merged);
    },

    // Timestamps
    serverTimestamp: () => ({ __serverTimestamp: true }),
    Timestamp: {
      now: () => ({
        toDate: () => new Date("2026-05-12T00:00:00Z"),
        seconds: 1778457600,
        nanoseconds: 0,
      }),
      fromDate: (d: Date) => ({
        toDate: () => d,
        seconds: Math.floor(d.getTime() / 1000),
        nanoseconds: 0,
      }),
    },
  };
});

// Import after mocks so the helper picks them up.
import { createBookingsForReservationPayment } from "./create-bookings-from-payment";

const TANZANIA_PACKAGE_ID = "tanzania-exploration";
const PAYMENT_DOC_ID = "test-payment-tanzania";

const tanzaniaPackage = {
  tourCode: "TZE",
  name: "Tanzania Exploration",
  pricing: { original: 2049, discounted: null },
  duration: "13 Days",
  currentVersion: 1,
};

describe("createBookingsForReservationPayment - Tanzania Exploration custom pricing", () => {
  beforeEach(() => {
    store.clear();
    addedDocs.length = 0;
    autoIdCounter = 0;

    // Seed the tour package
    store.set(`tourPackages/${TANZANIA_PACKAGE_ID}`, tanzaniaPackage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the per-tour-date custom price (£1949) from payment.originalPrice, not the package default (£2049)", async () => {
    // Seed a confirmed reservation-fee payment with a custom price for this tour date
    store.set(`stripePayments/${PAYMENT_DOC_ID}`, {
      customer: {
        email: "booker@example.com",
        firstName: "Jane",
        lastName: "Doe",
      },
      booking: {
        type: "Single Booking",
        groupSize: 1,
        guestDetails: [],
        id: "PENDING",
        documentId: "",
      },
      tour: {
        packageId: TANZANIA_PACKAGE_ID,
        packageName: "Tanzania Exploration",
        date: "2026-12-10",
      },
      payment: {
        amount: 250,
        currency: "GBP",
        status: "reserve_paid",
        type: "reservationFee",
        originalPrice: 1949, // ← custom tour-date price
      },
    });

    const result = await createBookingsForReservationPayment({
      paymentDocId: PAYMENT_DOC_ID,
      creationLock: "webhook",
    });

    expect(result.alreadyExists).toBe(false);
    if (result.alreadyExists) return;

    expect(result.bookingIds).toHaveLength(1);
    expect(result.bookingDocumentIds).toHaveLength(1);

    const bookingDocs = addedDocs.filter(
      (d) => d.collectionPath === "bookings",
    );
    expect(bookingDocs).toHaveLength(1);

    const booking = bookingDocs[0].data;

    // Core assertion: the booking captures the custom price, not the default
    expect(booking.originalTourCost).toBe(1949);
    expect(booking.originalTourCost).not.toBe(2049);

    // Remaining balance and installment math must derive from custom price
    // remainingBalance = (discounted || original) - paid = 1949 - 250 = 1699
    expect(booking.remainingBalance).toBe(1699);

    // Reservation fee captured as paid
    expect(booking.reservationFee).toBe(250);
    expect(booking.paid).toBe(250);

    // Personal info propagated
    expect(booking.firstName).toBe("Jane");
    expect(booking.lastName).toBe("Doe");
    expect(booking.tourPackageName).toBe("Tanzania Exploration");
    expect(booking.tourCode).toBe("TZE");

    // The durable link back to the tour. `tourCode` and `tourPackageName` above
    // are snapshots that go stale when a tour is renamed or recoded — a booking
    // written without a tourId silently falls back to matching on those, which
    // is what cost 45 bookings their review eligibility. Must never regress.
    expect(booking.tourId).toBe(TANZANIA_PACKAGE_ID);
  });

  it("falls back to the package default (£2049) when no custom price is set on the payment doc", async () => {
    store.set(`stripePayments/${PAYMENT_DOC_ID}`, {
      customer: {
        email: "booker@example.com",
        firstName: "John",
        lastName: "Smith",
      },
      booking: {
        type: "Single Booking",
        groupSize: 1,
        guestDetails: [],
        id: "PENDING",
        documentId: "",
      },
      tour: {
        packageId: TANZANIA_PACKAGE_ID,
        packageName: "Tanzania Exploration",
        date: "2026-12-10",
      },
      payment: {
        amount: 250,
        currency: "GBP",
        status: "reserve_paid",
        type: "reservationFee",
        // No originalPrice → must fall back to tour package pricing
      },
    });

    await createBookingsForReservationPayment({
      paymentDocId: PAYMENT_DOC_ID,
      creationLock: "webhook",
    });

    const bookingDocs = addedDocs.filter(
      (d) => d.collectionPath === "bookings",
    );
    expect(bookingDocs).toHaveLength(1);
    expect(bookingDocs[0].data.originalTourCost).toBe(2049);
    expect(bookingDocs[0].data.remainingBalance).toBe(2049 - 250);
  });

  it("splits the reservation fee across the main booker and guests for a Duo Booking with custom price", async () => {
    store.set(`stripePayments/${PAYMENT_DOC_ID}`, {
      customer: {
        email: "main@example.com",
        firstName: "Main",
        lastName: "Booker",
      },
      booking: {
        type: "Duo Booking",
        groupSize: 2,
        guestDetails: [
          {
            email: "guest@example.com",
            firstName: "Guest",
            lastName: "Two",
          },
        ],
        id: "PENDING",
        documentId: "",
      },
      tour: {
        packageId: TANZANIA_PACKAGE_ID,
        packageName: "Tanzania Exploration",
        date: "2026-12-10",
      },
      payment: {
        amount: 500, // 250 per person
        currency: "GBP",
        status: "reserve_paid",
        type: "reservationFee",
        originalPrice: 1949,
      },
    });

    const result = await createBookingsForReservationPayment({
      paymentDocId: PAYMENT_DOC_ID,
      creationLock: "webhook",
    });

    expect(result.alreadyExists).toBe(false);
    if (result.alreadyExists) return;
    expect(result.bookingIds).toHaveLength(2);

    const bookingDocs = addedDocs.filter(
      (d) => d.collectionPath === "bookings",
    );
    expect(bookingDocs).toHaveLength(2);

    // Both bookings get the custom price and a 250 fee each
    for (const { data } of bookingDocs) {
      expect(data.originalTourCost).toBe(1949);
      expect(data.reservationFee).toBe(250);
      expect(data.paid).toBe(250);
      expect(data.remainingBalance).toBe(1949 - 250);
    }

    // Main booker flag set correctly
    expect(bookingDocs[0].data.isMainBooker).toBe(true);
    expect(bookingDocs[1].data.isMainBooker).toBe(false);
    expect(bookingDocs[1].data.mainBookerId).toBe(bookingDocs[0].data
      ? "auto-1"
      : undefined);
  });

  it("is idempotent: returns the existing booking when one is already linked to the payment", async () => {
    store.set(`stripePayments/${PAYMENT_DOC_ID}`, {
      customer: { email: "x@x.com", firstName: "X", lastName: "Y" },
      booking: {
        type: "Single Booking",
        groupSize: 1,
        guestDetails: [],
        id: "TZE-001-JD",
        documentId: "existing-booking-doc-id",
      },
      tour: {
        packageId: TANZANIA_PACKAGE_ID,
        packageName: "Tanzania Exploration",
        date: "2026-12-10",
      },
      payment: {
        amount: 250,
        currency: "GBP",
        status: "reserve_paid",
        type: "reservationFee",
        originalPrice: 1949,
      },
    });

    const result = await createBookingsForReservationPayment({
      paymentDocId: PAYMENT_DOC_ID,
      creationLock: "webhook",
    });

    expect(result.alreadyExists).toBe(true);
    if (!result.alreadyExists) return;
    expect(result.bookingDocumentId).toBe("existing-booking-doc-id");
    expect(result.bookingId).toBe("TZE-001-JD");

    // No new bookings written
    expect(addedDocs.filter((d) => d.collectionPath === "bookings")).toHaveLength(
      0,
    );
  });

  it("rejects payments that are not yet reserve_paid / succeeded", async () => {
    store.set(`stripePayments/${PAYMENT_DOC_ID}`, {
      customer: { email: "x@x.com", firstName: "X", lastName: "Y" },
      booking: {
        type: "Single Booking",
        groupSize: 1,
        guestDetails: [],
        id: "PENDING",
        documentId: "",
      },
      tour: {
        packageId: TANZANIA_PACKAGE_ID,
        packageName: "Tanzania Exploration",
        date: "2026-12-10",
      },
      payment: {
        amount: 250,
        currency: "GBP",
        status: "reserve_pending", // ← not paid
        type: "reservationFee",
        originalPrice: 1949,
      },
    });

    await expect(
      createBookingsForReservationPayment({
        paymentDocId: PAYMENT_DOC_ID,
        creationLock: "webhook",
      }),
    ).rejects.toThrow(/Payment not confirmed/);
  });
});
