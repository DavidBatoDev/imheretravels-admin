import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Firestore stand-in, keyed by `${collection}/${id}`.
const store = new Map<string, Record<string, any>>();
const addedDocs: Array<{ collectionPath: string; data: Record<string, any> }> =
  [];
let autoId = 0;

const createSession = vi.fn(async (_params: any) => ({
  id: "cs_test_123",
  url: "https://checkout.stripe.com/c/pay/cs_test_123",
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: createSession } };
  },
}));

vi.mock("@/lib/firebase", () => ({ db: { __fake: true } }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, collectionPath: string) => ({ collectionPath }),
  doc: (_db: unknown, collectionPath: string, id: string) => ({
    path: `${collectionPath}/${id}`,
    id,
  }),
  query: (ref: any, ...constraints: any[]) => ({
    collectionPath: ref.collectionPath,
    constraints: constraints.filter((c) => c.op),
  }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  limit: () => ({}),
  getDocs: async (q: { collectionPath: string; constraints: any[] }) => {
    const get = (data: any, field: string) =>
      field.split(".").reduce((o, k) => o?.[k], data);
    const docs = [...store.entries()]
      .filter(([path]) => path.startsWith(`${q.collectionPath}/`))
      .filter(([, data]) =>
        q.constraints.every((c) => get(data, c.field) === c.value),
      )
      .map(([path, data]) => ({ id: path.split("/")[1], data: () => data }));
    return { empty: docs.length === 0, size: docs.length, docs };
  },
  addDoc: async (ref: { collectionPath: string }, data: any) => {
    const id = `auto-${++autoId}`;
    store.set(`${ref.collectionPath}/${id}`, data);
    addedDocs.push({ collectionPath: ref.collectionPath, data });
    return { id };
  },
  updateDoc: async (ref: { path: string }, updates: any) => {
    store.set(ref.path, { ...(store.get(ref.path) || {}), ...updates });
  },
  serverTimestamp: () => "SERVER_TIMESTAMP",
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
}));

const { POST } = await import("./route");

const ACCESS_TOKEN = "token-ciara";

/** Mirrors the fields of Ciara Murphy's prod booking that the route reads. */
function seedBooking(overrides: Record<string, any> = {}) {
  store.set("bookings/r1Yiq0DwBWtAIyLzMxrI", {
    access_token: ACCESS_TOKEN,
    bookingId: "SB-IHF-Dev-20270319-CM001",
    firstName: "Ciara",
    lastName: "Murphy",
    emailAddress: " ciara.murphy.henze@gmail.com",
    tourPackageName: "India Holi Festival Tour",
    p1DueDate: "2026-10-15",
    p1Amount: 524.5,
    p1DatePaid: null,
    ...overrides,
  });
}

function request(installment_id = "p1") {
  return new Request("http://localhost/api/installments/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: ACCESS_TOKEN, installment_id }),
  }) as any;
}

const stripePaymentDocs = () =>
  addedDocs.filter((d) => d.collectionPath === "stripePayments");

beforeEach(() => {
  store.clear();
  addedDocs.length = 0;
  autoId = 0;
  createSession.mockClear();
});

describe("POST /api/installments/create-checkout — customer email", () => {
  it("trims a leading space before sending the email to Stripe", async () => {
    seedBooking();

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checkout_url).toContain("checkout.stripe.com");
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0][0].customer_email).toBe(
      "ciara.murphy.henze@gmail.com",
    );
    expect(stripePaymentDocs()[0].data.customer.email).toBe(
      "ciara.murphy.henze@gmail.com",
    );
    // Amount is untouched by the email change.
    expect(
      createSession.mock.calls[0][0].line_items[0].price_data.unit_amount,
    ).toBe(52450);
  });

  it("handles trailing whitespace and zero-width characters", async () => {
    seedBooking({ emailAddress: "​ciara.murphy.henze@gmail.com  " });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(createSession.mock.calls[0][0].customer_email).toBe(
      "ciara.murphy.henze@gmail.com",
    );
  });

  it("passes a clean address through unchanged", async () => {
    seedBooking({ emailAddress: "Jane.Doe@Example.com" });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(createSession.mock.calls[0][0].customer_email).toBe(
      "Jane.Doe@Example.com",
    );
  });

  it("falls back to the legacy `email` field when emailAddress is blank", async () => {
    seedBooking({ emailAddress: "   ", email: " legacy@example.com" });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(createSession.mock.calls[0][0].customer_email).toBe(
      "legacy@example.com",
    );
  });

  it.each([
    ["missing", undefined],
    ["whitespace only", "   "],
    ["no @", "ciara.gmail.com"],
    ["no domain dot", "ciara@gmail"],
    ["space inside", "ciara murphy@gmail.com"],
  ])(
    "rejects an invalid address (%s) before writing anything or calling Stripe",
    async (_label, emailAddress) => {
      seedBooking({ emailAddress });

      const res = await POST(request());
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toMatch(/email address on your booking/i);
      expect(createSession).not.toHaveBeenCalled();
      expect(stripePaymentDocs()).toHaveLength(0);
      expect(
        store.get("bookings/r1Yiq0DwBWtAIyLzMxrI")?.paymentTokens,
      ).toBeUndefined();
    },
  );
});
