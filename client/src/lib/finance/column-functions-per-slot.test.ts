import { describe, it, expect } from "vitest";
import getP3AmountFunction from "@/app/functions/columns/payment-term-3/p3-amount";
import getP4AmountFunction from "@/app/functions/columns/payment-term-4/p4-amount";
import getTotalPaidAmountFunction from "@/app/functions/columns/payment-setting/paid";
import getRemainingBalanceFunction from "@/app/functions/columns/payment-setting/remaining-balance";
import getPaidTerms from "@/app/functions/columns/payment-setting/paid-terms";
import getFullPaymentRemainingFunction from "@/app/functions/columns/full-payment/full-payment-amount";
import getOverpaidAmountFunction from "@/app/functions/columns/payment-setting/overpaid-amount";
import { calculateInstallmentAmounts } from "@/lib/booking-calculations";

const D = new Date(2026, 0, 1);

// Sam Hernandez, £1,100 tour, £150 reservation, P4: asked 260/230/230/230,
// actually paid 260/230/310, P4 open.
const sam = {
  tour: "Philippine Sunset",
  cost: 1100, resFee: 150, plan: "P4",
  amounts: [260, 230, 230, 230] as const,
  paid: [260, 230, 310, undefined] as const,
  dates: [D, D, D, undefined] as const,
};

describe("column functions — per-slot cash path (grid)", () => {
  it("P4 Amount: recomputes the open term from cash actually received", () => {
    const v = getP4AmountFunction(
      "Oct 31, 2025", false, 0, sam.cost, sam.resFee, "", 0, sam.plan, "Standard Booking, P4",
      undefined, 0,
      sam.dates[0], sam.amounts[0], sam.dates[1], sam.amounts[1], sam.dates[2], sam.amounts[2], sam.dates[3], sam.amounts[3],
      sam.resFee, sam.paid[0], sam.paid[1], sam.paid[2], sam.paid[3],
    );
    expect(v).toBe(150);
  });

  it("P3 Amount: a paid term keeps what it asked for even when overpaid", () => {
    const v = getP3AmountFunction(
      "Sep 26, 2025", false, 0, sam.cost, sam.resFee, "", 0, sam.plan, "Stripe",
      undefined, 0,
      sam.dates[0], sam.amounts[0], sam.dates[1], sam.amounts[1], sam.dates[2], sam.amounts[2], sam.dates[3], sam.amounts[3],
      sam.resFee, sam.paid[0], sam.paid[1], sam.paid[2], sam.paid[3],
    );
    expect(v).toBe(230);
  });

  it("Paid: sums cash received, ignoring any legacy manual credit", () => {
    const v = getTotalPaidAmountFunction(
      sam.tour, sam.resFee, "P1", 260, // legacy spurious credit still on the row
      undefined, 0,
      sam.dates[0], sam.amounts[0], sam.dates[1], sam.amounts[1], sam.dates[2], sam.amounts[2], sam.dates[3], sam.amounts[3],
      0, 0, 0, 0,
      sam.resFee, sam.paid[0], sam.paid[1], sam.paid[2], sam.paid[3], undefined,
    );
    expect(v).toBe(950);
  });

  it("Remaining Balance: cost minus cash received, credit ignored", () => {
    const v = getRemainingBalanceFunction(
      sam.tour, false, 0, sam.cost, sam.resFee, "P1", 260, sam.plan,
      undefined, 0,
      sam.dates[0] as any, sam.amounts[0], sam.dates[1] as any, sam.amounts[1], sam.dates[2] as any, sam.amounts[2], sam.dates[3] as any, sam.amounts[3],
      0, 0, 0, 0,
      sam.resFee, sam.paid[0], sam.paid[1], sam.paid[2], sam.paid[3], undefined,
    );
    expect(v).toBe(150);
  });

  it("Paid Terms: instalment cash only, reservation excluded", async () => {
    const v = await getPaidTerms(
      sam.tour, "P1", 260, undefined as any, 0,
      sam.dates[0], sam.amounts[0], sam.dates[1], sam.amounts[1], sam.dates[2], sam.amounts[2], sam.dates[3] as any, sam.amounts[3],
      sam.resFee,
      sam.resFee, sam.paid[0], sam.paid[1], sam.paid[2], sam.paid[3], undefined,
    );
    expect(v).toBe(800);
  });

  it("Full Payment Amount: a reservation overpayment reduces it, not a credit", () => {
    // £1,199 tour, £250 fee, guest sent £300 → full payment asks 899
    expect(getFullPaymentRemainingFunction("T", "Full Payment", true, 0, 1199, 250, 0, "", 300)).toBe(899);
    // legacy path unchanged: credit still applies when no per-slot cash
    expect(getFullPaymentRemainingFunction("T", "Full Payment", true, 0, 1199, 250, 50, "")).toBe(899);
  });

  it("legacy rows (no *AmountPaid) are byte-for-byte unchanged", () => {
    const v = getTotalPaidAmountFunction(
      sam.tour, sam.resFee, "", 0, undefined, 0,
      sam.dates[0], sam.amounts[0], sam.dates[1], sam.amounts[1], sam.dates[2], sam.amounts[2], sam.dates[3], sam.amounts[3],
      0, 0, 0, 0,
    );
    expect(v).toBe(150 + 260 + 230 + 230);
  });
});

