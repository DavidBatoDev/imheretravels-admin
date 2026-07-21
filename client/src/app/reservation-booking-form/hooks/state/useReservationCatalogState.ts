import { useState } from "react";
import type { PersonPaymentPlan } from "../../utils/step3PaymentPlan";

export type ReservationTourPackage = {
  id: string;
  slug?: string;
  name: string;
  travelDates: string[];
  status?: "active" | "inactive";
  isHosted?: boolean;
  stripePaymentLink?: string;
  deposit?: number;
  price: number;
  coverImage?: string;
  duration?: string;
  highlights?: (string | { text: string; image?: string })[];
  destinations?: string[];
  media?: {
    coverImage?: string;
    gallery?: string[];
  };
  description?: string;
  region?: string;
  country?: string;
  rating?: number;
  travelDateDetails?: Array<{
    date: string;
    customDeposit?: number;
    customOriginal?: number;
    hasCustomDeposit?: boolean;
  }>;
};

export type ReservationPaymentTerm = {
  id: string;
  name: string;
  description: string;
  paymentPlanType: string;
  monthsRequired?: number;
  monthlyPercentages?: number[];
  color: string;
};

export type ReservationCatalogStateSlice = {
  tourPackages: ReservationTourPackage[];
  setTourPackages: React.Dispatch<React.SetStateAction<ReservationTourPackage[]>>;
  tourDates: string[];
  setTourDates: React.Dispatch<React.SetStateAction<string[]>>;
  isLoadingPackages: boolean;
  setIsLoadingPackages: React.Dispatch<React.SetStateAction<boolean>>;
  paymentTerms: ReservationPaymentTerm[];
  setPaymentTerms: React.Dispatch<React.SetStateAction<ReservationPaymentTerm[]>>;
  selectedPaymentPlan: string;
  setSelectedPaymentPlan: React.Dispatch<React.SetStateAction<string>>;
  fetchedPaymentPlanLabel: string;
  setFetchedPaymentPlanLabel: React.Dispatch<React.SetStateAction<string>>;
  paymentPlans: PersonPaymentPlan[];
  setPaymentPlans: React.Dispatch<React.SetStateAction<PersonPaymentPlan[]>>;
  activePaymentTab: number;
  setActivePaymentTab: React.Dispatch<React.SetStateAction<number>>;
};

export const useReservationCatalogState = (): ReservationCatalogStateSlice => {
  const [tourPackages, setTourPackages] = useState<ReservationTourPackage[]>([]);
  const [tourDates, setTourDates] = useState<string[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(true);
  const [paymentTerms, setPaymentTerms] = useState<ReservationPaymentTerm[]>(
    [],
  );
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<string>("");
  const [fetchedPaymentPlanLabel, setFetchedPaymentPlanLabel] =
    useState<string>("");
  const [paymentPlans, setPaymentPlans] = useState<PersonPaymentPlan[]>([]);
  const [activePaymentTab, setActivePaymentTab] = useState(0);

  return {
    tourPackages,
    setTourPackages,
    tourDates,
    setTourDates,
    isLoadingPackages,
    setIsLoadingPackages,
    paymentTerms,
    setPaymentTerms,
    selectedPaymentPlan,
    setSelectedPaymentPlan,
    fetchedPaymentPlanLabel,
    setFetchedPaymentPlanLabel,
    paymentPlans,
    setPaymentPlans,
    activePaymentTab,
    setActivePaymentTab,
  };
};


