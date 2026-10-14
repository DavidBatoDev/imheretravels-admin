import { describe, expect, it } from "vitest";
import {
  buildPublicBookingView,
  hasRequiredPublicBookingFields,
  timestampsFromWire,
  timestampsToWire,
} from "./public-booking-view";

// Shaped like a firebase-admin Timestamp (getters + toDate).
class FakeAdminTs {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number,
  ) {}
  toDate() {
    return new Date(this.seconds * 1000);
  }
}

const complete = {
  bookingId: "B1",
  fullName: "Ana Cruz",
  tourPackageName: "Brazil",
  tourDate: new FakeAdminTs(1800000000, 0),
  formattedDate: "2027-01-15",
  tourDuration: "10 days",
  originalTourCost: 2000,
  paid: 500,
  remainingBalance: 1500,
  bookingType: "Single Booking",
};

describe("public booking view", () => {
  it("requires every field the page needs", () => {
    expect(hasRequiredPublicBookingFields(complete)).toBe(true);
    expect(hasRequiredPublicBookingFields({ ...complete, paid: null })).toBe(false);
    expect(hasRequiredPublicBookingFields({ ...complete, bookingId: undefined })).toBe(false);
  });

  it("projects an allowlist and leaves out secrets", () => {
    const view = buildPublicBookingView("doc1", {
      ...complete,
      access_token: "secret",
      paymentTokens: { p1: { token: "t" } },
      internalNotes: "staff only",
      paymentProgress: "40%",
    }, null);
    expect(view.bookingDocumentId).toBe("doc1");
    expect(view.paymentProgress).toBe(40);
    expect(view).not.toHaveProperty("access_token");
    expect(view).not.toHaveProperty("internalNotes");
    expect(view).not.toHaveProperty("paymentTokens");
    expect(buildPublicBookingView("doc1", { ...complete, paymentTokens: {} }, null, { includePaymentTokens: true }))
      .toHaveProperty("paymentTokens");
  });

  it("falls back to paid / total when no stored progress", () => {
    expect(buildPublicBookingView("d", complete, null).paymentProgress).toBe(25);
    expect(
      buildPublicBookingView("d", { ...complete, isMainBooker: true, discountedTourCost: 1000 }, null).paymentProgress,
    ).toBe(50);
  });

  it("round-trips nested timestamps through JSON", () => {
    const wire = JSON.parse(
      JSON.stringify(
        timestampsToWire({
          tourDate: new FakeAdminTs(10, 5),
          addOns: [{ paidAt: new FakeAdminTs(20, 0), name: "Bike" }],
          p1DatePaid: null,
          note: "x",
        }),
      ),
    );
    expect(wire.tourDate).toEqual({ __ts: [10, 5] });

    const back = timestampsFromWire(wire, (s, n) => ({ s, n })) as any;
    expect(back.tourDate).toEqual({ s: 10, n: 5 });
    expect(back.addOns[0]).toEqual({ paidAt: { s: 20, n: 0 }, name: "Bike" });
    expect(back.p1DatePaid).toBeNull();
    expect(back.note).toBe("x");
  });
});
