import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updates: Array<{ path: string; payload: Record<string, any> }> = [];

vi.mock("@/lib/firebase", () => ({ db: { __fake: true } }));
vi.mock("@/store/auth-store", () => ({
  useAuthStore: { getState: () => ({ user: null, userProfile: null }) },
}));
vi.mock("./booking-version-history-service", () => ({
  bookingVersionHistoryService: { createVersionSnapshot: vi.fn() },
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collectionPath: string, id: string) => ({
    path: `${collectionPath}/${id}`,
  }),
  getDoc: async () => ({ exists: () => true, data: () => ({}) }),
  serverTimestamp: () => "SERVER_TIMESTAMP",
  writeBatch: () => {
    const pending: typeof updates = [];
    return {
      update: (ref: { path: string }, payload: any) =>
        pending.push({ path: ref.path, payload }),
      set: (ref: { path: string }, payload: any) =>
        pending.push({ path: ref.path, payload }),
      commit: async () => {
        updates.push(...pending);
      },
    };
  },
}));

const { batchedWriter } = await import("./batched-writer");

beforeEach(() => {
  updates.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("batchedWriter email normalisation", () => {
  it("trims a pasted email before it is written to the booking", async () => {
    batchedWriter.queueFieldUpdate(
      "r1Yiq0DwBWtAIyLzMxrI",
      "emailAddress",
      " ciara.murphy.henze@gmail.com",
    );
    await batchedWriter.flush();

    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("bookings/r1Yiq0DwBWtAIyLzMxrI");
    expect(updates[0].payload.emailAddress).toBe(
      "ciara.murphy.henze@gmail.com",
    );
  });

  it("leaves other fields exactly as given", async () => {
    batchedWriter.queueFieldUpdate("b1", "firstName", " Ciara ");
    batchedWriter.queueFieldUpdate("b1", "p1Amount", 524.5);
    batchedWriter.queueFieldUpdate("b1", "emailAddress", "");
    await batchedWriter.flush();

    expect(updates[0].payload).toMatchObject({
      firstName: " Ciara ",
      p1Amount: 524.5,
      emailAddress: "",
    });
  });
});
