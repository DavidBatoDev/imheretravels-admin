"use client";

import { Search, X } from "lucide-react";

/**
 * Free-text review search box. Shared by the per-tour section (filters in place)
 * and the reviews hub (debounced into the `?q=` URL param), so both look and
 * behave identically.
 */
export default function SearchInput({
  value,
  onChange,
  className = "w-full sm:max-w-xs",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-grey" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search reviews"
        aria-label="Search reviews"
        className="w-full appearance-none rounded-full border border-light-grey bg-white py-2 pl-9 pr-9 font-body text-b4-desktop text-midnight outline-none transition-colors placeholder:text-grey focus:border-crimson-red [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-grey hover:bg-light-grey hover:text-midnight"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
