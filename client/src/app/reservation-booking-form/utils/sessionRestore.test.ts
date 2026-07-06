import { describe, expect, it } from "vitest";
import {
  buildAdditionalGuestsSessionKey,
  buildStripePaymentDocSessionKey,
  buildStripePaymentSessionKey,
  getCompletedStepsForSessionRestoreRoute,
  getSessionRestoreRoute,
  getSessionRestoreStatus,
  isStaleReservationSessionKey,
  shouldAutoRestoreFromUrlPayment,
  shouldResumePendingFromUrl,
} from "./sessionRestore";

describe("sessionRestore", () => {
  it("builds stable session keys", () => {
    expect(buildStripePaymentDocSessionKey("a@x.com", "tour-1")).toBe(
      "stripe_payment_doc_a@x.com_tour-1",
    );
    expect(buildStripePaymentSessionKey("a@x.com", "tour-1")).toBe(
      "stripe_payment_a@x.com_tour-1",
    );
    expect(buildAdditionalGuestsSessionKey("a@x.com", "tour-1")).toBe(
      "additional_guests_a@x.com_tour-1",
    );
  });

  it("identifies stale reservation keys by current email/tour context", () => {
    expect(
      isStaleReservationSessionKey({
        key: "stripe_payment_doc_other@x.com_tour-2",
        email: "a@x.com",
        tourPackage: "tour-1",
      }),
    ).toBe(true);

    expect(
      isStaleReservationSessionKey({
        key: "additional_guests_a@x.com_tour-2",
        email: "a@x.com",
        tourPackage: "tour-1",
      }),
    ).toBe(false);

    expect(
      isStaleReservationSessionKey({
        key: "some_other_key",
        email: "a@x.com",
        tourPackage: "tour-1",
      }),
    ).toBe(false);
  });

  it("reads session restore status from nested payment first", () => {
    expect(
      getSessionRestoreStatus({ payment: { status: "reserve_pending" } }),
    ).toBe("reserve_pending");
    expect(getSessionRestoreStatus({ status: "reserve_paid" })).toBe(
      "reserve_paid",
    );
    expect(getSessionRestoreStatus({})).toBe("");
  });

  it("allows URL auto-restore only for terms_selected", () => {
    expect(
      shouldAutoRestoreFromUrlPayment({
        payment: { status: "terms_selected" },
      }),
    ).toBe(true);
    expect(
      shouldAutoRestoreFromUrlPayment({ payment: { status: "reserve_paid" } }),
    ).toBe(false);
  });

  it("resumes pending drafts from URL only with the resume param", () => {
    expect(
      shouldResumePendingFromUrl(
        { payment: { status: "reserve_pending" } },
        true,
      ),
    ).toBe(true);
    expect(shouldResumePendingFromUrl({ status: "pending" }, true)).toBe(true);

    // No resume param → organic ?paymentid= navigation stays unchanged
    expect(
      shouldResumePendingFromUrl(
        { payment: { status: "reserve_pending" } },
        false,
      ),
    ).toBe(false);

    // Paid or plan-selected drafts never take the pending-resume path
    expect(
      shouldResumePendingFromUrl({ payment: { status: "reserve_paid" } }, true),
    ).toBe(false);
    expect(
      shouldResumePendingFromUrl(
        { payment: { status: "terms_selected" } },
        true,
      ),
    ).toBe(false);
  });

  it("maps statuses to session restore routes", () => {
    expect(getSessionRestoreRoute("reserve_pending")).toBe("pending-step2");
    expect(getSessionRestoreRoute("reserve_paid")).toBe("paid-verify");
    expect(getSessionRestoreRoute("unknown")).toBe("fallback-step2");
  });

  it("maps routes to completed steps consistently", () => {
    expect(getCompletedStepsForSessionRestoreRoute("pending-step2")).toEqual([
      1,
    ]);
    expect(getCompletedStepsForSessionRestoreRoute("paid-verify")).toEqual([
      1, 2,
    ]);
    expect(getCompletedStepsForSessionRestoreRoute("fallback-step2")).toEqual([
      1,
    ]);
  });
});
