import { useCallback } from "react";
import type { PersonPaymentPlan } from "../../utils/step3PaymentPlan";
import { runConfirmBookingAction } from "../../actions/confirmBookingAction";

type PaymentPlanOption = {
  id?: string;
  type?: string;
  label?: string;
};

type UseConfirmBookingFlowOptions = {
  paymentConfirmed: boolean;
  isLastMinute: boolean;
  allPlansSelected: boolean;
  numberOfPeople: number;
  paymentPlans: PersonPaymentPlan[];
  availablePaymentPlans: PaymentPlanOption[];
  bookingId: string;
  paymentDocId: string | null;
  email: string;
  tourPackage: string;
  setConfirmingBooking: (value: boolean) => void;
  setFetchedPaymentPlanLabel: (value: string) => void;
  setBookingConfirmed: (value: boolean) => void;
};

export const useConfirmBookingFlow = ({
  paymentConfirmed,
  isLastMinute,
  allPlansSelected,
  numberOfPeople,
  paymentPlans,
  availablePaymentPlans,
  bookingId,
  paymentDocId,
  email,
  tourPackage,
  setConfirmingBooking,
  setFetchedPaymentPlanLabel,
  setBookingConfirmed,
}: UseConfirmBookingFlowOptions) => {
  const handleConfirmBooking = useCallback(async () => {
    await runConfirmBookingAction({
      paymentConfirmed,
      isLastMinute,
      allPlansSelected,
      numberOfPeople,
      paymentPlans,
      availablePaymentPlans,
      bookingId,
      paymentDocId,
      email,
      tourPackage,
      setConfirmingBooking,
      setFetchedPaymentPlanLabel,
      setBookingConfirmed,
      onAlert: (message) => alert(message),
      onError: (error) => {
        console.error("âŒ Error confirming booking:", error);
      },
    });
  }, [
    paymentConfirmed,
    isLastMinute,
    allPlansSelected,
    numberOfPeople,
    paymentPlans,
    availablePaymentPlans,
    bookingId,
    paymentDocId,
    email,
    tourPackage,
    setConfirmingBooking,
    setFetchedPaymentPlanLabel,
    setBookingConfirmed,
  ]);

  return {
    handleConfirmBooking,
  };
};

