import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin-db";
import type { PublicSaleAvailability, SaleEvent, SaleInventory } from "@/types/sale-events";
import { MAX_PARTY_SIZE, MAX_SLOTS, effectiveStatus, isSaleOpen, publicState, salePriceFor } from "./slots";
import { SaleError } from "./holds";
import {
  SALE_COL,
  inventoryRef,
  saleRef,
  serializeInventory,
  serializeSale,
  storedSlotsWithMs,
  toMs,
  tsFromMs,
  type StoredSlot,
} from "./store";

// ---------------------------------------------------------------------------
// Admin input
// ---------------------------------------------------------------------------

const isoOrNull = z.string().datetime({ offset: true }).nullable();

/**
 * A sale tour is just a link to a tour package plus its discount ladder. Name,
 * slug, cover and original price come from the tour itself (see tourFacts);
 * any of those sent by the client are ignored.
 */
export const SaleTourInput = z.object({
  tourPackageId: z.string().min(1).max(128).regex(/^[^/]+$/),
  tourSlug: z.string().max(200).optional(),
  displayName: z.string().max(200).optional(),
  tourName: z.string().max(200).optional(),
  originalPrice: z.number().nonnegative().optional(),
  coverImage: z.string().max(2000).optional(),
  order: z.number().int().nonnegative(),
  /** Discount £ per slot, slot 1 first. 1 slot = 1 person. */
  ladder: z.array(z.number().nonnegative()).min(1).max(MAX_SLOTS),
});

export interface TourFacts {
  name: string;
  slug: string;
  coverImage: string;
  /** Base original price per person (`pricing.original`). */
  originalPrice: number;
}

/** Live tour data for sale tours, keyed by tourPackages id. Missing tours are absent. */
export async function tourFacts(ids: string[]): Promise<Map<string, TourFacts>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, TourFacts>();
  if (!unique.length) return out;
  const snaps = await adminDb().getAll(...unique.map((id) => adminDb().collection("tourPackages").doc(id)));
  for (const s of snaps) {
    if (!s.exists) continue;
    out.set(s.id, {
      name: s.get("name") ?? "",
      // The www tour page and the reservation form both key on `slug`.
      slug: s.get("slug") || "",
      coverImage: s.get("media.coverImage") ?? "",
      originalPrice: Number(s.get("pricing.original")) || 0,
    });
  }
  return out;
}

export const SaleInput = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  status: z.enum(["draft", "live", "paused", "ended"]),
  startAt: isoOrNull,
  endAt: isoOrNull,
  holdMinutes: z.number().int().min(1).max(60),
  checkoutMode: z.enum(["auto", "manual"]),
  hero: z.object({
    title: z.string().max(120),
    subtitle: z.string().max(400),
    bannerUrl: z.string().max(2000).optional(),
    mobileBannerUrl: z.string().max(2000).optional(),
  }),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(200).optional(),
      ogImage: z.string().max(2000).optional(),
    })
    .default({}),
  tours: z.array(SaleTourInput).max(60),
});
export type SaleInputT = z.infer<typeof SaleInput>;

