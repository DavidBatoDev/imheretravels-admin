import "server-only";

import Stripe from "stripe";
import { FieldValue, type DocumentReference, type Timestamp, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import type { HoldStatus, SaleHoldView, SlotStatus } from "@/types/sale-events";
import {
  HOLD_GRACE_MS,
  MAX_PARTY_SIZE,
  PAYING_EXTENSION_MS,
  effectiveStatus,
  isSaleOpen,
  pickSlots,
  salePriceFor,
} from "./slots";
import { tourPriceInfo } from "./pricing";
import {
  SALE_COL,
  holdRef,
  inventoryRef,
  newHoldToken,
  saleRef,
  storedSlotsWithMs,
  toIso,
  toMs,
  tokenMatches,
  tsFromMs,
  type StoredSlot,
} from "./store";

/**
 * Slot holds. Every state change runs in a firebase-admin transaction on the
 * tour's inventory doc. Server-side Firestore transactions lock the documents
 * they read, so two claims for the last slot are serialized: exactly one wins.
 *
 * Expiry is lazy: a held slot past `heldUntil` counts as free (see slots.ts),
 * and the next claim takes it and cancels the old hold's PaymentIntent. No
 * cron is needed for correctness.
 */

export class SaleError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

type SlotWithMs = StoredSlot & { heldUntilMs: number | null };

interface StoredHold {
  saleId: string;
  saleName: string;
  saleSlug: string;
  checkoutMode: "auto" | "manual";
  tourPackageId: string;
  tourSlug: string;
  tourName: string;
  displayName: string;
  partySize: number;
  slotIndexes: number[];
  slots: { index: number; salePrice: number; originalPrice: number; discountGBP?: number }[];
  email: string;
  tokenHash: string;
  status: HoldStatus;
  displayExpiresAt: Timestamp;
  expiresAt: Timestamp;
  payingAt?: Timestamp | null;
  paymentDocId?: string | null;
  stripeIntentId?: string | null;
}

const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

/** Best effort: a cancelled intent can't be confirmed, so a stale tab can't pay. */
async function cancelIntents(intentIds: (string | null | undefined)[]) {
  for (const id of new Set(intentIds.filter(Boolean) as string[])) {
    try {
      await stripe().paymentIntents.cancel(id);
    } catch (e) {
      // Already succeeded/cancelled: the webhook's conflict path covers a late success.
      console.warn(`[sale] could not cancel intent ${id}:`, (e as Error).message);
    }
  }
}

/** Slot fields minus the runtime-only `heldUntilMs`. */
function toStored(slot: SlotWithMs): StoredSlot {
  const { heldUntilMs: _unused, ...rest } = slot;
  return rest;
}

function freed(slot: SlotWithMs): SlotWithMs {
  return {
    index: slot.index,
    discountGBP: slot.discountGBP,
    salePrice: slot.salePrice,
    paymentLinkUrl: slot.paymentLinkUrl ?? null,
    note: slot.note ?? null,
    status: "available",
    holdId: null,
    heldUntil: null,
    heldUntilMs: null,
    holderEmail: null,
    paymentDocId: null,
    stripeIntentId: null,
  };
}

function holdView(id: string, h: StoredHold, nowMs: number, paymentLinks?: Map<number, string | null>): SaleHoldView {
  const expiresMs = toMs(h.expiresAt) ?? 0;
  const status: HoldStatus = h.status === "active" && expiresMs <= nowMs ? "expired" : h.status;
  return {
    holdId: id,
    saleId: h.saleId,
    saleName: h.saleName,
    saleSlug: h.saleSlug,
    checkoutMode: h.checkoutMode,
    tourPackageId: h.tourPackageId,
    tourSlug: h.tourSlug,
    tourName: h.tourName,
    displayName: h.displayName,
    partySize: h.partySize,
    slots: h.slots.map((s) => ({ ...s, paymentLinkUrl: paymentLinks?.get(s.index) ?? null })),
    status,
    paying: !!h.payingAt,
    displayExpiresAt: toIso(h.displayExpiresAt)!,
    expiresAt: toIso(h.expiresAt)!,
    serverNow: new Date(nowMs).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

export interface ClaimInput {
  saleId: string;
  tourPackageId: string;
  partySize: number;
  email: string;
}

export async function claimSlots(input: ClaimInput): Promise<SaleHoldView & { token: string }> {
  const db = adminDb();
  const email = input.email.trim().toLowerCase();
  const partySize = input.partySize;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) {
    throw new SaleError(400, "invalid_party_size");
  }

  const { token, tokenHash } = newHoldToken();
  const newRef = db.collection(SALE_COL.holds).doc();
  const toCancel: (string | null | undefined)[] = [];

  const view = await db.runTransaction(async (tx) => {
    const now = Date.now();
    const sRef = saleRef(input.saleId);
    const iRef = inventoryRef(input.saleId, input.tourPackageId);
    const [saleSnap, invSnap] = await tx.getAll(sRef, iRef);
    if (!saleSnap.exists) throw new SaleError(404, "sale_not_found");
    const sale = saleSnap.data()!;
    if (!isSaleOpen({ status: sale.status, startAtMs: toMs(sale.startAt), endAtMs: toMs(sale.endAt) }, now)) {
      throw new SaleError(409, "sale_closed");
    }
    const tour = (sale.tours ?? []).find((t: { tourPackageId: string }) => t.tourPackageId === input.tourPackageId);
    if (!tour || !invSnap.exists) throw new SaleError(404, "tour_not_in_sale");
    // Prices come from the tour's current original price, not a stored copy.
    const tourSnap = await tx.get(db.collection("tourPackages").doc(input.tourPackageId));
    // "From" price until the customer picks a date; init-payment re-prices on the date.
    const basePrice = tourPriceInfo(
      Number(tourSnap.get("pricing.original")) || Number(tour.originalPrice) || 0,
      tourSnap.get("travelDates"),
    ).fromPrice;
    const tourName: string = tourSnap.get("name") || tour.tourName || "";
    const tourSlug: string = tourSnap.get("slug") || tour.tourSlug || "";

    // One active hold per email: an earlier hold is released (or refused if mid-payment).
    const mine = await tx.get(
      db.collection(SALE_COL.holds).where("email", "==", email).where("status", "==", "active"),
    );
    const live = mine.docs.filter((d) => (toMs(d.get("expiresAt")) ?? 0) > now);
    if (live.some((d) => d.get("payingAt"))) throw new SaleError(409, "hold_in_payment");

    const sameTour = live.find((d) => d.get("saleId") === input.saleId && d.get("tourPackageId") === input.tourPackageId);
    const others = live.filter((d) => d !== sameTour);
    const otherInvRefs = new Map<string, DocumentReference>();
    for (const d of others) {
      const ref = inventoryRef(d.get("saleId"), d.get("tourPackageId"));
      otherInvRefs.set(ref.path, ref);
    }
    const otherInvSnaps = otherInvRefs.size ? await tx.getAll(...otherInvRefs.values()) : [];

    // ---- all reads done; compute ----
    let slots = storedSlotsWithMs(invSnap.get("slots")) as SlotWithMs[];
    if (sameTour) slots = slots.map((s) => (s.holdId === sameTour.id && s.status !== "sold" ? freed(s) : s));

    const picked = pickSlots(slots, partySize, now);
    if (!picked) {
      const left = slots.filter((s) => effectiveStatus(s, now) === "available").length;
      throw new SaleError(409, "not_enough_slots", { left });
    }

    const holdMs = Math.max(1, Number(sale.holdMinutes) || 15) * 60_000;
    const displayUntil = now + holdMs;
    const heldUntil = displayUntil + HOLD_GRACE_MS;
    const pickedIdx = new Set(picked.map((s) => s.index));

    // Slots we take over from an expired hold: cancel that hold's intent and mark it expired.
    const reclaimedHolds = new Set<string>();
    for (const s of picked) {
      if (s.holdId) {
        reclaimedHolds.add(s.holdId);
        toCancel.push(s.stripeIntentId);
      }
    }

    const nextSlots = slots.map((s) =>
      pickedIdx.has(s.index)
        ? {
            ...freed(s),
            status: "held" as SlotStatus,
            holdId: newRef.id,
            heldUntil: tsFromMs(heldUntil),
            heldUntilMs: heldUntil,
            holderEmail: email,
          }
        : s,
    );

    // ---- writes ----
    tx.update(iRef, { slots: nextSlots.map(toStored), updatedAt: FieldValue.serverTimestamp() });

    for (const snap of otherInvSnaps) {
      const holdIds = new Set(others.map((d) => d.id));
      const cleaned = (storedSlotsWithMs(snap.get("slots")) as SlotWithMs[]).map((s) =>
        s.holdId && holdIds.has(s.holdId) && s.status !== "sold" ? freed(s) : s,
      );
      tx.update(snap.ref, { slots: cleaned.map(toStored), updatedAt: FieldValue.serverTimestamp() });
    }
    for (const d of [...others, ...(sameTour ? [sameTour] : [])]) {
      tx.update(d.ref, { status: "released", releasedReason: "new_claim_by_holder", releasedAt: FieldValue.serverTimestamp() });
      toCancel.push(d.get("stripeIntentId"));
    }
    for (const id of reclaimedHolds) {
      if (id === sameTour?.id) continue;
      tx.set(holdRef(id), { status: "expired", expiredAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const hold: StoredHold = {
      saleId: input.saleId,
      saleName: sale.name ?? "",
      saleSlug: sale.slug ?? "",
      checkoutMode: sale.checkoutMode ?? "auto",
      tourPackageId: input.tourPackageId,
      tourSlug,
      tourName,
      displayName: tourName,
      partySize,
      slotIndexes: picked.map((s) => s.index),
      slots: picked.map((s) => ({
        index: s.index,
        discountGBP: s.discountGBP,
        salePrice: salePriceFor(basePrice, s.discountGBP),
        originalPrice: basePrice,
      })),
      email,
      tokenHash,
      status: "active",
      displayExpiresAt: tsFromMs(displayUntil),
      expiresAt: tsFromMs(heldUntil),
      payingAt: null,
      paymentDocId: null,
      stripeIntentId: null,
    };
    tx.create(newRef, { ...hold, createdAt: FieldValue.serverTimestamp() });

    const links = new Map(picked.map((s) => [s.index, s.paymentLinkUrl ?? null] as const));
    return holdView(newRef.id, hold, now, links);
  }, { maxAttempts: 10 }); // launch-minute contention: retry rather than fail the claim

  await cancelIntents(toCancel);
  return { ...view, token };
}

// ---------------------------------------------------------------------------
// Read / pay / release / convert
// ---------------------------------------------------------------------------

async function loadHold(tx: Transaction, holdId: string, token: string | null) {
  const snap = await tx.get(holdRef(holdId));
  if (!snap.exists) throw new SaleError(404, "hold_not_found");
  const hold = snap.data() as StoredHold;
  if (token !== null && !tokenMatches(token, hold.tokenHash)) throw new SaleError(404, "hold_not_found");
  return { snap, hold };
}

export async function getHoldView(holdId: string, token: string): Promise<SaleHoldView> {
  const snap = await holdRef(holdId).get();
  if (!snap.exists) throw new SaleError(404, "hold_not_found");
  const hold = snap.data() as StoredHold;
  if (!tokenMatches(token, hold.tokenHash)) throw new SaleError(404, "hold_not_found");
  const inv = await inventoryRef(hold.saleId, hold.tourPackageId).get();
  const links = new Map(
    (storedSlotsWithMs(inv.get("slots")) as SlotWithMs[]).map((s) => [s.index, s.paymentLinkUrl ?? null] as const),
  );
  return holdView(snap.id, hold, Date.now(), links);
}

/** Slots still belong to this hold (nobody reclaimed them). */
function ownsSlots(slots: SlotWithMs[], holdId: string, indexes: number[]) {
  return indexes.every((i) => slots.find((s) => s.index === i)?.holdId === holdId);
}

/**
 * Called when the customer presses Pay. Moves the slots to `paying` and
 * extends the hold once, so card entry and 3-D Secure are never cut off.
 */
export async function markPaying(holdId: string, token: string): Promise<SaleHoldView> {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const { snap, hold } = await loadHold(tx, holdId, token);
    const iRef = inventoryRef(hold.saleId, hold.tourPackageId);
    const inv = await tx.get(iRef);
    if (hold.status !== "active" || (toMs(hold.expiresAt) ?? 0) <= now) throw new SaleError(410, "hold_expired");
    const slots = storedSlotsWithMs(inv.get("slots")) as SlotWithMs[];
    if (!ownsSlots(slots, holdId, hold.slotIndexes)) throw new SaleError(410, "hold_expired");

    const until = hold.payingAt ? (toMs(hold.expiresAt) as number) : Math.max(toMs(hold.expiresAt) ?? 0, now + PAYING_EXTENSION_MS);
    const next = slots.map((s) =>
      s.holdId === holdId && s.status !== "sold"
        ? { ...s, status: "paying" as SlotStatus, heldUntil: tsFromMs(until), heldUntilMs: until }
        : s,
    );
    tx.update(iRef, { slots: next.map(toStored), updatedAt: FieldValue.serverTimestamp() });
    const patch = {
      payingAt: hold.payingAt ?? tsFromMs(now),
      expiresAt: tsFromMs(until),
      displayExpiresAt: tsFromMs(until),
    };
    tx.update(snap.ref, patch);
    return holdView(holdId, { ...hold, ...patch }, now);
  });
}

/** Records the PaymentIntent on the hold and its slots (init-payment). */
export async function linkPaymentToHold(
  holdId: string,
  token: string,
  paymentDocId: string,
  intentId: string,
  pricedSlots?: StoredHold["slots"],
) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const { snap, hold } = await loadHold(tx, holdId, token);
    const iRef = inventoryRef(hold.saleId, hold.tourPackageId);
    const inv = await tx.get(iRef);
    const slots = storedSlotsWithMs(inv.get("slots")) as SlotWithMs[];
    const next = slots.map((s) => (s.holdId === holdId ? { ...s, paymentDocId, stripeIntentId: intentId } : s));
    tx.update(iRef, { slots: next.map(toStored) });
    tx.update(snap.ref, { paymentDocId, stripeIntentId: intentId, ...(pricedSlots ? { slots: pricedSlots } : {}) });
  });
}

