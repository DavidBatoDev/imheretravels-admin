import { useCallback } from "react";
import { runPaymentSuccessAction } from "../../actions/paymentSuccessAction";

type UsePaymentSuccessFlowOptions = {
  email: string;
  tourPackage: string;
  completedSteps: number[];
  setCompletedSteps: (
    update: number[] | ((prev: number[]) => number[]),
  ) => void;
  setPaymentConfirmed: (value: boolean) => void;
  setBookingId: (value: string) => void;
};

export const usePaymentSuccessFlow = ({
  email,
  tourPackage,
  completedSteps,
  setCompletedSteps,
  setPaymentConfirmed,
  setBookingId,
}: UsePaymentSuccessFlowOptions) => {
  const handlePaymentSuccess = useCallback(
    async (paymentIntentId?: string, paymentDocId?: string) => {
      await runPaymentSuccessAction({
        paymentIntentId,
        paymentDocId,
        email,
        tourPackage,
        completedSteps,
        setCompletedSteps,
        setPaymentConfirmed,
        setBookingId,
        onError: (error) => {
          console.error("âŒ Error in payment success handler:", error);
          alert(
            "Payment processing encountered an error. Please refresh the page and verify your payment status.",
          );
        },
      });
    },
    [
      email,
      tourPackage,
      completedSteps,
      setCompletedSteps,
      setPaymentConfirmed,
      setBookingId,
    ],
  );

  return {
    handlePaymentSuccess,
  };
};

