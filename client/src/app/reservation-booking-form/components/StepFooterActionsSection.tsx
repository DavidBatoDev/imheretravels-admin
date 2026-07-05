"use client";

import React from "react";
import BookingConfirmationDocument from "./BookingConfirmationDocument";
import Receipt from "./Receipt";
import { generateBookingConfirmationPDF } from "../utils/bookingConfirmationPdf";

type GuestDetail = {
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  whatsAppNumber: string;
  whatsAppCountry: string;
};

type SelectedPackage = {
  name?: string;
  price?: number;
};

type SelectedDateDetail = {
  customOriginal?: number;
};

type AvailablePaymentTerm = {
  isLastMinute: boolean;
};

export type StepFooterActionsSectionProps = {
  step: number;
  bookingConfirmed: boolean;
  paymentConfirmed: boolean;
  confirmingBooking: boolean;
  completedSteps: number[];
  setCompletedSteps: React.Dispatch<React.SetStateAction<number[]>>;
  setStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  setClearing: React.Dispatch<React.SetStateAction<boolean>>;
  guestsWrapRef: React.RefObject<HTMLDivElement | null>;
  animateHeight: (from: number, to: number) => Promise<void>;
  setGuestsHeight: React.Dispatch<React.SetStateAction<string>>;
  setGuestsMounted: React.Dispatch<React.SetStateAction<boolean>>;
  setDateVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setFirstName: React.Dispatch<React.SetStateAction<string>>;
  setLastName: React.Dispatch<React.SetStateAction<string>>;
  setBirthdate: React.Dispatch<React.SetStateAction<string>>;
  setNationality: React.Dispatch<React.SetStateAction<string>>;
  setBookingType: React.Dispatch<React.SetStateAction<string>>;
  setTourPackage: React.Dispatch<React.SetStateAction<string>>;
  setTourDate: React.Dispatch<React.SetStateAction<string>>;
  setAdditionalGuests: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupSize: React.Dispatch<React.SetStateAction<number>>;
  setErrors: React.Dispatch<React.SetStateAction<{ [k: string]: string }>>;
  ANIM_DURATION: number;
  checkExistingPaymentsAndMaybeProceed: () => void | Promise<void>;
  isCreatingPayment: boolean;
  email: string;
  birthdate: string;
  firstName: string;
  lastName: string;
  whatsAppNumber: string;
  whatsAppCountry: string;
  nationality: string;
  bookingType: string;
  tourPackage: string;
  tourDate: string;
  groupSize: number;
  guestDetails: GuestDetail[];
  safeGetCountryCallingCodeFn: (countryCode: string) => string;
  isValidPhoneNumberFn: (value: string) => boolean;
  handleConfirmBooking: () => void | Promise<void>;
  availablePaymentTerm: AvailablePaymentTerm;
  allPlansSelected: boolean;
  bookingId: string;
  selectedPackage?: SelectedPackage;
  selectedDateDetail?: SelectedDateDetail;
  depositAmount: number;
  numberOfPeople: number;
  selectedPaymentPlanLabel: string;
};

