"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video[controls]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Modal focus management for the review dialogs (focus modal + photo lightbox).
 *
 * While `active`: remembers what was focused, moves focus into the container,
 * and keeps Tab / Shift+Tab cycling inside it. On teardown, focus is restored to
 * whatever opened the dialog (the "Read more" button, the photo tile, …).
 *
 * `getClientRects()` (not `offsetParent`) is the visibility test — these dialogs
 * render `position: fixed` in a portal, where `offsetParent` is always null.
 */
export default function useFocusTrap({
  active,
  containerRef,
}: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.getClientRects().length > 0,
      );

    const first = focusables()[0];
    if (first) {
      first.focus();
    } else if (container) {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      const inside = !!container?.contains(activeEl);

      if (e.shiftKey && (activeEl === firstEl || !inside)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (activeEl === lastEl || !inside)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}
