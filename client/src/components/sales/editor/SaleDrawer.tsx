"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-hand drawer in the style of the tour editor's settings panel: white,
 * 560px, sticky header, light backdrop so the page stays visible behind it.
 * Built on Radix Dialog for focus trapping, Escape and a labelled title.
 */
export default function SaleDrawer({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-[560px] max-w-[92vw] flex-col bg-white shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-200 data-[state=open]:duration-300",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-light-grey bg-white px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="flex items-center gap-2 font-sans text-base font-bold text-midnight">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-crimson-red" />}
                <span className="truncate">{title}</span>
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 font-body text-xs text-dark-gray">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-dark-gray transition-colors hover:bg-light-grey hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="shrink-0 border-t border-light-grey bg-white px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