export interface SaleWithInventory extends SaleEvent {
  inventory: Record<string, SaleInventory>;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSales(): Promise<SaleWithInventory[]> {
  const snap = await adminDb().collection(SALE_COL.events).orderBy("createdAt", "desc").get();
  return Promise.all(snap.docs.map((d) => getSale(d.id) as Promise<SaleWithInventory>));
}

/**
 * A sale with live tour data: names, slugs, covers and original prices come
 * from the tour packages now, and every unsold slot is re-priced from the
 * tour's current price. Sold slots keep the price they sold at.
 */
export async function getSale(saleId: string): Promise<SaleWithInventory | null> {
  const s = await saleRef(saleId).get();
  if (!s.exists) return null;
  const inv = await saleRef(saleId).collection(SALE_COL.inventory).get();
  const sale = serializeSale(s);
  const facts = await tourFacts(sale.tours.map((t) => t.tourPackageId));
  const tours = sale.tours.map((t) => {
    const f = facts.get(t.tourPackageId);
    return f
      ? { ...t, tourName: f.name, displayName: f.name, tourSlug: f.slug, coverImage: f.coverImage || t.coverImage, originalPrice: f.originalPrice }
      : t;
  });
  const priceOf = new Map(tours.map((t) => [t.tourPackageId, t.originalPrice]));
  const inventory = Object.fromEntries(
    inv.docs.map((d) => {
      const i = serializeInventory(d);
      const base = priceOf.get(d.id);
      return [
        d.id,
        base === undefined
          ? i
          : { ...i, slots: i.slots.map((sl) => (sl.status === "sold" ? sl : { ...sl, salePrice: salePriceFor(base, sl.discountGBP) })) },
      ];
    }),
  );
  return { ...sale, tours, inventory };
}

export async function getSaleIdBySlug(slug: string): Promise<string | null> {
  const q = await adminDb().collection(SALE_COL.events).where("slug", "==", slug).limit(1).get();
  return q.empty ? null : q.docs[0].id;
}

/** Public availability: slot states and prices only, never holder data. */
export async function getPublicAvailability(saleId: string): Promise<PublicSaleAvailability | null> {
  const sale = await getSale(saleId);
  if (!sale) return null;
  const now = Date.now();
  return {
    saleId,
    status: sale.status,
    isOpen: isSaleOpen({ status: sale.status, startAtMs: toMs(sale.startAt), endAtMs: toMs(sale.endAt) }, now),
    serverNow: new Date(now).toISOString(),
    tours: sale.tours.map((t) => {
      const slots = (sale.inventory[t.tourPackageId]?.slots ?? []).map((s) => ({ ...s, heldUntilMs: toMs(s.heldUntil) }));
      const pub = slots.map((s) => ({
        index: s.index,
        salePrice: s.salePrice,
        discountGBP: s.discountGBP,
        state: publicState(s, now),
      }));
      const free = pub.filter((s) => s.state === "available");
      return {
        tourPackageId: t.tourPackageId,
        slots: pub,
        left: free.length,
        onHold: pub.filter((s) => s.state === "on_hold").length,
        nextPrice: free[0]?.salePrice ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function saveSale(saleId: string | null, input: SaleInputT, uid: string): Promise<string> {
  const db = adminDb();
  const clash = await getSaleIdBySlug(input.slug);
  if (clash && clash !== saleId) throw new SaleError(409, "slug_taken");

  const ref = saleId ? saleRef(saleId) : db.collection(SALE_COL.events).doc();
  const existing = saleId ? await ref.get() : null;
  if (saleId && !existing?.exists) throw new SaleError(404, "sale_not_found");

  // Each sale tour must be a real tour; its data is copied from it (and read live on display).
  const facts = await tourFacts(input.tours.map((t) => t.tourPackageId));
  const missing = input.tours.find((t) => !facts.has(t.tourPackageId));
  if (missing) throw new SaleError(400, "tour_not_found", { tourPackageId: missing.tourPackageId });
  const tours = input.tours.map((t) => {
    const f = facts.get(t.tourPackageId)!;
    return {
      tourPackageId: t.tourPackageId,
      tourSlug: f.slug,
      displayName: f.name,
      tourName: f.name,
      originalPrice: f.originalPrice,
      ...(f.coverImage ? { coverImage: f.coverImage } : {}),
      order: t.order,
    };
  });
  const hero = Object.fromEntries(Object.entries(input.hero).filter(([, v]) => v !== "" && v !== undefined));
  const fields = {
    slug: input.slug,
    name: input.name,
    status: input.status,
    startAt: input.startAt ? tsFromMs(Date.parse(input.startAt)) : null,
    endAt: input.endAt ? tsFromMs(Date.parse(input.endAt)) : null,
    holdMinutes: input.holdMinutes,
    checkoutMode: input.checkoutMode,
    seo: Object.fromEntries(Object.entries(input.seo).filter(([, v]) => typeof v === "string" && v.trim() !== "")),
    hero,
    tours,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
    ...(existing?.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: uid }),
    // Preview links keep working across saves; only a sale without one gets a token.
    ...(existing?.get("previewToken") ? {} : { previewToken: randomBytes(18).toString("base64url") }),
  };
  // mergeFields replaces each listed field whole (a nested merge would keep a removed banner).
  await ref.set(fields, { mergeFields: Object.keys(fields) });

  for (const t of input.tours) {
    await syncLadder(ref.id, t.tourPackageId, facts.get(t.tourPackageId)!.originalPrice, t.ladder);
  }

  // A tour dropped from the sale keeps its inventory only if something was sold or is held.
  const keep = new Set(input.tours.map((t) => t.tourPackageId));
  const invDocs = await ref.collection(SALE_COL.inventory).get();
  for (const d of invDocs.docs) {
    if (keep.has(d.id)) continue;
    const busy = storedSlotsWithMs(d.get("slots")).some((s) => effectiveStatus(s, Date.now()) !== "available");
    if (busy) throw new SaleError(409, "tour_has_active_slots", { tourPackageId: d.id });
    await d.ref.delete();
  }
  return ref.id;
}

/**
 * Applies a new discount ladder to a tour's inventory without touching slot
 * state: held and sold slots keep their price snapshot (the hold already
 * captured it), and only free trailing slots can be removed.
 */
async function syncLadder(saleId: string, tourPackageId: string, originalPrice: number, ladder: number[]) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const iRef = inventoryRef(saleId, tourPackageId);
    const inv = await tx.get(iRef);
    const now = Date.now();
    const current = storedSlotsWithMs(inv.get("slots"));
    const next: StoredSlot[] = [];
    ladder.forEach((discountGBP, i) => {
      const index = i + 1;
      const existing = current.find((s) => s.index === index);
      const priced = { discountGBP, salePrice: salePriceFor(originalPrice, discountGBP) };
      if (!existing) {
        next.push({ index, ...priced, status: "available" });
        return;
      }
      const { heldUntilMs: _ms, ...stored } = existing;
      // Only repricing a slot nobody has: a hold keeps the price it was shown.
      next.push(effectiveStatus(existing, now) === "available" ? { ...stored, ...priced } : stored);
    });
    for (const s of current) {
      if (s.index > ladder.length && effectiveStatus(s, now) !== "available") {
        throw new SaleError(409, "slot_in_use", { tourPackageId, index: s.index });
      }
    }
    tx.set(iRef, { slots: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

export async function deleteSale(saleId: string) {
  const ref = saleRef(saleId);
  const inv = await ref.collection(SALE_COL.inventory).get();
  const now = Date.now();
  for (const d of inv.docs) {
    if (storedSlotsWithMs(d.get("slots")).some((s) => effectiveStatus(s, now) !== "available")) {
      throw new SaleError(409, "sale_has_active_slots");
    }
  }
  for (const d of inv.docs) await d.ref.delete();
  await ref.delete();
}

export { MAX_PARTY_SIZE, MAX_SLOTS };
