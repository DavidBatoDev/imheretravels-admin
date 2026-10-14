import { useCallback } from "react";
import { runExistingPaymentsFlowAction } from "../../actions/checkExistingPaymentsAction";
import {
  lookupReservations,
  updateReservationDraft,
  type PublicReservation,
} from "../../api/reservationsApi";

type UseExistingPaymentCheckOptions = {
  email: string;
  selectedPackageName: string;
  tourDate: string;
  replaceWithPaymentId: (paymentDocId: string | null) => void;
  formSlice: {
    validate: () => boolean;
    isCreatingPayment: boolean;
    getReservationDraftPayload: () => Record<string, unknown>;
    createPlaceholder: () => Promise<string | null>;
  };
  flowSlice: {
    paymentDocId: string | null;
    completedSteps: number[];
    setCompletedSteps: (steps: number[]) => void;
    setStep: (step: number) => void;
  };
  uiSlice: {
    setIsCreatingPayment: (value: boolean) => void;
    setModalLoading: (value: boolean) => void;
    setFoundStripePayments: (records: any[]) => void;
    setShowEmailModal: (value: boolean) => void;
  };
};

export const useExistingPaymentCheck = ({
  email,
  selectedPackageName,
  tourDate,
  replaceWithPaymentId,
  formSlice,
  flowSlice,
  uiSlice,
}: UseExistingPaymentCheckOptions) => {
  const {
    validate,
    isCreatingPayment,
    getReservationDraftPayload,
    createPlaceholder,
  } = formSlice;
  const { paymentDocId, completedSteps, setCompletedSteps, setStep } =
    flowSlice;
  const {
    setIsCreatingPayment,
    setModalLoading,
    setFoundStripePayments,
    setShowEmailModal,
  } = uiSlice;

  const checkExistingPaymentsAndMaybeProceed = useCallback(async () => {
    // The lookup also returns each reservation's booking plan, so the
    // per-booking check below needs no second request.
    let found: PublicReservation[] = [];
    await runExistingPaymentsFlowAction({
      validate,
      isCreatingPayment,
      paymentDocId,
      updateExistingPaymentDoc: async (existingPaymentDocId) => {
        try {
          await updateReservationDraft(existingPaymentDocId, getReservationDraftPayload());
          return true;
        } catch (err) {
          console.error("Error updating payment document:", err);
          alert("Unable to update payment record. Please try again.");
          return false;
        }
      },
      createPlaceholder,
      completedSteps,
      setCompletedSteps,
      setStep,
      setIsCreatingPayment,
      setModalLoading,
      setFoundStripePayments,
      setShowEmailModal,
      replaceWithPaymentId,
      checkInput: {
        fetchPayments: async () => {
          const draft = getReservationDraftPayload() as {
            customer?: { birthdate?: string };
          };
          found = await lookupReservations(email, draft.customer?.birthdate || "");
          return found;
        },
        fetchBookingHasPaymentPlan: async (bookingDocId) =>
          found.some(
            (r) =>
              (r.booking?.documentId === bookingDocId || r.booking?.id === bookingDocId) &&
              !!r.bookingPaymentPlan,
          ),
        selectedPackageName,
        tourDate,
        onBookingLookupError: (error) => {
          console.error("Error checking booking for payment plan:", error);
        },
      },
      onCheckError: (error) => {
        console.error("Error checking existing payments:", error);
      },
      onFallbackPlaceholderError: (error) => {
        console.debug("Failed to set paymentid query param (fallback):", error);
      },
    });
  }, [
    validate,
    isCreatingPayment,
    paymentDocId,
    getReservationDraftPayload,
    createPlaceholder,
    completedSteps,
    setCompletedSteps,
    setStep,
    setIsCreatingPayment,
    setModalLoading,
    setFoundStripePayments,
    setShowEmailModal,
    replaceWithPaymentId,
    email,
    selectedPackageName,
    tourDate,
  ]);

  return {
    checkExistingPaymentsAndMaybeProceed,
  };
};

