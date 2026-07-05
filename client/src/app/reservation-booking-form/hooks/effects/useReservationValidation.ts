import { useCallback } from "react";
import { validateReservationStep1 } from "../../utils/bookingValidation";

type GuestDetail = {
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  whatsAppNumber: string;
  whatsAppCountry: string;
};

type UseReservationValidationOptions = {
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  whatsAppNumber: string;
  whatsAppCountry: string;
  bookingType: string;
  groupSize: number;
  tourPackage: string;
  tourDate: string;
  guestDetails: GuestDetail[];
  setErrors: (errors: { [k: string]: string }) => void;
  setActiveGuestTab: (tab: number) => void;
  safeGetCountryCallingCodeFn: (countryCode: string) => string;
  isValidPhoneNumberFn: (fullNumber: string) => boolean;
};

export const useReservationValidation = ({
  email,
  firstName,
  lastName,
  birthdate,
  nationality,
  whatsAppNumber,
  whatsAppCountry,
  bookingType,
  groupSize,
  tourPackage,
  tourDate,
  guestDetails,
  setErrors,
  setActiveGuestTab,
  safeGetCountryCallingCodeFn,
  isValidPhoneNumberFn,
}: UseReservationValidationOptions) => {
  const isFieldValid = useCallback((field: string, value: string) => {
    if (field === "email") {
      return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    if (field === "firstName" || field === "lastName") {
      return value.trim().length > 0;
    }
    if (field === "birthdate") return value.length > 0;
    if (field === "nationality") return value.length > 0;
    return false;
  }, []);

  const validate = useCallback(() => {
    console.log("ðŸ” Starting validation...");
    const result = validateReservationStep1(
      {
        email,
        firstName,
        lastName,
        birthdate,
        nationality,
        whatsAppNumber,
        whatsAppCountry,
        bookingType,
        groupSize,
        tourPackage,
        tourDate,
        guestDetails,
      },
      {
        isValidPhoneNumberFn,
        safeGetCountryCallingCodeFn,
      },
    );

    console.log("ðŸ“‹ Validation errors:", result.errors);
    console.log("âœ… Validation result:", result.isValid ? "PASSED" : "FAILED");

    if (result.firstGuestTabToFocus !== null) {
      setActiveGuestTab(result.firstGuestTabToFocus);
      console.log(
        "ðŸ”Ž Focusing guest tab",
        result.firstGuestTabToFocus,
        "due to validation error",
      );
    }

    setErrors(result.errors);

    return result.isValid;
  }, [
    email,
    firstName,
    lastName,
    birthdate,
    nationality,
    whatsAppNumber,
    whatsAppCountry,
    bookingType,
    groupSize,
    tourPackage,
    tourDate,
    guestDetails,
    isValidPhoneNumberFn,
    safeGetCountryCallingCodeFn,
    setActiveGuestTab,
    setErrors,
  ]);
  return {
    validate,
    isFieldValid,
  };
};