/**
 * Validates a hold for payment: active, unexpired and still owning its slots.
 * Returns the stored hold so init-payment can price it server-side.
 */
export async function requireActiveHold(holdId: string, token: string) {
  const db = adminDb();
  const snap = await holdRef(holdId).get();
  if (!snap.exists) throw new SaleError(404, "hold_not_found");
  const hold = snap.data() as StoredHold;
  if (!tokenMatches(token, hold.tokenHash)) throw new SaleError(404, "hold_not_found");
  if (hold.status !== "active" || (toMs(hold.expiresAt) ?? 0) <= Date.now()) throw new SaleError(410, "hold_expired");
  const inv = await inventoryRef(hold.saleId, hold.tourPackageId).get();
  if (!ownsSlots(storedSlotsWithMs(inv.get("slots")) as SlotWithMs[], holdId, hold.slotIndexes)) {
    throw new SaleError(410, "hold_expired");
  }
  return hold;
}

/**
 * Frees the hold's slots. `token === null` is the admin path. Customers can't
 * release a hold that is mid-payment.
 */
export async function releaseHold(holdId: string, token: string | null, reason: string) {
  const db = adminDb();
  const intent = await db.runTransaction(async (tx) => {
    const { snap, hold } = await loadHold(tx, holdId, token);
    const iRef = inventoryRef(hold.saleId, hold.tourPackageId);
    const inv = await tx.get(iRef);
    if (hold.status !== "active") return null;
    if (token !== null && hold.payingAt) throw new SaleError(409, "hold_in_payment");
    const slots = (storedSlotsWithMs(inv.get("slots")) as SlotWithMs[]).map((s) =>
      s.holdId === holdId && s.status !== "sold" ? freed(s) : s,
    );
    tx.update(iRef, { slots: slots.map(toStored), updatedAt: FieldValue.serverTimestamp() });
    tx.update(snap.ref, { status: "released", releasedReason: reason, releasedAt: FieldValue.serverTimestamp() });
    return hold.stripeIntentId ?? null;
  });
  await cancelIntents([intent]);
}

