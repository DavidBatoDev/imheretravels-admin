import ReactCountryFlag from "react-country-flag";
import { getCountries, isValidPhoneNumber } from "react-phone-number-input";
import en from "react-phone-number-input/locale/en";
import BirthdatePicker from "./BirthdatePicker";
import Select from "./Select";

type NationalityOption = {
  label: React.ReactNode;
  value: string;
  searchValue?: string;
};

type MainBookerFormSectionProps = {
  paymentConfirmed: boolean;
  errors: { [k: string]: string };
  showValidationFeedback: boolean;
  fieldBase: string;
  fieldWithIcon: string;
  fieldFocus: string;
  fieldBorder: (err?: boolean) => string;
  isFieldValid: (field: string, value: string) => boolean;

  email: string;
  setEmail: (value: string) => void;
  birthdate: string;
  setBirthdate: (value: string) => void;
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  nationality: string;
  setNationality: (value: string) => void;
  nationalityOptions: NationalityOption[];
  whatsAppCountry: string;
  setWhatsAppCountry: (value: string) => void;
  whatsAppNumber: string;
  setWhatsAppNumber: (value: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<{ [k: string]: string }>>;
  getCountryData: (countryCode: string) => {
    alpha3: string;
    flag: string;
    maxLength: number;
  };
  safeGetCountryCallingCode: (countryCode: string) => string;
};

export default function MainBookerFormSection({
  paymentConfirmed,
  errors,
  showValidationFeedback,
  fieldBase,
  fieldWithIcon,
  fieldFocus,
  fieldBorder,
  isFieldValid,
  email,
  setEmail,
  birthdate,
  setBirthdate,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  nationality,
  setNationality,
  nationalityOptions,
  whatsAppCountry,
  setWhatsAppCountry,
  whatsAppNumber,
  setWhatsAppNumber,
  setErrors,
  getCountryData,
  safeGetCountryCallingCode,
}: MainBookerFormSectionProps) {
  return (
    <div className="transition-all duration-300 ease-out">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              className={`${fieldBase} ${fieldWithIcon} ${fieldBorder(
                !!errors.email,
              )} ${isFieldValid("email", email) ? "border-green-500" : ""} ${fieldFocus}`}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              disabled={paymentConfirmed}
            />
            {isFieldValid("email", email) && !errors.email && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
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
          {errors.email && (
            <p
              id="email-error"
              className="mt-1.5 text-xs text-destructive flex items-center gap-1"
            >
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
              {errors.email}
            </p>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-foreground flex items-center gap-2">
            Birthdate
            <span className="text-destructive text-xs">*</span>
          </span>
          <div className="relative">
            <BirthdatePicker
              value={birthdate}
              onChange={(iso) => setBirthdate(iso)}
              minYear={1920}
              maxYear={new Date().getFullYear()}
              disabled={paymentConfirmed}
              isValid={!!birthdate && !errors?.birthdate}
            />
          </div>
          {errors?.birthdate && (
            <p className="mt-1 text-xs text-destructive">{errors.birthdate}</p>
          )}
        </label>

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
              name="firstName"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Alex"
              className={`${fieldBase} ${fieldWithIcon} ${fieldBorder(
                !!errors.firstName,
              )} ${
                isFieldValid("firstName", firstName) ? "border-green-500" : ""
              } ${fieldFocus}`}
              aria-invalid={!!errors.firstName}
              aria-describedby={
                errors.firstName ? "firstName-error" : undefined
              }
              disabled={paymentConfirmed}
            />
            {isFieldValid("firstName", firstName) && !errors.firstName && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
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
          {errors.firstName && (
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
              {errors.firstName}
            </p>
          )}
        </label>

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
              name="lastName"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Johnson"
              className={`${fieldBase} ${fieldWithIcon} ${fieldBorder(
                !!errors.lastName,
              )} ${isFieldValid("lastName", lastName) ? "border-green-500" : ""} ${fieldFocus}`}
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
              disabled={paymentConfirmed}
            />
            {isFieldValid("lastName", lastName) && !errors.lastName && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
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
          {errors.lastName && (
            <p
              id="lastName-error"
              className="mt-1.5 text-xs text-destructive flex items-center gap-1"
            >
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
              {errors.lastName}
            </p>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-foreground flex items-center gap-2">
            Nationality
            <span className="text-destructive text-xs">*</span>
          </span>
          <Select
            value={nationality || null}
            onChange={setNationality}
            options={nationalityOptions}
            placeholder="Select nationality"
            ariaLabel="Nationality"
            className="mt-1"
            disabled={paymentConfirmed}
            isValid={
              showValidationFeedback && !!nationality && !errors.nationality
            }
            searchable={true}
          />
          {errors.nationality && (
            <p className="mt-1 text-xs text-destructive">
              {errors.nationality}
            </p>
          )}
        </label>

        <label className="block relative min-w-0">
          <span className="text-sm font-semibold text-foreground flex items-center gap-2">
            WhatsApp number
            <span className="text-destructive text-xs">*</span>
          </span>
          <div className="relative mt-1 flex min-w-0 items-stretch gap-2">
            <Select
              value={whatsAppCountry}
              onChange={(code) => {
                setWhatsAppCountry(code);
                setWhatsAppNumber("");
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
              className={`basis-[136px] min-w-[120px] max-w-[160px] sm:basis-[160px] ${paymentConfirmed ? "disabled-hover" : ""}`}
            />
            <div className="flex-1 relative min-w-0">
              <div
                className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 shadow-sm border-2 ${
                  paymentConfirmed
                    ? whatsAppNumber &&
                      isValidPhoneNumber(
                        `+${safeGetCountryCallingCode(whatsAppCountry)}${whatsAppNumber}`,
                      )
                      ? "opacity-50 bg-muted/40 border-green-500 cursor-not-allowed"
                      : "opacity-50 bg-muted/40 border-border cursor-not-allowed"
                    : errors.whatsAppNumber
                      ? "bg-input border-destructive"
                      : whatsAppNumber &&
                          isValidPhoneNumber(
                            `+${safeGetCountryCallingCode(whatsAppCountry)}${whatsAppNumber}`,
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
                  className={`text-muted-foreground mr-2 select-none ${paymentConfirmed ? "opacity-50" : ""}`}
                >
                  +{safeGetCountryCallingCode(whatsAppCountry)}
                </span>
                <input
                  type="tel"
                  value={whatsAppNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    const maxLen = getCountryData(whatsAppCountry).maxLength;
                    const limitedValue = value.slice(0, maxLen);
                    setWhatsAppNumber(limitedValue);

                    const fullNumber = `+${safeGetCountryCallingCode(whatsAppCountry)}${limitedValue}`;
                    setErrors((prev) => {
                      const clone = { ...prev } as any;
                      if (!limitedValue.trim()) {
                        clone.whatsAppNumber = "WhatsApp number is required";
                      } else if (
                        limitedValue.length > 2 &&
                        !isValidPhoneNumber(fullNumber)
                      ) {
                        clone.whatsAppNumber = "Enter a valid phone number";
                      } else if (isValidPhoneNumber(fullNumber)) {
                        delete clone.whatsAppNumber;
                      }
                      return clone;
                    });
                  }}
                  onBlur={() => {
                    const fullNumber = whatsAppNumber
                      ? `+${safeGetCountryCallingCode(whatsAppCountry)}${whatsAppNumber}`
                      : "";
                    setErrors((prev) => {
                      const clone = { ...prev } as any;
                      if (!whatsAppNumber) {
                        clone.whatsAppNumber = "WhatsApp number is required";
                      } else if (!isValidPhoneNumber(fullNumber)) {
                        clone.whatsAppNumber = "Enter a valid phone number";
                      } else {
                        delete clone.whatsAppNumber;
                      }
                      return clone;
                    });
                  }}
                  disabled={paymentConfirmed}
                  placeholder="123 456 7890"
                  maxLength={getCountryData(whatsAppCountry).maxLength}
                  className={`flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 ${paymentConfirmed ? "opacity-50 text-muted-foreground cursor-not-allowed" : ""}`}
                />
              </div>
              {whatsAppNumber &&
                isValidPhoneNumber(
                  `+${safeGetCountryCallingCode(whatsAppCountry)}${whatsAppNumber}`,
                ) &&
                !errors.whatsAppNumber && (
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
          {!!errors.whatsAppNumber && (
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
              {errors.whatsAppNumber}
            </p>
          )}
        </label>
      </div>
    </div>
  );
}
