import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// In-memory stripePayments keyed by doc id.
const store = new Map<string, Record<string, any>>();
const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

vi.mock("@/lib/server-firestore", () => ({
  db: {},
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  query: (coll: unknown, ...constraints: any[]) => ({ coll, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getDoc: async (ref: { id: string }) => ({
    exists: () => store.has(ref.id),
    data: () => store.get(ref.id),
  }),
  getDocs: async (q: { constraints: Array<{ value: unknown }> }) => ({
    docs: [...store.entries()]
      .filter(([, d]) => d.payment?.stripeIntentId === q.constraints[0].value)
      .map(([id]) => ({ id })),
  }),
  updateDoc: async (ref: { id: string }, data: Record<string, unknown>) => {
    updates.push({ id: ref.id, data });
  },
  serverTimestamp: () => "TS",
}));

vi.mock("@/lib/create-bookings-from-payment", () => ({
  CreateBookingsError: class extends Error {
    constructor(
      message: string,
      public status = 500,
    ) {
      super(message);
    }
  },
}));

const { assertReservationPaidWithStripe } = await import("./reservation-payment-check");

let intent: Record<string, unknown>;
const stripe = { paymentIntents: { retrieve: vi.fn(async () => intent) } } as any;

const reject = (id: string, status: number, message: RegExp) =>
  expect(assertReservationPaidWithStripe(stripe, id)).rejects.toMatchObject({
    status,
    message: expect.stringMatching(message),
  });

beforeEach(() => {
  store.clear();
  updates.length = 0;
  store.set("pay1", { payment: { stripeIntentId: "pi_1", amount: 250, status: "reserve_pending" } });
  intent = { status: "succeeded", currency: "gbp", amount_received: 25000 };
});

describe("assertReservationPaidWithStripe", () => {
  it("passes a succeeded intent for the right amount and marks the doc paid", async () => {
    await assertReservationPaidWithStripe(stripe, "pay1", { markStatus: "reserve_paid" });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1");
    expect(updates).toEqual([
      { id: "pay1", data: { "payment.status": "reserve_paid", "timestamps.updatedAt": "TS" } },
    ]);
  });

  it("does not write when markStatus is not asked for, or the doc is past pending", async () => {
    await assertReservationPaidWithStripe(stripe, "pay1");
    store.get("pay1")!.payment.status = "terms_selected";
    await assertReservationPaidWithStripe(stripe, "pay1", { markStatus: "reserve_paid" });
    expect(updates).toEqual([]);
  });

  it("rejects a status the browser wrote without a real payment", async () => {
    store.get("pay1")!.payment.status = "reserve_paid";
    intent.status = "requires_payment_method";
    await reject("pay1", 402, /not completed/);
  });

  it("rejects missing docs and docs with no intent", async () => {
    await reject("nope", 404, /not found/);
    store.set("pay2", { payment: { amount: 250, status: "reserve_paid" } });
    await reject("pay2", 409, /No card payment/);
  });

  it("rejects an amount or currency mismatch", async () => {
    intent.amount_received = 100;
    await reject("pay1", 409, /amount/);
    intent.amount_received = 25000;
    intent.currency = "eur";
    await reject("pay1", 409, /currency/);
  });

  it("rejects one payment claimed by a second reservation", async () => {
    store.set("copy", { payment: { stripeIntentId: "pi_1", amount: 250, status: "reserve_paid" } });
    await reject("copy", 409, /another reservation/);
  });
});
