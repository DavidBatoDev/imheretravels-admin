"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import useFocusTrap from "./useFocusTrap";

const DURATION = 200; // ms — keep in sync with the transition duration below

/**
 * Focus modal for a single review: dims the page, traps scroll AND focus, and
 * closes on backdrop click / Escape / the X button. Animates in and out (skipped
 * under `prefers-reduced-motion`), compensates for the removed scrollbar so the
 * page doesn't shift, and returns focus to whatever opened it.
 */
export default function ReviewModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = !!useReducedMotion();

  useEffect(() => setMounted(true), []);

  // Trigger the enter transition on the frame after the first (hidden) paint.
  useEffect(() => {
    if (!mounted) return;
    if (reduce) {
      setVisible(true);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [mounted, reduce]);

  // Play the exit transition, then unmount.
  const requestClose = useCallback(() => {
    if (reduce) {
      onClose();
      return;
    }
    setVisible(false);
    window.setTimeout(onClose, DURATION);
  }, [onClose, reduce]);

  useFocusTrap({ active: mounted, containerRef: panelRef });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    document.addEventListener("keydown", onKey);

    // Lock scroll and reserve the scrollbar's width so the page stays put.
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [requestClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 md:items-center md:p-8 ${
        reduce ? "" : "transition-colors duration-200 ease-out"
      } ${visible ? "bg-midnight/70" : "bg-midnight/0"}`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label="Review details"
    >
      <div
        ref={panelRef}
        className={`relative my-auto w-full max-w-2xl ${
          reduce ? "" : "transition duration-200 ease-out"
        } ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close review"
          onClick={requestClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-midnight shadow-small backdrop-blur hover:bg-light-grey"
        >
          <X className="size-5" />
        </button>
        {/* Capped + self-scrolling so a long review + photo grid can never grow
            taller than the viewport (the outer overlay's own scroll wasn't
            enough — its background is fine at any height, but the panel
            itself was overflowing off the bottom on short mobile viewports,
            exposing the page behind it). Close button stays outside this box
            so it's always visible, not scrolled away with the content. */}
        <div className="no-scrollbar max-h-[85vh] overflow-y-auto rounded-brand-lg">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
