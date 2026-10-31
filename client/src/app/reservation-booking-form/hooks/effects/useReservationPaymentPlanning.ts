import { useCallback, useMemo } from "react";
import {
  fixTermName,
  generatePaymentScheduleForMonths,
  getAvailablePaymentTermForDate,
  getFriendlyDescription,
} from "../../utils/bookingFlow";
import {
  areAllPaymentPlansSelected,
  upsertPaymentPlanAtIndex,
  type PersonPaymentPlan,
} from "../../utils/step3PaymentPlan";

type PaymentTerm = {
  id: string;
  name: string;
  paymentPlanType: string;
  monthsRequired?: number;
  color: string;
};

type SelectedPackage = {
  price?: number;
};

type SelectedDateDetail = {
  customOriginal?: number;
};

export type AvailablePaymentPlan = {
  id: string;
  type: string;
  label: string;
  description: string;
  monthsRequired: number;
  color: string;
  schedule: Array<{ date: string; amount: number }>;
};

type UseReservationPaymentPlanningOptions = {
  tourDate: string;
  selectedPackage: SelectedPackage | undefined;
  selectedDateDetail: SelectedDateDetail | undefined;
  numberOfPeople: number;
  depositAmount: number;
  paymentTerms: PaymentTerm[];
  fetchedPaymentPlanLabel: string;
  selectedPaymentPlan: string;
  paymentPlans: PersonPaymentPlan[];
  activePaymentTab: number;
  setPaymentPlans: React.Dispatch<React.SetStateAction<PersonPaymentPlan[]>>;
  /** Per-traveller sale prices while a Black Friday hold is active (traveller 0 = main booker). */
  saleTravellerPrices?: number[] | null;
};

export const useReservationPaymentPlanning = ({
  tourDate,
  selectedPackage,
  selectedDateDetail,
  numberOfPeople,
  depositAmount,
  paymentTerms,
  fetchedPaymentPlanLabel,
  selectedPaymentPlan,
  paymentPlans,
  activePaymentTab,
  setPaymentPlans,
  saleTravellerPrices = null,
}: UseReservationPaymentPlanningOptions) => {
  const availablePaymentTerm = useMemo(
    () => getAvailablePaymentTermForDate(tourDate),
    [tourDate],
  );

  // Black Friday holds price each traveller from their own slot; otherwise the
  // date's custom price or the tour price, as before.
  const selectedTourPrice = useMemo(
    () =>
      saleTravellerPrices?.[activePaymentTab] ??
      ((selectedDateDetail?.customOriginal ?? selectedPackage?.price) || 0),
    [saleTravellerPrices, activePaymentTab, selectedDateDetail, selectedPackage],
  );
  const totalPartyPrice = useMemo(
    () =>
      saleTravellerPrices
        ? saleTravellerPrices.reduce((sum, p) => sum + p, 0)
        : selectedTourPrice * numberOfPeople,
    [saleTravellerPrices, selectedTourPrice, numberOfPeople],
  );

  const availablePaymentPlans = useMemo<AvailablePaymentPlan[]>(() => {
    if (!availablePaymentTerm.term || availablePaymentTerm.isInvalid) return [];

    if (availablePaymentTerm.isLastMinute) {
      return [
        {
          id: "full_payment",
          type: "full_payment",
          label: "Full Payment Required Within 48hrs",
          description: "Complete payment of remaining balance within 2 days",
          monthsRequired: 1,
          color: "#f59e0b",
          schedule: [],
        },
      ];
    }

    const termMap: { [key: string]: number } = { P1: 1, P2: 2, P3: 3, P4: 4 };
    const maxMonths = termMap[availablePaymentTerm.term] || 0;

    return paymentTerms
      .filter((term) => term.monthsRequired && term.monthsRequired <= maxMonths)
      .map((term) => {
        const monthsRequired = term.monthsRequired ?? 0;
        const totalTourPrice = totalPartyPrice;
        return {
          id: term.id,
          type: term.paymentPlanType,
          label: fixTermName(term.name),
          description: getFriendlyDescription(monthsRequired),
          monthsRequired,
          color: term.color,
          schedule: generatePaymentScheduleForMonths({
            tourDate,
            monthsRequired,
            totalTourPrice,
            depositAmount,
          }),
        };
      });
  }, [
    availablePaymentTerm,
    paymentTerms,
    totalPartyPrice,
    tourDate,
    depositAmount,
  ]);

  const selectedPaymentPlanLabel = useMemo(() => {
    if (fetchedPaymentPlanLabel) {
      return fetchedPaymentPlanLabel;
    }
    if (availablePaymentTerm.isLastMinute || selectedPaymentPlan === "full_payment") {
      return "Full Payment";
    }
    return fixTermName(
      paymentTerms.find((p) => p.id === selectedPaymentPlan)?.name || "Selected",
    );
  }, [
    fetchedPaymentPlanLabel,
    availablePaymentTerm,
    selectedPaymentPlan,
    paymentTerms,
  ]);

  const allPlansSelected = useMemo(
    () => areAllPaymentPlansSelected(paymentPlans, numberOfPeople),
    [paymentPlans, numberOfPeople],
  );

  const handleSelectPaymentPlanForActiveTraveler = useCallback(
    (planId: string) => {
      const reservationFeePerPerson = depositAmount / numberOfPeople;
      setPaymentPlans((prev) =>
        upsertPaymentPlanAtIndex(prev, activePaymentTab, {
          plan: planId,
          tourCostShare: selectedTourPrice,
          reservationFeeShare: reservationFeePerPerson,
        }),
      );
    },
    [
      depositAmount,
      numberOfPeople,
      setPaymentPlans,
      activePaymentTab,
      selectedTourPrice,
    ],
  );

  return {
    availablePaymentTerm,
    selectedTourPrice,
    availablePaymentPlans,
    selectedPaymentPlanLabel,
    allPlansSelected,
    handleSelectPaymentPlanForActiveTraveler,
  };
};

