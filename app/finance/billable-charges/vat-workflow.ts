import { uiMessage, type UiMessage } from "../../../lib/i18n/core";
import type { FinancePriceTaxMode } from "../finance-line-amounts";
import { resolveVatEvidence, type VatEvidence } from "../document-decision/shared";

export type ChargeVatValue = { priceTaxMode: FinancePriceTaxMode; vatRate: string; vatTreatment?: VatEvidence | null };
export type ChargeVatChoice = "standard" | "zero" | "none";
export type ChargeVatErrors = Record<string, UiMessage | "">;
export const noVatTreatments = ["exempt", "outside_scope", "disbursement", "pass_through"] as const;
// Retain the existing Charge editor default; an existing positive source rate takes precedence.
export const defaultChargeVatRate = "7";

export function chargeVatChoice(value: ChargeVatValue): ChargeVatChoice {
  return value.priceTaxMode === "non_vat" ? "none" : value.vatRate.trim() !== "" && Number(value.vatRate) === 0 ? "zero" : "standard";
}

export function selectChargeVat(value: ChargeVatValue, choice: ChargeVatChoice, positiveRate = defaultChargeVatRate): ChargeVatValue {
  if (choice === chargeVatChoice(value)) return value;
  if (choice === "none") return { priceTaxMode: "non_vat", vatRate: "0", vatTreatment: null };
  return {
    priceTaxMode: value.priceTaxMode === "non_vat" ? "vat_exclusive" : value.priceTaxMode,
    vatRate: choice === "zero" ? "0" : positiveRate,
    vatTreatment: choice === "zero" ? { schema_version: 1, treatment: "zero_rated", reason: "" } : null,
  };
}

export function validateChargeVat(value: ChargeVatValue): ChargeVatErrors {
  const errors: ChargeVatErrors = {};
  const applicable = value.priceTaxMode !== "non_vat";
  const rate = Number(value.vatRate);
  if (!["non_vat", "vat_inclusive", "vat_exclusive"].includes(value.priceTaxMode)) errors.priceTaxMode = uiMessage("finance.charge.vat.invalidMode");
  if (!/^\d+(?:\.\d{1,4})?$/.test(value.vatRate.trim()) || rate < 0 || rate > 100 || (!applicable && rate !== 0)) errors.vatRate = uiMessage("finance.charge.ui.error.vatRate");
  if (Object.keys(errors).length) return errors;
  if (applicable && rate > 0) {
    if (resolveVatEvidence(value.vatTreatment, true, rate) !== "standard_rate") errors.vatTreatment = uiMessage("finance.charge.vat.conflict");
    return errors;
  }
  const treatment = value.vatTreatment?.treatment;
  if (applicable ? treatment !== "zero_rated" : !noVatTreatments.some(item => item === treatment)) errors.vatTreatment = uiMessage(applicable ? "finance.charge.vat.zeroRequired" : "finance.charge.vat.treatmentRequired");
  const reason = value.vatTreatment?.reason?.trim() || "";
  if (!reason) errors.vatReason = uiMessage(applicable ? "finance.charge.vat.zeroReasonRequired" : "finance.charge.vat.reasonRequired");
  else if ([...reason].length > 2000) errors.vatReason = uiMessage("finance.charge.vat.reasonTooLong");
  return errors;
}

export function hasChargeVatErrors(errors: ChargeVatErrors) {
  return ["vatRate", "priceTaxMode", "vatTreatment", "vatReason"].some(key => Boolean(errors[key]));
}

export function refreshChargeVatErrors(errors: ChargeVatErrors, value: ChargeVatValue): ChargeVatErrors {
  const next = { ...errors };
  for (const key of ["vatRate", "priceTaxMode", "vatTreatment", "vatReason"]) delete next[key];
  return hasChargeVatErrors(errors) ? { ...next, ...validateChargeVat(value) } : next;
}

export function isChargeVatBackendError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error || "");
  return /DOCUMENT_VAT_CONFLICT|DOCUMENT_UNKNOWN_TREATMENT/.test(message);
}

export function savedChargeVat(value: { price_tax_mode: string; vat_rate: string | number; vat_treatment_json?: VatEvidence | null }): ChargeVatValue {
  return { priceTaxMode: value.price_tax_mode as FinancePriceTaxMode, vatRate: String(value.vat_rate), vatTreatment: value.vat_treatment_json };
}
