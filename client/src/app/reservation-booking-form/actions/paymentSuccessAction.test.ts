import { describe, expect, it, vi } from "vitest";
import { runPaymentSuccessAction } from "./paymentSuccessAction";

const updateDocMock = vi.fn(async () => undefined);
const getDocsMock = vi.fn(async () => ({ empty: true, docs: [] }));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  updateDoc: updateDocMock,
  serverTimestamp: vi.fn(() => "server-ts"),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDocs: getDocsMock,
  onSnapshot: vi.fn(),
}));

describe("runPaymentSuccessAction", () => {
  it("sets payment confirmed and completed steps when payment doc id provided", async () => {
    updateDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue({ empty: true, docs: [] });

    const setCompletedSteps = vi.fn();
    const setPaymentConfirmed = vi.fn();
    const setBookingId = vi.fn();
    const onError = vi.fn();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ bookingId: "B-1", bookingDocumentId: "BD-1" }),
    } as any);

    await runPaymentSuccessAction({
      db: {} as any,
      paymentIntentId: "pi_1",
      paymentDocId: "doc_1",
      email: "a@x.com",
      firstName: "A",
      lastName: "B",
      birthdate: "1990-01-01",
      nationality: "British",
      bookingType: "Single Booking",
      groupSize: 1,
      tourPackage: "tour-1",
      tourDate: "2026-12-01",
      selectedPackageName: "Tour 1",
      selectedPackageDeposit: 250,
      completedSteps: [],
      setCompletedSteps,
      setPaymentConfirmed,
      setBookingId,
      onError,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stripe-payments/create-booking",
      expect.objectContaining({ method: "POST" }),
    );
    expect(setPaymentConfirmed).toHaveBeenCalledWith(true);
    expect(setCompletedSteps).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("invokes onError when payment document update fails", async () => {
    updateDocMock.mockRejectedValueOnce(new Error("update failed"));

    const onError = vi.fn();

    await runPaymentSuccessAction({
      db: {} as any,
      paymentIntentId: "pi_1",
      paymentDocId: "doc_1",
      email: "a@x.com",
      firstName: "A",
      lastName: "B",
      birthdate: "1990-01-01",
      nationality: "British",
      bookingType: "Single Booking",
      groupSize: 1,
      tourPackage: "tour-1",
      tourDate: "2026-12-01",
      selectedPackageName: "Tour 1",
      selectedPackageDeposit: 250,
      completedSteps: [],
      setCompletedSteps: vi.fn(),
      setPaymentConfirmed: vi.fn(),
      setBookingId: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalled();
  });
});
