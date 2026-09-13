import { translate } from "../../../lib/i18n/catalog";
import { vpDistributionMessages } from "../../../lib/i18n/messages/vp-distribution";
import { moneyAllocationMessages } from "../../../lib/i18n/messages/money-allocation";
import type { UiLocale } from "../../../lib/i18n/core";
import type { MoneyAllocation, MoneyLine, MoneySource } from "./money-allocation";
import type { FormulaResult } from "../compensation/formula-calculation";

export const distributionFields = ["referral_amount", "company_share_amount", "work_compensation_amount"] as const;
export const directCompanyClassifications = ["additional_service", "reimbursable_expense", "government_or_court_fee"] as const;
export function isDirectCompanyClassification(classification: string | null): boolean {
  return directCompanyClassifications.some(value => value === classification);
}
export type DistributionField = typeof distributionFields[number];
export type DistributionChoice = { invoice_item_id: string; formula_result?: FormulaResult } & Record<DistributionField, string>;
export type DistributionDecision = { invoice_item_id: string; formula_result?: FormulaResult } & Record<DistributionField, string | number>;
export type DistributionLine = MoneyLine & {
  classification: string | null;
  professional_pool: number; company_economic: number; company_cash: number;
};
export type DistributionSource = {
  schema_version: 1; policy_version: "vp_distribution_v1";
  money_source: MoneySource | null; money_allocation: MoneyAllocation | null;
  lines: DistributionLine[];
  totals: Record<"cash" | "wht" | "vat" | "base" | "professional_pool" | "company_economic" | "company_cash", number | null>;
  blockers: string[];
};
export type DistributionRecord = {
  id: string; payment_id: string; money_allocation_id: string | null;
  revision: number; previous_id: string | null; version: number;
  status: "draft" | "reviewed" | "finalized" | "superseded";
  source_snapshot_json: DistributionSource; decisions_json: DistributionDecision[]; note: string | null;
  created_at: string; reviewed_at: string | null; finalized_at: string | null; superseded_at: string | null;
  created_by?: string | null; reviewed_by?: string | null; finalized_by?: string | null; superseded_by?: string | null;
  supersede_reason: string | null;
};
export type DistributionContext = {
  source: DistributionSource; current: DistributionRecord | null; source_current: boolean;
  can_manage: boolean; posting_enabled: false; history: DistributionRecord[];
  audit: { id: string; distribution_id: string; event_type: string; created_at: string; actor_id: string | null }[];
};

