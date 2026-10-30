"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TourPackage } from "@/types/tours";

interface TourPickerProps {
  tours: TourPackage[];
  onSelect: (tour: TourPackage) => void;
  /** Tours already in the sale: shown disabled. */
  excludeIds?: Set<string>;
  /** Shown first, under "Suggested". */
  suggested?: TourPackage[];
  selectedId?: string;
  placeholder?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  "aria-label"?: string;
  children?: React.ReactNode;
}

/** Searchable tour combobox (search by name, country label or slug). */
export default function TourPicker({
  tours,
  onSelect,
  excludeIds,
  suggested = [],
  selectedId,
  placeholder = "Select a tour…",
  className,
  variant = "outline",
  size = "default",
  children,
  ...rest
}: TourPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = selectedId ? tours.find((t) => t.id === selectedId) : undefined;
  const suggestedIds = new Set(suggested.map((t) => t.id));
  const others = tours.filter((t) => !suggestedIds.has(t.id));

  const item = (t: TourPackage) => {
    const taken = excludeIds?.has(t.id) && t.id !== selectedId;
    return (
      <CommandItem
        key={t.id}
        value={`${t.name} ${t.cardSubHeader ?? ""} ${t.slug} ${t.id}`}
        disabled={taken}
        onSelect={() => {
          onSelect(t);
          setOpen(false);
        }}
        className="flex items-center gap-2"
      >
        <Check className={cn("h-4 w-4 shrink-0", t.id === selectedId ? "opacity-100" : "opacity-0")} aria-hidden />
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{t.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[
              t.cardSubHeader,
              t.pricing?.original ? `£${t.pricing.original}` : null,
              t.status === "draft" ? "Draft" : null,
              taken ? "already added" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          role="combobox"
          aria-expanded={open}
          aria-label={rest["aria-label"]}
          className={cn("justify-between", className)}
        >
          {children ?? (
            <>
              <span className="truncate">{selected ? selected.name : placeholder}</span>
              <ChevronsUpDown className="opacity-50" aria-hidden />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tours…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No tours found.</CommandEmpty>
            {suggested.length > 0 && <CommandGroup heading="Suggested">{suggested.map(item)}</CommandGroup>}
            <CommandGroup heading={suggested.length > 0 ? "All tours" : undefined}>{others.map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
