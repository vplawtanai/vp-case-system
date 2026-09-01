export type MoneyInput = number | string;

export type GrossFirstAllocationItem = {
  amountBeforeTax: MoneyInput;
  vatAmount: MoneyInput;
  totalAmount: MoneyInput;
};

export type GrossFirstAllocationInstallment = {
  percentage: MoneyInput;
  itemPercentages?: MoneyInput[];
};

export type GrossFirstAllocationCell = {
  beforeTax: number;
  vat: number;
  total: number;
};

export type GrossFirstAllocationResult = {
  cells: GrossFirstAllocationCell[][];
  installmentTotals: GrossFirstAllocationCell[];
};

const PERCENT_SCALE = 6;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const PERCENT_TOTAL_UNITS = BigInt(100_000_000);

function decimalToUnits(value: MoneyInput, scale: number) {
  let text = String(value ?? 0).trim();
  if (/e/i.test(text)) text = Number(value).toFixed(scale);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid non-negative decimal: ${text}`);

  const base = BigInt(10) ** BigInt(scale);
  const fraction = match[2] || "";
  const kept = fraction.slice(0, scale).padEnd(scale, "0");
  let units = BigInt(match[1]) * base + BigInt(kept || "0");
  if (fraction.length > scale && Number(fraction[scale]) >= 5) units += ONE;
  return units;
}

function moneyToSatang(value: MoneyInput) {
  return decimalToUnits(value, 2);
}

function percentageToUnits(value: MoneyInput) {
  return decimalToUnits(value, PERCENT_SCALE);
}

function satangToMoney(value: bigint) {
  return Number(value) / 100;
}

function roundRatio(value: bigint, multiplier: bigint, denominator: bigint) {
  if (value < ZERO || multiplier < ZERO || denominator <= ZERO) throw new Error("Invalid allocation ratio");
  const numerator = value * multiplier;
  return (TWO * numerator + denominator) / (TWO * denominator);
}

function allocateByWeights(total: bigint, weights: bigint[]) {
  if (total < ZERO || weights.some((weight) => weight < ZERO)) throw new Error("Allocation inputs must be non-negative");
  const weightTotal = weights.reduce((sum, weight) => sum + weight, ZERO);
  if (weightTotal === ZERO) {
    if (total !== ZERO) throw new Error("Cannot allocate a positive amount without weights");
    return weights.map(() => ZERO);
  }

  const allocations = weights.map((weight) => total * weight / weightTotal);
  const remainders = weights.map((weight, index) => ({
    index,
    remainder: total * weight % weightTotal,
  }));
  let residual = total - allocations.reduce((sum, amount) => sum + amount, ZERO);
  remainders.sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (const candidate of remainders) {
    if (residual === ZERO) break;
    if (weights[candidate.index] === ZERO) continue;
    allocations[candidate.index] += ONE;
    residual -= ONE;
  }
  if (residual !== ZERO) throw new Error("Unable to distribute allocation residual");
  return allocations;
}

function validatePercentages(weights: bigint[]) {
  const total = weights.reduce((sum, weight) => sum + weight, ZERO);
  if (total > PERCENT_TOTAL_UNITS) throw new Error("Allocation percentages exceed 100%");
  return total;
}

export function calculateGrossFirstPercentageAllocation(input: {
  allocationMode: "proportional_all_items" | "per_item";
  items: GrossFirstAllocationItem[];
  installments: GrossFirstAllocationInstallment[];
}): GrossFirstAllocationResult {
  if (!input.items.length || !input.installments.length) {
    return { cells: input.items.map(() => input.installments.map(() => ({ beforeTax: 0, vat: 0, total: 0 }))), installmentTotals: input.installments.map(() => ({ beforeTax: 0, vat: 0, total: 0 })) };
  }

  const itemBeforeTax = input.items.map((item) => moneyToSatang(item.amountBeforeTax));
  const itemVat = input.items.map((item) => moneyToSatang(item.vatAmount));
  const itemGross = input.items.map((item) => moneyToSatang(item.totalAmount));
  itemGross.forEach((gross, index) => {
    if (itemBeforeTax[index] + itemVat[index] !== gross) throw new Error("Source item amounts do not reconcile");
  });

  const installmentCount = input.installments.length;
  const cellGross = input.items.map(() => input.installments.map(() => ZERO));

  if (input.allocationMode === "proportional_all_items") {
    const weights = input.installments.map((installment) => percentageToUnits(installment.percentage));
    const percentageTotal = validatePercentages(weights);
    const quotationGross = itemGross.reduce((sum, amount) => sum + amount, ZERO);
    const allocatedGrossTarget = roundRatio(quotationGross, percentageTotal, PERCENT_TOTAL_UNITS);
    const installmentGrossTargets = allocateByWeights(allocatedGrossTarget, weights);
    const remainingItemGross = [...itemGross];

    input.installments.forEach((_, installmentIndex) => {
      const isFinalCompleteInstallment = percentageTotal === PERCENT_TOTAL_UNITS && installmentIndex === installmentCount - 1;
      const allocations = isFinalCompleteInstallment
        ? [...remainingItemGross]
        : allocateByWeights(installmentGrossTargets[installmentIndex], remainingItemGross);
      allocations.forEach((amount, itemIndex) => {
        cellGross[itemIndex][installmentIndex] = amount;
        remainingItemGross[itemIndex] -= amount;
      });
    });
  } else {
    input.items.forEach((_, itemIndex) => {
      const weights = input.installments.map((installment) => percentageToUnits(installment.itemPercentages?.[itemIndex] ?? 0));
      const percentageTotal = validatePercentages(weights);
      const allocatedGrossTarget = roundRatio(itemGross[itemIndex], percentageTotal, PERCENT_TOTAL_UNITS);
      const allocations = allocateByWeights(allocatedGrossTarget, weights);
      allocations.forEach((amount, installmentIndex) => {
        cellGross[itemIndex][installmentIndex] = amount;
      });
    });
  }

  const cellVat = input.items.map(() => input.installments.map(() => ZERO));
  const cells = input.items.map((_, itemIndex) => {
    const allocatedGross = cellGross[itemIndex].reduce((sum, amount) => sum + amount, ZERO);
    const allocatedVatTarget = itemGross[itemIndex] === ZERO
      ? ZERO
      : roundRatio(itemVat[itemIndex], allocatedGross, itemGross[itemIndex]);
    const vatAllocations = allocateByWeights(allocatedVatTarget, cellGross[itemIndex]);
    vatAllocations.forEach((amount, installmentIndex) => { cellVat[itemIndex][installmentIndex] = amount; });
    return cellGross[itemIndex].map((gross, installmentIndex) => ({
      beforeTax: satangToMoney(gross - vatAllocations[installmentIndex]),
      vat: satangToMoney(vatAllocations[installmentIndex]),
      total: satangToMoney(gross),
    }));
  });

  const installmentTotals = input.installments.map((_, installmentIndex) => {
    const gross = cellGross.reduce((sum, row) => sum + row[installmentIndex], ZERO);
    const vat = cellVat.reduce((sum, row) => sum + row[installmentIndex], ZERO);
    return { beforeTax: satangToMoney(gross - vat), vat: satangToMoney(vat), total: satangToMoney(gross) };
  });

  return { cells, installmentTotals };
}
