export const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const hasPaidDate = (value: unknown): boolean => {
  if (value == null) return false;

  if (typeof value === "object" && (value as { type?: string })?.type === "firestore/timestamp/1.0") {
    return true;
  }

  if (typeof value === "object" && typeof (value as { seconds?: number }).seconds === "number") {
    return true;
  }

  if (value instanceof Date && !isNaN(value.getTime())) return true;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "null" && normalized !== "undefined";
  }

  return true;
};

const creditOrderMap: Record<string, number> = {
  Reservation: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

const paymentPlanTermsMap: Record<string, number> = {
  "": 1,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

export const getCreditOrder = (
  creditFrom?: string,
  creditAmount?: number | string | null,
): number => {
  const amount = toNumber(creditAmount);
  if (amount <= 0) return -1;
  return creditOrderMap[(creditFrom ?? "").trim()] ?? -1;
};

export const getPaymentPlanTerms = (paymentPlan?: string | null): number =>
  paymentPlanTermsMap[(paymentPlan ?? "").trim()] ?? 1;

const splitAmountWithRemainder = (total: number, terms: number): number[] => {
  const safeTerms = Number.isFinite(terms) ? Math.max(0, Math.floor(terms)) : 0;
  if (safeTerms === 0) return [];

  const roundedTotal = roundCurrency(total);
  if (safeTerms === 1) return [roundedTotal];

  const base = Math.trunc((roundedTotal / safeTerms) * 100) / 100;
  const amounts = new Array<number>(safeTerms).fill(base);
  const allocated = base * (safeTerms - 1);
  amounts[safeTerms - 1] = roundCurrency(roundedTotal - allocated);

  return amounts;
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value == null) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const allocateByWeight = (
  total: number,
  indices: number[],
  weights: number[],
): number[] => {
  if (indices.length === 0) return [];

  const totalCents = Math.max(0, Math.round(roundCurrency(total) * 100));
  if (totalCents === 0) return new Array<number>(indices.length).fill(0);

  const safeWeights = weights.map((weight) =>
    Math.max(0, roundCurrency(weight)),
  );
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    return splitAmountWithRemainder(roundCurrency(total), indices.length);
  }

  const allocationsInCents = new Array<number>(indices.length).fill(0);
  const fractions = safeWeights.map((weight, index) => {
    const raw = (weight / weightSum) * totalCents;
    const floored = Math.floor(raw);
    allocationsInCents[index] = floored;
    return { index, fraction: raw - floored };
  });

  let remainder = totalCents - allocationsInCents.reduce((sum, cents) => sum + cents, 0);
  if (remainder > 0) {
    const order = fractions
      .slice()
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

    for (let i = 0; i < remainder; i += 1) {
      const target = order[i % order.length];
      allocationsInCents[target.index] += 1;
    }
  }

  return allocationsInCents.map((cents) => roundCurrency(cents / 100));
};

export const allocateInstallmentAmounts = (
  totalAmount: number | string | null | undefined,
  termsInput: number,
  creditFrom?: string | null,
  creditAmount?: number | string | null,
): number[] => {
  const terms = Number.isFinite(termsInput)
    ? Math.max(0, Math.floor(termsInput))
    : 0;
  if (terms === 0) return [];

  const total = toNumber(totalAmount);
  const creditAmt = toNumber(creditAmount);
  const normalizedCreditFrom = (creditFrom ?? "").trim();
  const creditOrder = getCreditOrder(normalizedCreditFrom, creditAmt);

  if (creditOrder === -1) {
    return splitAmountWithRemainder(total, terms);
  }

  if (creditOrder === 0) {
    return splitAmountWithRemainder(total - creditAmt, terms);
  }

  if (creditOrder > terms) {
    return splitAmountWithRemainder(total, terms);
  }

  // Credit against a specific installment term (P1–P4) is a discount that
  // only reduces that one term's due amount; every other term keeps its
  // normal, even share of `total` — the customer's overall balance drops by
  // exactly the credit amount.
  const allocations = splitAmountWithRemainder(total, terms);
  const creditIndex = creditOrder - 1;
  allocations[creditIndex] = roundCurrency(
    Math.max(0, (allocations[creditIndex] ?? 0) - creditAmt),
  );

  return allocations;
};

export const allocateInstallmentAmountsWithPaidLocks = (
  totalAmount: number | string | null | undefined,
  termsInput: number,
  creditFrom?: string | null,
  creditAmount?: number | string | null,
  currentTermAmounts?: Array<number | string | null | undefined>,
  termPaidDates?: unknown[],
): number[] => {
  const terms = Number.isFinite(termsInput)
    ? Math.max(0, Math.floor(termsInput))
    : 0;
  if (terms === 0) return [];

  const total = roundCurrency(toNumber(totalAmount));
  const baseAllocations = allocateInstallmentAmounts(
    total,
    terms,
    creditFrom,
    creditAmount,
  );

  if (!currentTermAmounts?.length || !termPaidDates?.length) {
    return baseAllocations;
  }

  const allocations = baseAllocations.slice(0, terms);
  const lockedIndices: number[] = [];
  const unlockedIndices: number[] = [];

  for (let index = 0; index < terms; index += 1) {
    const isPaid = hasPaidDate(termPaidDates[index]);
    const currentAmount = toFiniteNumberOrNull(currentTermAmounts[index]);

    if (isPaid && currentAmount != null) {
      allocations[index] = roundCurrency(currentAmount);
      lockedIndices.push(index);
    } else {
      unlockedIndices.push(index);
    }
  }

  if (lockedIndices.length === 0) {
    return baseAllocations;
  }

  if (unlockedIndices.length === 0) {
    return allocations;
  }

  const lockedTotal = roundCurrency(
    lockedIndices.reduce((sum, index) => sum + (allocations[index] ?? 0), 0),
  );
  // Target the credit-adjusted grand total (sum of baseAllocations), not the
  // raw pre-credit `total` — otherwise crediting one term while another is
  // already locked-paid would force the unlocked term(s) back up to make the
  // raw total, silently cancelling out the credit. A locked term that
  // collected slightly more or less than its theoretical share (e.g.
  // reconciling a real, out-of-band payment) has that difference absorbed by
  // the remaining unlocked term(s), so every term still sums to the
  // credit-adjusted total exactly.
  const grandTarget = roundCurrency(
    baseAllocations.reduce((sum, amount) => sum + (toNumber(amount) || 0), 0),
  );
  const unlockedTarget = roundCurrency(grandTarget - lockedTotal);

  if (unlockedTarget <= 0) {
    unlockedIndices.forEach((index) => {
      allocations[index] = 0;
    });
    return allocations;
  }

  const unlockedWeights = unlockedIndices.map(
    (index) => baseAllocations[index] ?? 0,
  );
  const unlockedAllocations = allocateByWeight(
    unlockedTarget,
    unlockedIndices,
    unlockedWeights,
  );

  unlockedIndices.forEach((index, idx) => {
    allocations[index] = roundCurrency(unlockedAllocations[idx] ?? 0);
  });

  return allocations;
};

export const isManualCreditApplied = (
  creditFrom?: string | null,
  creditAmount?: number | string | null,
  fullPaymentDatePaid?: unknown,
  p1DatePaid?: unknown,
  p2DatePaid?: unknown,
  p3DatePaid?: unknown,
  p4DatePaid?: unknown,
): boolean => {
  const amount = toNumber(creditAmount);
  if (amount <= 0) return false;

  const source = (creditFrom ?? "").trim();

  if (source === "Reservation") return true;
  if (source === "Full Payment") return hasPaidDate(fullPaymentDatePaid);
  if (source === "P1") return hasPaidDate(p1DatePaid);
  if (source === "P2") return hasPaidDate(p2DatePaid);
  if (source === "P3") return hasPaidDate(p3DatePaid);
  if (source === "P4") return hasPaidDate(p4DatePaid);

  return false;
};

export const getAppliedManualCreditAmount = (
  creditFrom?: string | null,
  creditAmount?: number | string | null,
  fullPaymentDatePaid?: unknown,
  p1DatePaid?: unknown,
  p2DatePaid?: unknown,
  p3DatePaid?: unknown,
  p4DatePaid?: unknown,
): number =>
  isManualCreditApplied(
    creditFrom,
    creditAmount,
    fullPaymentDatePaid,
    p1DatePaid,
    p2DatePaid,
    p3DatePaid,
    p4DatePaid,
  )
    ? toNumber(creditAmount)
    : 0;

export const roundCurrency = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

