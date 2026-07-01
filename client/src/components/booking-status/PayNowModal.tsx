"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";

interface PayNowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  installmentTerm: "full_payment" | "p1" | "p2" | "p3" | "p4";
  amount: number;
  currency: string;
  /** Existing Stripe checkout handler — creates checkout session and returns URL */
  onStripeCheckout: () => void;
  stripeProcessing: boolean;
}

export default function PayNowModal({
  open,
  onOpenChange,
  bookingId,
  installmentTerm,
  amount,
  currency,
  onStripeCheckout,
  stripeProcessing,
}: PayNowModalProps) {
  const currencySymbol =
    currency?.toLowerCase() === "gbp"
      ? "£"
      : currency?.toLowerCase() === "eur"
        ? "£"
        : currency?.toLowerCase() === "usd"
          ? "$"
          : currency?.toUpperCase() + " ";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-hk-grotesk">
            <CreditCard className="h-5 w-5 text-crimson-red" />
            Pay {currencySymbol}{amount.toFixed(2)} — {installmentTerm === "full_payment" ? "Full Payment" : installmentTerm.toUpperCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="text-center py-4 space-y-3">
            <CreditCard className="h-10 w-10 text-indigo-500 mx-auto" />
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Pay with Card via Stripe
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                You&apos;ll be redirected to a secure Stripe checkout page to
                complete your payment of {currencySymbol}
                {amount.toFixed(2)}.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Amount</span>
              <span className="font-semibold text-gray-900">
                {currencySymbol}{amount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Payment</span>
              <span className="text-gray-900">
                {installmentTerm === "full_payment"
                  ? "Full Payment"
                  : installmentTerm.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Booking</span>
              <span className="font-mono text-xs text-gray-900">
                {bookingId}
              </span>
            </div>
          </div>

          <Button
            onClick={onStripeCheckout}
            disabled={stripeProcessing}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {stripeProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirecting to Stripe...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay with Stripe
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-gray-400">
            Secured by Stripe. Supports Visa, Mastercard, Apple Pay, Google Pay.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