describe("Overpaid Amount column", () => {
  it("is 0 on a legacy row and on a correctly paid per-slot row", () => {
    expect(getOverpaidAmountFunction(sam.tour, 0, sam.cost, sam.resFee, undefined, sam.plan, undefined, undefined, undefined,
      260, undefined, D, 230, undefined, D, 230, undefined, D, 230, undefined, undefined)).toBe(0);
    expect(getOverpaidAmountFunction(sam.tour, 0, sam.cost, sam.resFee, 150, sam.plan, undefined, undefined, undefined,
      260, 260, D, 230, 230, D, 310, 310, D, 150, 150, D)).toBe(0);
  });

  it("reports cash beyond everything owed when the last term is overpaid", () => {
    // £950 owed across 4 terms; guest paid 260 + 230 + 310 + 300 = 1,100 → £150 over
    expect(getOverpaidAmountFunction(sam.tour, 0, sam.cost, sam.resFee, 150, sam.plan, undefined, undefined, undefined,
      260, 260, D, 230, 230, D, 310, 310, D, 150, 300, D)).toBe(150);
  });

  it("full payment plan: overpayment on the single payment", () => {
    // £1,199 tour, £250 fee → 949 due; guest paid 1,000
    expect(getOverpaidAmountFunction("T", 0, 1199, 250, 250, "Full Payment", 949, 1000, D)).toBe(51);
  });

  it("late fees are part of what is owed, so they absorb an overpayment first", () => {
    expect(getOverpaidAmountFunction(sam.tour, 0, sam.cost, sam.resFee, 150, sam.plan, undefined, undefined, undefined,
      260, 260, D, 230, 230, D, 310, 310, D, 150, 300, D, 7.49)).toBe(142.51);
  });
});

describe("select-plan path — calculateInstallmentAmounts honours per-slot cash", () => {
  it("reservation overpayment shrinks every term when a plan is chosen", () => {
    const r = calculateInstallmentAmounts(
      "P4", 1949, null, 250, true, 0, "", "d", "d", "d", "d",
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      300, // reservationAmountPaid
    );
    expect(r.p1Amount).toBe(412.25);
    expect(r.p4Amount).toBe(412.25);
  });

  it("with no per-slot fields the legacy credit path is untouched", () => {
    const r = calculateInstallmentAmounts("P4", 1949, null, 250, true, 100, "Reservation", "d", "d", "d", "d");
    expect(r.p1Amount).toBe(399.75);
  });
});
