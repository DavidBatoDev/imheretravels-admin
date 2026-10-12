import "server-only";

import {
  FieldValue,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type SetOptions,
  type WhereFilterOp,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";

/**
 * The subset of the `firebase/firestore` modular API that the booking routes
 * use, backed by firebase-admin.
 *
 * Phase 0 (portal/docs/06-phase0-admin-lockdown.md): API routes used the
 * browser SDK on the server with no signed-in user, so they only worked while
 * Firestore rules were open to everyone. Switching a route's imports from
 * `@/lib/firebase` + `firebase/firestore` to this module moves it to
 * firebase-admin without rewriting its logic.
 *
 * Differences from the browser SDK that matter to callers:
 * - Admin access bypasses security rules: authorise the caller first.
 * - `Timestamp` is firebase-admin's class. Write only this one: a browser-SDK
 *   Timestamp handed to firebase-admin is rejected as a custom object.
 */

export { Timestamp };
export type { DocumentData };

/** Stand-in for the browser `db` handle; the real instance is adminDb(). */
export const db = Object.freeze({ kind: "server-firestore" as const });
type Db = typeof db;

type Ref = DocumentReference<DocumentData>;
type CollRef = CollectionReference<DocumentData>;

/**
 * A document snapshot with the browser SDK's shape: `exists()` is a method
 * and, as there, a type guard that makes `data()` defined.
 */
export interface ServerDocSnapshot {
  id: string;
  ref: Ref;
  exists(): this is ServerQueryDocSnapshot;
  data(): DocumentData | undefined;
  get(fieldPath: string): unknown;
}

/** A snapshot known to exist (query results, or after `exists()`). */
export interface ServerQueryDocSnapshot extends ServerDocSnapshot {
  data(): DocumentData;
}

export interface ServerQuerySnapshot {
  docs: ServerQueryDocSnapshot[];
  empty: boolean;
  size: number;
  forEach(callback: (doc: ServerQueryDocSnapshot) => void): void;
}

function wrap(snap: DocumentSnapshot<DocumentData>): ServerQueryDocSnapshot {
  return {
    id: snap.id,
    ref: snap.ref,
    exists(): this is ServerQueryDocSnapshot {
      return snap.exists;
    },
    // Only typed as defined; callers check exists() first, as with the browser SDK.
    data: () => snap.data() as DocumentData,
    get: (fieldPath) => snap.get(fieldPath),
  };
}

const joinPath = (path: string, segments: string[]) =>
  [path, ...segments].join("/");

export function collection(_db: Db, path: string, ...segments: string[]): CollRef {
  return adminDb().collection(joinPath(path, segments));
}

/**
 * `doc(db, "col", "id")`, `doc(collectionRef)` (new auto-id) or
 * `doc(collectionRef, "id")`, as in the browser SDK.
 */
export function doc(parent: Db | CollRef, path?: string, ...segments: string[]): Ref {
  if (parent === db) {
    if (!path) throw new Error("server-firestore: doc(db) needs a path");
    return adminDb().doc(joinPath(path, segments));
  }
  const coll = parent as CollRef;
  return path ? coll.doc(joinPath(path, segments)) : coll.doc();
}

export async function getDoc(ref: Ref): Promise<ServerDocSnapshot> {
  return wrap(await ref.get());
}

export async function getDocs(q: Query<DocumentData>): Promise<ServerQuerySnapshot> {
  const snap = await q.get();
  const docs = snap.docs.map(wrap);
  return {
    docs,
    empty: snap.empty,
    size: snap.size,
    forEach: (callback) => docs.forEach(callback),
  };
}

export async function setDoc(ref: Ref, data: DocumentData, options?: SetOptions): Promise<void> {
  await (options ? ref.set(data, options) : ref.set(data));
}

export async function updateDoc(ref: Ref, data: DocumentData): Promise<void> {
  await ref.update(data);
}

export async function addDoc(coll: CollRef, data: DocumentData): Promise<Ref> {
  return coll.add(data);
}

export async function deleteDoc(ref: Ref): Promise<void> {
  await ref.delete();
}

// Query constraints are plain descriptions, applied in order by query().
type Constraint =
  | { type: "where"; field: string; op: WhereFilterOp; value: unknown }
  | { type: "orderBy"; field: string; direction: "asc" | "desc" }
  | { type: "limit"; n: number };

export const where = (field: string, op: WhereFilterOp, value: unknown): Constraint => ({
  type: "where",
  field,
  op,
  value,
});

export const orderBy = (field: string, direction: "asc" | "desc" = "asc"): Constraint => ({
  type: "orderBy",
  field,
  direction,
});

export const limit = (n: number): Constraint => ({ type: "limit", n });

export function query(base: Query<DocumentData>, ...constraints: Constraint[]): Query<DocumentData> {
  return constraints.reduce<Query<DocumentData>>((q, c) => {
    if (c.type === "where") return q.where(c.field, c.op, c.value);
    if (c.type === "orderBy") return q.orderBy(c.field, c.direction);
    return q.limit(c.n);
  }, base);
}

export const serverTimestamp = () => FieldValue.serverTimestamp();
export const deleteField = () => FieldValue.delete();
export const increment = (n: number) => FieldValue.increment(n);
export const arrayUnion = (...elements: unknown[]) => FieldValue.arrayUnion(...elements);
