import { useEffect } from "react";
import { getReservation } from "../../api/reservationsApi";
import { getCountries, type Country } from "react-phone-number-input";
import { parseWhatsAppInternationalNumber } from "../../utils/phoneNumberParser";
import { buildAdditionalGuestsSessionKey } from "../../utils/sessionRestore";
import type { PersonPaymentPlan } from "../../utils/step3PaymentPlan";

type GuestDetail = {
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  whatsAppNumber: string;
  whatsAppCountry: string;
};

type UseReservationGuestPersistenceOptions = {
  bookingType: string;
  additionalGuests: string[];
  email: string;
  tourPackage: string;
  sessionRestoredRef: React.MutableRefObject<boolean>;
  setAdditionalGuests: (value: string[]) => void;
  paymentDocId: string | null;
  guestDetails: GuestDetail[];
  setGuestDetails: (value: GuestDetail[]) => void;
  setGroupSize: (value: number) => void;
  paymentPlans: PersonPaymentPlan[];
  setPaymentPlans: React.Dispatch<React.SetStateAction<PersonPaymentPlan[]>>;
  step: number;
  selectedDateDetail?: { customOriginal?: number };
  selectedPackage?: { price?: number };
  depositAmount: number;
  safeGetCountryCallingCode: (countryCode: string) => string;
};

export const useReservationGuestPersistence = ({
  bookingType,
  additionalGuests,
  email,
  tourPackage,
  sessionRestoredRef,
  setAdditionalGuests,
  paymentDocId,
  guestDetails,
  setGuestDetails,
  setGroupSize,
  paymentPlans,
  setPaymentPlans,
  step,
  selectedDateDetail,
  selectedPackage,
  depositAmount,
  safeGetCountryCallingCode,
}: UseReservationGuestPersistenceOptions) => {
  useEffect(() => {
    if (
      (bookingType === "Duo Booking" || bookingType === "Group Booking") &&
      additionalGuests.length > 0
    ) {
      try {
        const sessionKey = buildAdditionalGuestsSessionKey(email, tourPackage);
        sessionStorage.setItem(sessionKey, JSON.stringify(additionalGuests));
      } catch (err) {
        console.warn(
          "Failed to save additional guests to sessionStorage:",
          err,
        );
      }
    }
  }, [additionalGuests, email, tourPackage, bookingType]);

  useEffect(() => {
    if (!email || !tourPackage) return;
    if (bookingType !== "Duo Booking" && bookingType !== "Group Booking") return;
    if (sessionRestoredRef.current) return;

    try {
      const sessionKey = buildAdditionalGuestsSessionKey(email, tourPackage);
      const savedGuests = sessionStorage.getItem(sessionKey);

      if (savedGuests) {
        const parsedGuests = JSON.parse(savedGuests);
        if (Array.isArray(parsedGuests) && parsedGuests.length > 0) {
          console.log(
            "ðŸ”„ Restoring additional guests from sessionStorage:",
            parsedGuests,
          );
          sessionRestoredRef.current = true;
          setAdditionalGuests(parsedGuests);
        }
      }
    } catch (err) {
      console.warn("Failed to restore additional guests from sessionStorage:", err);
    }
  }, [email, tourPackage, bookingType, sessionRestoredRef, setAdditionalGuests]);

  useEffect(() => {
    const restoreGuestDetailsFromFirestore = async () => {
      if (!paymentDocId) return;
      if (guestDetails.length > 0) return;
      if (bookingType !== "Duo Booking" && bookingType !== "Group Booking") return;

      try {
        console.log("ðŸ”„ Restoring guest details from Firestore...");
        const paymentData = await getReservation(paymentDocId);
        if (!paymentData) return;
        const storedGuestDetails = paymentData.booking?.guestDetails || [];
        const storedGroupSize = paymentData.booking?.groupSize || 1;

        if (storedGuestDetails.length > 0) {
          console.log(
            `âœ… Restored ${storedGuestDetails.length} guest details from Firestore`,
          );

          const parsedGuestDetails = storedGuestDetails.map((guest: any) => {
            let whatsAppCountry = guest.whatsAppCountry || "PH";
            let whatsAppNumber = guest.whatsAppNumber || "";

            if (whatsAppNumber.startsWith("+") && !guest.whatsAppCountry) {
              const parsedWhatsApp = parseWhatsAppInternationalNumber({
                fullNumber: whatsAppNumber,
                countries: getCountries(),
                getCallingCode: (country) =>
                  safeGetCountryCallingCode(country as Country),
              });

              if (parsedWhatsApp.matched && parsedWhatsApp.country) {
                whatsAppCountry = parsedWhatsApp.country;
                whatsAppNumber = parsedWhatsApp.localNumber;
              } else {
                console.warn("Unknown country code in:", whatsAppNumber);
              }
            }

            return {
              ...guest,
              whatsAppCountry,
              whatsAppNumber,
            } as GuestDetail;
          });

          setGuestDetails(parsedGuestDetails);

          if (bookingType === "Group Booking" && storedGroupSize > 1) {
            setGroupSize(storedGroupSize);
          }

          if (paymentPlans.length === 0 && step === 3) {
            const initialPlans = Array(storedGroupSize)
              .fill(null)
              .map(() => ({
                plan: "",
                tourCostShare:
                  (selectedDateDetail?.customOriginal ?? selectedPackage?.price) || 0,
                reservationFeeShare: depositAmount / storedGroupSize,
              }));
            setPaymentPlans(initialPlans);
          }
        }
      } catch (err) {
        console.warn("Failed to restore guest details from Firestore:", err);
      }
    };

    restoreGuestDetailsFromFirestore();
  }, [
    paymentDocId,
    guestDetails.length,
    bookingType,
    paymentPlans.length,
    step,
    selectedDateDetail,
    selectedPackage,
    depositAmount,
    safeGetCountryCallingCode,
    setGuestDetails,
    setGroupSize,
    setPaymentPlans,
  ]);
};

