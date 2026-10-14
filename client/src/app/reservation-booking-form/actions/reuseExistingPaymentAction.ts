import { canDiscardExistingPayment } from "../utils/paymentLookup";
import type { ReservationSideEffects } from "../types/sideEffects";

export type DiscardExistingPaymentActionResult = {
  updatedRecords: Array<any>;
  shouldCloseModal: boolean;
  nextStep: 2 | null;
  shouldAddStepOne: boolean;
  blocked: boolean;
  failed: boolean;
};

export type ReusePendingPaymentActionResult = {
  succeeded: boolean;
  failed: boolean;
};

export type ReuseReservePaidActionResult = {
  outcome:
    | "verification-failed-reload"
    | "confirmed-with-plan"
    | "confirmed-needs-plan";
  bookingDocId: string | null;
  paymentPlanLabel: string | null;
  selectedPaymentPlan: unknown | null;
};

export type ReuseTermsSelectedActionResult = {
  outcome: "confirmed-with-plan" | "confirmed-without-plan";
  bookingDocId: string | null;
  paymentPlanLabel: string | null;
  selectedPaymentPlan: unknown | null;
};

export const discardExistingPaymentAction = async ({
  effects,
  recId,
  paymentStatus,
  foundStripePayments,
  createPlaceholder,
  initPaymentPayload,
}: {
  effects: ReservationSideEffects;
  recId: string;
  paymentStatus?: string;
  foundStripePayments: Array<any>;
  createPlaceholder: () => Promise<string | null>;
  initPaymentPayload: {
    email: string;
    tourPackage: string;
    tourPackageName: string;
    amountGBP: number;
  };
}): Promise<DiscardExistingPaymentActionResult> => {
  const status = paymentStatus || "";

  if (!canDiscardExistingPayment(status)) {
    effects.notification.alert(
      "Cannot discard a reservation that is already paid or confirmed. If you need help, contact support.",
    );
    return {
      updatedRecords: foundStripePayments,
      shouldCloseModal: false,
      nextStep: null,
      shouldAddStepOne: false,
      blocked: true,
      failed: false,
    };
  }

  try {
    await effects.reservations.discard(recId);
    const updatedRecords = foundStripePayments.filter((d) => d.id !== recId);

    if (updatedRecords.length === 0) {
      const newPaymentDocId = await createPlaceholder();

      if (newPaymentDocId) {
        try {
          const response = await effects.http.postJson(
            "/api/stripe-payments/init-payment",
            {
              ...initPaymentPayload,
              paymentDocId: newPaymentDocId,
              meta: {
                source: "reservation-form-new",
                createdAt: Date.now(),
              },
            },
          );

          if (!response.ok || (response.data as any)?.error) {
            throw new Error(
              ((response.data as any)?.error as string) ||
                "Failed to initialize payment",
            );
          }
        } catch (err) {
          effects.notification.error("Error initializing new payment:", err);
          // Keep current behavior: continue even if init-payment fails.
        }
      }

      return {
        updatedRecords,
        shouldCloseModal: true,
        nextStep: 2,
        shouldAddStepOne: true,
        blocked: false,
        failed: false,
      };
    }

    return {
      updatedRecords,
      shouldCloseModal: false,
      nextStep: null,
      shouldAddStepOne: false,
      blocked: false,
      failed: false,
    };
  } catch (err) {
    effects.notification.error(
      "Failed to discard existing stripePayment:",
      err,
    );
    effects.notification.alert(
      "Unable to discard reservation. Please try again.",
    );
    return {
      updatedRecords: foundStripePayments,
      shouldCloseModal: false,
      nextStep: null,
      shouldAddStepOne: false,
      blocked: false,
      failed: true,
    };
  }
};

export const reusePendingPaymentAction = async ({
  effects,
  pathname,
  rec,
  initPaymentPayload,
  sessionStorageKey,
}: {
  effects: ReservationSideEffects;
  pathname: string;
  rec: { id: string };
  initPaymentPayload: {
    email: string;
    tourPackage: string;
    tourPackageName: string;
    amountGBP: number;
  };
  sessionStorageKey: string;
}): Promise<ReusePendingPaymentActionResult> => {
  try {
    const response = await effects.http.postJson(
      "/api/stripe-payments/init-payment",
      {
        ...initPaymentPayload,
        paymentDocId: rec.id,
        meta: {
          source: "reservation-form-reuse",
          reuseAttempt: Date.now(),
        },
      },
    );

    if (!response.ok || (response.data as any)?.error) {
      throw new Error(
        ((response.data as any)?.error as string) ||
          "Failed to initialize payment",
      );
    }

    effects.storage.setItem(sessionStorageKey, rec.id);
    effects.navigation.replaceWithPaymentId(pathname, rec.id);

    return {
      succeeded: true,
      failed: false,
    };
  } catch (err) {
    effects.notification.error("Error reusing existing payment:", err);
    effects.notification.alert(
      "Unable to reuse existing payment. Please try again.",
    );
    return {
      succeeded: false,
      failed: true,
    };
  }
};

