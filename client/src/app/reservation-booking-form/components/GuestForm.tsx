import React, { useState, useEffect, useCallback, memo } from "react";
import { motion } from "framer-motion";
import Select from "./Select";
import BirthdatePicker from "./BirthdatePicker";
import {
  getNationalityOptions,
  getNationalityCountryCode,
} from "../utils/nationalityUtils";
import ReactCountryFlag from "react-country-flag";
import "react-phone-number-input/style.css";
import {
  isValidPhoneNumber,
  getCountries,
  getCountryCallingCode,
} from "react-phone-number-input";
import en from "react-phone-number-input/locale/en";
import type { Country } from "react-phone-number-input";

// Styling constants
const fieldBase =
  "mt-1 block w-full px-4 py-3 rounded-lg bg-input text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:bg-muted/40 disabled:cursor-not-allowed disabled:text-muted-foreground";
const fieldWithIcon = "pl-11";
const fieldFocus =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 focus:shadow-md hover:border-primary/50 disabled:focus:outline-none disabled:focus:ring-0 disabled:hover:border-primary/50 disabled:hover:shadow-sm";
const fieldBorder = (hasError: boolean) =>
  `border-2 ${hasError ? "border-destructive" : "border-border"}`;

// Helper functions (copied from page.tsx to be self-contained)
const safeGetCountryCallingCode = (countryCode: string): string => {
  try {
    return getCountryCallingCode(countryCode as Country);
  } catch (error) {
    console.warn(`Unknown country code for phone: ${countryCode}`);
    return "1"; // Default to US/Canada code
  }
};

const countryData: Record<
  string,
  { alpha3: string; flag: string; maxLength: number }
