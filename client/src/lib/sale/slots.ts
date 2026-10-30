// Pure slot-ladder rules shared by the claim transaction, the admin tracking
// table and the tests. No Firestore here.

import type { PublicSlotState, SlotStatus } from "@/types/sale-events";

/** The server keeps a hold this much longer than the countdown it shows. */
export const HOLD_GRACE_MS = 2 * 60_000;
/** Pressing Pay extends the hold once by this much, so 3-D Secure isn't cut off. */
export const PAYING_EXTENSION_MS = 5 * 60_000;
export const MAX_PARTY_SIZE = 4;

export interface SlotLike {
  index: number;
  status: SlotStatus;
  /** epoch ms; only meaningful while held or paying */
  heldUntilMs?: number | null;
}

/** A held or paying slot whose hold ran out counts as free again (lazy expiry). */
export function effectiveStatus(slot: SlotLike, nowMs: number): SlotStatus {
  if ((slot.status === "held" || slot.status === "paying") && (slot.heldUntilMs ?? 0) <= nowMs) {
    return "available";
  }
  return slot.status;
}

export function publicState(slot: SlotLike, nowMs: number): PublicSlotState {
  const s = effectiveStatus(slot, nowMs);
  if (s === "sold") return "sold";
  if (s === "held" || s === "paying") return "on_hold";
  return "available";
}

/**
 * The lowest `partySize` free slots, in ladder order, or null when there are
 * not enough. Slots are sold in order, so a duo takes e.g. slots 2 and 3.
 */
export function pickSlots<T extends SlotLike>(slots: T[], partySize: number, nowMs: number): T[] | null {
  if (!Number.isInteger(partySize) || partySize < 1) return null;
  const free = [...slots]
    .sort((a, b) => a.index - b.index)
    .filter((s) => effectiveStatus(s, nowMs) === "available");
  return free.length >= partySize ? free.slice(0, partySize) : null;
}

export function salePriceFor(originalPrice: number, discountGBP: number): number {
  return Math.max(0, Math.round((originalPrice - discountGBP) * 100) / 100);
}

export interface SaleWindow {
  status: string;
  startAtMs: number | null;
  endAtMs: number | null;
}

/** Claims are accepted only while the sale is live and inside its window. */
export function isSaleOpen(sale: SaleWindow, nowMs: number): boolean {
  if (sale.status !== "live") return false;
  if (sale.startAtMs !== null && nowMs < sale.startAtMs) return false;
  if (sale.endAtMs !== null && nowMs >= sale.endAtMs) return false;
  return true;
}
