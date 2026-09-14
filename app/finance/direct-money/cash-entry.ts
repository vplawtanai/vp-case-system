import { decimalUnits } from "../compensation/formula-calculation";
import { resolveVatEvidence } from "../document-decision/shared";
import { calculateStructuredWht } from "../payments/tax";
import { directLineAmounts, type DirectInput, type DirectLine } from "./shared";

const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), RATE_SCALE = BigInt(1000000);
const MAX_BASE = BigInt(99999999999900);
const roundRatio = (numerator: bigint, denominator: bigint) => (TWO * numerator + denominator) / (TWO * denominator);
export type CashLineResult = { line: DirectLine; error: string | null };

export function deriveCashLine(line: DirectLine, actual: number | null, customWhtBase = false, manualBase = false): CashLineResult {
  const fail = (error: string): CashLineResult => ({ line, error });
  const cash = actual === null ? null : decimalUnits(actual, 2);
  if (cash === null || cash <= ZERO) return fail("amountInvalid");
  const vatRate = decimalUnits(line.vat_rate, 4);
  if (vatRate === null || vatRate > RATE_SCALE) return fail("rateInvalid");
  if (resolveVatEvidence(line.vat_treatment_json, line.vat_applicable, line.vat_rate) === "unknown") return fail("vatRequired");
  if (line.wht_applicability === "unknown") return fail("whtRequired");
  const withholding = line.wht_applicability === "applies";
  const whtRate = withholding ? decimalUnits(line.wht_rate ?? "", 4) : ZERO;
  if (whtRate === null || (withholding && whtRate <= ZERO) || whtRate > RATE_SCALE) return fail("whtInvalid");
  const v = line.vat_applicable ? vatRate : ZERO;
  let fixedWht = ZERO;
  if (withholding && customWhtBase) {
    const tax = calculateStructuredWht(line.wht_base, String(line.wht_rate), String(line.wht_base));
    if (!tax) return fail("whtInvalid");
    fixedWht = decimalUnits(tax.whtAmount, 2)!;
  }
  const w = customWhtBase ? ZERO : whtRate;
  const denominator = RATE_SCALE + v - w;
  const candidate = (base: bigint): DirectLine => ({ ...line, base: Number(base) / 100,
    wht_base: withholding ? customWhtBase ? line.wht_base : Number(base) / 100 : null,
    wht_rate: withholding ? line.wht_rate : null });
  function matches(row: DirectLine): boolean {
    const base = decimalUnits(row.base, 2);
    if (base === null || base <= ZERO || base > MAX_BASE) return false;
    const whtBase = row.wht_base === null ? null : decimalUnits(row.wht_base, 2);
    if (withholding && (whtBase === null || whtBase <= ZERO || whtBase > base)) return false;
    if (!withholding && (row.wht_base !== null || row.wht_rate !== null)) return false;
    const amounts = directLineAmounts(row);
    const vat = decimalUnits(amounts.vat, 2), gross = decimalUnits(amounts.gross, 2);
    const tax = amounts.wht === null ? null : decimalUnits(amounts.wht, 2);
    // Accept only shared-calculator results that also agree with deployed numeric rounding.
    return vat === roundRatio(base * v, RATE_SCALE) && gross === base + vat
      && tax !== null && (!withholding || tax > ZERO) && gross - tax === cash
      && amounts.cash !== null && decimalUnits(amounts.cash, 2) === cash;
  }
  // Preserve valid saved evidence, including a different base on a rounding plateau.
  if ((customWhtBase || !withholding || line.wht_base === line.base) && matches(line)) return { line, error: null };
  if (manualBase) return fail("reverseUnresolved");
  if (denominator <= ZERO) return fail("reverseUnresolved");
  const numerator = (cash + fixedWht) * RATE_SCALE;
  const nearest = roundRatio(numerator, denominator);
  if (nearest > ZERO && nearest <= MAX_BASE && matches(candidate(nearest))) return { line: candidate(nearest), error: null };

  // Each rounded tax contributes at most half a satang of error. Search the exact
  // bounded interval, using the monotone cash projection (all rates are <= 100%).
  let low = (numerator - RATE_SCALE) / denominator;
  let high = (numerator + RATE_SCALE) / denominator + ONE;
  if (low < ONE) low = ONE;
  const minimumWhtBase = withholding ? customWhtBase ? decimalUnits(line.wht_base!, 2)! : (RATE_SCALE / TWO + whtRate - ONE) / whtRate : ONE;
  if (low < minimumWhtBase) low = minimumWhtBase;
  if (high > MAX_BASE) high = MAX_BASE;
  const projected = (base: bigint) => base + roundRatio(base * v, RATE_SCALE) - roundRatio(base * w, RATE_SCALE) - fixedWht;
  while (low < high) {
    const mid = (low + high) / TWO;
    if (projected(mid) < cash) low = mid + ONE; else high = mid;
  }
  if (low <= MAX_BASE && projected(low) === cash && matches(candidate(low))) return { line: candidate(low), error: null };
  return fail("reverseUnresolved");
}

export function initialCashAllocations(input: DirectInput): Record<string, number | null> {
  return Object.fromEntries(input.lines.map(line => [line.source_line_id, directLineAmounts(line).cash]));
}
export function allocateActualMoney(input: DirectInput, choices: Record<string, number | null>) {
  const total = decimalUnits(input.cash_amount, 2);
  const explicit = input.lines.slice(0, -1).map(line => choices[line.source_line_id] ?? null);
  const cents = explicit.map(amount => amount === null ? null : decimalUnits(amount, 2));
  const sum = cents.some(amount => amount === null || amount <= ZERO) ? null : cents.reduce<bigint>((value, amount) => value + amount!, ZERO);
  const remaining = total === null || sum === null ? null : total - sum;
  const remainder = remaining === null || remaining < ZERO || remaining > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(remaining) / 100;
  return { amounts: [...explicit, remainder], remainder,
    valid: total !== null && total > ZERO && remainder !== null && remainder > 0 };
}
export function prepareCashEntry(input: DirectInput, choices: Record<string, number | null>, customBases: Record<string, boolean>, manualBases: Record<string, boolean>) {
  const allocation = allocateActualMoney(input, choices);
  const results = input.lines.map((line, i) => deriveCashLine(line, allocation.amounts[i], !!customBases[line.source_line_id], !!manualBases[line.source_line_id]));
  return { allocation, results, valid: allocation.valid && results.every(row => row.error === null),
    input: { ...input, lines: results.map(row => row.line) } };
}
