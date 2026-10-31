import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UseSaleHoldResult } from "../hooks/effects/useSaleHold";

const WWW_BASE = process.env.NEXT_PUBLIC_WWW_URL || "https://imheretravels.com";

const gbp = (n: number) =>
  `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Sticky countdown for a Black Friday slot hold. Only the person holding the
 * slots ever sees this; other visitors just see "On hold" on the sale page.
 */
export default function SaleHoldBanner({
  sale,
  prices,
}: {
  sale: UseSaleHoldResult;
  /** Per-slot prices for the chosen date, in slot order (falls back to the hold's). */
  prices?: number[] | null;
}) {
  const { hold, phase, msLeft } = sale;
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef(new Set<string>());
  const [leaving, setLeaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Screen readers hear the time at 5 and 1 minutes, not every second.
  useEffect(() => {
    if (phase !== "active") return;
    for (const [mark, text] of [
      [300_000, "5 minutes left on your held slots"],
      [60_000, "1 minute left on your held slots"],
    ] as const) {
      if (msLeft <= mark && msLeft > mark - 5_000 && !announced.current.has(text)) {
        announced.current.add(text);
        setAnnouncement(text);
      }
    }
  }, [msLeft, phase]);

  if (phase === "none" || phase === "loading") return null;

  const saleUrl = `${WWW_BASE}/${hold?.saleSlug || "black-friday"}`;
  const ended = phase === "expired" || phase === "invalid";
  const urgent = phase === "active" && msLeft < 120_000;
  const slotsLabel = hold ? `${hold.partySize} ${hold.partySize === 1 ? "slot" : "slots"}` : "slots";
  const ordered = hold ? [...hold.slots].sort((a, b) => a.index - b.index) : [];
  const priceOf = (i: number) => prices?.[i] ?? ordered[i]?.salePrice ?? 0;
  const total = ordered.reduce((sum, _s, i) => sum + priceOf(i), 0);

  const changeParty = async () => {
    setLeaving(true);
    await sale.release();
    window.location.href = saleUrl;
  };

  return (
    <>
      {/* Slim one-line bar: pinned to the top on phones (the form's buttons are at
          the bottom), sticky inside the form panel on desktop. Details expand on tap. */}
      <div
        className="fixed inset-x-0 top-0 z-[60] px-2 pt-[max(0.375rem,env(safe-area-inset-top))] lg:sticky lg:inset-x-auto lg:top-2 lg:z-30 lg:mb-3 lg:px-0 lg:pt-0"
        role="status"
      >
        <div
          className={`mx-auto max-w-[760px] rounded-full border shadow-md backdrop-blur transition-colors ${
            phase === "secured"
              ? "border-emerald-500/40 bg-emerald-50/95 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-100"
              : urgent
                ? "border-[#EF3340] bg-[#EF3340] text-white"
                : "border-[#EF3340]/30 bg-card/95 text-foreground"
          } ${detailsOpen ? "rounded-2xl" : ""}`}
        >
          <div className="flex h-10 items-center gap-2 pl-3 pr-1.5 text-sm">
            {phase === "secured" ? (
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <span
                className={`shrink-0 font-bold tabular-nums ${urgent ? "" : "text-[#EF3340]"}`}
                aria-label={`${formatClock(msLeft)} left`}
              >
                {formatClock(msLeft)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {phase === "secured"
                ? `${slotsLabel} secured`
                : hold?.paying
                  ? `Confirming payment · ${slotsLabel} protected`
                  : `${slotsLabel} held for you`}
              <span className="font-normal opacity-75"> · {hold?.displayName ?? ""}</span>
            </span>
            {hold && phase !== "secured" && (
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                aria-expanded={detailsOpen}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold underline-offset-2 hover:underline"
              >
                {detailsOpen ? "Hide" : "Details"}
              </button>
            )}
          </div>

          {hold && detailsOpen && phase !== "secured" && (
            <div className="border-t border-current/10 px-4 pb-3 pt-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 opacity-90">
                {ordered.map((s, i) => (
                  <span key={s.index} className="tabular-nums">
                    Slot {s.index} · {gbp(priceOf(i))}
                  </span>
                ))}
                {hold.slots.length > 1 && <span className="font-semibold tabular-nums">Total {gbp(total)}</span>}
                {phase === "active" && !hold.paying && (
                  <button
                    type="button"
                    onClick={changeParty}
                    disabled={leaving}
                    className="ml-auto underline underline-offset-2 disabled:opacity-50"
                  >
                    Change party
                  </button>
                )}
              </div>
              <p className="mt-1 opacity-75">
                Only you can see this timer. Pay the reservation fee before it ends to secure your slots.
              </p>
            </div>
          )}
        </div>
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </div>

      <AlertDialog open={ended}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Your hold has ended</AlertDialogTitle>
            <AlertDialogDescription>
              {phase === "invalid"
                ? "This hold link is no longer valid."
                : "Your slots were released so others can book them."}{" "}
              Slots may still be available, though the next price can differ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                sale.clear();
                window.location.href = saleUrl;
              }}
            >
              Back to the sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
