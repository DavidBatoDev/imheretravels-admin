// Lightweight searchable select for the admin "Add a review" dialog.
//
// A standalone component (not a fork of reservation-booking-form/components/Select.tsx)
// so the two can diverge safely. That component hand-rolls its own portal
// straight to document.body, which fights Radix Dialog's focus trap when
// reused inside a modal (typing in the search box silently goes nowhere —
// the trap keeps stealing focus back to the trigger) and its per-option
// framer-motion entrance animation reads as sluggish for a 249-country list.
// Built on the existing Popover + Command (cmdk) primitives instead, which
// already nest correctly inside a Radix Dialog (the same pattern the emoji
// picker in this file already uses) and match this dialog's own field sizing.
"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type NationalityOption = {
  label: React.ReactNode;
  value: string;
  searchValue?: string;
};

type Props = {
  value: string | null;
  onChange: (v: string) => void;
  options: NationalityOption[];
  placeholder?: string;
  ariaLabel?: string;
  searchable?: boolean;
  disabled?: boolean;
};

// h-10 matches the sibling shadcn <Input> (First name) so the fields line up.
const TRIGGER_CLS =
  "flex h-10 w-full items-center text-left rounded-md border border-light-grey bg-white px-4 font-body text-b2-desktop text-midnight outline-none transition-colors focus:border-crimson-red disabled:cursor-not-allowed disabled:opacity-50";

export default function NationalitySelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  ariaLabel,
  disabled = false,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={ariaLabel} disabled={disabled} className={TRIGGER_CLS}>
          {selected ? selected.label : <span className="text-grey">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput autoFocus placeholder="Search…" />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-2 font-body text-b4-desktop text-grey">No results</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.searchValue ?? (typeof opt.label === "string" ? opt.label : opt.value)}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="font-body text-b4-desktop"
                >
                  {opt.label}
                  {opt.value === value && <Check className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
