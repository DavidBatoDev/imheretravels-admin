"use client";

/**
 * Prompt shown when an existing destination is renamed, offering to re-sync the
 * SEO title / description / URL slug to match. Each field is an opt-in checkbox
 * with a before→after preview:
 *  - Title / Description default ON when they're still empty or auto-generated,
 *    OFF when the admin has customized them (so hand-written copy isn't clobbered).
 *  - URL Slug defaults OFF and carries a warning, since changing it breaks the
 *    live public URL.
 */

import { useEffect, useState } from "react";
import { Sparkles, X, AlertTriangle } from "lucide-react";

export interface SeoFields {
  title: string;
  description: string;
  slug: string;
}
type FieldKey = keyof SeoFields;

interface Row {
  key: FieldKey;
  label: string;
  from: string;
  to: string;
  defaultChecked: boolean;
  warn?: string;
}

export default function SeoAutofillModal({
  open,
  name,
  current,
  suggestion,
  isAutoTitle,
  isAutoDescription,
  onApply,
  onClose,
}: {
  open: boolean;
  name: string;
  current: SeoFields;
  suggestion: SeoFields;
  isAutoTitle: boolean;
  isAutoDescription: boolean;
  onApply: (patch: Partial<SeoFields>) => void;
  onClose: () => void;
}) {
  const rows: Row[] = [];
  if (suggestion.title && suggestion.title !== current.title) {
    const customized = !!current.title.trim() && !isAutoTitle;
    rows.push({
      key: "title",
      label: "SEO Title",
      from: current.title,
      to: suggestion.title,
      defaultChecked: !customized,
      warn: customized ? "You've customized this — leave off to keep it." : undefined,
    });
  }
  if (suggestion.description && suggestion.description !== current.description) {
    const customized = !!current.description.trim() && !isAutoDescription;
    rows.push({
      key: "description",
      label: "SEO Description",
      from: current.description,
      to: suggestion.description,
      defaultChecked: !customized,
      warn: customized ? "You've customized this — leave off to keep it." : undefined,
    });
  }
  if (suggestion.slug && suggestion.slug !== current.slug) {
    rows.push({
      key: "slug",
      label: "URL Slug",
      from: current.slug,
      to: suggestion.slug,
      defaultChecked: false,
      warn: "Changes the public URL — the old /all-destinations/… link will stop working.",
    });
  }

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) return;
    const init: Record<string, boolean> = {};
    rows.forEach((r) => (init[r.key] = r.defaultChecked));
    setChecked(init);
    // Re-init whenever the prompt opens for a (possibly new) name.
  }, [open, name]);

  if (!open) return null;

  const anyChecked = rows.some((r) => checked[r.key]);
  const apply = () => {
    const patch: Partial<SeoFields> = {};
    rows.forEach((r) => {
      if (checked[r.key]) patch[r.key] = r.to;
    });
    onApply(patch);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-light-grey px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-crimson-red" />
            <span className="font-sans font-bold text-midnight">Update SEO &amp; URL?</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-full text-dark-gray hover:bg-light-grey hover:text-midnight"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-4">
          <p className="mb-3 text-sm text-dark-gray">
            You renamed this destination to{" "}
            <span className="font-semibold text-midnight">&ldquo;{name}&rdquo;</span>. Choose what to
            update to match:
          </p>
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.key} className="rounded-xl border border-light-grey p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={!!checked[r.key]}
                    onChange={(e) => setChecked((c) => ({ ...c, [r.key]: e.target.checked }))}
                    className="mt-0.5 size-4 shrink-0 accent-crimson-red"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-midnight">{r.label}</p>
                    {r.from ? (
                      <p className="truncate text-[11px] text-dark-gray/50 line-through">{r.from}</p>
                    ) : null}
                    <p className="truncate text-[11px] text-midnight">{r.to}</p>
                    {r.warn && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] text-vivid-orange">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        {r.warn}
                      </p>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-light-grey px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm text-midnight transition-colors hover:bg-light-grey"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!anyChecked}
            className="rounded-full bg-crimson-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-light-red disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply selected
          </button>
        </div>
      </div>
    </div>
  );
}
