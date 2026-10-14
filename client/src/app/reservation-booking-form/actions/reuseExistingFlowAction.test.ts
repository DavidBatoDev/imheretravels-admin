import { describe, expect, it, vi } from "vitest";
import { runReuseExistingFlowAction } from "./reuseExistingFlowAction";

const {
  getPaymentStatusMock,
  getReuseExistingFlowMock,
  reuseReservePaidActionMock,
  reusePendingPaymentActionMock,
  reuseTermsSelectedActionMock,
} = vi.hoisted(() => ({
  getPaymentStatusMock: vi.fn(() => "reserve_paid"),
  getReuseExistingFlowMock: vi.fn(() => "reserve-paid"),
  reuseReservePaidActionMock: vi.fn(async () => ({
    outcome: "confirmed-with-plan",
    bookingDocId: "booking-1",
    paymentPlanLabel: "P1",
    selectedPaymentPlan: "p1_single_installment",
  })),
  reusePendingPaymentActionMock: vi.fn(async () => ({
    succeeded: true,
    failed: false,
  })),
  reuseTermsSelectedActionMock: vi.fn(async () => ({
    outcome: "confirmed-with-plan",
    bookingDocId: "booking-1",
    paymentPlanLabel: "P1",
    selectedPaymentPlan: "p1_single_installment",
  })),
}));

vi.mock("../utils/paymentLookup", () => ({
  getPaymentStatus: getPaymentStatusMock,
  getReuseExistingFlow: getReuseExistingFlowMock,
  getStripePaymentSessionStorageKey: vi.fn(() => "session-key"),
}));

vi.mock("./reuseExistingPaymentAction", () => ({
  reuseReservePaidAction: reuseReservePaidActionMock,
  reusePendingPaymentAction: reusePendingPaymentActionMock,
  reuseTermsSelectedAction: reuseTermsSelectedActionMock,
}));

vi.mock("../utils/customerHydration", () => ({
  deriveCustomerRestoreState: vi.fn(() => ({})),
}));

vi.mock("../utils/reuseHydration", () => ({
  deriveBookingRestoreState: vi.fn(() => ({
    bookingType: "Single Booking",
    groupSize: 3,
    additionalGuests: [],
    shouldMountGuests: false,
  })),
}));

vi.mock("../utils/guestUiState", () => ({
  scheduleGuestsMountHeightSync: vi.fn(),
}));

vi.mock("react-phone-number-input", () => ({
  getCountries: vi.fn(() => ["GB", "US"]),
}));

const buildBaseInput = () => ({
  rec: { id: "doc-1" } as any,
  effects: {
    storage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      getAllKeys: vi.fn(() => []),
    },
    navigation: {
      replaceUrl: vi.fn(),
      replaceWithPaymentId: vi.fn(),
      reloadPage: vi.fn(),
    },
    notification: {
      alert: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    http: {
      getJson: vi.fn(),
      postJson: vi.fn(),
    },
    reservations: {
      getBookingPaymentPlan: vi.fn(async () => null),
      syncStatus: vi.fn(async () => "reserve_pending"),
      discard: vi.fn(),
    },
  },
  pathname: "/reservation-booking-form",
  email: "traveler@example.com",
  tourPackage: "tour-1",
  selectedPackageName: "Tour 1",
  depositAmount: 250,
  completedSteps: [] as number[],
  safeGetCountryCallingCodeFn: vi.fn(() => "44"),
  setEmail: vi.fn(),
  setFirstName: vi.fn(),
  setLastName: vi.fn(),
  setBirthdate: vi.fn(),
  setNationality: vi.fn(),
  setWhatsAppCountry: vi.fn(),
  setWhatsAppNumber: vi.fn(),
  setBookingType: vi.fn(),
  setGroupSize: vi.fn(),
  setAdditionalGuests: vi.fn(),
  setGuestsMounted: vi.fn(),
  setGuestsHeight: vi.fn(),
  getGuestsContentHeight: vi.fn(() => 100),
  setTourPackage: vi.fn(),
  setTourDate: vi.fn(),
  setIsCreatingPayment: vi.fn(),
  setShowEmailModal: vi.fn(),
  setPaymentDocId: vi.fn(),
  setFetchedPaymentPlanLabel: vi.fn(),
  setBookingId: vi.fn(),
  setPaymentConfirmed: vi.fn(),
  setBookingConfirmed: vi.fn(),
  setSelectedPaymentPlan: vi.fn(),
  setCompletedSteps: vi.fn(),
  setStep: vi.fn(),
  replaceWithPaymentId: vi.fn(),
});

describe("runReuseExistingFlowAction", () => {
  it("handles reserve-paid flow and advances to step 3", async () => {
    getReuseExistingFlowMock.mockReturnValueOnce("reserve-paid");

    const input = buildBaseInput();
    await runReuseExistingFlowAction(input);

    expect(reuseReservePaidActionMock).toHaveBeenCalled();
    expect(input.setShowEmailModal).toHaveBeenCalledWith(false);
    expect(input.setPaymentDocId).toHaveBeenCalledWith("doc-1");
    expect(input.setPaymentConfirmed).toHaveBeenCalledWith(true);
    expect(input.setBookingConfirmed).toHaveBeenCalledWith(true);
    expect(input.setStep).toHaveBeenCalledWith(3);
  });

  it("handles reserve-pending flow and resets creating state", async () => {
    getReuseExistingFlowMock.mockReturnValueOnce("reserve-pending");

    const input = buildBaseInput();
    input.rec = {
      id: "doc-2",
      customer: { email: "from-rec@example.com" },
      tour: { packageId: "tour-2", packageName: "Tour 2", date: "2026-12-01" },
      payment: { amount: 300 },
      booking: { type: "Single Booking", groupSize: 3 },
    };

    await runReuseExistingFlowAction(input);

    expect(input.setIsCreatingPayment).toHaveBeenCalledWith(true);
    expect(reusePendingPaymentActionMock).toHaveBeenCalled();
    expect(input.setShowEmailModal).toHaveBeenCalledWith(false);
    expect(input.setPaymentDocId).toHaveBeenCalledWith("doc-2");
    expect(input.setStep).toHaveBeenCalledWith(2);
    expect(input.setIsCreatingPayment).toHaveBeenCalledWith(false);
  });

  it("uses fallback behavior for other statuses", async () => {
    getReuseExistingFlowMock.mockReturnValueOnce("fallback");

    const input = buildBaseInput();
    await runReuseExistingFlowAction(input);

    expect(input.effects.storage.setItem).toHaveBeenCalledWith(
      "session-key",
      "doc-1",
    );
    expect(input.replaceWithPaymentId).toHaveBeenCalledWith("doc-1");
    expect(input.setStep).toHaveBeenCalledWith(2);
  });
});
