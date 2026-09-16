import {
  compensationFormulaDefinitions as catalog, createAllocation, generateAllocations,
  normalizeAllocationForState, type AllocationRow, type FormulaCode,
} from "./formula-engine";

export type FormulaDefinition = typeof catalog.formulas[number] & {
  version: number; recipient_buckets: typeof catalog.recipient_buckets; calculation: string;
};
export function formulaSnapshot(code: FormulaCode): FormulaDefinition | undefined {
  const definition = catalog.formulas.find(row => row.code === code);
  return definition ? structuredClone({ ...definition, version: catalog.version,
    recipient_buckets: catalog.recipient_buckets, calculation: catalog.distribution_calculation }) : undefined;
}
export type FormulaPerson = { id: string; name: string };
export type FormulaInput = { code: FormulaCode; version: number; rows: AllocationRow[] };
export type FormulaBucket = "referral_amount" | "company_share_amount" | "work_compensation_amount";
export type FormulaRecipient = {
  component_no: number; recipient_type: string; role_label: string;
  recipient_kind: "company" | "user" | "external"; recipient_user_id: string | null; recipient_name: string;
  percent: number | null; fixed_amount: number | null; amount: number; bucket: FormulaBucket;
  rounding_adjustment_cents: number;
  recipient_payee_id?: string;
};
export type FormulaResult = {
  schema_version: 1; formula_code: FormulaCode; formula_version: number; formula_snapshot: FormulaDefinition;
  calculation: string; pool: number; recipients: FormulaRecipient[];
  referral_amount: number; company_share_amount: number; work_compensation_amount: number;
};

export function decimalUnits(value: string | number, scale: number): bigint | null {
  const text = String(value);
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * (BigInt(10) ** BigInt(scale)) + BigInt(fraction.padEnd(scale, "0"));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? result : null;
}

export function initialFormula(code: FormulaCode, pool: number): FormulaInput {
  const rows = generateAllocations(code, pool === 0 ? 1 : pool).map(row => pool === 0 ? { ...row, amount: "0" } : row);
  if (code === "custom") rows.push(createAllocation("company", "Company", 0, true, "Company Share"));
  return { code, version: catalog.version, rows: rows.map(normalizeAllocationForState) };
}

