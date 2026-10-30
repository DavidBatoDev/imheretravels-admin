import { auth } from "@/lib/firebase";
import type {
  SaleCheckoutMode,
  SaleEvent,
  SaleHero,
  SaleInventory,
  SaleStatus,
} from "@/types/sale-events";

// Client wrappers for /api/sale-events (admin, staff-only). The request shapes
// mirror the zod schemas in src/lib/sale/sales.ts and the slots route; they are
// restated here because that module is server-only.

const API_BASE = "/api/sale-events";

export interface SaleWithInventory extends SaleEvent {
  inventory: Record<string, SaleInventory>;
}

export interface SaleTourInput {
  tourPackageId: string;
  tourSlug: string;
  displayName: string;
  tourName: string;
  originalPrice: number;
  coverImage?: string;
  order: number;
  /** Discount £ per slot, slot 1 first. */
  ladder: number[];
}

export interface SaleInput {
  slug: string;
  name: string;
  status: SaleStatus;
  /** ISO with offset, or null. */
  startAt: string | null;
  /** null = end date TBA. */
  endAt: string | null;
  holdMinutes: number;
  checkoutMode: SaleCheckoutMode;
  hero: SaleHero;
  tours: SaleTourInput[];
}

export type SlotOp =
  | { action: "release" }
  | { action: "reopen" }
  | { action: "mark_sold"; note?: string; holderEmail?: string }
  | { action: "set_link"; paymentLinkUrl: string | null };

export interface ZodIssueLike {
  path: (string | number)[];
  message: string;
  code?: string;
}

/** A non-2xx response. `code` is the API's `error` field (e.g. "slug_taken"). */
export class SaleApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "SaleApiError";
  }

  get issues(): ZodIssueLike[] {
    return Array.isArray(this.details.issues) ? (this.details.issues as ZodIssueLike[]) : [];
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new SaleApiError(401, "not_signed_in");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await getAuthHeaders()) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new SaleApiError(0, "network_error");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { error, ...details } = data;
    throw new SaleApiError(res.status, typeof error === "string" ? error : `http_${res.status}`, details);
  }
  return data as T;
}

export const SaleEventsService = {
  async list(): Promise<SaleWithInventory[]> {
    const { sales } = await request<{ sales: SaleWithInventory[] }>("");
    return sales;
  },

  async get(id: string): Promise<SaleWithInventory> {
    const { sale } = await request<{ sale: SaleWithInventory }>(`/${encodeURIComponent(id)}`);
    return sale;
  },

  async create(input: SaleInput): Promise<string> {
    const { id } = await request<{ id: string }>("", { method: "POST", body: input });
    return id;
  },

  async update(id: string, input: SaleInput): Promise<string> {
    await request<{ id: string }>(`/${encodeURIComponent(id)}`, { method: "PUT", body: input });
    return id;
  },

  async remove(id: string): Promise<void> {
    await request<{ ok: true }>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async updateSlot(saleId: string, tourPackageId: string, index: number, op: SlotOp): Promise<void> {
    await request<{ ok: true }>(`/${encodeURIComponent(saleId)}/slots`, {
      method: "POST",
      body: { tourPackageId, index, op },
    });
  },
};

// ---------------------------------------------------------------------------
// Friendly messages for the API's error codes
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  slug: "URL slug",
  name: "Sale name",
  status: "Status",
  startAt: "Start date",
  endAt: "End date",
  holdMinutes: "Hold minutes",
  checkoutMode: "Checkout mode",
  title: "Hero title",
  subtitle: "Hero subtitle",
  bannerUrl: "Desktop banner",
  mobileBannerUrl: "Mobile banner",
  displayName: "Display name",
  originalPrice: "Original price",
  ladder: "Slots",
  tourPackageId: "Tour",
};

/**
 * Turns an error from this service into a toast title/description.
 * `tourName` resolves a tourPackageId in error details to something readable.
 */
export function describeSaleError(
  e: unknown,
  tourName: (tourPackageId: string) => string = (id) => id,
): { title: string; description: string } {
  if (!(e instanceof SaleApiError)) {
    return { title: "Something went wrong", description: e instanceof Error ? e.message : String(e) };
  }
  const tourId = typeof e.details.tourPackageId === "string" ? e.details.tourPackageId : "";
  const index = typeof e.details.index === "number" ? e.details.index : null;
  switch (e.code) {
    case "Invalid sale": {
      const lines = e.issues.slice(0, 4).map((i) => {
        const key = [...i.path].reverse().find((p) => typeof p === "string") as string | undefined;
        const tourIdx = i.path[0] === "tours" && typeof i.path[1] === "number" ? ` (tour ${i.path[1] + 1})` : "";
        return `${(key && FIELD_LABELS[key]) || key || "Field"}${tourIdx}: ${i.message}`;
      });
      return { title: "Please fix the highlighted fields", description: lines.join("\n") || "The sale failed validation." };
    }
    case "slug_taken":
      return { title: "URL slug already used", description: "Another sale uses this slug. Pick a different one." };
    case "tour_has_active_slots":
      return {
        title: "Can't remove that tour",
        description: `${tourName(tourId)} has held or sold slots. Release or reopen them first, then remove the tour.`,
      };
    case "slot_in_use":
      return {
        title: "Can't remove a slot in use",
        description: `Slot ${index ?? "?"} of ${tourName(tourId)} is held or sold, so the ladder can't be shortened past it.`,
      };
    case "sale_has_active_slots":
      return {
        title: "Sale has held or sold slots",
        description: "Release holds and reopen sold slots before deleting, or set the sale to Ended instead.",
      };
    case "sale_not_found":
      return { title: "Sale not found", description: "It may have been deleted. Refresh the list." };
    case "tour_not_in_sale":
    case "slot_not_found":
      return { title: "Slot not found", description: "Save the sale first so its slots exist, then try again." };
    case "Invalid request":
      return { title: "Invalid request", description: "Check the values you entered (e.g. a full https:// link or a valid email)." };
    case "not_signed_in":
      return { title: "Not signed in", description: "Sign in again and retry." };
    case "network_error":
      return { title: "Network error", description: "Couldn't reach the server. Check your connection and retry." };
    default:
      if (e.status === 401 || e.status === 403) {
        return { title: "Not allowed", description: e.code.startsWith("http_") ? "You don't have permission for this." : e.code };
      }
      return { title: "Request failed", description: e.code.replace(/_/g, " ") };
  }
}
