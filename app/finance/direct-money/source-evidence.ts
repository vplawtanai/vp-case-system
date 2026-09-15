import { directVatSelection, hasCustomWhtBase } from "./form-presentation";
import type { DirectInput, DirectLine } from "./shared";

const prefix = "System-derived direct-money provenance v1: ";

export function readDerivedDirectEvidence(reason: string): Record<string, unknown> | null {
  if (!reason.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(reason.slice(prefix.length));
    return value?.origin === "structured_direct_money_input" && value.schema_version === 1 ? value : null;
  } catch { return null; }
}

export function isDerivedDirectEvidence(reason: string): boolean {
  return readDerivedDirectEvidence(reason) !== null;
}

function additionalEvidenceRequirement(input: DirectInput, line: DirectLine, customBase: boolean, manualBase: boolean) {
  if (line.money_nature === "unclassified") return "evidenceClassification";
  if (line.money_nature !== "business_revenue") return "evidenceNonRevenue";
  if (!["professional_fee", "additional_service"].includes(line.classification || "")) return "evidenceClassification";
  // Do not guess the meaning of free prose or treat a payer name as a Client linkage.
  if (!input.client_id || !input.payer_name.trim() || !/[\p{L}\p{N}]/u.test(line.description)) return "evidenceContext";
  if (directVatSelection(line) !== "standard_rate" || line.vat_rate !== 7 || customBase || manualBase ||
    (line.wht_applicability !== "does_not_apply" && (line.wht_applicability !== "applies" || ![1, 2, 3, 5].includes(line.wht_rate ?? 0)))) return "evidenceTax";
  return null;
}

export function prepareDirectSourceEvidence(input: DirectInput, customBases: Record<string, boolean> = {}, manualBases: Record<string, boolean> = {}) {
  const evidence = input.lines.map(line => {
    const manualReason = isDerivedDirectEvidence(line.reason) ? "" : line.reason;
    const requirement = additionalEvidenceRequirement(input, line, customBases[line.source_line_id] || hasCustomWhtBase(line), !!manualBases[line.source_line_id]);
    // 047 has no provenance-metadata column. Keep the origin marker inside its existing
    // reason string; field references point to facts frozen alongside it, not invented prose.
    const reason = (manualReason.trim() || requirement) ? manualReason : prefix + JSON.stringify({
      schema_version: 1, origin: "structured_direct_money_input", source_line_id: line.source_line_id,
      client_id: input.client_id, case_id: input.case_id, advisory_matter_id: input.advisory_matter_id,
      payer_source: "facts.payer_name", description_source: "same_line.description",
      money_nature: line.money_nature, classification: line.classification,
      vat_treatment: directVatSelection(line), vat_rate: line.vat_rate,
      wht_applicability: line.wht_applicability, wht_base: line.wht_base, wht_rate: line.wht_rate,
    });
    return { reason, manualReason, requirement, derived: isDerivedDirectEvidence(reason) };
  });
  return { evidence, input: { ...input, lines: input.lines.map((line, i) => ({ ...line, reason: evidence[i].reason })) } };
}