export type ConvertResult =
  | { ok: true; hold: StoredHold & { id: string } }
  | { ok: false; reason: "hold_not_found" | "conflict"; hold?: StoredHold & { id: string } };

/**
 * Payment succeeded: mark the slots sold. Accepts a hold whose time ran out as
 * long as nobody reclaimed its slots. If they were reclaimed, the hold becomes
 * `conflict` and the caller refunds. Idempotent for webhook retries.
 */
export async function convertHold(holdId: string, paymentDocId: string, intentId: string): Promise<ConvertResult> {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const hSnap = await tx.get(holdRef(holdId));
    if (!hSnap.exists) return { ok: false, reason: "hold_not_found" } as const;
    const hold = { ...(hSnap.data() as StoredHold), id: hSnap.id };
    const iRef = inventoryRef(hold.saleId, hold.tourPackageId);
    const inv = await tx.get(iRef);
    if (hold.status === "converted") return { ok: true, hold } as const;
    if (hold.status === "conflict") return { ok: false, reason: "conflict", hold } as const;

    const slots = storedSlotsWithMs(inv.get("slots")) as SlotWithMs[];
    if (!ownsSlots(slots, holdId, hold.slotIndexes)) {
      // Free whatever this hold still has, so the slots aren't stuck.
      const cleaned = slots.map((s) => (s.holdId === holdId && s.status !== "sold" ? freed(s) : s));
      tx.update(iRef, { slots: cleaned.map(toStored), updatedAt: FieldValue.serverTimestamp() });
      tx.update(hSnap.ref, {
        status: "conflict",
        paymentDocId,
        stripeIntentId: intentId,
        conflictAt: FieldValue.serverTimestamp(),
      });
      return { ok: false, reason: "conflict", hold } as const;
    }

    const now = Date.now();
    const soldPrice = new Map(hold.slots.map((x) => [x.index, x.salePrice]));
    const sold = slots.map((s) =>
      s.holdId === holdId
        ? {
            ...s,
            status: "sold" as SlotStatus,
            salePrice: soldPrice.get(s.index) ?? s.salePrice,
            heldUntil: null,
            heldUntilMs: null,
            soldAt: tsFromMs(now),
            paymentDocId,
            stripeIntentId: intentId,
          }
        : s,
    );
    tx.update(iRef, { slots: sold.map(toStored), updatedAt: FieldValue.serverTimestamp() });
    tx.update(hSnap.ref, {
      status: "converted",
      paymentDocId,
      stripeIntentId: intentId,
      convertedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, hold } as const;
  });
}