> = {
  US: { alpha3: "USA", flag: "🇺🇸", maxLength: 10 },
  GB: { alpha3: "GBR", flag: "🇬🇧", maxLength: 10 },
  PH: { alpha3: "PHL", flag: "🇵🇭", maxLength: 10 },
  JP: { alpha3: "JPN", flag: "🇯🇵", maxLength: 10 },
  CN: { alpha3: "CHN", flag: "🇨🇳", maxLength: 11 },
  IN: { alpha3: "IND", flag: "🇮🇳", maxLength: 10 },
  AU: { alpha3: "AUS", flag: "🇦🇺", maxLength: 9 },
  CA: { alpha3: "CAN", flag: "🇨🇦", maxLength: 10 },
  DE: { alpha3: "DEU", flag: "🇩🇪", maxLength: 11 },
  FR: { alpha3: "FRA", flag: "🇫🇷", maxLength: 9 },
  IT: { alpha3: "ITA", flag: "🇮🇹", maxLength: 10 },
  ES: { alpha3: "ESP", flag: "🇪🇸", maxLength: 9 },
  BR: { alpha3: "BRA", flag: "🇧🇷", maxLength: 11 },
  MX: { alpha3: "MEX", flag: "🇲🇽", maxLength: 10 },
  KR: { alpha3: "KOR", flag: "🇰🇷", maxLength: 10 },
  SG: { alpha3: "SGP", flag: "🇸🇬", maxLength: 8 },
  MY: { alpha3: "MYS", flag: "🇲🇾", maxLength: 10 },
  TH: { alpha3: "THA", flag: "🇹🇭", maxLength: 9 },
  VN: { alpha3: "VNM", flag: "🇻🇳", maxLength: 10 },
  ID: { alpha3: "IDN", flag: "🇮🇩", maxLength: 11 },
  NZ: { alpha3: "NZL", flag: "🇳🇿", maxLength: 9 },
  AE: { alpha3: "ARE", flag: "🇦🇪", maxLength: 9 },
  SA: { alpha3: "SAU", flag: "🇸🇦", maxLength: 9 },
  ZA: { alpha3: "ZAF", flag: "🇿🇦", maxLength: 9 },
  RU: { alpha3: "RUS", flag: "🇷🇺", maxLength: 10 },
  TR: { alpha3: "TUR", flag: "🇹🇷", maxLength: 10 },
  NL: { alpha3: "NLD", flag: "🇳🇱", maxLength: 9 },
  SE: { alpha3: "SWE", flag: "🇸🇪", maxLength: 9 },
  CH: { alpha3: "CHE", flag: "🇨🇭", maxLength: 9 },
  PL: { alpha3: "POL", flag: "🇵🇱", maxLength: 9 },
  BE: { alpha3: "BEL", flag: "🇧🇪", maxLength: 9 },
  AT: { alpha3: "AUT", flag: "🇦🇹", maxLength: 10 },
  NO: { alpha3: "NOR", flag: "🇳🇴", maxLength: 8 },
  DK: { alpha3: "DNK", flag: "🇩🇰", maxLength: 8 },
  FI: { alpha3: "FIN", flag: "🇫🇮", maxLength: 9 },
  IE: { alpha3: "IRL", flag: "🇮🇪", maxLength: 9 },
  PT: { alpha3: "PRT", flag: "🇵🇹", maxLength: 9 },
  GR: { alpha3: "GRC", flag: "🇬🇷", maxLength: 10 },
  CZ: { alpha3: "CZE", flag: "🇨🇿", maxLength: 9 },
  HU: { alpha3: "HUN", flag: "🇭🇺", maxLength: 9 },
  RO: { alpha3: "ROU", flag: "🇷🇴", maxLength: 9 },
  IL: { alpha3: "ISR", flag: "🇮🇱", maxLength: 9 },
  EG: { alpha3: "EGY", flag: "🇪🇬", maxLength: 10 },
  AR: { alpha3: "ARG", flag: "🇦🇷", maxLength: 10 },
  CL: { alpha3: "CHL", flag: "🇨🇱", maxLength: 9 },
  CO: { alpha3: "COL", flag: "🇨🇴", maxLength: 10 },
  PE: { alpha3: "PER", flag: "🇵🇪", maxLength: 9 },
  HK: { alpha3: "HKG", flag: "🇭🇰", maxLength: 8 },
  TW: { alpha3: "TWN", flag: "🇹🇼", maxLength: 9 },
  PK: { alpha3: "PAK", flag: "🇵🇰", maxLength: 10 },
  BD: { alpha3: "BGD", flag: "🇧🇩", maxLength: 10 },
  NG: { alpha3: "NGA", flag: "🇳🇬", maxLength: 10 },
  KE: { alpha3: "KEN", flag: "🇰🇪", maxLength: 9 },
  UA: { alpha3: "UKR", flag: "🇺🇦", maxLength: 9 },
};

const getCountryData = (countryCode: string) => {
  return (
    countryData[countryCode] || {
      alpha3: countryCode.toUpperCase(),
      flag: countryCode
        .toUpperCase()
        .split("")
        .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
        .join(""),
      maxLength: 15,
    }
  );
};

interface GuestDetails {
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  whatsAppNumber: string;
  whatsAppCountry: string;
}

interface GuestFormProps {
  index: number;
  initialData: GuestDetails;
  onUpdate: (index: number, data: GuestDetails) => void;
  errors: { [key: string]: string };
  paymentConfirmed: boolean;
}

