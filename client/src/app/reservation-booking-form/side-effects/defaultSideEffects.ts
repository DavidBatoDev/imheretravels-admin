import {
  discardReservation,
  getReservation,
  syncReservationStatus,
} from "../api/reservationsApi";
import type {
  ReservationsPort,
  HttpPort,
  NavigationPort,
  NotificationPort,
  ReservationSideEffects,
  RouterLike,
  StoragePort,
} from "../types/sideEffects";

const createStoragePort = (): StoragePort => ({
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
  getAllKeys: () => {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  },
});

const createNavigationPort = (router: RouterLike): NavigationPort => ({
  replaceUrl: (url) => {
    router.replace(url);
  },
  replaceWithPaymentId: (pathname, paymentDocId) => {
    if (!paymentDocId) return;

    const nextUrl = `${pathname}?paymentid=${paymentDocId}`;

    try {
      router.replace(nextUrl);
    } catch {
      // Keep silent here to preserve existing behavior where URL updates are best-effort.
    }

    try {
      const state = window.history.state || null;
      window.history.replaceState(state, "", nextUrl);
    } catch {
      // Keep silent for history fallback failures.
    }
  },
  reloadPage: () => {
    window.location.reload();
  },
});

const createNotificationPort = (): NotificationPort => ({
  alert: (message) => {
    window.alert(message);
  },
  warn: (...args) => {
    console.warn(...args);
  },
  error: (...args) => {
    console.error(...args);
  },
});

const createHttpPort = (): HttpPort => ({
  getJson: async (url) => {
    const response = await fetch(url);
    const data = await response.json();
    return { ok: response.ok, data };
  },
  postJson: async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { ok: response.ok, data };
  },
});

const createReservationsPort = (): ReservationsPort => ({
  getBookingPaymentPlan: async (paymentDocId) =>
    (await getReservation(paymentDocId))?.bookingPaymentPlan ?? null,
  syncStatus: syncReservationStatus,
  discard: discardReservation,
});

export const createDefaultReservationSideEffects = ({
  router,
}: {
  router: RouterLike;
}): ReservationSideEffects => ({
  storage: createStoragePort(),
  navigation: createNavigationPort(router),
  notification: createNotificationPort(),
  http: createHttpPort(),
  reservations: createReservationsPort(),
});
