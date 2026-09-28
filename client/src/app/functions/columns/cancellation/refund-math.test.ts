import { describe, expect, it } from "vitest";

import getAdminFee from "../payment-setting/admin-fee";
import getNonRefundableAmount from "./non-refundable-amount";
import getRefundableAmount from "./refundable-amount";

const MID = "50% of non-reservation amount minus admin fee";
const EARLY = "100% of non-reservation amount minus admin fee";

async function run(opts: {
  paid: number;
  fullPaymentAmount?: number;
  paidTerms?: number;
  eligibleRefund: string;
  lateFees?: Array<[number, string]>;
}) {
  const late = [0, 1, 2, 3].flatMap((i) => opts.lateFees?.[i] ?? [0, ""]);
  const reason = "Guest - Change of plans";
  const rf = 250;
  const adminFee = await getAdminFee(
    "Guest",
    opts.eligibleRefund,
    opts.paidTerms ?? 0,
    opts.fullPaymentAmount ?? "",
    rf,
    0,
    reason,
    opts.paid,
    ...late,
  );
  const refundable = await getRefundableAmount(
    reason,
    adminFee,
    opts.paid,
    opts.paidTerms ?? 0,
    rf,
    opts.fullPaymentAmount ?? "",
    0,
    "2026-09-28",
    opts.eligibleRefund,
    ...late,
  );
  const nonRefundable = await getNonRefundableAmount(
    "Guest",
    "2026-09-28",
    opts.eligibleRefund,
    opts.paid,
    refundable,
  );
  return { adminFee, refundable, nonRefundable };
}

describe("guest cancellation refund math (Full Payment plan)", () => {
  // SB-BZT-20261227-JG004: £1,699 tour, £250 deposit paid, balance £1,449 unpaid.
  it("deposit only → nothing refundable, deposit retained", async () => {
    const r = await run({ paid: 250, fullPaymentAmount: 1449, eligibleRefund: MID });
    expect(r).toEqual({ adminFee: 0, refundable: 0, nonRefundable: 250 });
  });

  it("paid in full, mid-range → 50% of £1,449 minus 10% fee", async () => {
    const r = await run({ paid: 1699, fullPaymentAmount: 1449, eligibleRefund: MID });
    expect(r.adminFee).toBeCloseTo(144.9);
    expect(r.refundable).toBeCloseTo(579.6);
    expect(r.nonRefundable).toBeCloseTo(1119.4);
  });

  it("paid in full, early → 100% of £1,449 minus 10% fee", async () => {
    const r = await run({ paid: 1699, fullPaymentAmount: 1449, eligibleRefund: EARLY });
    expect(r.refundable).toBeCloseTo(1304.1);
    expect(r.nonRefundable).toBeCloseTo(394.9);
  });
});

describe("guest cancellation refund math (instalments) is unchanged", () => {
  it("50% of paid terms minus 10% of paid terms", async () => {
    const r = await run({ paid: 916, paidTerms: 666, eligibleRefund: "50% of paid terms minus admin fee" });
    expect(r.adminFee).toBeCloseTo(66.6);
    expect(r.refundable).toBeCloseTo(266.4);
    expect(r.nonRefundable).toBeCloseTo(649.6);
  });
});

describe("paid late fees are never refunded", () => {
  it("full payment: £50 paid late fee is excluded from refund and admin fee", async () => {
    const r = await run({
      paid: 1749,
      fullPaymentAmount: 1449,
      eligibleRefund: EARLY,
      lateFees: [[50, "2026-08-01"]],
    });
    expect(r.adminFee).toBeCloseTo(144.9);
    expect(r.refundable).toBeCloseTo(1304.1);
    expect(r.nonRefundable).toBeCloseTo(444.9);
  });

  it("unpaid late fee (no date paid) changes nothing", async () => {
    const r = await run({
      paid: 1699,
      fullPaymentAmount: 1449,
      eligibleRefund: EARLY,
      lateFees: [[50, ""]],
    });
    expect(r.refundable).toBeCloseTo(1304.1);
  });
});
