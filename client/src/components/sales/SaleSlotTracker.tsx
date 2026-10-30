"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  SaleEventsService,
  describeSaleError,
  type SaleWithInventory,
  type SlotOp,
} from "@/services/sale-events-service";
import type { SaleSlot, SaleTour } from "@/types/sale-events";
import {
  SALE_STATUS_META,
  SLOT_STATUS_META,
  formatCountdown,
  formatDateTime,
  formatGBP,
  inventorySummary,
  msOf,
  saleSummary,
  saleWindowLabel,
  slotDisplayStatus,
  useNow,
} from "./sale-utils";
import { tierOfSlot } from "./editor/sale-draft";

const REFRESH_MS = 10_000;

interface SaleSlotTrackerProps {
  sale: SaleWithInventory;
  onClose: () => void;
  /** Called after a slot action, so the list behind can refresh its counts. */
  onChanged?: () => void;
}

type SlotRef = { tour: SaleTour; slot: SaleSlot };
type Confirm = { kind: "release" | "reopen" } & SlotRef;

export default function SaleSlotTracker({ sale: initial, onClose, onChanged }: SaleSlotTrackerProps) {
  const { toast } = useToast();
  const now = useNow(1000);
  const [sale, setSale] = useState(initial);
  const [lastLoaded, setLastLoaded] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // `${tourPackageId}#${index}`
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [markSold, setMarkSold] = useState<(SlotRef & { email: string; note: string }) | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(
    async (manual = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const fresh = await SaleEventsService.get(initial.id);
        setSale(fresh);
        setLastLoaded(Date.now());
        setLoadError(null);
      } catch (e) {
        const { title, description } = describeSaleError(e);
        setLoadError(`${title}: ${description}`);
      } finally {
        inFlight.current = false;
        if (manual) setRefreshing(false);
      }
    },
    [initial.id],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  async function run(ref: SlotRef, op: SlotOp, success: string) {
    const id = `${ref.tour.tourPackageId}#${ref.slot.index}`;
    setPending(id);
    try {
      await SaleEventsService.updateSlot(sale.id, ref.tour.tourPackageId, ref.slot.index, op);
      toast({ title: success, description: `${ref.tour.displayName} · slot ${ref.slot.index}` });
      await load();
      onChanged?.();
      return true;
    } catch (e) {
      const { title, description } = describeSaleError(e, () => ref.tour.displayName);
      toast({ title, description, variant: "destructive" });
      return false;
    } finally {
      setPending(null);
    }
  }

  /** Other slots of the same party hold (a release frees the whole hold). */
  const partyMates = (ref: SlotRef) =>
    ref.slot.holdId
      ? (sale.inventory[ref.tour.tourPackageId]?.slots ?? [])
          .filter((s) => s.holdId === ref.slot.holdId && s.index !== ref.slot.index && s.status !== "sold")
          .map((s) => s.index)
      : [];

  const totals = saleSummary(sale, now);
  const statusMeta = SALE_STATUS_META[sale.status];
  const ago = Math.max(0, Math.round((now - lastLoaded) / 1000));

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className="flex max-h-[92vh] max-w-[min(96vw,90rem)] flex-col gap-0 overflow-hidden p-0"
          onEscapeKeyDown={(e) => {
            // Escape inside an inline payment-link edit cancels the edit, not the dialog.
            if ((e.target as HTMLElement | null)?.closest?.("[data-inline-edit]")) e.preventDefault();
          }}
        >
          <DialogHeader className="border-b px-6 py-4 text-left">
            <div className="flex flex-wrap items-center gap-3 pr-8">
              <DialogTitle className="text-2xl font-bold">Track slots · {sale.name}</DialogTitle>
              <Badge variant="outline" className={statusMeta.className}>
                {statusMeta.label}
              </Badge>
              <Badge variant="outline">{sale.checkoutMode === "manual" ? "Manual payment links" : "Stripe checkout"}</Badge>
            </div>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{saleWindowLabel(sale, now)}</span>
              <span className="font-medium text-foreground">
                {totals.sold} sold · {totals.held} held · {totals.left} left
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                1 slot = 1 person · a party takes the next free slots
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs" aria-live="polite">
                {loadError ? <span className="text-destructive">{loadError}</span> : <span>Updated {ago}s ago · auto-refreshes every 10s</span>}
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => load(true)} disabled={refreshing}>
                  <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden /> Refresh
                </Button>
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {sale.tours.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">This sale has no tours yet. Add some in Edit.</p>
            ) : (
              <div className="flex flex-col gap-6">
                {sale.tours.map((tour) => {
                  const inv = sale.inventory[tour.tourPackageId];
                  const sum = inventorySummary(inv, now);
                  const tiersBySlot = tierOfSlot(inv?.slots ?? []);
                  return (
                    <section key={tour.tourPackageId} aria-labelledby={`trk-${tour.tourPackageId}`} className="rounded-lg border bg-card">
                      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                        {tour.coverImage && (
                          <img src={tour.coverImage} alt="" className="size-10 rounded-md object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 id={`trk-${tour.tourPackageId}`} className="truncate font-semibold">
                            {tour.displayName}
                          </h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {tour.tourName} · original {formatGBP(tour.originalPrice)}
                          </p>
                        </div>
                        <p className="text-sm font-medium tabular-nums">
                          <span className="text-crimson-red">{sum.sold} sold</span> · <span className="text-amber-700">{sum.held} held</span> ·{" "}
                          <span className="text-emerald-700">{sum.left} left</span>
                        </p>
                      </div>
                      {!inv || inv.slots.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-muted-foreground">No slots yet. Save the sale to create them.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          {/* The shared table has no cell padding and <th> centres by default: align every column. */}
                          <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_td:last-child]:text-right [&_td]:px-3 [&_td]:py-2.5 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 [&_th:last-child]:text-right [&_th]:px-3 [&_th]:text-left [&_th]:align-middle">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">Slot</TableHead>
                                <TableHead className="w-12">Tier</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Holder</TableHead>
                                <TableHead>Hold ends</TableHead>
                                <TableHead>Payment</TableHead>
                                <TableHead>Bookings</TableHead>
                                <TableHead className="min-w-[14rem]">Payment link</TableHead>
                                <TableHead className="w-12 text-right">
                                  <span className="sr-only">Actions</span>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {inv.slots.map((slot) => (
                                <SlotRow
                                  key={slot.index}
                                  tour={tour}
                                  slot={slot}
                                  tier={tiersBySlot.get(slot.index) ?? 1}
                                  now={now}
                                  manualMode={sale.checkoutMode === "manual"}
                                  busy={pending === `${tour.tourPackageId}#${slot.index}`}
                                  onRelease={() => setConfirm({ kind: "release", tour, slot })}
                                  onReopen={() => setConfirm({ kind: "reopen", tour, slot })}
                                  onMarkSold={() => setMarkSold({ tour, slot, email: slot.holderEmail ?? "", note: slot.note ?? "" })}
                                  onSetLink={(url) => run({ tour, slot }, { action: "set_link", paymentLinkUrl: url }, url ? "Payment link saved" : "Payment link removed")}
                                />
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Release / reopen confirmation */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "release" ? "Release this hold?" : "Reopen this sold slot?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm &&
                (confirm.kind === "release"
                  ? `${confirm.tour.displayName} slot ${confirm.slot.index}${confirm.slot.holderEmail ? ` (held by ${confirm.slot.holderEmail})` : ""} goes back on sale.${
                      partyMates(confirm).length
                        ? ` Slots ${partyMates(confirm).join(", ")} are in the same hold and are released too.`
                        : ""
                    } ${confirm.slot.status === "paying" ? "The customer pressed Pay and may be mid-payment. " : ""}Their hold link stops working.`
                  : `${confirm.tour.displayName} slot ${confirm.slot.index} becomes available again at ${formatGBP(confirm.slot.salePrice)}. The slot's holder, Stripe and booking references are cleared (its payment link and note stay). The booking and payment records themselves are not changed.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirm) return;
                const c = confirm;
                setConfirm(null);
                run(c, { action: c.kind }, c.kind === "release" ? "Hold released" : "Slot reopened");
              }}
            >
              {confirm?.kind === "release" ? "Release hold" : "Reopen slot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark sold */}
      <Dialog open={!!markSold} onOpenChange={(o) => !o && setMarkSold(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark slot as sold</DialogTitle>
            <DialogDescription>
              {markSold && `${markSold.tour.displayName} · slot ${markSold.slot.index} · ${formatGBP(markSold.slot.salePrice)}`}
              . Use this when payment was taken outside the automatic checkout.
            </DialogDescription>
          </DialogHeader>
          {markSold && (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const email = markSold.email.trim();
                const note = markSold.note.trim();
                const ok = await run(
                  markSold,
                  { action: "mark_sold", ...(email ? { holderEmail: email } : {}), ...(note ? { note } : {}) },
                  "Slot marked as sold",
                );
                if (ok) setMarkSold(null);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="mark-sold-email">Holder email (optional)</Label>
                <Input
                  id="mark-sold-email"
                  type="email"
                  autoComplete="off"
                  value={markSold.email}
                  onChange={(e) => setMarkSold({ ...markSold, email: e.target.value })}
                  placeholder="guest@example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mark-sold-note">Note (optional)</Label>
                <Textarea
                  id="mark-sold-note"
                  value={markSold.note}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setMarkSold({ ...markSold, note: e.target.value })}
                  placeholder="e.g. Paid by bank transfer, ref 1234"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setMarkSold(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending !== null}>
                  {pending !== null && <Loader2 className="animate-spin" aria-hidden />}
                  Mark sold
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function SlotRow({
  tour,
  slot,
  tier,
  now,
  manualMode,
  busy,
  onRelease,
  onReopen,
  onMarkSold,
  onSetLink,
}: {
  tour: SaleTour;
  slot: SaleSlot;
  /** Price tier (consecutive slots with the same discount). */
  tier: number;
  now: number;
  manualMode: boolean;
  busy: boolean;
  onRelease: () => void;
  onReopen: () => void;
  onMarkSold: () => void;
  onSetLink: (url: string | null) => Promise<boolean>;
}) {
  const st = slotDisplayStatus(slot, now);
  const meta = SLOT_STATUS_META[st];
  const heldUntil = msOf(slot.heldUntil);
  const holding = st === "held" || st === "paying";
  const canRelease = holding || st === "expired";

  return (
    <TableRow className={cn(busy && "opacity-60")}>
      <TableCell className="font-medium">{slot.index}</TableCell>
      <TableCell className="tabular-nums">{tier}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        <div className="font-semibold">{formatGBP(slot.salePrice)}</div>
        <div className="text-xs text-muted-foreground">−{formatGBP(slot.discountGBP)}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>
          {meta.label}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[14rem]">
        {slot.holderEmail ? (
          <a href={`mailto:${slot.holderEmail}`} className="block truncate text-sm hover:underline">
            {slot.holderEmail}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {slot.note && (
          <p className="truncate text-xs text-muted-foreground" title={slot.note}>
            {slot.note}
          </p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {holding && heldUntil !== null ? (
          <span className={cn("font-mono text-sm", heldUntil - now < 60_000 && "text-destructive")} aria-label={`Hold ends in ${formatCountdown(heldUntil - now)}`}>
            {formatCountdown(heldUntil - now)}
          </span>
        ) : st === "expired" ? (
          <span className="text-xs text-muted-foreground">Expired {formatDateTime(slot.heldUntil)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {slot.stripeIntentId ? (
          <a
            href={`https://dashboard.stripe.com/payments/${encodeURIComponent(slot.stripeIntentId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 whitespace-nowrap text-crimson-red hover:underline"
          >
            Stripe <ExternalLink className="h-3 w-3" aria-hidden />
            <span className="sr-only">(opens payment {slot.stripeIntentId} in a new tab)</span>
          </a>
        ) : null}
        {slot.paymentDocId && (
          <div className="font-mono text-xs text-muted-foreground" title="Payment document id">
            {slot.paymentDocId}
          </div>
        )}
        {slot.soldAt && <div className="whitespace-nowrap text-xs text-muted-foreground">Paid {formatDateTime(slot.soldAt)}</div>}
        {!slot.stripeIntentId && !slot.paymentDocId && !slot.soldAt && <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm">
        {slot.bookingIds && slot.bookingIds.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {slot.bookingIds.map((b) => (
              <a
                key={b}
                href={`/bookings?tab=bookings&bookingId=${encodeURIComponent(b)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-crimson-red hover:underline"
              >
                {b} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <PaymentLinkCell
          url={slot.paymentLinkUrl ?? null}
          busy={busy}
          highlightMissing={manualMode && st !== "sold"}
          label={`${tour.displayName} slot ${slot.index}`}
          onSave={onSetLink}
        />
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label={`Actions for ${tour.displayName} slot ${slot.index}`}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Slot {slot.index}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canRelease} onSelect={onRelease}>
              <Unlock className="mr-2 h-4 w-4" aria-hidden /> Release hold
            </DropdownMenuItem>
            <DropdownMenuItem disabled={st === "sold"} onSelect={onMarkSold}>
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden /> Mark sold…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={st !== "sold"} onSelect={onReopen} className="text-destructive focus:text-destructive">
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Reopen slot…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function PaymentLinkCell({
  url,
  busy,
  highlightMissing,
  label,
  onSave,
}: {
  url: string | null;
  busy: boolean;
  highlightMissing: boolean;
  label: string;
  onSave: (url: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function submit() {
    const v = value.trim();
    if (v) {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      } catch {
        setError("Enter a full link starting with https://");
        return;
      }
    }
    if ((v || null) === url) {
      setEditing(false);
      return;
    }
    if (await onSave(v || null)) setEditing(false);
  }

  if (editing) {
    const errId = `${label.replace(/\W+/g, "-")}-link-err`;
    return (
      <form
        data-inline-edit
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            type="url"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setEditing(false);
                setValue(url ?? "");
                setError(null);
              }
            }}
            placeholder="https://buy.stripe.com/…"
            className="h-8 min-w-[12rem] text-xs"
            aria-label={`Payment link for ${label}`}
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
            disabled={busy}
          />
          <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label="Save payment link">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setValue(url ?? "");
              setError(null);
            }}
            aria-label="Cancel editing payment link"
          >
            <X aria-hidden />
          </Button>
        </div>
        {error && (
          <p id={errId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="max-w-[12rem] truncate text-xs text-crimson-red hover:underline" title={url}>
          {url.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <span className={cn("text-xs", highlightMissing ? "font-medium text-amber-700" : "text-muted-foreground")}>
          {highlightMissing ? "Not set" : "—"}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={busy}
        onClick={() => {
          setValue(url ?? "");
          setEditing(true);
        }}
        aria-label={`${url ? "Edit" : "Add"} payment link for ${label}`}
      >
        <Pencil aria-hidden />
      </Button>
    </div>
  );
}
