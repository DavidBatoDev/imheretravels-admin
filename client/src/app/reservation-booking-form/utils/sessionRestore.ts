export const buildStripePaymentDocSessionKey = (
  email: string,
  tourPackage: string,
): string => {
  return `stripe_payment_doc_${email}_${tourPackage}`;
};

export const buildStripePaymentSessionKey = (
  email: string,
  tourPackage: string,
): string => {
  return `stripe_payment_${email}_${tourPackage}`;
};

export const buildAdditionalGuestsSessionKey = (
  email: string,
  tourPackage: string,
): string => {
  return `additional_guests_${email}_${tourPackage}`;
};

export type SessionRestoreRoute =
  | "pending-step2"
  | "paid-verify"
  | "fallback-step2";

export const getSessionRestoreStatus = (payment: {
  status?: string;
  payment?: { status?: string };
}): string => {
  return payment?.payment?.status || payment?.status || "";
};

export const shouldAutoRestoreFromUrlPayment = (payment: {
  status?: string;
  payment?: { status?: string };
}): boolean => {
  return getSessionRestoreStatus(payment) === "terms_selected";
};

/**
 * URL restore for still-unpaid drafts, gated behind an explicit resume param
 * (`?paymentid=<id>&resume=1`) so only abandoned-booking follow-up email links
 * change behavior — organic `?paymentid=` navigation is untouched.
 */
export const shouldResumePendingFromUrl = (
  payment: {
    status?: string;
    payment?: { status?: string };
  },
  hasResumeParam: boolean,
): boolean => {
  if (!hasResumeParam) {
    return false;
  }

  const status = getSessionRestoreStatus(payment);
  return status === "reserve_pending" || status === "pending";
};

export const getSessionRestoreRoute = (status: string): SessionRestoreRoute => {
  if (status === "reserve_pending") {
    return "pending-step2";
  }

  if (status === "reserve_paid") {
    return "paid-verify";
  }

  return "fallback-step2";
};

export const getCompletedStepsForSessionRestoreRoute = (
  route: SessionRestoreRoute,
): number[] => {
  if (route === "paid-verify") {
    return [1, 2];
  }

  return [1];
};

export const isStaleReservationSessionKey = ({
  key,
  email,
  tourPackage,
}: {
  key: string;
  email: string;
  tourPackage: string;
}): boolean => {
  const isReservationSessionKey =
    key.startsWith("stripe_payment_") || key.startsWith("additional_guests_");

  if (!isReservationSessionKey) {
    return false;
  }

  return !key.includes(email) && !key.includes(tourPackage);
};
