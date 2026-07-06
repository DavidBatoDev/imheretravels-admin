import { useEffect } from "react";
import { getCountries, type Country } from "react-phone-number-input";
import type { Firestore } from "firebase/firestore";
import { deriveCustomerRestoreState } from "../../utils/customerHydration";
import {
  buildStripePaymentDocSessionKey,
  getSessionRestoreRoute,
  getSessionRestoreStatus,
  shouldAutoRestoreFromUrlPayment,
  shouldResumePendingFromUrl,
} from "../../utils/sessionRestore";
import {
  deriveBookingRestoreState,
  getPaymentPlanLabelFromRecord,
} from "../../utils/reuseHydration";
import { scheduleGuestsMountHeightSync } from "../../utils/guestUiState";

type UseSessionRestoreOptions = {
  db: Firestore;
  searchParams: { get: (key: string) => string | null } | null;
  debug: boolean;
  replaceWithPaymentId: (docId: string | null) => void;
  safeGetCountryCallingCode: (countryCode: string) => string;
  customerSlice: {
    setEmail: (value: string) => void;
    setFirstName: (value: string) => void;
    setLastName: (value: string) => void;
    setBirthdate: (value: string) => void;
    setNationality: (value: string) => void;
    setWhatsAppCountry: (value: Country) => void;
    setWhatsAppNumber: (value: string) => void;
  };
  bookingSlice: {
    setBookingType: (value: string) => void;
    setGroupSize: (value: number) => void;
    setAdditionalGuests: (value: string[]) => void;
    setTourPackage: (value: string) => void;
    setTourDate: (value: string) => void;
    setFetchedPaymentPlanLabel: (value: string) => void;
    setSelectedPaymentPlan: (value: string) => void;
  };
  uiSlice: {
    setSessionLoading: (value: boolean) => void;
    setGuestsMounted: (value: boolean) => void;
    setGuestsHeight: (value: string) => void;
    guestsContentRef: React.RefObject<HTMLDivElement | null>;
  };
  flowSlice: {
    setPaymentDocId: (value: string | null) => void;
    setPaymentConfirmed: (value: boolean) => void;
    setBookingConfirmed: (value: boolean) => void;
    setBookingId: (value: string) => void;
    setStep: (value: number) => void;
    setCompletedSteps: (
      value: number[] | ((prev: number[]) => number[]),
    ) => void;
  };
};

