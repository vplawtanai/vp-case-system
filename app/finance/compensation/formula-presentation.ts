import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";
import { compensationFormulaDefinitions, formulaCodes, getRoleLabelForSave, getWorkPoolRecipientType, renderFormula, type AllocationRow, type FormulaCode } from "./formula-engine";
import type { FormulaBucket, FormulaInput, FormulaPerson } from "./formula-calculation";

export type FormulaContextName = "compensation" | "vp_revenue_distribution";
// Presentation only: never included in the immutable, versioned economic catalog.
const presentation: Record<FormulaCode, { contexts: FormulaContextName[]; label?: string }> = {
  pao_line: { contexts: ["compensation", "vp_revenue_distribution"] },
  tun_line: { contexts: ["compensation", "vp_revenue_distribution"] },
  source_worker_qc: { contexts: ["compensation", "vp_revenue_distribution"], label: "vpFormula.threeBucketFormula" },
  custom: { contexts: ["compensation", "vp_revenue_distribution"] },
  travel_fee: { contexts: ["compensation"] },
};
export function formulasForContext(context: FormulaContextName) {
  return formulaCodes.filter(code => presentation[code].contexts.includes(context));
}
export function contextualFormulaLabel(code: FormulaCode, context: FormulaContextName, locale: UiLocale) {
  const key = context === "vp_revenue_distribution" ? presentation[code]?.label : undefined;
  return key ? translate(locale, key) : renderFormula(code, locale);
}
export const workRoles = [
  { value: "Lead Lawyer / Case Owner", label: "vpFormula.lead" },
  { value: "Co-Lawyer / Co-Worker", label: "vpFormula.coworker" },
  { value: "Assistant", label: "vpFormula.assistant" },
  { value: "Quality Controller", label: "vpFormula.quality" },
  { value: "Lawyer", label: "finance.compensation.type.lawyer" },
] as const;
export function workRoleType(role: string) {
  return role === "Lawyer" ? "lawyer" : getWorkPoolRecipientType(role);
}
export const formulaBuckets = ["referral_amount", "company_share_amount", "work_compensation_amount"] as const;
export function allocationBucket(row: AllocationRow): FormulaBucket | undefined {
  return compensationFormulaDefinitions.recipient_buckets[row.recipient_type as keyof typeof compensationFormulaDefinitions.recipient_buckets] as FormulaBucket | undefined;
}
export function allocationRole(row: AllocationRow) { return getRoleLabelForSave(row) || ""; }
export function missingFormulaRecipient(row: AllocationRow, people: FormulaPerson[]) {
  return row.recipient_type !== "company" && (row.recipient_user_id === "__other__"
    ? !row.recipient_name.trim() : !people.some(person => person.id === row.recipient_user_id));
}
export function controlledWorkRole(row: AllocationRow) {
  return allocationBucket(row) !== "work_compensation_amount" || workRoles.some(role => role.value === allocationRole(row));
}
export function distributionRoleIssues(input: FormulaInput, people: FormulaPerson[]) {
  const issues: string[] = [];
  if (input.rows.some(row => !controlledWorkRole(row))) issues.push("controlledRole");
  if (input.code === "source_worker_qc") {
    const leads = input.rows.filter(row => allocationBucket(row) === "work_compensation_amount" && allocationRole(row) === "Lead Lawyer / Case Owner");
    if (leads.length !== 1) issues.push("leadRequired");
    else if (missingFormulaRecipient(leads[0], people)) issues.push("leadRecipient");
    const referrals = input.rows.filter(row => allocationBucket(row) === "referral_amount");
    if (referrals.length !== 1 || missingFormulaRecipient(referrals[0], people)) issues.push("referralRecipient");
  }
  return issues;
}
