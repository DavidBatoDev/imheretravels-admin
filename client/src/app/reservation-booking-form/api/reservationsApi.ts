import { Timestamp } from "firebase/firestore";
import { timestampsFromWire } from "@/lib/public-booking-view";

// Browser client for api/public/reservations/*. The form used to read and
// write stripePayments directly; these calls replace every one of those.
// Responses come back in the old doc shape (Timestamps revived), so callers
// read the same fields as before.

const BASE = "/api/public/reservations";

export type PublicReservation = Record<string, any> & {
  id: string;
  bookingPaymentPlan?: string | null;
};

const revive = <T>(value: unknown): T =>
  timestampsFromWire(value, (s, n) => new Timestamp(s, n)) as T;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

/** Create a draft from buildReservationDraftPayload(); the server prices it. */
export async function createReservationDraft(draft: Record<string, unknown>): Promise<string> {
  const { id } = await call<{ id: string }>(BASE, { method: "POST", body: JSON.stringify(draft) });
  return id;
}

export async function updateReservationDraft(id: string, draft: Record<string, unknown>): Promise<void> {
  await call(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(draft) });
}

/** The reservation, or null when it doesn't exist. */
export async function getReservation(id: string): Promise<PublicReservation | null> {
  try {
    const { reservation } = await call<{ reservation: unknown }>(`${BASE}/${encodeURIComponent(id)}`);
    return revive<PublicReservation>(reservation);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function discardReservation(id: string): Promise<void> {
  await call(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Reservations for this email whose birthdate also matches (newest 10). */
export async function lookupReservations(email: string, birthdate: string): Promise<PublicReservation[]> {
  const { records } = await call<{ records: unknown[] }>(`${BASE}/lookup`, {
    method: "POST",
    body: JSON.stringify({ email, birthdate }),
  });
  return records.map((r) => revive<PublicReservation>(r));
}

/** After Stripe's confirmPayment: the server checks Stripe and marks the reservation paid. */
export async function confirmReservationPayment(
  paymentIntentId: string,
  paymentDocId?: string | null,
): Promise<{ paymentDocId: string; status: string }> {
  return call(`${BASE}/confirm-payment`, {
    method: "POST",
    body: JSON.stringify({ paymentIntentId, paymentDocId: paymentDocId || undefined }),
  });
}

/** Re-check a reservation's status against Stripe (fixes a stale "paid" or "pending"). */
export async function syncReservationStatus(id: string): Promise<string> {
  const { status } = await call<{ status: string }>(`${BASE}/${encodeURIComponent(id)}/sync-status`, {
    method: "POST",
  });
  return status;
}
