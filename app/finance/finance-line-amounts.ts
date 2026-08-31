export type FinancePriceTaxMode = "non_vat" | "vat_exclusive" | "vat_inclusive";

export type FinanceLineAmounts = {
  enteredTotal: number;
  amountBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
};

export function calculateFinanceLineAmounts(
  quantity: number,
  unitRate: number,
  priceTaxMode: FinancePriceTaxMode,
  vatRate: number,
): FinanceLineAmounts {
  const enteredTotal = roundMoney(quantity * unitRate);
  const amountBeforeVat = priceTaxMode === "vat_inclusive"
    ? roundMoney(enteredTotal / (1 + vatRate / 100))
    : enteredTotal;
  const vatAmount = priceTaxMode === "non_vat"
    ? 0
    : priceTaxMode === "vat_inclusive"
      ? roundMoney(enteredTotal - amountBeforeVat)
      : roundMoney((amountBeforeVat * vatRate) / 100);

  return {
    enteredTotal,
    amountBeforeVat,
    vatAmount,
    totalAmount: priceTaxMode === "vat_inclusive"
      ? enteredTotal
      : roundMoney(amountBeforeVat + vatAmount),
  };
}

export function roundFinanceMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundMoney(value: number) {
  return roundFinanceMoney(value);
}
