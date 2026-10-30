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
export default function SaleHoldBanner({ sale }: { sale: UseSaleHoldResult }) {
  const { hold, phase, msLeft } = sale;
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef(new Set<string>());
  const [leaving, setLeaving] = useState(false);

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
  const total = hold?.slots.reduce((sum, s) => sum + s.salePrice, 0) ?? 0;

  const changeParty = async () => {
    setLeaving(true);
    await sale.release();
    window.location.href = saleUrl;
  };

  return (
    <>
      <div
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-2 lg:z-30 lg:mb-4"
        role="status"
      >
        <div
          className={`rounded-2xl border px-4 py-3 shadow-lg backdrop-blur transition-colors ${
            phase === "secured"
              ? "border-emerald-500/40 bg-emerald-50/95 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-100"
              : urgent
                ? "border-[#EF3340] bg-[#EF3340] text-white"
                : "border-[#EF3340]/30 bg-card/95 text-foreground"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                {hold?.saleName || "Black Friday Sale"}
              </p>
              <p className="truncate text-sm font-semibold">
                {phase === "secured"
                  ? `${slotsLabel} secured · ${hold?.displayName ?? ""}`
                  : hold?.paying
                    ? `Confirming payment · ${slotsLabel} protected`
                    : `${slotsLabel} held · ${hold?.displayName ?? ""}`}
              </p>
            </div>
            {phase === "active" && (
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-lg font-bold tabular-nums ${
                  urgent ? "bg-white/20" : "bg-[#EF3340]/10 text-[#EF3340]"
                }`}
                aria-label={`${formatClock(msLeft)} left`}
              >
                {formatClock(msLeft)}
              </span>
            )}
          </div>

          {hold && phase !== "secured" && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-90">
              {hold.slots.map((s) => (
                <span key={s.index} className="tabular-nums">
                  Slot {s.index} · {gbp(s.salePrice)}
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
          )}
          {phase === "active" && !hold?.paying && (
            <p className="mt-1 text-[11px] opacity-75">
              Only you can see this timer. Pay the reservation fee before it ends to secure your slots.
            </p>
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
