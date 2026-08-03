"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, RefreshCcw, ExternalLink } from "lucide-react";
import { FaFileInvoice } from "react-icons/fa";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Booking } from "@/types/bookings";

interface Transaction {
  id: string;
  payment: {
    amount: number;
    currency: string;
    status: string;
    type?: string;
    installmentTerm?: string;
  };
  booking?: {
    id: string;
    documentId: string;
  };
  timestamps: {
    createdAt: { seconds: number; nanoseconds: number } | string;
    paidAt?: { seconds: number; nanoseconds: number } | string;
    updatedAt?: { seconds: number; nanoseconds: number } | string;
    confirmedAt?: { seconds: number; nanoseconds: number } | string;
  };
}

const STATUS_STYLES: Record<string, { label: string; color: string; icon: any }> = {
  succeeded: { label: "Succeeded", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  installment_paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  reserve_paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  reservation_paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  terms_selected: { label: "Paid", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  reservation_pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  installment_pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  failed: { label: "Failed", color: "bg-rose-100 text-rose-800", icon: AlertCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800", icon: AlertCircle },
  refunded: { label: "Refunded", color: "bg-muted text-muted-foreground", icon: RefreshCcw },
};

function getStatusBadge(status: string) {
  const config = STATUS_STYLES[status] || STATUS_STYLES["pending"];
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} border-0 flex items-center gap-1 w-fit rounded-md px-2 py-0.5 text-[10px]`}>
      {config.label} <Icon className="h-2.5 w-2.5" />
    </Badge>
  );
}

function getTypeLabel(t: Transaction) {
  if (t.payment.type === "reservationFee") return "Reservation Fee";
  if (t.payment.type === "installment" && t.payment.installmentTerm) {
    if (t.payment.installmentTerm === "full_payment") return "Full Payment";
    return `${t.payment.installmentTerm.toUpperCase()} - Installment`;
  }
  return t.payment.type || "Payment";
}

function getDate(t: Transaction) {
  return t.timestamps.updatedAt || t.timestamps.confirmedAt || t.timestamps.createdAt;
}

function formatDate(value: Transaction["timestamps"]["createdAt"] | undefined) {
  if (!value) return "N/A";
  const date =
    typeof value === "string"
      ? new Date(value)
      : new Date((value as { seconds: number }).seconds * 1000);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: (currency || "GBP").toUpperCase(),
  }).format(amount);
}

/**
 * Transactions belonging to this specific booking record — matched by the
 * booking's Firestore doc id, never by traveler email. A traveler can have
 * other unrelated bookings under the same email, so matching on email would
 * pull those in too; matching on booking.documentId / bookingDocumentIds
 * keeps this scoped to this one booking (and its group-payment siblings).
 */
export default function BookingTransactionHistory({ booking }: { booking: Booking }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const bookingDocId = booking?.id || "";

  useEffect(() => {
    if (!bookingDocId) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const results = new Map<string, Transaction>();
    let pending = 2;

    const applyResults = () => {
      pending -= 1;
      if (pending <= 0) setIsLoading(false);
    };

    const paymentsRef = collection(db, "stripePayments");

    const unsubDirect = onSnapshot(
      query(paymentsRef, where("booking.documentId", "==", bookingDocId)),
      (snapshot) => {
        snapshot.docs.forEach((d) => results.set(d.id, { id: d.id, ...d.data() } as Transaction));
        setTransactions(Array.from(results.values()));
        applyResults();
      },
      () => applyResults(),
    );

    const unsubGroup = onSnapshot(
      query(paymentsRef, where("bookingDocumentIds", "array-contains", bookingDocId)),
      (snapshot) => {
        snapshot.docs.forEach((d) => results.set(d.id, { id: d.id, ...d.data() } as Transaction));
        setTransactions(Array.from(results.values()));
        applyResults();
      },
      () => applyResults(),
    );

    return () => {
      unsubDirect();
      unsubGroup();
    };
  }, [bookingDocId]);

  const sorted = [...transactions].sort((a, b) => {
    const toMillis = (v: any) => {
      if (!v) return 0;
      if (typeof v === "string") return new Date(v).getTime();
      if (v.seconds) return v.seconds * 1000;
      return 0;
    };
    return toMillis(getDate(b)) - toMillis(getDate(a));
  });

  return (
    <div className="col-span-1 sm:col-span-2 lg:col-span-4 pt-2 sm:pt-3 border-t border-border/30">
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <p className="text-[9px] sm:text-xs text-muted-foreground font-medium uppercase">
          Transaction History
        </p>
        {booking?.bookingId && (
          <Link
            href={`/transactions?search=${encodeURIComponent(booking.bookingId)}`}
            className="text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            View all in Transactions <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        )}
      </div>

      {isLoading ? (
        <p className="text-[11px] sm:text-sm text-muted-foreground">Loading transactions…</p>
      ) : sorted.length === 0 ? (
        <p className="text-[11px] sm:text-sm text-muted-foreground">
          No transactions found for this booking.
        </p>
      ) : (
        <div className="divide-y divide-border/60 rounded-md border border-field-border overflow-hidden">
          {sorted.map((t) => (
            <Link
              key={t.id}
              href={`/transactions?paymentId=${t.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-2.5 hover:bg-muted/40 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <FaFileInvoice className="h-3 w-3 text-crimson-red flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-sm font-semibold text-foreground truncate">
                  {getTypeLabel(t)}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {formatDate(getDate(t))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] sm:text-sm font-bold text-foreground">
                  {formatCurrency(t.payment?.amount || 0, t.payment?.currency)}
                </p>
                {getStatusBadge(t.payment?.status)}
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
