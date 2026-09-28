/**
 * Booking add-ons — itemised extras a guest pays for on top of the tour
 * (private room, single supplement, excursion, airport transfer, …).
 *
 * Stored on the booking as `addOns: BookingAddOn[]`. Pure helpers only (no
 * Firebase, no React) so the grid, the edit modal, the column functions and
 * the finance module all read add-ons the same way.
 *
 * Money rules
 *   - Each add-on ADDS its `amount` to what the guest owes.
 *   - An add-on is paid in full once it has a `datePaid` (no partial
 *     payments per item — split an item in two if it was paid in parts).
 *   - Paid add-ons are cash received (Gross Revenue) dated `datePaid`.
 *   - Add-ons are separate line items: they are NOT spread across P1–P4.
 */

export interface BookingAddOn {
  /** Stable id so React lists and edits don't reorder by index. */
  id: string;
  /** What was bought, e.g. "Private room". */
  item: string;
  /** Price in the booking currency. */
  amount: number;
  /** YYYY-MM-DD the guest paid for it; empty/absent = not yet paid. */
  datePaid?: string | null;
  /** Free text: who paid, how, anything worth remembering. */
  notes?: string;
}

export interface AddOnTotals {
  count: number;
  total: number;
  paid: number;
  unpaid: number;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

let idCounter = 0;
/** Short unique id for a new add-on row. */
export const newAddOnId = (): string =>
  `ao_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

/** YYYY-MM-DD → local-midnight Date (never UTC, so the day never shifts). */
export function parseAddOnDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Coerce whatever is stored in `addOns` into a clean list. Tolerates
 * undefined, "", a legacy string, or partially-filled rows; drops rows with
 * neither an item name nor an amount.
 */
export function normalizeAddOns(value: unknown): BookingAddOn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r) => r && typeof r === "object")
    .map((r: any, i: number) => {
      const paid = parseAddOnDate(r.datePaid);
      const y = paid?.getFullYear();
      return {
        id: String(r.id || `ao_legacy_${i}`),
        item: String(r.item ?? "").trim(),
        amount: round2(Number(r.amount) || 0),
        datePaid: paid
          ? `${y}-${String(paid.getMonth() + 1).padStart(2, "0")}-${String(paid.getDate()).padStart(2, "0")}`
          : null,
        notes: String(r.notes ?? "").trim(),
      };
    })
    .filter((r) => r.item !== "" || r.amount !== 0);
}

export function addOnTotals(value: unknown): AddOnTotals {
  const list = normalizeAddOns(value);
  let total = 0;
  let paid = 0;
  for (const a of list) {
    total += a.amount;
    if (a.datePaid) paid += a.amount;
  }
  return { count: list.length, total: round2(total), paid: round2(paid), unpaid: round2(total - paid) };
}

/** One-line summary for grid cells, detail views and exports. */
export function formatAddOnsSummary(value: unknown, currency = "£"): string {
  const list = normalizeAddOns(value);
  if (list.length === 0) return "";
  const t = addOnTotals(list);
  const money = (n: number) => `${currency}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const items = list.map((a) => `${a.item || "Item"} ${money(a.amount)}${a.datePaid ? "" : " (unpaid)"}`).join("; ");
  return t.unpaid > 0
    ? `${items} — ${money(t.total)} total, ${money(t.unpaid)} unpaid`
    : `${items} — ${money(t.total)} total, paid`;
}