export const useSessionRestore = ({
  db,
  searchParams,
  debug,
  replaceWithPaymentId,
  safeGetCountryCallingCode,
  customerSlice,
  bookingSlice,
  uiSlice,
  flowSlice,
}: UseSessionRestoreOptions) => {
  const {
    setEmail,
    setFirstName,
    setLastName,
    setBirthdate,
    setNationality,
    setWhatsAppCountry,
    setWhatsAppNumber,
  } = customerSlice;
  const {
    setBookingType,
    setGroupSize,
    setAdditionalGuests,
    setTourPackage,
    setTourDate,
    setFetchedPaymentPlanLabel,
    setSelectedPaymentPlan,
  } = bookingSlice;
  const {
    setSessionLoading,
    setGuestsMounted,
    setGuestsHeight,
    guestsContentRef,
  } = uiSlice;
  const {
    setPaymentDocId,
    setPaymentConfirmed,
    setBookingConfirmed,
    setBookingId,
    setStep,
    setCompletedSteps,
  } = flowSlice;

  useEffect(() => {
    let mounted = true;

    setSessionLoading(true);

    const loadFromSession = async () => {
      try {
        const urlPaymentId = searchParams?.get("paymentid");
        const hasResumeParam = searchParams?.get("resume") === "1";

        if (urlPaymentId) {
          try {
            const { doc, getDoc } = await import("firebase/firestore");
            const snap = await getDoc(doc(db, "stripePayments", urlPaymentId));

            if (snap.exists()) {
              const data = snap.data() as any;

              if (shouldAutoRestoreFromUrlPayment(data)) {
                if (debug)
                  console.debug("URL restore (terms_selected): loading doc", {
                    urlPaymentId,
                    data,
                  });

                if (!mounted) return;

                setPaymentDocId(urlPaymentId);

                const restoredCustomer = deriveCustomerRestoreState({
                  record: data,
                  countries: getCountries(),
                  getCallingCode: (country) =>
                    safeGetCountryCallingCode(country as Country),
                  onUnmatchedPhone: "set-number",
                });
                if (restoredCustomer.email) setEmail(restoredCustomer.email);
                if (restoredCustomer.firstName)
                  setFirstName(restoredCustomer.firstName);
                if (restoredCustomer.lastName)
                  setLastName(restoredCustomer.lastName);
                if (restoredCustomer.birthdate)
                  setBirthdate(restoredCustomer.birthdate);
                if (restoredCustomer.nationality)
                  setNationality(restoredCustomer.nationality);
                if (restoredCustomer.whatsAppCountry)
                  setWhatsAppCountry(
                    restoredCustomer.whatsAppCountry as Country,
                  );
                if (restoredCustomer.whatsAppNumber)
                  setWhatsAppNumber(restoredCustomer.whatsAppNumber);
                const restoredBookingState = deriveBookingRestoreState(data);

                if (data.booking?.type)
                  setBookingType(restoredBookingState.bookingType);
                if (typeof data.booking?.groupSize === "number")
                  setGroupSize(restoredBookingState.groupSize);

                if (restoredBookingState.shouldMountGuests) {
                  scheduleGuestsMountHeightSync({
                    setGuestsMounted,
                    getContentHeight: () =>
                      guestsContentRef.current?.scrollHeight ?? 0,
                    setGuestsHeight,
                  });
                }

                setAdditionalGuests(restoredBookingState.additionalGuests);
                if (data.tour?.packageId) setTourPackage(data.tour.packageId);
                if (data.tour?.date) setTourDate(data.tour.date);

                const urlPaymentPlanLabel = getPaymentPlanLabelFromRecord(data);
                if (urlPaymentPlanLabel) {
                  setFetchedPaymentPlanLabel(urlPaymentPlanLabel);
                }

                setPaymentConfirmed(true);
                setBookingConfirmed(true);
                if (data.booking?.id) setBookingId(data.booking.id);
                if (data.payment?.selectedPaymentPlan)
                  setSelectedPaymentPlan(data.payment.selectedPaymentPlan);
                setStep(3);
                setCompletedSteps([1, 2, 3]);

                return;
              }

              // Unpaid draft opened from a follow-up email link
              // (?paymentid=<id>&resume=1): rehydrate and land on the
              // payment step, mirroring the sessionStorage pending-step2 path.
              if (shouldResumePendingFromUrl(data, hasResumeParam)) {
                if (debug)
                  console.debug("URL restore (pending resume): loading doc", {
                    urlPaymentId,
                    data,
                  });

                if (!mounted) return;

                setPaymentDocId(urlPaymentId);

                const restoredCustomer = deriveCustomerRestoreState({
                  record: data,
                  countries: getCountries(),
                  getCallingCode: (country) =>
                    safeGetCountryCallingCode(country as Country),
                  onUnmatchedPhone: "set-number",
                });
                if (restoredCustomer.email) setEmail(restoredCustomer.email);
                if (restoredCustomer.firstName)
                  setFirstName(restoredCustomer.firstName);
                if (restoredCustomer.lastName)
                  setLastName(restoredCustomer.lastName);
                if (restoredCustomer.birthdate)
                  setBirthdate(restoredCustomer.birthdate);
                if (restoredCustomer.nationality)
                  setNationality(restoredCustomer.nationality);
                if (restoredCustomer.whatsAppCountry)
                  setWhatsAppCountry(
                    restoredCustomer.whatsAppCountry as Country,
                  );
                if (restoredCustomer.whatsAppNumber)
                  setWhatsAppNumber(restoredCustomer.whatsAppNumber);
                const restoredBookingState = deriveBookingRestoreState(data);

                if (data.booking?.type)
                  setBookingType(restoredBookingState.bookingType);
                if (typeof data.booking?.groupSize === "number")
                  setGroupSize(restoredBookingState.groupSize);

                if (restoredBookingState.shouldMountGuests) {
                  scheduleGuestsMountHeightSync({
                    setGuestsMounted,
                    getContentHeight: () =>
                      guestsContentRef.current?.scrollHeight ?? 0,
                    setGuestsHeight,
                  });
                }

                setAdditionalGuests(restoredBookingState.additionalGuests);
                if (data.tour?.packageId) setTourPackage(data.tour.packageId);
                if (data.tour?.date) setTourDate(data.tour.date);

                // Persist the session key so in-tab behavior afterwards
                // matches an organic (non-email) session.
                try {
                  if (data.customer?.email && data.tour?.packageId) {
                    sessionStorage.setItem(
                      buildStripePaymentDocSessionKey(
                        data.customer.email,
                        data.tour.packageId,
                      ),
                      urlPaymentId,
                    );
                  }
                } catch {}

                setStep(2);
                setCompletedSteps((prev) => Array.from(new Set([...prev, 1])));

                return;
              }
            }
          } catch (err) {
            console.warn("Failed to load payment from URL:", err);
          }
        }

        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (!key) continue;
          if (key.startsWith("stripe_payment_doc_")) {
            const docId = sessionStorage.getItem(key);
            if (debug)
              console.debug("session restore: found key", { key, docId });
            if (!docId) continue;

            try {
              const { doc, getDoc } = await import("firebase/firestore");
              const snap = await getDoc(doc(db, "stripePayments", docId));
              if (!snap.exists()) {
                try {
                  sessionStorage.removeItem(key);
                } catch {}
                if (debug)
                  console.debug("session restore: doc missing, removed key", {
                    key,
                    docId,
                  });
                continue;
              }
              const data = snap.data() as any;
              if (debug)
                console.debug("session restore: loaded doc", { docId, data });

              if (!mounted) return;

              setPaymentDocId(docId);
              if (debug)
                console.debug("session restore: setPaymentDocId", docId);
              try {
                replaceWithPaymentId(docId);
              } catch (err) {
                console.debug(
                  "Failed to set paymentid query param on session restore:",
                  err,
                );
              }

              const restoredCustomer = deriveCustomerRestoreState({
                record: data,
                countries: getCountries(),
                getCallingCode: (country) =>
                  safeGetCountryCallingCode(country as Country),
                onUnmatchedPhone: "set-number",
              });
              if (restoredCustomer.email) setEmail(restoredCustomer.email);
              if (restoredCustomer.firstName)
                setFirstName(restoredCustomer.firstName);
              if (restoredCustomer.lastName)
                setLastName(restoredCustomer.lastName);
              if (restoredCustomer.birthdate)
                setBirthdate(restoredCustomer.birthdate);
              if (restoredCustomer.nationality)
                setNationality(restoredCustomer.nationality);
              if (restoredCustomer.whatsAppCountry)
                setWhatsAppCountry(restoredCustomer.whatsAppCountry as Country);
              if (restoredCustomer.whatsAppNumber)
                setWhatsAppNumber(restoredCustomer.whatsAppNumber);
              const restoredBookingState = deriveBookingRestoreState(data);

              if (data.booking?.type)
                setBookingType(restoredBookingState.bookingType);
              if (typeof data.booking?.groupSize === "number")
                setGroupSize(restoredBookingState.groupSize);

              if (restoredBookingState.shouldMountGuests) {
                scheduleGuestsMountHeightSync({
                  setGuestsMounted,
                  getContentHeight: () =>
                    guestsContentRef.current?.scrollHeight ?? 0,
                  setGuestsHeight,
                });
              }

              setAdditionalGuests(restoredBookingState.additionalGuests);
              if (data.tour?.packageId) setTourPackage(data.tour.packageId);
              if (data.tour?.date) setTourDate(data.tour.date);

              const sessionPaymentPlanLabel =
                getPaymentPlanLabelFromRecord(data);
              if (sessionPaymentPlanLabel) {
                setFetchedPaymentPlanLabel(sessionPaymentPlanLabel);
              }

              const restoredStatus = getSessionRestoreStatus(data);
              const restoreRoute = getSessionRestoreRoute(restoredStatus);

              if (restoreRoute === "pending-step2") {
                try {
                  replaceWithPaymentId(docId);
                } catch (err) {
                  console.debug(
                    "Failed to set paymentid query param on session restore:",
                    err,
                  );
                }
                setStep(2);
                setCompletedSteps((prev) => Array.from(new Set([...prev, 1])));
              } else if (restoreRoute === "paid-verify") {
                const stripeIntentId = data.payment?.stripeIntentId;

                if (stripeIntentId) {
                  try {
                    const verifyResponse = await fetch(
                      `/api/stripe-payments/verify-payment?paymentIntentId=${stripeIntentId}`,
                    );
                    const verifyResult = await verifyResponse.json();

                    if (
                      !verifyResponse.ok ||
                      verifyResult.status !== "succeeded"
                    ) {
                      const { doc: firestoreDoc, updateDoc } =
                        await import("firebase/firestore");
                      await updateDoc(
                        firestoreDoc(db, "stripePayments", docId),
                        {
                          "payment.status": "reserve_pending",
                        },
                      );

                      try {
                        replaceWithPaymentId(docId);
                      } catch (err) {
                        console.debug(
                          "Failed to set paymentid query param:",
                          err,
                        );
                      }
                      setStep(2);
                      setCompletedSteps((prev) =>
                        Array.from(new Set([...prev, 1])),
                      );
                      alert(
                        "Payment verification failed. The payment was not completed. Please try again.",
                      );
                      return;
                    }
                  } catch (err) {
                    console.error("Error verifying payment on load:", err);
                    try {
                      replaceWithPaymentId(docId);
                    } catch (err2) {
                      console.debug(
                        "Failed to set paymentid query param:",
                        err2,
                      );
                    }
                    setStep(2);
                    setCompletedSteps((prev) =>
                      Array.from(new Set([...prev, 1])),
                    );
                    return;
                  }
                }

                setPaymentConfirmed(true);
                try {
                  replaceWithPaymentId(docId);
                } catch (err) {
                  console.debug(
                    "Failed to set paymentid query param on session restore:",
                    err,
                  );
                }
                setStep(3);
                if (data.booking?.id) setBookingId(data.booking.id);
                setCompletedSteps((prev) =>
                  Array.from(new Set([...prev, 1, 2])),
                );
              } else {
                setStep(2);
                setCompletedSteps((prev) => Array.from(new Set([...prev, 1])));
              }

              return;
            } catch (err) {
              console.warn("Failed to load stripe payment doc:", err);
              continue;
            }
          }
        }
      } catch (e) {
        console.warn("Error while restoring session payment doc:", e);
      }
    };

    loadFromSession().finally(() => {
      if (mounted) setSessionLoading(false);
    });

    return () => {
      mounted = false;
    };
    // Intentionally mount-only to preserve existing restoration semantics.
  }, []);
};

