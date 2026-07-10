"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard navigation for the review filter/sort menus, which already carry the
 * right roles (`listbox` / `option` / `aria-selected`) but no key handling.
 *
 * While `open`: moves DOM focus into the list (the selected option, else the
 * first), then Arrow Up/Down wrap through options, Home/End jump to the ends,
 * and Escape closes the menu and returns focus to the trigger. Enter/Space are
 * handled natively because each option is a real `<button>`.
 */
export default function useListboxNav({
  open,
  listRef,
  triggerRef,
  onClose,
  autoFocus = true,
}: {
  open: boolean;
  listRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Set false when the panel has its own autofocused control (e.g. a search box). */
  autoFocus?: boolean;
}) {
  // Held in a ref so an inline `() => setOpen(false)` doesn't re-run the effect
  // on every render (which would yank focus back to the selected option mid-nav).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const options = () =>
      Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

    if (autoFocus) {
      const initial = options();
      (initial.find((o) => o.getAttribute("aria-selected") === "true") ?? initial[0])?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      const opts = options();
      if (opts.length === 0) return;
      const idx = opts.indexOf(document.activeElement as HTMLElement);
      const focusAt = (i: number) => {
        e.preventDefault();
        opts[(i + opts.length) % opts.length]?.focus();
      };
      switch (e.key) {
        case "ArrowDown":
          return focusAt(idx < 0 ? 0 : idx + 1);
        case "ArrowUp":
          return focusAt(idx < 0 ? opts.length - 1 : idx - 1);
        case "Home":
          return focusAt(0);
        case "End":
          return focusAt(opts.length - 1);
        case "Escape":
          e.preventDefault();
          onCloseRef.current();
          triggerRef.current?.focus();
          return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, listRef, triggerRef, autoFocus]);
}
