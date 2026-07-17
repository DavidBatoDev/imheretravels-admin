"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Fuse from "fuse.js";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";
import type { RelatedBooking } from "@/types/incidents";

type BookingLite = RelatedBooking & { bookingStatus?: string };

const toISODate = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  return "";
};

/**
 * Search the `bookings` collection and pick one to link to an incident. Shows
 * matching bookings with basic info; the selected booking renders as a card.
 * Bookings are fetched once on first focus and searched client-side (Fuse).
 */
export default function BookingSearchField({
  value,
  onChange,
}: {
  value?: RelatedBooking | null;
  onChange: (booking: RelatedBooking | null) => void;
}) {
  const [items, setItems] = useState<BookingLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const ensureLoaded = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "bookings"));
      setItems(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            bookingDocId: d.id,
            bookingId: x.bookingId || x.bookingCode || d.id,
            fullName: x.fullName || `${x.firstName ?? ""} ${x.lastName ?? ""}`.trim(),
            emailAddress: x.emailAddress || "",
            tourPackageName: x.tourPackageName || "",
            tourDate: toISODate(x.tourDate),
            bookingStatus: x.bookingStatus || "",
          };
        }),
      );
      setLoaded(true);
    } catch (e) {
      console.error("Failed to load bookings for search:", e);
    } finally {
      setLoading(false);
    }
  };

  const fuse = useMemo(
    () =>
      items.length
        ? new Fuse(items, {
            keys: ["bookingId", "fullName", "emailAddress", "tourPackageName"],
            threshold: 0.4,
            minMatchCharLength: 2,
          })
        : null,
    [items],
  );

  const results = useMemo(() => {
    if (!term.trim()) return items.slice(0, 8);
    return fuse ? fuse.search(term).slice(0, 8).map((r) => r.item) : [];
  }, [term, fuse, items]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-input p-3">
        <div className="min-w-0">
          <div className="font-mono text-sm text-foreground">{value.bookingId}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[value.fullName, value.emailAddress].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[value.tourPackageName, value.tourDate].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button
          type="button"
          aria-label="Clear booking"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-crimson-red"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-10"
        placeholder="Search bookings by ID, name, email, or tour…"
        value={term}
        onFocus={() => {
          setOpen(true);
          ensureLoaded();
        }}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {loading && (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              {loaded ? "No matching bookings." : "Type to search bookings."}
            </div>
          )}
          {results.map((b) => (
            <button
              key={b.bookingDocId}
              type="button"
              onClick={() => {
                onChange({
                  bookingDocId: b.bookingDocId,
                  bookingId: b.bookingId,
                  fullName: b.fullName,
                  emailAddress: b.emailAddress,
                  tourPackageName: b.tourPackageName,
                  tourDate: b.tourDate,
                });
                setOpen(false);
                setTerm("");
              }}
              className="flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted"
            >
              <span className="font-mono text-xs text-foreground">{b.bookingId}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[b.fullName, b.tourPackageName, b.tourDate]
                  .filter(Boolean)
                  .join(" · ") || b.emailAddress}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
