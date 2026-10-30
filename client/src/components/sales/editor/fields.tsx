"use client";

import { forwardRef, useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Form controls for the sale editor. White fields with a 2px border dark enough
 * to read as a control (≥3:1 against white) and a crimson focus state, so
 * inputs never blend into the page.
 */
export const FIELD_CLASS =
  "w-full rounded-md border-2 border-dark-gray/70 bg-white px-3 py-2 font-body text-sm text-midnight " +
  "placeholder:text-dark-gray/80 transition-colors hover:border-midnight " +
  "focus:outline-none focus-visible:border-crimson-red focus-visible:ring-2 focus-visible:ring-crimson-red/25 " +
  "disabled:cursor-not-allowed disabled:border-light-grey disabled:bg-light-grey/60 disabled:text-dark-gray " +
  "aria-[invalid=true]:border-crimson-red";

/** For shadcn SelectTrigger, which brings its own layout. */
export const SELECT_TRIGGER_CLASS =
  "h-10 border-2 border-dark-gray/70 bg-white font-body text-sm text-midnight hover:border-midnight " +
  "focus:border-crimson-red focus:ring-2 focus:ring-crimson-red/25 focus:ring-offset-0";

export const FieldInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function FieldInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_CLASS, "h-10", className)} {...props} />;
  },
);

export const FieldTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function FieldTextarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_CLASS, "min-h-[72px] resize-y", className)} {...props} />;
  },
);

export function FieldLabel({
  htmlFor,
  children,
  required,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("block font-sans text-sm font-bold text-midnight", className)}>
      {children}
      {required && (
        <span className="ml-0.5 text-crimson-red" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export function HelpText({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <p id={id} className={cn("font-body text-xs leading-snug text-dark-gray", className)}>
      {children}
    </p>
  );
}

export function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={cn("font-body text-xs tabular-nums", over ? "font-bold text-[#B4232E]" : "text-dark-gray")}>
      {value.length}/{max}
    </span>
  );
}

/** Uppercase section heading with a crimson tick, as in the tour settings panel. */
export function PanelSectionHead({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-4 flex items-center gap-2.5">
      <span className="h-4 w-1 shrink-0 rounded-full bg-crimson-red" aria-hidden />
      <span className="text-xs font-bold uppercase tracking-wider text-midnight">{children}</span>
      <span className="h-0.5 flex-1 rounded-full bg-grey/40" aria-hidden />
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Click-to-edit text on the canvas. A dashed outline is always visible so the
// editable parts of the page are obvious; it turns solid on focus.
// ---------------------------------------------------------------------------

const INLINE_BASE =
  "w-full rounded-md border border-dashed bg-transparent px-2 -mx-2 outline-none transition-colors focus:border-solid";
const INLINE_TONE = {
  light: "border-dark-gray/70 hover:border-midnight focus:border-crimson-red focus:ring-2 focus:ring-crimson-red/20 placeholder:text-dark-gray/70",
  dark: "border-white/40 hover:border-white/80 focus:border-light-red focus:ring-2 focus:ring-light-red/30 placeholder:text-white/60",
};

export function InlineInput({
  tone = "light",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { tone?: keyof typeof INLINE_TONE }) {
  return <input type="text" className={cn(INLINE_BASE, INLINE_TONE[tone], className)} {...props} />;
}

/** Auto-growing textarea for headings and paragraphs. */
export function InlineTextarea({
  tone = "light",
  className,
  value,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { tone?: keyof typeof INLINE_TONE; value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn(INLINE_BASE, INLINE_TONE[tone], "resize-none overflow-hidden", className)}
      {...props}
    />
  );
}

/** Tiny "click to edit" tag shown above an editable block. */
export function EditTag({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" }) {
  return (
    <span
      className={cn(
        "mb-1 inline-block font-body text-[11px] font-bold uppercase tracking-wider",
        tone === "dark" ? "text-white/70" : "text-dark-gray",
      )}
    >
      {children}
    </span>
  );
}

/** Wraps a (possibly disabled) control with a tooltip; disabled controls can't take hover/focus themselves. */
export function LockTip({ show, text, children }: { show: boolean; text: string; children: React.ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
          aria-label={text}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
