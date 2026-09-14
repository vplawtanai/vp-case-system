import { calculateFormula, decimalUnits, restoreFormula, type FormulaInput, type FormulaPerson } from "../compensation/formula-calculation";
import { compensationFormulaDefinitions } from "../compensation/formula-engine";
import { distributionRoleIssues, formulasForContext } from "../compensation/formula-presentation";
import { distributionSource, distributionIdentity, distributionLineId, initialDistributionChoices, type DistributionChoice, type DistributionContext } from "./vp-distribution";

export type FormulaContext = DistributionContext & {
  formula_schema_version: 1;
  formula_catalog: typeof compensationFormulaDefinitions;
  formula_people: FormulaPerson[];
};
export type LineFormulaInputs = Record<string, FormulaInput>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => JSON.stringify(key) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
export function formulaCatalogCurrent(context: FormulaContext): boolean {
  return context.formula_schema_version === 1 && canonical(context.formula_catalog) === canonical(compensationFormulaDefinitions);
}
export function initialLineFormulas(context: FormulaContext): LineFormulaInputs {
  return Object.fromEntries(initialDistributionChoices(context).flatMap(choice => choice.formula_result
    ? [[distributionLineId(choice), restoreFormula(choice.formula_result)]] : []));
}
export function lineFormulaChoices(context: FormulaContext, inputs: LineFormulaInputs) {
  const errors: Record<string, string[]> = {}, saved = initialDistributionChoices(context);
  let poolCents = BigInt(0), allocatedCents: bigint | null = BigInt(0);
  const choices: DistributionChoice[] = distributionSource(context).lines.filter(line => line.classification === "professional_fee").map(line => {
    const id = distributionLineId(line), input = inputs[id];
    const calculated = input ? calculateFormula(line.professional_pool, input, context.formula_people) : { result: null, errors: ["formulaRequired"] };
    const editing = !context.current || context.current.status === "draft";
    errors[id] = [...calculated.errors, ...(editing && input ? distributionRoleIssues(input, context.formula_people) : []),
      ...(editing && input && !formulasForContext("vp_revenue_distribution").includes(input.code) ? ["formulaRequired"] : [])];
    const result = calculated.result;
    poolCents += decimalUnits(line.professional_pool, 2) ?? BigInt(0);
    if (!result) allocatedCents = null;
    else if (allocatedCents !== null) for (const row of result.recipients) allocatedCents += decimalUnits(row.amount, 2) ?? BigInt(0);
    if (!result) return saved.find(choice => distributionLineId(choice) === id)!;
    return { ...distributionIdentity(line), referral_amount: String(result.referral_amount),
      company_share_amount: String(result.company_share_amount), work_compensation_amount: String(result.work_compensation_amount),
      formula_result: result };
  });
  return { choices, errors, valid: formulaCatalogCurrent(context) && Object.values(errors).every(values => !values.length),
    progress: { professional_pool: Number(poolCents) / 100, allocated: allocatedCents === null ? null : Number(allocatedCents) / 100,
      remaining: allocatedCents === null ? null : Number(poolCents - allocatedCents) / 100 } };
}
