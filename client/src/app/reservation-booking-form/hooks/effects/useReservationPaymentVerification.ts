import { useEffect } from "react";
import { db } from "../../../../lib/firebase";

type UseReservationPaymentVerificationOptions = {
  paymentConfirmed: boolean;
  step: number;
  setPaymentConfirmed: (value: boolean) => void;
  setCompletedSteps: (
    update: number[] | ((prev: number[]) => number[]),
  ) => void;
};

export const useReservationPaymentVerification = ({
  paymentConfirmed,
  step,
  setPaymentConfirmed,
  setCompletedSteps,
}: UseReservationPaymentVerificationOptions) => {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const verifyPaymentFromURL = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const pid = params.get("paymentid");
        if (pid) {
          console.log(
            "🔍 DEBUG: Found paymentid in URL, verifying payment status:",
            pid,
          );

          try {
            // `paymentid` is the stripePayments doc id, not the Stripe
            // PaymentIntent id — resolve the intent before asking Stripe.
            const { doc, getDoc } = await import("firebase/firestore");
            const snap = await getDoc(doc(db, "stripePayments", pid));
            const stripeIntentId = snap.exists()
              ? snap.data()?.payment?.stripeIntentId
              : undefined;
            if (!stripeIntentId) return;

            const verifyRes = await fetch(
              `/api/stripe-payments/verify-payment?paymentIntentId=${stripeIntentId}`,
              { method: "GET" },
            );

            if (verifyRes.ok) {
              const verifyData = await verifyRes.json();
              console.log(
                "🔍 DEBUG: Stripe verification result for URL paymentid:",
                verifyData.status,
              );

              if (verifyData.status === "succeeded") {
                console.log(
                  "✅ DEBUG: Payment verified from URL, setting paymentConfirmed to true",
                );
                setPaymentConfirmed(true);
                setCompletedSteps((prev) => {
                  const next = new Set(prev);
                  next.add(1);
                  next.add(2);
                  return Array.from(next);
                });
              } else {
                console.log(
                  "❌ DEBUG: Payment not succeeded, status:",
                  verifyData.status,
                );
              }
            } else {
              console.log("❌ DEBUG: Failed to verify payment from URL");
            }
          } catch (verifyErr) {
            console.error("❌ DEBUG: Error verifying payment from URL:", verifyErr);
          }
        }
      } catch {}
    };

    verifyPaymentFromURL();
  }, [setCompletedSteps, setPaymentConfirmed]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get("paymentid");
      if (pid && paymentConfirmed) {
        setCompletedSteps((prev) => {
          const next = new Set(prev);
          next.add(1);
          next.add(2);
          return Array.from(next).sort();
        });
      }
    } catch {}
  }, [step, paymentConfirmed, setCompletedSteps]);
};
