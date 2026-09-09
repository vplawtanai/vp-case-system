import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

export type BillableChargeSourceType = "ad_hoc_service" | "recoverable_cost" | "billing_installment_item";
export type ClientCostFundingMode = "collect_before_disbursement" | "reimburse_after_advance";

export function billableChargeNatureLabel(value: BillableChargeSourceType | string, locale: UiLocale = "th") {
  if (value === "recoverable_cost") return translate(locale, "finance.charge.nature.recoverable");
  if (value === "billing_installment_item") return translate(locale, "finance.charge.nature.installment");
  return translate(locale, "finance.charge.nature.additional");
}

export function clientCostFundingModeLabel(value: ClientCostFundingMode | null | undefined, locale: UiLocale = "th") {
  if (value === "collect_before_disbursement") return translate(locale, "finance.charge.funding.collect");
  if (value === "reimburse_after_advance") return translate(locale, "finance.charge.funding.advance");
  return translate(locale, "finance.charge.funding.legacy");
}

export function fundingModeForSource(
  sourceType: BillableChargeSourceType,
  fundingMode: ClientCostFundingMode | "" | null | undefined,
) {
  return sourceType === "recoverable_cost" && fundingMode ? fundingMode : null;
}

export function clientCostFundingModeRequired(
  sourceType: BillableChargeSourceType,
  fundingMode: ClientCostFundingMode | "" | null | undefined,
) {
  return sourceType === "recoverable_cost" && !fundingMode;
}
