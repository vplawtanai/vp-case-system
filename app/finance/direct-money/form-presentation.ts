import { resolveVatEvidence, type VatTreatment } from "../document-decision/shared";
import type { DirectLine } from "./shared";

export const directVatTreatments: VatTreatment[] = ["unknown", "standard_rate", "zero_rated", "exempt", "outside_scope", "disbursement", "pass_through"];
export const nonVatTreatments: VatTreatment[] = ["exempt", "outside_scope", "disbursement", "pass_through"];
export type DirectVatMode = "" | "non_vat" | "7" | "0" | "other";
export type DirectWhtMode = "" | "none" | "1" | "2" | "3" | "5" | "other";

export function directVatMode(line: DirectLine): DirectVatMode {
  const treatment = directVatSelection(line);
  if (treatment === "unknown") return "";
  if (treatment === "standard_rate") return line.vat_rate === 7 ? "7" : "other";
  return treatment === "zero_rated" ? "0" : "non_vat";
}
export function directVatQuickPatch(line: DirectLine, mode: DirectVatMode): Partial<DirectLine> {
  if (mode === "other" || mode === directVatMode(line)) return {};
  if (mode === "7") return { vat_applicable: true, vat_rate: 7, vat_treatment_json: { schema_version: 1, treatment: "standard_rate" } };
  if (mode === "0") return { vat_applicable: true, vat_rate: 0, vat_treatment_json: { schema_version: 1, treatment: "zero_rated", reason: "" } };
  // No-VAT is a presentation category, not a new or inferred legal treatment.
  return { vat_applicable: false, vat_rate: 0, vat_treatment_json: null };
}
export function directWhtMode(line: DirectLine): DirectWhtMode {
  if (line.wht_applicability === "does_not_apply") return "none";
  if (line.wht_applicability !== "applies") return "";
  return [1, 2, 3, 5].includes(line.wht_rate ?? 0) ? String(line.wht_rate) as DirectWhtMode : "other";
}
export function hasCustomWhtBase(line: DirectLine): boolean {
  return line.wht_applicability === "applies" && line.wht_base !== null && line.wht_base !== line.base;
}
export function directWhtQuickPatch(line: DirectLine, mode: DirectWhtMode, customBase = hasCustomWhtBase(line)): Partial<DirectLine> {
  if (mode === "none") return { wht_applicability: "does_not_apply", wht_base: null, wht_rate: null };
  return { wht_applicability: "applies", wht_base: customBase ? line.wht_base : line.base,
    wht_rate: mode === "other" ? line.wht_rate : mode ? Number(mode) : null };
}
export function directAmountPatch(line: DirectLine, base: number, customBase = hasCustomWhtBase(line)): Partial<DirectLine> {
  return { base, ...(line.wht_applicability === "applies" && !customBase ? { wht_base: base } : {}) };
}

export function directVatSelection(line: DirectLine): VatTreatment {
  const stored = line.vat_treatment_json?.treatment;
  if (stored && stored !== "unknown" && directVatTreatments.includes(stored)) return stored;
  return line.vat_applicable && line.vat_rate > 0 ? "standard_rate" : "unknown";
}

export function directVatPatch(line: DirectLine, treatment: VatTreatment): Pick<DirectLine, "vat_applicable" | "vat_rate" | "vat_treatment_json"> {
  if (directVatSelection(line) === treatment) return { vat_applicable: line.vat_applicable, vat_rate: line.vat_rate, vat_treatment_json: line.vat_treatment_json };
  return {
    vat_applicable: treatment === "standard_rate" || treatment === "zero_rated",
    vat_rate: treatment === "standard_rate" && line.vat_applicable ? line.vat_rate : 0,
    vat_treatment_json: treatment === "unknown" ? null : { schema_version: 1, treatment, reason: "" },
  };
}

export function directVatChoiceIncomplete(line: DirectLine): boolean {
  // A chosen treatment must be complete even when money nature is still unclassified.
  return directVatSelection(line) !== "unknown" && resolveVatEvidence(line.vat_treatment_json, line.vat_applicable, line.vat_rate) === "unknown";
}

export function reconciliationResult(parts: (number | null)[], gross: number | null): { matches: boolean; difference: number | null } {
  if (gross === null || !Number.isFinite(gross) || gross <= 0 || parts.some(value => value === null || !Number.isFinite(value) || value < 0)) return { matches: false, difference: null };
  // Compare existing calculated values at their stored monetary precision, without changing them.
  const difference = Math.abs(parts.reduce<number>((sum, value) => sum + Math.round(value! * 100), 0) - Math.round(gross * 100)) / 100;
  return { matches: difference === 0, difference };
}
