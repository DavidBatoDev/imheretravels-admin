import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Timestamp, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import type { SaleEvent, SaleInventory, SaleSlot } from "@/types/sale-events";

/**
 * Sale collections are written only through firebase-admin (they are denied
 * to clients in firestore.rules), so slot counts can't be edited from a
 * browser.
 */
export const SALE_COL = {
  events: "saleEvents",
  inventory: "inventory", // subcollection of saleEvents, one doc per tour
  holds: "saleHolds",
  rateLimits: "saleRateLimits",
} as const;

export const saleRef = (saleId: string) => adminDb().collection(SALE_COL.events).doc(saleId);
export const inventoryRef = (saleId: string, tourPackageId: string) =>
  saleRef(saleId).collection(SALE_COL.inventory).doc(tourPackageId);
export const holdRef = (holdId: string) => adminDb().collection(SALE_COL.holds).doc(holdId);

export function toMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof v === "object" && v && "toMillis" in v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  return null;
}

export const toIso = (v: unknown): string | null => {
  const ms = toMs(v);
  return ms === null ? null : new Date(ms).toISOString();
};

export const tsFromMs = (ms: number) => Timestamp.fromMillis(ms);

/** Raw slot as stored: timestamps are Firestore Timestamps. */
export type StoredSlot = Omit<SaleSlot, "heldUntil" | "soldAt"> & {
  heldUntil?: Timestamp | null;
  soldAt?: Timestamp | null;
};

export function storedSlotsWithMs(slots: StoredSlot[] | undefined) {
  return (slots ?? []).map((s) => ({ ...s, heldUntilMs: toMs(s.heldUntil) }));
}

export function serializeSale(snap: DocumentSnapshot<DocumentData>): SaleEvent {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    slug: d.slug ?? "",
    name: d.name ?? "",
    status: d.status ?? "draft",
    startAt: toIso(d.startAt),
    endAt: toIso(d.endAt),
    holdMinutes: d.holdMinutes ?? 15,
    checkoutMode: d.checkoutMode ?? "auto",
    hero: { title: "", subtitle: "", ...(d.hero ?? {}) },
    seo: { ...(d.seo ?? {}) },
    redirectSlugs: d.redirectSlugs ?? [],
    fallbackUrl: d.fallbackUrl ?? "",
    previewToken: d.previewToken ?? "",
    tours: (d.tours ?? []).slice().sort((a: { order: number }, b: { order: number }) => a.order - b.order),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

export function serializeInventory(snap: DocumentSnapshot<DocumentData>): SaleInventory {
  const d = snap.data() ?? {};
  return {
    tourPackageId: snap.id,
    slots: ((d.slots ?? []) as StoredSlot[])
      .map((s) => ({ ...s, heldUntil: toIso(s.heldUntil), soldAt: toIso(s.soldAt) }))
      .sort((a, b) => a.index - b.index),
    updatedAt: toIso(d.updatedAt),
  };
}

// Hold tokens: the customer's link carries `<holdId>.<token>`; only a hash is stored.
export function newHoldToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, tokenHash: string | undefined): boolean {
  if (!tokenHash || !token) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(tokenHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Splits the `hold` URL param `<holdId>.<token>`. */
export function parseHoldParam(param: string | null | undefined): { holdId: string; token: string } | null {
  if (!param) return null;
  const dot = param.indexOf(".");
  if (dot <= 0) return null;
  const holdId = param.slice(0, dot);
  const token = param.slice(dot + 1);
  if (!/^[A-Za-z0-9]{10,40}$/.test(holdId) || !token) return null;
  return { holdId, token };
}
