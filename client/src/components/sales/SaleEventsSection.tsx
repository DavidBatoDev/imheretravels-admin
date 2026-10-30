"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ListChecks, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SaleEventsService, describeSaleError, type SaleWithInventory } from "@/services/sale-events-service";
import type { TourPackage } from "@/types/tours";
import SaleEventEditor from "./SaleEventEditor";
import SaleSlotTracker from "./SaleSlotTracker";
import { SALE_STATUS_META, saleSummary, saleWindowLabel, useNow } from "./sale-utils";

const WWW_ORIGIN = process.env.NEXT_PUBLIC_WWW_URL || "https://imheretravels.com";

interface SaleEventsSectionProps {
  tours: TourPackage[];
  toursLoading?: boolean;
}

/** "Sale Events" card list on the Sales & Discounts tab. */
export default function SaleEventsSection({ tours, toursLoading }: SaleEventsSectionProps) {
  const { toast } = useToast();
  const now = useNow(30_000);
  const [sales, setSales] = useState<SaleWithInventory[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editor, setEditor] = useState<{ key: number; sale: SaleWithInventory | null } | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SaleWithInventory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setSales(await SaleEventsService.list());
    } catch (e) {
      const { title, description } = describeSaleError(e);
      toast({ title: `Couldn't load sales: ${title}`, description, variant: "destructive" });
      setSales((s) => s ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await SaleEventsService.remove(toDelete.id);
      toast({ title: "Sale deleted", description: toDelete.name });
      setToDelete(null);
      await load();
    } catch (e) {
      const { title, description } = describeSaleError(e);
      toast({ title, description, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const tracking = trackingId ? sales?.find((s) => s.id === trackingId) ?? null : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Sale Events</CardTitle>
            <CardDescription>
              Limited-slot sale pages (e.g. Black Friday): each tour gets a ladder of discounted slots, sold in order.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={load} disabled={refreshing} aria-label="Refresh sales">
              <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden />
            </Button>
            <Button
              size="lg"
              onClick={() => setEditor({ key: Date.now(), sale: null })}
              disabled={sales === null || toursLoading}
            >
              <Plus className="mr-2 h-5 w-5" aria-hidden /> Create Sale
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sales === null ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading sales">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : sales.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p className="mb-2 text-lg font-medium">No sale events yet</p>
            <p className="text-sm">Create the Black Friday sale to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {sales.map((sale) => {
              const meta = SALE_STATUS_META[sale.status];
              const totals = saleSummary(sale, now);
              const banner = sale.hero.bannerUrl || sale.hero.mobileBannerUrl;
              return (
                <li key={sale.id} className="flex items-stretch overflow-hidden rounded-lg border transition-all hover:shadow-sm">
                  {banner ? (
                    <div className="h-32 w-32 flex-shrink-0">
                      <img src={banner} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center bg-muted">
                      <span className="text-xs text-muted-foreground">No Image</span>
                    </div>
                  )}
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-lg font-semibold">{sale.name}</span>
                        <Badge variant="outline" className={`px-2.5 py-0.5 ${meta.className}`}>
                          {meta.label}
                        </Badge>
                        {sale.checkoutMode === "manual" && (
                          <Badge variant="outline" className="px-2.5 py-0.5">
                            Manual payment links
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-1 text-sm text-muted-foreground">
                        <span>{saleWindowLabel(sale, now) || "No schedule"}</span>
                        <span aria-hidden>•</span>
                        <a
                          href={`${WWW_ORIGIN}/${sale.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                        >
                          /{sale.slug} <ExternalLink className="h-3 w-3" aria-hidden />
                          <span className="sr-only">(opens the sale page in a new tab)</span>
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1 text-xs">
                        <Badge variant="outline">
                          {sale.tours.length} tour{sale.tours.length === 1 ? "" : "s"}
                        </Badge>
                        <Badge variant="outline" className="border-crimson-red/30 bg-crimson-red/10 text-crimson-red">
                          {totals.sold} sold
                        </Badge>
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                          {totals.held} held
                        </Badge>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                          {totals.left} left
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setTrackingId(sale.id)}>
                        <ListChecks aria-hidden /> Track slots
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setEditor({ key: Date.now(), sale })}
                        disabled={toursLoading}
                        aria-label={`Edit ${sale.name}`}
                        title="Edit sale"
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setToDelete(sale)}
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${sale.name}`}
                        title="Delete sale"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {editor && (
        <SaleEventEditor
          key={editor.key}
          sale={editor.sale}
          tours={tours}
          isFirstSale={(sales?.length ?? 0) === 0}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
          }}
        />
      )}

      {tracking && <SaleSlotTracker key={tracking.id} sale={tracking} onClose={() => setTrackingId(null)} onChanged={load} />}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale event?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">&ldquo;{toDelete?.name}&rdquo;</span> and its slot ladders will be permanently removed, and{" "}
              /{toDelete?.slug} stops working. Sales with held or sold slots can&apos;t be deleted; set them to Ended instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
