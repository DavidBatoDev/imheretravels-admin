import { afterEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.fn();
const getReservationMock = vi.fn();
vi.mock("../api/reservationsApi", () => ({
  confirmReservationPayment: confirmMock,
  getReservation: getReservationMock,
}));

const { runPaymentSuccessAction } = await import("./paymentSuccessAction");

const base = () => ({
  paymentIntentId: "pi_1",
  paymentDocId: "doc_1",
  email: "a@x.com",
  tourPackage: "tour-1",
  completedSteps: [] as number[],
  setCompletedSteps: vi.fn(),
  setPaymentConfirmed: vi.fn(),
  setBookingId: vi.fn(),
  onError: vi.fn(),
  bookingWait: { timeoutMs: 50, intervalMs: 1 },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  confirmMock.mockReset();
  getReservationMock.mockReset();
});

describe("runPaymentSuccessAction", () => {
  it("asks the server to confirm the payment, then creates the booking outside production", async () => {
    confirmMock.mockResolvedValue({ paymentDocId: "doc_1", status: "reserve_paid" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ bookingId: "B-1", bookingDocumentId: "BD-1" }),
    } as any);
    const input = base();

    await runPaymentSuccessAction(input);

    expect(confirmMock).toHaveBeenCalledWith("pi_1", "doc_1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stripe-payments/create-booking",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ paymentDocId: "doc_1" }) }),
    );
    expect(input.setBookingId).toHaveBeenCalledWith("B-1");
    expect(input.setPaymentConfirmed).toHaveBeenCalledWith(true);
    expect(input.setCompletedSteps).toHaveBeenCalledTimes(2);
    expect(input.onError).not.toHaveBeenCalled();
  });

  it("uses the doc the server resolved from the intent when the form lost its id", async () => {
    confirmMock.mockResolvedValue({ paymentDocId: "found_doc", status: "reserve_paid" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ bookingId: "B-2" }),
    } as any);

    await runPaymentSuccessAction({ ...base(), paymentDocId: undefined });

    expect(confirmMock).toHaveBeenCalledWith("pi_1", undefined);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stripe-payments/create-booking",
      expect.objectContaining({ body: JSON.stringify({ paymentDocId: "found_doc" }) }),
    );
  });

  it("does not block the customer when the confirmation check fails", async () => {
    confirmMock.mockRejectedValue(new Error("amount mismatch"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, json: async () => ({}) } as any);
    const input = base();

    await runPaymentSuccessAction(input);

    expect(input.setPaymentConfirmed).toHaveBeenCalledWith(true);
    expect(input.onError).not.toHaveBeenCalled();
  });

  it("in production waits for the webhook's booking by polling the reservation", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENV", "production");
    confirmMock.mockResolvedValue({ paymentDocId: "doc_1", status: "reserve_paid" });
    getReservationMock
      .mockResolvedValueOnce({ booking: { id: "PENDING", documentId: "" } })
      .mockResolvedValueOnce({ booking: { id: "B-9", documentId: "BD-9" } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input = base();

    await runPaymentSuccessAction(input);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getReservationMock).toHaveBeenCalledWith("doc_1");
    expect(input.setBookingId).toHaveBeenCalledWith("B-9");
    expect(input.setPaymentConfirmed).toHaveBeenCalledWith(true);
  });

  it("invokes onError when creating the booking throws", async () => {
    confirmMock.mockResolvedValue({ paymentDocId: "doc_1", status: "reserve_paid" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const input = base();

    await runPaymentSuccessAction(input);

    expect(input.onError).toHaveBeenCalled();
  });
});
