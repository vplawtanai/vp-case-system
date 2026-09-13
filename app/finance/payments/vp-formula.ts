import { calculateFormula, restoreFormula, type FormulaInput, type FormulaPerson } from "../compensation/formula-calculation";
import { compensationFormulaDefinitions } from "../compensation/formula-engine";
import { distributionSource, initialDistributionChoices, type DistributionChoice, type DistributionContext } from "./vp-distribution";

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
    ? [[choice.invoice_item_id, restoreFormula(choice.formula_result)]] : []));
}
export function lineFormulaChoices(context: FormulaContext, inputs: LineFormulaInputs) {
  const errors: Record<string, string[]> = {}, saved = initialDistributionChoices(context);
  const choices: DistributionChoice[] = distributionSource(context).lines.filter(line => line.classification === "professional_fee").map(line => {
    const input = inputs[line.invoice_item_id];
    const calculated = input ? calculateFormula(line.professional_pool, input, context.formula_people) : { result: null, errors: ["formulaRequired"] };
    errors[line.invoice_item_id] = calculated.errors;
    const result = calculated.result;
    if (!result) return saved.find(choice => choice.invoice_item_id === line.invoice_item_id)!;
    return { invoice_item_id: line.invoice_item_id, referral_amount: String(result.referral_amount),
      company_share_amount: String(result.company_share_amount), work_compensation_amount: String(result.work_compensation_amount),
      formula_result: result };
  });
  return { choices, errors, valid: formulaCatalogCurrent(context) && Object.values(errors).every(values => !values.length) };
}