// Integer cents preserve exactness; neither source nor user input is rounded.
export function distributionCents(value: string | number, exact = false): number | null {
  const text = String(value);
  if (!(exact ? /^\d+\.\d{2}$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function distributionSource(context: DistributionContext): DistributionSource {
  const current = context.current;
  return current && current.status !== "draft" ? current.source_snapshot_json : context.source;
}

export function initialDistributionChoices(context: DistributionContext): DistributionChoice[] {
  const saved = context.source_current || (context.current && context.current.status !== "draft")
    ? context.current?.decisions_json : undefined;
  return distributionSource(context).lines.filter(line => line.classification === "professional_fee").map(line => {
    const decision = saved?.find(choice => choice.invoice_item_id === line.invoice_item_id);
    const amount = (field: DistributionField) => {
      const value = decision?.[field] ?? "0.00", cents = distributionCents(value);
      return cents === null ? String(value) : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
    };
    return { invoice_item_id: line.invoice_item_id, referral_amount: amount("referral_amount"), company_share_amount: amount("company_share_amount"), work_compensation_amount: amount("work_compensation_amount"),
      ...(decision?.formula_result ? { formula_result: decision.formula_result } : {}) };
  });
}

export function distributionSplitCents(choice?: DistributionChoice): number | null {
  if (!choice) return null;
  const values = distributionFields.map(field => distributionCents(choice[field]));
  const sum = values.reduce<number>((total, value) => total + (value ?? 0), 0);
  return values.every(value => value !== null) && Number.isSafeInteger(sum) ? sum : null;
}

export function distributionLineComplete(line: DistributionLine, choice?: DistributionChoice): boolean {
  const pool = distributionCents(line.professional_pool);
  return choice?.invoice_item_id === line.invoice_item_id && pool !== null && distributionSplitCents(choice) === pool;
}

export function distributionSourceProven(source: DistributionSource): boolean {
  if (source.schema_version !== 1 || source.policy_version !== "vp_distribution_v1"
    || source.money_source?.payment?.status !== "confirmed" || source.blockers.length || source.money_source.blockers.length
    || !source.lines.length || new Set(source.lines.map(line => line.invoice_item_id)).size !== source.lines.length) return false;
  return source.lines.every(line => {
    if (isDirectCompanyClassification(line.classification)) return true;
    if (line.classification !== "professional_fee") return false;
    const base = distributionCents(line.base), wht = distributionCents(line.wht), pool = distributionCents(line.professional_pool);
    return base !== null && wht !== null && pool !== null && base - wht === pool;
  });
}

export function distributionDraftValid(source: DistributionSource, choices: DistributionChoice[]): boolean {
  const lines = source.lines.filter(line => line.classification === "professional_fee");
  return distributionSourceProven(source) && choices.length === lines.length && lines.every(line => {
    const matches = choices.filter(choice => choice.invoice_item_id === line.invoice_item_id);
    const sum = distributionSplitCents(matches[0]), pool = distributionCents(line.professional_pool);
    return matches.length === 1 && sum !== null && pool !== null && sum <= pool;
  });
}

export function distributionReviewComplete(source: DistributionSource, choices: DistributionChoice[]): boolean {
  return distributionDraftValid(source, choices) && source.lines.filter(line => line.classification === "professional_fee")
    .every(line => distributionLineComplete(line, choices.find(choice => choice.invoice_item_id === line.invoice_item_id)));
}

export function distributionPayload(source: DistributionSource, choices: DistributionChoice[]): DistributionDecision[] {
  if (!distributionDraftValid(source, choices)) throw new Error("VP_DISTRIBUTION_CHOICES_INVALID");
  return choices.map(choice => ({
    invoice_item_id: choice.invoice_item_id,
    referral_amount: distributionCents(choice.referral_amount)! / 100,
    company_share_amount: distributionCents(choice.company_share_amount)! / 100,
    work_compensation_amount: distributionCents(choice.work_compensation_amount)! / 100,
    ...(choice.formula_result ? { formula_result: choice.formula_result } : {}),
  }));
}

export function distributionExpected(context: DistributionContext): { p_expected_id: string | null; p_expected_version: number | null } {
  const latest = context.current ?? context.history[0];
  return { p_expected_id: latest?.id ?? null, p_expected_version: latest?.version ?? null };
}

export function distributionError(error: unknown, locale: UiLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("VP_FORMULA_")) {
    if (message.includes("RECIPIENT_STALE")) return translate(locale, "vpFormula.recipientStale");
    if (message.includes("STALE")) return translate(locale, "vpFormula.catalogStale");
    const formulaErrors: Record<string, string> = { REQUIRED: "formulaRequired", INVALID: "formulaRequired",
      PARAMETER: "parameterInvalid", RECONCILE: "reconcile", CONTRACT: "formulaContract", ROLE: "roleRequired",
      RECIPIENT: "recipientRequired", DUPLICATE_RECIPIENT: "duplicateRecipient", EVIDENCE_INVALID: "formulaContract" };
    const code = Object.keys(formulaErrors).find(key => message.includes("VP_FORMULA_" + key));
    return translate(locale, "vpFormula.error." + (code ? formulaErrors[code] : "formulaContract"));
  }
  const codes = ["PERMISSION_DENIED", "STALE", "SOURCE_CHANGED", "SOURCE_UNPROVEN", "REVIEW_REQUIRED", "AMOUNT_INVALID", "CHOICES_INVALID", "POOL_EXCEEDED", "ACK_REQUIRED", "REASON_REQUIRED", "SUPERSEDE_REQUIRED", "HISTORY_IMMUTABLE"];
  const code = codes.find(value => message.includes(`VP_DISTRIBUTION_${value}`));
  return translate(locale, `vpDistribution.error.${code || "unknown"}`);
}

export function distributionBlocker(blocker: string, locale: UiLocale): string {
  const key = `vpDistribution.block.${blocker}`, upstreamKey = `moneyAllocation.block.${blocker}`;
  return translate(locale, Object.hasOwn(vpDistributionMessages, key) ? key
    : Object.hasOwn(moneyAllocationMessages, upstreamKey) ? upstreamKey : "vpDistribution.error.SOURCE_UNPROVEN");
}

export function distributionAuditEvent(event: string, locale: UiLocale): string {
  const key = `vpDistribution.audit.${event}`;
  return translate(locale, Object.hasOwn(vpDistributionMessages, key) ? key : "vpDistribution.auditEvent");
}
