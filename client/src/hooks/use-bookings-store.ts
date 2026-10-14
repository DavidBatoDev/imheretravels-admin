"use client";

import { useSyncExternalStore } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Booking } from "@/types/bookings";

/**
 * Shared realtime `bookings` listener.
 *
 * Every screen that needs the full bookings list (bookings list, sheet,
 * dashboard, global search, booking search field) reads from this single
 * Firestore listener instead of opening its own. The listener is started by
 * the first subscriber and kept alive for a short grace period after the last
 * one unmounts, so tab switches and page navigations reuse it instead of
 * re-downloading the whole collection.
 */

export interface BookingsStoreState {
  bookings: Booking[];
  isLoading: boolean;
  error: Error | null;
  /**
   * True once the current listener has data confirmed by the server. False
   * while showing cached data (IndexedDB) or a snapshot left over from a
   * previous listener.
   */
  isSynced: boolean;
}

const IDLE_TEARDOWN_MS = 60_000;

let state: BookingsStoreState = {
  bookings: [],
  isLoading: true,
  error: null,
  isSynced: false,
};
const listeners = new Set<() => void>();
let unsubscribeFirestore: (() => void) | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

const SERVER_SNAPSHOT: BookingsStoreState = {
  bookings: [],
  isLoading: true,
  error: null,
  isSynced: false,
};

function emit(next: BookingsStoreState) {
  state = next;
  listeners.forEach((l) => l());
}

function startFirestoreListener() {
  if (unsubscribeFirestore) return;
  // A fresh listener retries after a previous error.
  if (state.error) state = { ...state, error: null };
  // The first snapshot of every listener replaces the data, even when it has
  // no doc changes (e.g. the collection became empty since the last listener).
  let isFirstSnapshot = true;
  // Metadata changes are included so we hear about the cache → server
  // transition even when the server data matches the cache.
  unsubscribeFirestore = onSnapshot(
    query(collection(db, "bookings")),
    { includeMetadataChanges: true },
    (snapshot) => {
      const isSynced = !snapshot.metadata.fromCache;
      const dataChanged =
        isFirstSnapshot || snapshot.docChanges().length > 0;
      isFirstSnapshot = false;
      if (!dataChanged && isSynced === state.isSynced) return;

      const bookings = dataChanged
        ? (snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Booking[])
        : state.bookings;
      emit({ bookings, isLoading: false, error: null, isSynced });
    },
    (error) => {
      console.error("❌ [BOOKINGS STORE] Listener error:", error);
      emit({ ...state, isLoading: false, error });
      // Allow a later subscriber to retry.
      unsubscribeFirestore?.();
      unsubscribeFirestore = null;
    },
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  startFirestoreListener();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !teardownTimer) {
      teardownTimer = setTimeout(() => {
        teardownTimer = null;
        if (listeners.size > 0) return;
        unsubscribeFirestore?.();
        unsubscribeFirestore = null;
        // Keep the last snapshot so the next mount renders instantly, but mark
        // it unsynced so one-shot reads wait for fresh server data.
        state = { ...state, isSynced: false };
      }, IDLE_TEARDOWN_MS);
    }
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** Subscribe to the shared bookings list. Docs are returned unsorted. */
export function useBookingsStore(): BookingsStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Sort comparator by numeric `row`, rows without a number last. */
export function compareByRow(a: Booking, b: Booking): number {
  const aRow = typeof a.row === "number" ? a.row : 0;
  const bRow = typeof b.row === "number" ? b.row : 0;
  if (aRow === 0 && bRow === 0) return 0;
  if (aRow === 0) return 1;
  if (bRow === 0) return -1;
  return aRow - bRow;
}

/**
 * Imperative access for code that can't hold the hook for its whole lifetime
 * (e.g. a dialog that only needs bookings while open). Calls `onChange` with
 * the current state immediately and on every update; returns an unsubscribe.
 */
export function subscribeToBookings(
  onChange: (state: BookingsStoreState) => void,
): () => void {
  const listener = () => onChange(state);
  const unsubscribe = subscribe(listener);
  listener();
  return unsubscribe;
}

const ONE_SHOT_TIMEOUT_MS = 15_000;

/**
 * One-shot read of all bookings via the shared store. Resolves instantly when
 * the live listener is already in sync with the server; otherwise waits for
 * server-confirmed data (never resolves with cached or leftover data). Rejects
 * if the server can't be reached in time, like the old API fetch did.
 */
export function getBookingsOnce(): Promise<Booking[]> {
  return new Promise<Booking[]>((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      reject(new Error("Timed out loading bookings from the server"));
    }, ONE_SHOT_TIMEOUT_MS);
    unsubscribe = subscribeToBookings(({ bookings, isSynced, error }) => {
      if (settled || (!isSynced && !error)) return;
      settled = true;
      clearTimeout(timeout);
      queueMicrotask(() => unsubscribe?.());
      if (error) reject(error);
      else resolve(bookings);
    });
  });
}
