"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { SaleEventsService, describeSaleError, type SaleWithInventory } from "@/services/sale-events-service";
import { getAllTours } from "@/services/tours-service";
import type { TourPackage } from "@/types/tours";
import SaleEditor, { SALES_LIST_URL } from "./SaleEditor";

type State =
  | { kind: "loading" }
  | { kind: "error"; title: string; description: string; notFound?: boolean }
  | { kind: "ready"; sale: SaleWithInventory | null; tours: TourPackage[]; allSales: SaleWithInventory[] };

/** Loads what the sale editor needs (`saleId` null = new sale). */
export default function SaleEditorRoute({ saleId }: { saleId: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [tours, allSales] = await Promise.all([getAllTours(), SaleEventsService.list()]);
      let sale: SaleWithInventory | null = null;
      if (saleId) {
        sale = allSales.find((s) => s.id === saleId) ?? (await SaleEventsService.get(saleId));
      }
      setState({ kind: "ready", sale, tours, allSales });
    } catch (e) {
      const { title, description } = describeSaleError(e);
      const notFound = typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "sale_not_found";
      setState({ kind: "error", title, description, notFound });
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-light-grey" role="status" aria-live="polite">
        <div className="size-12 animate-spin rounded-full border-4 border-crimson-red border-t-transparent" aria-hidden />
        <span className="sr-only">Loading sale editor…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-light-grey px-4">
        <div className="w-full max-w-md rounded-[24px] bg-white p-8 text-center shadow-medium" role="alert">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-crimson-red" aria-hidden />
          <h1 className="font-sans text-h6-mobile font-bold text-midnight">{state.notFound ? "Sale not found" : state.title}</h1>
          <p className="mt-2 font-body text-b4-desktop text-dark-gray">{state.description}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={SALES_LIST_URL}
              className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-midnight px-5 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Sales
            </Link>
            {!state.notFound && (
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-crimson-red px-5 font-body text-sm font-bold text-white transition-colors hover:bg-light-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <SaleEditor key={state.sale?.id ?? "new"} sale={state.sale} tours={state.tours} allSales={state.allSales} />;
}
