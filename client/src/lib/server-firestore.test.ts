import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Fake firebase-admin Firestore that records what the facade asks for.
const calls: string[] = [];
const fakeQuery = (label: string): any => ({
  label,
  where: (f: string, op: string, v: unknown) => fakeQuery(`${label}.where(${f} ${op} ${JSON.stringify(v)})`),
  orderBy: (f: string, d: string) => fakeQuery(`${label}.orderBy(${f} ${d})`),
  limit: (n: number) => fakeQuery(`${label}.limit(${n})`),
  get: async () => ({ docs: [snap("a", { x: 1 }), snap("b", { x: 2 })], empty: false, size: 2 }),
});
const snap = (id: string, data: Record<string, unknown> | undefined) => ({
  id,
  ref: { path: `c/${id}` },
  exists: data !== undefined,
  data: () => data,
  get: (f: string) => data?.[f],
});
const fakeDb = {
  collection: (path: string) => ({
    ...fakeQuery(`collection(${path})`),
    path,
    doc: (id?: string) => ({ path: id ? `${path}/${id}` : `${path}/AUTO` }),
    add: async (data: unknown) => {
      calls.push(`add(${path}) ${JSON.stringify(data)}`);
      return { path: `${path}/NEW` };
    },
  }),
  doc: (path: string) => ({
    path,
    get: async () => snap(path.split("/").pop()!, path.endsWith("missing") ? undefined : { ok: true }),
    set: async (d: unknown, o?: unknown) => calls.push(`set(${path}) ${JSON.stringify(d)} ${JSON.stringify(o ?? null)}`),
    update: async (d: unknown) => calls.push(`update(${path}) ${JSON.stringify(d)}`),
  }),
};
vi.mock("@/lib/firebase-admin-db", () => ({ adminDb: () => fakeDb }));

import {
  addDoc,
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "@/lib/server-firestore";

describe("server-firestore (browser-SDK shape over firebase-admin)", () => {
  it("builds document refs the three ways the browser SDK allows", () => {
    expect((doc(db, "bookings", "b1") as any).path).toBe("bookings/b1");
    expect((doc(db, "bookings/b1/notes", "n1") as any).path).toBe("bookings/b1/notes/n1");
    const coll = collection(db, "stripePayments");
    expect((doc(coll) as any).path).toBe("stripePayments/AUTO");
    expect((doc(coll, "p1") as any).path).toBe("stripePayments/p1");
  });

  it("applies query constraints in order", () => {
    const q = query(
      collection(db, "stripePayments"),
      where("customer.email", "==", "a@b.c"),
      where("payment.status", "in", ["pending"]),
      orderBy("timestamps.createdAt", "desc"),
      limit(1),
    );
    expect((q as any).label).toBe(
      'collection(stripePayments).where(customer.email == "a@b.c").where(payment.status in ["pending"]).orderBy(timestamps.createdAt desc).limit(1)',
    );
  });

  it("gives snapshots a callable exists() like the browser SDK", async () => {
    const found = await getDoc(doc(db, "bookings", "b1"));
    expect(found.exists()).toBe(true);
    expect(found.data()).toEqual({ ok: true });
    const missing = await getDoc(doc(db, "bookings", "missing"));
    expect(missing.exists()).toBe(false);

    const all = await getDocs(collection(db, "bookings"));
    expect(all.size).toBe(2);
    expect(all.docs.map((d) => d.id)).toEqual(["a", "b"]);
    const seen: string[] = [];
    all.forEach((d) => seen.push(`${d.id}:${d.data().x}`));
    expect(seen).toEqual(["a:1", "b:2"]);
  });

  it("passes writes through, keeping merge options", async () => {
    calls.length = 0;
    await setDoc(doc(db, "stripePayments", "p1"), { id: "p1" }, { merge: true });
    await setDoc(doc(db, "stripePayments", "p2"), { id: "p2" });
    await updateDoc(doc(db, "bookings", "b1"), { "paymentTokens.p1.status": "success" });
    const ref = await addDoc(collection(db, "bookings"), { a: 1 });
    expect(calls).toEqual([
      'set(stripePayments/p1) {"id":"p1"} {"merge":true}',
      'set(stripePayments/p2) {"id":"p2"} null',
      'update(bookings/b1) {"paymentTokens.p1.status":"success"}',
      'add(bookings) {"a":1}',
    ]);
    expect((ref as any).path).toBe("bookings/NEW");
  });
});