/** After bookings exist, record them on the sold slots for the tracking table. */
export async function attachBookingsToHold(holdId: string, bookingIds: string[]) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const hSnap = await tx.get(holdRef(holdId));
    if (!hSnap.exists) return;
    const hold = hSnap.data() as StoredHold;
    const iRef = inventoryRef(hold.saleId, hold.tourPackageId);
    const inv = await tx.get(iRef);
    const order = [...hold.slotIndexes].sort((a, b) => a - b);
    const slots = (storedSlotsWithMs(inv.get("slots")) as SlotWithMs[]).map((s) => {
      const pos = order.indexOf(s.index);
      return s.holdId === holdId && pos >= 0 ? { ...s, bookingIds: bookingIds[pos] ? [bookingIds[pos]] : bookingIds } : s;
    });
    tx.update(iRef, { slots: slots.map(toStored) });
    tx.update(hSnap.ref, { bookingIds });
  });
}

// ---------------------------------------------------------------------------
// Admin slot actions
// ---------------------------------------------------------------------------

export type AdminSlotAction =
  | { action: "release" }
  | { action: "mark_sold"; note?: string; holderEmail?: string }
  | { action: "reopen" }
  | { action: "set_link"; paymentLinkUrl: string | null };

export async function adminUpdateSlot(saleId: string, tourPackageId: string, index: number, op: AdminSlotAction) {
  const db = adminDb();
  if (op.action === "release") {
    const inv = await inventoryRef(saleId, tourPackageId).get();
    const slot = (storedSlotsWithMs(inv.get("slots")) as SlotWithMs[]).find((s) => s.index === index);
    // Releases the whole party hold and cancels its intent. A hold that is no
    // longer active is a no-op there, so the slot itself is freed below.
    if (slot?.holdId && slot.status !== "sold") await releaseHold(slot.holdId, null, "admin_release");
  }
  await db.runTransaction(async (tx) => {
    const iRef = inventoryRef(saleId, tourPackageId);
    const inv = await tx.get(iRef);
    if (!inv.exists) throw new SaleError(404, "tour_not_in_sale");
    const slots = storedSlotsWithMs(inv.get("slots")) as SlotWithMs[];
    const i = slots.findIndex((s) => s.index === index);
    if (i < 0) throw new SaleError(404, "slot_not_found");
    const s = slots[i];
    if (op.action === "set_link") {
      slots[i] = { ...s, paymentLinkUrl: op.paymentLinkUrl };
    } else if (op.action === "mark_sold") {
      slots[i] = {
        ...s,
        status: "sold",
        heldUntil: null,
        heldUntilMs: null,
        soldAt: tsFromMs(Date.now()),
        note: op.note ?? s.note ?? null,
        holderEmail: op.holderEmail ?? s.holderEmail ?? null,
      };
      if (s.holdId) {
        tx.set(holdRef(s.holdId), { status: "converted", convertedAt: FieldValue.serverTimestamp(), convertedBy: "admin" }, { merge: true });
      }
    } else if (op.action === "release") {
      if (s.status === "sold") throw new SaleError(409, "slot_sold");
      slots[i] = freed(s);
    } else {
      slots[i] = freed(s);
    }
    tx.update(iRef, { slots: slots.map(toStored), updatedAt: FieldValue.serverTimestamp() });
  });
}
