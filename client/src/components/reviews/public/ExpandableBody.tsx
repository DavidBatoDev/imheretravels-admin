"use client";

import { useEffect, useRef, useState } from "react";
import ReviewModal from "./ReviewModal";

/**
 * Clamps a review body to a standard height so cards line up in the grid, and
 * shows a "Read more" control only when the content actually overflows. Reading
 * more opens the full review in a focus modal (dimmed backdrop) rather than
 * expanding the card in place.
 */
export default function ExpandableBody({
  children,
  modal,
  collapsedClassName = "max-h-52", // ~9 lines
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
  collapsedClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight - el.clientHeight > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <div ref={ref} className={`relative overflow-hidden ${collapsedClassName}`}>
        {children}
        {overflows && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent"
          />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="mt-2 font-body text-b4-desktop font-medium text-crimson-red underline underline-offset-2 hover:text-light-red"
        >
          Read more
        </button>
      )}
      {open && <ReviewModal onClose={() => setOpen(false)}>{modal ?? children}</ReviewModal>}
    </div>
  );
}
