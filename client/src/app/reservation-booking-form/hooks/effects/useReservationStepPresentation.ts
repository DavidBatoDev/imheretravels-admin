import { useMemo } from "react";
import { MIN_DAYS_BEFORE_TOUR } from "../../utils/bookingFlow";

type UseReservationStepPresentationOptions = {
  step: number;
  paymentConfirmed: boolean;
  bookingConfirmed: boolean;
  selectedPackage: unknown;
  bookingType: string;
  depositAmount: number;
  baseReservationFee: number;
  numberOfPeople: number;
  availablePaymentTerm: {
    isInvalid: boolean;
    isLastMinute: boolean;
  };
  tourDate: string;
  availablePaymentPlansCount: number;
  canSelectStep3Plans: boolean;
};

type StepDescriptionArgs = {
  step: number;
  selectedPackage: unknown;
  bookingType: string;
  depositAmount: number;
  baseReservationFee: number;
  numberOfPeople: number;
  availablePaymentTerm: {
    isInvalid: boolean;
    isLastMinute: boolean;
  };
  tourDate: string;
  availablePaymentPlansCount: number;
  canSelectStep3Plans: boolean;
};

export const getReservationProgressValue = (
  paymentConfirmed: boolean,
  bookingConfirmed: boolean,
): number => {
  if (bookingConfirmed) return 100;
  if (paymentConfirmed) return 66.66;
  return 33.33;
};

export const getReservationStepDescription = ({
  step,
  selectedPackage,
  bookingType,
  depositAmount,
  baseReservationFee,
  numberOfPeople,
  availablePaymentTerm,
  tourDate,
  availablePaymentPlansCount,
  canSelectStep3Plans,
}: StepDescriptionArgs): string => {
  switch (step) {
    case 1:
      return "Fill in your personal details and choose your tour name and date.";
    case 2:
      return selectedPackage
        ? bookingType === "Duo Booking" || bookingType === "Group Booking"
          ? `Pay GBP ${depositAmount.toFixed(2)} reservation fee (GBP ${baseReservationFee.toFixed(2)} x ${numberOfPeople} ${numberOfPeople === 1 ? "person" : "people"}) to secure your spots.`
          : `Pay GBP ${depositAmount.toFixed(2)} reservation fee to secure your spot.`
        : "Pay a small reservation fee to secure your spot.";
    case 3: {
      const daysDiff = tourDate
        ? Math.ceil(
            (new Date(tourDate).getTime() - new Date().getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      if (!canSelectStep3Plans) {
        if (availablePaymentTerm.isInvalid) {
          return `This tour date is too close to book. Please choose a date at least ${MIN_DAYS_BEFORE_TOUR} days from today.`;
        }
        if (availablePaymentTerm.isLastMinute) {
          return "Preview only: full payment will be required within 48 hours after Step 2 payment.";
        }
        return `Preview ${availablePaymentPlansCount} available payment plan${
          availablePaymentPlansCount !== 1 ? "s" : ""
        } for your selected tour date (${daysDiff} days away). Complete Step 2 payment to unlock selection.`;
      }

      if (availablePaymentTerm.isInvalid) {
        return `This tour date is too close to book. Please choose a date at least ${MIN_DAYS_BEFORE_TOUR} days from today.`;
      }
      if (availablePaymentTerm.isLastMinute) {
        return "Full payment required within 48 hours.";
      }
      return `Pick from ${availablePaymentPlansCount} payment plan${
        availablePaymentPlansCount !== 1 ? "s" : ""
      } based on your tour date (${daysDiff} days away).`;
    }
    default:
      return "";
  }
};

export const useReservationStepPresentation = ({
  step,
  paymentConfirmed,
  bookingConfirmed,
  selectedPackage,
  bookingType,
  depositAmount,
  baseReservationFee,
  numberOfPeople,
  availablePaymentTerm,
  tourDate,
  availablePaymentPlansCount,
  canSelectStep3Plans,
}: UseReservationStepPresentationOptions) => {
  const progressValue = useMemo(
    () => getReservationProgressValue(paymentConfirmed, bookingConfirmed),
    [paymentConfirmed, bookingConfirmed],
  );

  const stepDescription = useMemo(
    () =>
      getReservationStepDescription({
        step,
        selectedPackage,
        bookingType,
        depositAmount,
        baseReservationFee,
        numberOfPeople,
        availablePaymentTerm,
        tourDate,
        availablePaymentPlansCount,
        canSelectStep3Plans,
      }),
    [
      step,
      selectedPackage,
      bookingType,
      depositAmount,
      baseReservationFee,
      numberOfPeople,
      availablePaymentTerm,
      tourDate,
      availablePaymentPlansCount,
      canSelectStep3Plans,
    ],
  );

  return {
    progressValue,
    stepDescription,
  };
};
