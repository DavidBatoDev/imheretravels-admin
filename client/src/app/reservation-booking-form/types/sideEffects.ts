export type JsonObject = Record<string, unknown>;

export type RouterLike = {
  replace: (url: string) => void;
};

export type StoragePort = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  getAllKeys: () => string[];
};

export type NavigationPort = {
  replaceUrl: (url: string) => void;
  replaceWithPaymentId: (pathname: string, paymentDocId: string | null) => void;
  reloadPage: () => void;
};

export type NotificationPort = {
  alert: (message: string) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type HttpPort = {
  getJson: <T = JsonObject>(url: string) => Promise<{ ok: boolean; data: T }>;
  postJson: <T = JsonObject>(
    url: string,
    body: JsonObject,
  ) => Promise<{ ok: boolean; data: T }>;
};

/**
 * Reservation operations the reuse flow needs, done by the server
 * (api/public/reservations). Replaces a generic Firestore port that let the
 * browser read, update or delete any document.
 */
export type ReservationsPort = {
  /** Payment plan of the booking linked to this reservation, or null. */
  getBookingPaymentPlan: (paymentDocId: string) => Promise<string | null>;
  /** Re-check the status against Stripe; returns the resulting status. */
  syncStatus: (paymentDocId: string) => Promise<string>;
  /** Delete an unpaid draft. */
  discard: (paymentDocId: string) => Promise<void>;
};

export type ReservationSideEffects = {
  storage: StoragePort;
  navigation: NavigationPort;
  notification: NotificationPort;
  http: HttpPort;
  reservations: ReservationsPort;
};