const GuestForm = memo(
  ({
    index,
    initialData,
    onUpdate,
    errors,
    paymentConfirmed,
  }: GuestFormProps) => {
    // Local state to prevent parent re-renders on every keystroke
    const [localData, setLocalData] = useState<GuestDetails>(initialData);

    // Sync local state if initialData changes (e.g. from server refresh or tab switch)
    useEffect(() => {
      if (JSON.stringify(initialData) !== JSON.stringify(localData)) {
        setLocalData(initialData);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData]);

    // Debounced update to parent - syncs after 500ms of inactivity
    useEffect(() => {
      const timer = setTimeout(() => {
        onUpdate(index, localData);
      }, 500);

      return () => clearTimeout(timer);
    }, [localData, index, onUpdate]);

    // Update parent immediately for select fields (no need to wait)
    const handleImmediateUpdate = (updates: Partial<GuestDetails>) => {
      const newData = { ...localData, ...updates };
      setLocalData(newData);
      onUpdate(index, newData);
    };

    const handleChange = (field: keyof GuestDetails, value: string) => {
      setLocalData((prev) => ({ ...prev, [field]: value }));
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
        // Flush the debounced value when a field loses focus. Pressing
        // "Continue to Payment" blurs the field first, so validation never sees
        // a guest field as empty just because the 500ms debounce hadn't fired.
        onBlur={() => onUpdate(index, localData)}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {/* Guest Email */}
          <label className="block">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              Email address
              <span className="text-destructive text-xs">*</span>
            </span>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                  />
                </svg>
              </div>
              <input
                type="email"
                value={localData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="guest.email@example.com"
                className={`${fieldBase} ${fieldWithIcon} ${fieldBorder(
                  !!errors[`guest-${index}-email`],
                )} ${
                  localData.email &&
                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(localData.email) &&
                  !errors[`guest-${index}-email`]
                    ? "border-green-500"
                    : ""
                } ${fieldFocus}`}
                disabled={paymentConfirmed}
              />
              {localData.email &&
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(localData.email) &&
                !errors[`guest-${index}-email`] && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
            </div>
            {errors[`guest-${index}-email`] && (
              <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors[`guest-${index}-email`]}
              </p>
            )}
          </label>

          {/* Guest Birthdate */}
          <label className="block">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              Birthdate
              <span className="text-destructive text-xs">*</span>
            </span>
            <div className="relative">
              <BirthdatePicker
                value={localData.birthdate}
                onChange={(val) => handleImmediateUpdate({ birthdate: val })}
                isValid={
                  !!localData.birthdate && !errors[`guest-${index}-birthdate`]
                }
                disabled={paymentConfirmed}
              />
            </div>
            {errors[`guest-${index}-birthdate`] && (
              <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors[`guest-${index}-birthdate`]}
              </p>
            )}
          </label>

          {/* Guest First Name */}
          <label className="block relative group">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              First name
              <span className="text-destructive text-xs">*</span>
            </span>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={localData.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
                placeholder="John"
                className={`${fieldBase} ${fieldWithIcon} ${fieldBorder(
                  !!errors[`guest-${index}-firstName`],
                )} ${
                  localData.firstName ? "border-green-500" : ""
                } ${fieldFocus}`}
                disabled={paymentConfirmed}
              />
            </div>
            {errors[`guest-${index}-firstName`] && (
              <p className="mt-1.5 text-xs text-destructive">
                {errors[`guest-${index}-firstName`]}
              </p>
            )}
          </label>

          {/* Guest Last Name */}
          <label className="block relative group">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              Last name
              <span className="text-destructive text-xs">*</span>
            </span>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={localData.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
                placeholder="Doe"
                className={`${fieldBase} ${fieldWithIcon} ${fieldBorder(
                  !!errors[`guest-${index}-lastName`],
                )} ${
                  localData.lastName ? "border-green-500" : ""
                } ${fieldFocus}`}
                disabled={paymentConfirmed}
              />
            </div>
            {errors[`guest-${index}-lastName`] && (
              <p className="mt-1.5 text-xs text-destructive">
                {errors[`guest-${index}-lastName`]}
              </p>
            )}
          </label>

          {/* Guest Nationality */}
          <label className="block">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              Nationality
              <span className="text-destructive text-xs">*</span>
            </span>
            <Select
              value={localData.nationality}
              onChange={(val) => {
                // Sync WhatsApp country code with nationality
                const countryCode = getNationalityCountryCode(val);
                handleImmediateUpdate({
                  nationality: val,
                  whatsAppCountry: countryCode || localData.whatsAppCountry,
                });
              }}
              options={getNationalityOptions()}
              placeholder="Select nationality"
              ariaLabel="Nationality"
              className="mt-1"
              disabled={paymentConfirmed}
              isValid={!!localData.nationality}
            />
            {errors[`guest-${index}-nationality`] && (
              <p className="mt-1 text-xs text-destructive">
                {errors[`guest-${index}-nationality`]}
              </p>
            )}
          </label>

          {/* Guest WhatsApp Number */}
          <label className="block relative min-w-0">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              WhatsApp number
              <span className="text-destructive text-xs">*</span>
            </span>
            <div className="relative mt-1 flex min-w-0 items-stretch gap-2">
              <Select
                value={localData.whatsAppCountry}
                onChange={(code) => {
                  handleImmediateUpdate({
                    whatsAppCountry: code,
                    whatsAppNumber: "", // Clear number when country changes
                  });
                }}
                options={getCountries().map((country) => {
                  const data = getCountryData(country);
                  const callingCode = safeGetCountryCallingCode(country);
                  const countryName = en[country] || country;
                  return {
                    label: (
                      <span className="inline-flex items-center gap-2">
                        <ReactCountryFlag
                          countryCode={country}
                          svg
                          aria-label={countryName}
                          style={{
                            width: "1rem",
                            height: "0.5rem",
                            flexShrink: 1,
                          }}
                        />
                        <span>{`${data.alpha3} (+${callingCode})`}</span>
                      </span>
                    ),
                    value: country,
                    searchValue:
                      `${data.flag} ${data.alpha3} ${countryName} ${country} ${callingCode}`.toLowerCase(),
                  };
                })}
                placeholder="Country"
                ariaLabel="Country Code"
                disabled={paymentConfirmed}
                searchable
                className={`basis-[136px] min-w-[120px] max-w-[160px] sm:basis-[160px] ${
                  paymentConfirmed ? "disabled-hover" : ""
                }`}
              />
              <div className="flex-1 relative min-w-0">
                <div
                  className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 shadow-sm border-2 ${
                    paymentConfirmed
                      ? localData.whatsAppNumber &&
                        isValidPhoneNumber(
                          `+${safeGetCountryCallingCode(
                            localData.whatsAppCountry,
                          )}${localData.whatsAppNumber}`,
                        )
                        ? "opacity-50 bg-muted/40 border-green-500 cursor-not-allowed"
                        : "opacity-50 bg-muted/40 border-border cursor-not-allowed"
                      : errors[`guest-${index}-whatsAppNumber`]
                        ? "bg-input border-destructive"
                        : localData.whatsAppNumber &&
                            isValidPhoneNumber(
                              `+${safeGetCountryCallingCode(
                                localData.whatsAppCountry,
                              )}${localData.whatsAppNumber}`,
                            )
                          ? "bg-input border-green-500"
                          : "bg-input border-border"
                  } ${
                    !paymentConfirmed
                      ? "focus-within:outline-none focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-md hover:border-primary/50"
                      : ""
                  }`}
                >
                  <span
                    className={`text-muted-foreground mr-2 select-none ${
                      paymentConfirmed ? "opacity-50" : ""
                    }`}
                  >
                    +{safeGetCountryCallingCode(localData.whatsAppCountry)}
                  </span>
                  <input
                    type="tel"
                    value={localData.whatsAppNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, "");
                      const maxLen = getCountryData(
                        localData.whatsAppCountry,
                      ).maxLength;
                      handleChange("whatsAppNumber", value.slice(0, maxLen));
                    }}
                    placeholder="123 456 7890"
                    className={`flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 ${
                      paymentConfirmed
                        ? "opacity-50 text-muted-foreground cursor-not-allowed"
                        : ""
                    }`}
                    disabled={paymentConfirmed}
                  />
                </div>
                {localData.whatsAppNumber &&
                  isValidPhoneNumber(
                    `+${safeGetCountryCallingCode(
                      localData.whatsAppCountry,
                    )}${localData.whatsAppNumber}`,
                  ) &&
                  !errors[`guest-${index}-whatsAppNumber`] && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
              </div>
            </div>
            {!!errors[`guest-${index}-whatsAppNumber`] && (
              <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {errors[`guest-${index}-whatsAppNumber`]}
              </p>
            )}
          </label>
        </div>
      </motion.div>
    );
  },
);

GuestForm.displayName = "GuestForm";

export default GuestForm;

