import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: { __fake: true } }));

// Captured onSnapshot callbacks so tests can push snapshots.
type Listener = {
  next: (snap: unknown) => void;
  error: (err: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};
const listeners: Listener[] = [];

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((q) => q),
  onSnapshot: vi.fn((_q, _opts, next, error) => {
    const unsubscribe = vi.fn();
    listeners.push({ next, error, unsubscribe });
    return unsubscribe;
  }),
}));

function snapshot(
  docs: Array<{ id: string; row?: number }>,
  { fromCache = false, changes = docs.length } = {},
) {
  return {
    metadata: { fromCache },
    docChanges: () => new Array(changes).fill({}),
    docs: docs.map((d) => ({ id: d.id, data: () => ({ row: d.row }) })),
  };
}

async function loadStore() {
  vi.resetModules();
  listeners.length = 0;
  return import("./use-bookings-store");
}

describe("bookings store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens one Firestore listener for many subscribers", async () => {
    const store = await loadStore();
    const a = store.subscribeToBookings(() => {});
    const b = store.subscribeToBookings(() => {});
    expect(listeners).toHaveLength(1);
    a();
    b();
  });

  it("getBookingsOnce ignores cached data and waits for the server", async () => {
    const store = await loadStore();
    const promise = store.getBookingsOnce();
    let resolved: unknown = null;
    promise.then((v) => (resolved = v));

    listeners[0].next(snapshot([{ id: "stale" }], { fromCache: true }));
    await Promise.resolve();
    expect(resolved).toBeNull();

    // Server confirms with identical data: metadata-only event
    listeners[0].next(snapshot([{ id: "stale" }], { changes: 0 }));
    await expect(promise).resolves.toEqual([{ id: "stale", row: undefined }]);
  });

  it("keeps the listener for a grace period, then marks data unsynced", async () => {
    const store = await loadStore();
    const unsub = store.subscribeToBookings(() => {});
    listeners[0].next(snapshot([{ id: "a" }]));
    unsub();

    vi.advanceTimersByTime(30_000);
    const again = store.subscribeToBookings(() => {});
    expect(listeners).toHaveLength(1); // reused, not reopened
    again();

    vi.advanceTimersByTime(60_000);
    expect(listeners[0].unsubscribe).toHaveBeenCalledTimes(1);

    // Leftover data must not satisfy a one-shot read
    let resolved = false;
    const promise = store.getBookingsOnce().then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(listeners).toHaveLength(2);
    listeners[1].next(snapshot([{ id: "fresh" }]));
    await promise;
    expect(resolved).toBe(true);
  });

  it("skips metadata-only events that change nothing", async () => {
    const store = await loadStore();
    const onChange = vi.fn();
    store.subscribeToBookings(onChange);
    listeners[0].next(snapshot([{ id: "a" }]));
    const calls = onChange.mock.calls.length;
    listeners[0].next(snapshot([{ id: "a" }], { changes: 0 }));
    expect(onChange.mock.calls.length).toBe(calls);
  });

  it("retries after an error without replaying the old error", async () => {
    const store = await loadStore();
    const first = store.getBookingsOnce();
    listeners[0].error(new Error("boom"));
    await expect(first).rejects.toThrow("boom");

    const second = store.getBookingsOnce();
    expect(listeners).toHaveLength(2);
    listeners[1].next(snapshot([{ id: "a" }]));
    await expect(second).resolves.toHaveLength(1);
  });

  it("getBookingsOnce rejects when the server is unreachable", async () => {
    const store = await loadStore();
    const promise = store.getBookingsOnce();
    // Offline: only cached snapshots ever arrive
    listeners[0].next(snapshot([{ id: "a" }], { fromCache: true }));
    vi.advanceTimersByTime(15_000);
    await expect(promise).rejects.toThrow("Timed out");
  });

  it("a new listener's first snapshot replaces leftover data, even if empty", async () => {
    const store = await loadStore();
    const unsub = store.subscribeToBookings(() => {});
    listeners[0].next(snapshot([{ id: "a" }, { id: "b" }]));
    unsub();
    vi.advanceTimersByTime(60_000);

    const promise = store.getBookingsOnce();
    listeners[1].next(snapshot([], { changes: 0 }));
    await expect(promise).resolves.toEqual([]);
  });
});