export const reuseReservePaidAction = async ({
  effects,
  pathname,
  rec,
  sessionStorageKey,
}: {
  effects: ReservationSideEffects;
  pathname: string;
  rec: any;
  sessionStorageKey: string;
}): Promise<ReuseReservePaidActionResult> => {
  const stripeIntentId = rec?.payment?.stripeIntentId;
  const bookingDocId = rec?.booking?.documentId || rec?.booking?.id || null;
  const preferredBookingDocId =
    rec?.bookingId ||
    (rec?.booking?.id && rec?.booking?.id !== "PENDING"
      ? rec.booking.id
      : null) ||
    (bookingDocId && bookingDocId !== "PENDING" ? bookingDocId : null);
  const paymentPlanLabel =
    rec?.payment?.paymentPlanDetails?.label ||
    rec?.paymentPlanDetails?.label ||
    null;

  if (stripeIntentId) {
    try {
      const response = await effects.http.getJson<{ status?: string }>(
        `/api/stripe-payments/verify-payment?paymentIntentId=${stripeIntentId}`,
      );

      if (!response.ok || response.data?.status !== "succeeded") {
        await effects.reservations.syncStatus(rec.id);
        effects.notification.alert(
          "Payment verification failed. The payment was not completed successfully. Please try again.",
        );
        effects.navigation.reloadPage();

        return {
          outcome: "verification-failed-reload",
          bookingDocId: preferredBookingDocId,
          paymentPlanLabel,
          selectedPaymentPlan: null,
        };
      }
    } catch (err) {
      effects.notification.error("Error verifying payment:", err);
      // Preserve current behavior: continue cautiously if verification call errors.
    }
  }

  let selectedPaymentPlan: unknown | null = null;
  let hasPaymentPlan = false;

  if (bookingDocId && bookingDocId !== "PENDING" && bookingDocId !== "") {
    try {
      const bookingPlan = await effects.reservations.getBookingPaymentPlan(rec.id);

      if (bookingPlan) {
        hasPaymentPlan = true;
        selectedPaymentPlan = bookingPlan;
      }
    } catch (err) {
      effects.notification.error(
        "Error checking booking for payment plan:",
        err,
      );
    }
  }

  try {
    effects.storage.setItem(sessionStorageKey, rec.id);
  } catch {}
  effects.navigation.replaceWithPaymentId(pathname, rec.id);

  if (hasPaymentPlan) {
    return {
      outcome: "confirmed-with-plan",
      bookingDocId: bookingDocId,
      paymentPlanLabel,
      selectedPaymentPlan,
    };
  }

  return {
    outcome: "confirmed-needs-plan",
    bookingDocId: preferredBookingDocId,
    paymentPlanLabel,
    selectedPaymentPlan: null,
  };
};

export const reuseTermsSelectedAction = async ({
  effects,
  pathname,
  rec,
  sessionStorageKey,
}: {
  effects: ReservationSideEffects;
  pathname: string;
  rec: any;
  sessionStorageKey: string;
}): Promise<ReuseTermsSelectedActionResult> => {
  const bookingDocId = rec?.booking?.documentId || rec?.booking?.id || null;
  const paymentPlanLabel =
    rec?.payment?.paymentPlanDetails?.label ||
    rec?.paymentPlanDetails?.label ||
    null;

  let selectedPaymentPlan: unknown | null = null;

  if (bookingDocId && bookingDocId !== "PENDING" && bookingDocId !== "") {
    try {
      const bookingPlan = await effects.reservations.getBookingPaymentPlan(rec.id);

      if (bookingPlan) {
        selectedPaymentPlan = bookingPlan;
      }
    } catch (err) {
      effects.notification.error("Error fetching booking payment plan:", err);
    }
  }

  try {
    effects.storage.setItem(sessionStorageKey, rec.id);
  } catch {}
  effects.navigation.replaceWithPaymentId(pathname, rec.id);

  if (selectedPaymentPlan) {
    return {
      outcome: "confirmed-with-plan",
      bookingDocId,
      paymentPlanLabel,
      selectedPaymentPlan,
    };
  }

  return {
    outcome: "confirmed-without-plan",
    bookingDocId,
    paymentPlanLabel,
    selectedPaymentPlan: null,
  };
};
