"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addOnTotals,
  newAddOnId,
  normalizeAddOns,
  type BookingAddOn,
} from "@/lib/finance/add-ons";

/**
 * Itemised add-ons editor, shared by the Bookings grid (inside a dialog) and
 * the Edit Booking modal. Each row: item name, amount, date paid, notes.
 *
 * Edits stay local until `onSave` is called with the cleaned list, so a
 * half-typed row never reaches Firestore or triggers a recalculation.
 */
export function AddOnsEditor({
  value,
  onSave,
  onCancel,
  disabled,
  saveLabel = "Save add-ons",
}: {
  value: unknown;
  onSave: (next: BookingAddOn[]) => void;
  onCancel?: () => void;
  disabled?: boolean;
  saveLabel?: string;
}) {
  const [rows, setRows] = useState<BookingAddOn[]>(() => normalizeAddOns(value));
  const [dirty, setDirty] = useState(false);

  // Follow external changes (e.g. another admin edited) until the user edits.
  useEffect(() => {
    if (!dirty) setRows(normalizeAddOns(value));
  }, [value, dirty]);

  const update = (id: string, patch: Partial<BookingAddOn>) => {
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const add = () => {
    setDirty(true);
    setRows((prev) => [...prev, { id: newAddOnId(), item: "", amount: 0, datePaid: null, notes: "" }]);
  };
  const remove = (id: string) => {
    setDirty(true);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const missingName = rows.some((r) => !r.item.trim() && r.amount !== 0);
  const totals = addOnTotals(rows);
  const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No add-ons. Use &ldquo;Add item&rdquo; for anything paid on top of the tour, such as a private room.
        </p>
      )}

      {rows.map((r) => (
        <div key={r.id} className="rounded-md border border-border p-2 space-y-2">
          <div className="grid grid-cols-12 gap-2">
            <Input
              className="col-span-5 text-xs"
              placeholder="Item, e.g. Private room"
              value={r.item}
              onChange={(e) => update(r.id, { item: e.target.value })}
              disabled={disabled}
              aria-label="Add-on item"
            />
            <Input
              className="col-span-3 text-xs"
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={r.amount === 0 ? "" : r.amount}
              onChange={(e) => update(r.id, { amount: parseFloat(e.target.value) || 0 })}
              disabled={disabled}
              aria-label="Add-on amount"
            />
            <Input
              className="col-span-3 text-xs"
              type="date"
              value={r.datePaid ?? ""}
              onChange={(e) => update(r.id, { datePaid: e.target.value || null })}
              disabled={disabled}
              aria-label="Date paid (leave empty if unpaid)"
              title="Date paid. Leave empty if not paid yet."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="col-span-1 text-crimson-red px-0"
              onClick={() => remove(r.id)}
              disabled={disabled}
              aria-label="Remove add-on"
            >
              ✕
            </Button>
          </div>
          <Textarea
            className="text-xs"
            rows={2}
            placeholder="Notes: who paid, how, anything worth remembering"
            value={r.notes ?? ""}
            onChange={(e) => update(r.id, { notes: e.target.value })}
            disabled={disabled}
            aria-label="Add-on notes"
          />
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          + Add item
        </Button>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {totals.count} item{totals.count === 1 ? "" : "s"} · {money(totals.total)} total
            {totals.unpaid > 0 ? ` · ${money(totals.unpaid)} unpaid` : " · all paid"}
          </p>
        )}
      </div>

      {missingName && <p className="text-xs text-crimson-red">Every add-on with an amount needs an item name.</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={disabled || !dirty || missingName}
          onClick={() => {
            onSave(normalizeAddOns(rows));
            setDirty(false);
          }}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