// Both workflows use the same presets, roles and parameters. Legacy batches keep
// their historical rounding; authoritative distributions use exact-cent evidence.
export function calculateFormula(poolValue: number, input: FormulaInput, people: FormulaPerson[] = [],
  frozenDefinition?: FormulaDefinition): { result: FormulaResult | null; errors: string[] } {
  const definition = frozenDefinition ?? formulaSnapshot(input.code);
  const errors = new Set<string>(), pool = decimalUnits(poolValue, 2);
  if (!definition || input.version !== definition.version || input.code !== definition.code || pool === null || !input.rows.length || input.rows.length > 50)
    return { result: null, errors: ["formulaRequired"] };
  const fixed = definition.mode === "fixed", denominator = BigInt(1000000);
  const parameters = input.rows.map(row => decimalUnits(fixed ? row.amount : row.percent, fixed ? 2 : 4));
  if (parameters.some(value => value === null)) return { result: null, errors: ["parameterInvalid"] };
  const values = parameters as bigint[];
  if (fixed ? values.reduce((sum, value) => sum + value, BigInt(0)) !== pool
    : values.reduce((sum, value) => sum + value, BigInt(0)) !== denominator) errors.add("reconcile");
  if (definition.mode === "company_only" && (input.rows.length !== 1 || input.rows[0].recipient_type !== "company")) errors.add("formulaContract");
  if (!fixed && !input.rows.some(row => row.recipient_type === "company")) errors.add("formulaContract");
  if (definition.mode === "work_pool") {
    const source = input.rows.filter(row => row.recipient_type === "source");
    const company = input.rows.filter(row => row.recipient_type === "company");
    const work = input.rows.filter(row => row.recipient_type !== "company" && row.recipient_type !== "source");
    if (source.length !== 1 || company.length !== 1 || work.filter(row => row.role_label === "Lead Lawyer / Case Owner").length !== 1
      || decimalUnits(source[0]?.percent ?? "", 4) !== BigInt(definition.source_percent ?? 0) * BigInt(10000)
      || decimalUnits(company[0]?.percent ?? "", 4) !== BigInt(definition.company_percent ?? 0) * BigInt(10000)
      || work.reduce((sum, row) => sum + (decimalUnits(row.percent, 4) ?? BigInt(0)), BigInt(0)) !== BigInt(definition.work_percent ?? 0) * BigInt(10000)) errors.add("formulaContract");
  }
  const amounts = fixed ? [...values] : values.map(value => pool * value / denominator);
  const floorAmounts = [...amounts];
  if (!fixed && !errors.has("reconcile")) {
    const remainder = Number(pool - amounts.reduce((sum, value) => sum + value, BigInt(0)));
    const ranked = values.map((value, index) => ({ index, remainder: pool * value % denominator }))
      .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (let index = 0; index < remainder; index++) amounts[ranked[index].index] += BigInt(1);
  }
  if (pool > BigInt(0) && amounts.some(amount => amount <= BigInt(0))) errors.add("parameterInvalid");
  const recipients: FormulaRecipient[] = input.rows.map((row, index) => {
    const bucket = definition.recipient_buckets[row.recipient_type as keyof typeof catalog.recipient_buckets] as FormulaBucket | undefined;
    const company = row.recipient_type === "company";
    if (!bucket || row.is_company_share !== company) errors.add("roleRequired");
    const role = row.role_label === "Other" ? row.custom_role?.trim() || "" : row.role_label.trim();
    if (!role || role.length > 200) errors.add("roleRequired");
    const kind = company ? "company" : row.recipient_user_id === "__other__" ? "external" : "user";
    const user = people.find(person => person.id === row.recipient_user_id);
    const name = company ? "Company" : kind === "external" ? row.recipient_name.trim() : user?.name || "";
    if (!name || name.length > 300 || (kind === "user" && !user)) errors.add("recipientRequired");
    return { component_no: index + 1, recipient_type: row.recipient_type, role_label: role,
      ...(kind === "external" && row.recipient_payee_id ? { recipient_payee_id: row.recipient_payee_id } : {}),
      recipient_kind: kind, recipient_user_id: kind === "user" ? row.recipient_user_id || null : null, recipient_name: name,
      percent: fixed ? null : Number(values[index]) / 10000, fixed_amount: fixed ? Number(values[index]) / 100 : null,
      amount: Number(amounts[index]) / 100, bucket: bucket ?? "work_compensation_amount",
      rounding_adjustment_cents: Number(amounts[index] - floorAmounts[index]) };
  });
  const identityKeys = recipients.map(row => JSON.stringify([row.recipient_kind, row.recipient_user_id ?? row.recipient_payee_id ?? row.recipient_name, row.role_label, row.bucket]));
  if (new Set(identityKeys).size !== identityKeys.length) errors.add("duplicateRecipient");
  const totals = { referral_amount: 0, company_share_amount: 0, work_compensation_amount: 0 };
  for (const bucket of Object.keys(totals) as FormulaBucket[]) totals[bucket] = Number(recipients.reduce((sum, row, index) => sum + (row.bucket === bucket ? amounts[index] : BigInt(0)), BigInt(0))) / 100;
  return { result: { schema_version: 1, formula_code: input.code, formula_version: input.version,
    formula_snapshot: structuredClone(definition), calculation: definition.calculation, pool: poolValue, recipients, ...totals }, errors: [...errors] };
}

export function restoreFormula(result: FormulaResult): FormulaInput {
  return { code: result.formula_code, version: result.formula_version, rows: result.recipients.map(row => normalizeAllocationForState({
    ...createAllocation(row.recipient_type, row.recipient_name, row.percent ?? 0, row.recipient_kind === "company", row.role_label),
    recipient_user_id: row.recipient_kind === "external" ? "__other__" : row.recipient_user_id ?? "",
    ...(row.recipient_payee_id ? { recipient_payee_id: row.recipient_payee_id } : {}),
    amount: String(row.fixed_amount ?? row.amount),
  })) };
}