export default function StepFooterActionsSection({
  step,
  bookingConfirmed,
  paymentConfirmed,
  confirmingBooking,
  completedSteps,
  setCompletedSteps,
  setStep,
  setClearing,
  guestsWrapRef,
  animateHeight,
  setGuestsHeight,
  setGuestsMounted,
  setDateVisible,
  setEmail,
  setFirstName,
  setLastName,
  setBirthdate,
  setNationality,
  setBookingType,
  setTourPackage,
  setTourDate,
  setAdditionalGuests,
  setGroupSize,
  setErrors,
  ANIM_DURATION,
  checkExistingPaymentsAndMaybeProceed,
  isCreatingPayment,
  email,
  birthdate,
  firstName,
  lastName,
  whatsAppNumber,
  whatsAppCountry,
  nationality,
  bookingType,
  tourPackage,
  tourDate,
  groupSize,
  guestDetails,
  safeGetCountryCallingCodeFn,
  isValidPhoneNumberFn,
  handleConfirmBooking,
  availablePaymentTerm,
  allPlansSelected,
  bookingId,
  selectedPackage,
  selectedDateDetail,
  depositAmount,
  numberOfPeople,
  selectedPaymentPlanLabel,
}: StepFooterActionsSectionProps) {
  return (
    <div className="flex items-center justify-between mt-2">
      {step > 1 && !bookingConfirmed ? (
        <button
          type="button"
          onClick={() => {
            if (step === 3 && !paymentConfirmed) {
              setStep(completedSteps.includes(1) ? 2 : 1);
              return;
            }
            setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
          }}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
      ) : step === 1 && !paymentConfirmed ? (
        <button
          type="button"
          onClick={async () => {
            setClearing(true);
            const startH =
              guestsWrapRef.current?.getBoundingClientRect().height ?? 0;
            await animateHeight(startH, 0);
            setGuestsHeight("0px");
            setGuestsMounted(false);
            setDateVisible(false);
            setTimeout(() => {
              setEmail("");
              setFirstName("");
              setLastName("");
              setBirthdate("");
              setNationality("");
              setBookingType("Single Booking");
              setTourPackage("");
              setTourDate("");
              setAdditionalGuests([]);
              setGroupSize(3);
              setErrors({});
              setTimeout(() => setClearing(false), 10);

              setTimeout(() => {
                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }, ANIM_DURATION + 100);
            }, ANIM_DURATION + 20);
          }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </button>
      ) : (
        <div></div>
      )}

      {step === 1 && !paymentConfirmed && (
        <button
          type="button"
          onClick={() => {
            console.log("🔍 Continue to Payment clicked");
            console.log("📊 Validation state:", {
              isCreatingPayment,
              email: !!email,
              emailValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
              birthdate: !!birthdate,
              firstName: !!firstName,
              lastName: !!lastName,
              whatsAppNumber: !!whatsAppNumber,
              whatsAppValid: whatsAppNumber
                ? isValidPhoneNumberFn(
                    `+${safeGetCountryCallingCodeFn(whatsAppCountry)}${whatsAppNumber}`,
                  )
                : false,
              nationality: !!nationality,
              bookingType,
              tourPackage: !!tourPackage,
              tourDate: !!tourDate,
              guestDetailsLength: guestDetails.length,
              expectedGuestLength:
                bookingType === "Duo Booking" ? 1 : groupSize - 1,
              guestDetailsValid: !guestDetails.some(
                (guest) =>
                  !guest.email ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email) ||
                  !guest.birthdate ||
                  !guest.firstName ||
                  !guest.lastName ||
                  !guest.nationality ||
                  !guest.whatsAppNumber ||
                  !isValidPhoneNumberFn(
                    `+${safeGetCountryCallingCodeFn(guest.whatsAppCountry)}${guest.whatsAppNumber}`,
                  ),
              ),
            });
            checkExistingPaymentsAndMaybeProceed();
          }}
          disabled={isCreatingPayment}
          aria-busy={isCreatingPayment}
          className="group inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-primary to-crimson-red text-primary-foreground rounded-lg shadow-lg hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all duration-200 font-semibold disabled:cursor-wait disabled:hover:scale-100 disabled:hover:shadow-lg"
        >
          Continue to Payment
          <svg
            className="w-5 h-5 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      )}

      {step === 2 && (
        <button
          type="button"
          disabled={!paymentConfirmed}
          onClick={() => {
            if (!completedSteps.includes(2)) {
              setCompletedSteps([...completedSteps, 2]);
            }
            try {
              const sessionKey = `stripe_payment_${email}_${tourPackage}`;
              sessionStorage.removeItem(sessionKey);
            } catch {}
            setStep(3);
          }}
          className={`group inline-flex items-center gap-2 px-8 py-3.5 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 font-semibold ${
            paymentConfirmed
              ? "bg-gradient-to-r from-primary to-crimson-red text-primary-foreground hover:shadow-xl hover:scale-105 focus:ring-primary"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
          }`}
        >
          Continue to Payment Plan
          {paymentConfirmed && (
            <svg
              className="w-5 h-5 group-hover:translate-x-1 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          )}
        </button>
      )}

      {step === 3 && !bookingConfirmed && !paymentConfirmed && (
        <button
          type="button"
          onClick={() => setStep(completedSteps.includes(1) ? 2 : 1)}
          className="group inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-primary to-crimson-red text-primary-foreground rounded-lg shadow-lg hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all duration-200 font-semibold"
        >
          {completedSteps.includes(1)
            ? "Continue to Payment"
            : "Go to Personal & Booking"}
          <svg
            className="w-5 h-5 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      )}

      {step === 3 && !bookingConfirmed && paymentConfirmed && (
        <button
          type="button"
          onClick={handleConfirmBooking}
          className={`group inline-flex items-center gap-2 px-8 py-3.5 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 font-semibold ${
            availablePaymentTerm.isLastMinute || allPlansSelected
              ? "bg-gradient-to-r from-spring-green to-green-500 text-white hover:shadow-xl hover:scale-105 focus:ring-spring-green"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          }`}
          disabled={
            (!availablePaymentTerm.isLastMinute && !allPlansSelected) ||
            confirmingBooking
          }
        >
          {confirmingBooking ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Confirming...
            </>
          ) : (
            <>
              Complete Reservation now
              <svg
                className="w-5 h-5 group-hover:scale-110 transition-transform"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </>
          )}
        </button>
      )}

      {step === 3 && bookingConfirmed && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div
            id="booking-confirmation-doc"
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: "-99999px",
              opacity: 0,
              pointerEvents: "none",
              width: "100%",
            }}
          >
            <BookingConfirmationDocument
              bookingId={bookingId}
              tourName={selectedPackage?.name || "Tour"}
              tourDate={tourDate}
              email={email}
              firstName={firstName}
              lastName={lastName}
              paymentPlan={selectedPaymentPlanLabel}
              reservationFee={depositAmount}
              totalAmount={(selectedPackage?.price || 0) * numberOfPeople}
              remainingBalance={
                ((selectedDateDetail?.customOriginal ?? selectedPackage?.price) ||
                  0) *
                  numberOfPeople -
                depositAmount
              }
              paymentDate={new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              currency="GBP"
            />
          </div>

          <div className="relative z-10 flex justify-center py-8 px-4 print:hidden">
            <div className="max-w-2xl w-full bg-card rounded-2xl shadow-xl p-8 border border-border">
              <div className="bg-spring-green/10 border border-spring-green/30 p-6 rounded-lg mb-6 print:hidden print:mb-0 print:border-spring-green/10 print:bg-green-50">
                <div className="flex items-start gap-3">
                  <svg
                    className="h-8 w-8 text-spring-green flex-shrink-0 mt-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-foreground mb-2">
                      Reservation Confirmed!
                    </h2>
                    <p className="text-muted-foreground">
                      You're all set for {selectedPackage?.name}
                      {numberOfPeople > 1 && (
                        <span className="font-semibold">
                          {" "}
                          ({numberOfPeople} travelers)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="hidden print:block bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">
                  Reservation Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-300">
                    <span className="text-sm text-gray-600">Reservation ID</span>
                    <span className="text-sm font-mono font-semibold text-gray-900">
                      {bookingId}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-300">
                    <span className="text-sm text-gray-600">Booking Type</span>
                    <span className="text-sm font-medium text-gray-900">
                      {bookingType}
                      {numberOfPeople > 1 && (
                        <span className="text-xs text-gray-600 ml-1">
                          ({numberOfPeople} travelers)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-300">
                    <span className="text-sm text-gray-600">Tour</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedPackage?.name}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-300">
                    <span className="text-sm text-gray-600">Tour Date</span>
                    <span className="text-sm font-medium text-gray-900">
                      {tourDate}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-300">
                    <span className="text-sm text-gray-600">Email</span>
                    <span className="text-sm font-medium text-gray-900">
                      {email}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-600">Payment Plan</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedPaymentPlanLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-muted/30 rounded-lg p-6 mb-6 print:hidden">
                <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
                  Reservation Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">
                      Reservation ID
                    </span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {bookingId}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">
                      Booking Type
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {bookingType}
                      {numberOfPeople > 1 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({numberOfPeople} travelers)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Tour</span>
                    <span className="text-sm font-medium text-foreground">
                      {selectedPackage?.name}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">
                      Tour Date
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {tourDate}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm font-medium text-foreground">
                      {email}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">
                      Payment Plan
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {selectedPaymentPlanLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="my-8 border-t-2 border-border print:hidden"></div>

              <div className="mb-6 print:page-break-before">
                <Receipt
                  bookingId={bookingId}
                  tourName={selectedPackage?.name || "Tour"}
                  reservationFee={depositAmount}
                  currency="GBP"
                  email={email}
                  totalAmount={
                    ((selectedDateDetail?.customOriginal ?? selectedPackage?.price) ||
                      0) * numberOfPeople
                  }
                  remainingBalance={
                    ((selectedDateDetail?.customOriginal ?? selectedPackage?.price) ||
                      0) *
                      numberOfPeople -
                    depositAmount
                  }
                  travelDate={tourDate}
                  paymentDate={new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  numberOfTravelers={numberOfPeople}
                />
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  What's Next?
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-spring-green text-white flex-shrink-0 mt-0.5">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">
                      Check your email at{" "}
                      <span className="font-semibold text-foreground">{email}</span>{" "}
                      for a confirmation message with your complete reservation
                      details and payment schedule.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-spring-green text-white flex-shrink-0 mt-0.5">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">
                      Follow the payment schedule outlined in your email to
                      complete your payments on time.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-spring-green text-white flex-shrink-0 mt-0.5">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">
                      Get ready for an unforgettable adventure with I'm Here
                      Travels!
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  const fallbackDisplayId = "SB-IDD-20260327-JD002";
                  const isDocId = (id?: string) =>
                    !!id && /^[A-Za-z0-9]{20,}$/.test(id);
                  const confirmationId =
                    bookingId && !isDocId(bookingId) ? bookingId : fallbackDisplayId;
                  try {
                    const paymentPlanLabel = selectedPaymentPlanLabel;
                    const pdf = await generateBookingConfirmationPDF(
                      confirmationId,
                      selectedPackage?.name || "Tour",
                      tourDate,
                      email,
                      firstName,
                      lastName,
                      paymentPlanLabel.replace(/^P\d+_[A-Z_]+\s-\s/, ""),
                      depositAmount,
                      (selectedPackage?.price || 0) * numberOfPeople,
                      (selectedPackage?.price || 0) * numberOfPeople -
                        depositAmount,
                      new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }),
                      "GBP",
                      numberOfPeople,
                      bookingType,
                    );
                    pdf.save(`IHT_Reservation-Confirmation_${confirmationId}.pdf`);
                  } catch (error) {
                    console.error("Error generating PDF:", error);
                    alert("Failed to generate PDF. Please try again.");
                  }
                }}
                className="mt-4 w-full px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition"
              >
                Download Receipt
              </button>

              <div
                role="status"
                aria-live="polite"
                className="mt-6 rounded-md bg-spring-green/10 border border-spring-green/30 p-4 text-sm text-creative-midnight"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-spring-green text-white">
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">You're on the list</div>
                    <div className="text-xs text-muted-foreground">
                      We'll send a confirmation to{" "}
                      <span className="font-medium">{email}</span> if provided.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
