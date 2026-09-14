import { resolveVatEvidence, type VatTreatment } from "../document-decision/shared";
import type { DirectLine } from "./shared";

export const directVatTreatments: VatTreatment[] = ["unknown", "standard_rate", "zero_rated", "exempt", "outside_scope", "disbursement", "pass_through"];

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
