import { resolveVatEvidence, vatTreatmentLabel, type VatEvidence, type VatTreatment } from "./shared";
import { useI18n } from "../../../lib/i18n/provider";

export function VatTreatmentInput({ value, applicable, rate, onChange, disabled = false }: { value?: VatEvidence | null; applicable: boolean; rate: number; onChange: (value: VatEvidence) => void; disabled?: boolean }) {
  const { locale, t } = useI18n();
  if (applicable && rate > 0) return <p>VAT {rate}% · {t("finance.document.combined")}</p>;
  const choices: VatTreatment[] = applicable ? ["zero_rated"] : ["exempt", "outside_scope", "disbursement", "pass_through"];
  const selected = value && choices.includes(value.treatment) ? value.treatment : "unknown";
  return <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
    <label>{t("finance.vat.label")}<select disabled={disabled} aria-label={t("finance.vat.label")} style={{ width: "100%", minWidth: 0 }} value={selected} onChange={e => onChange({ schema_version: 1, treatment: e.target.value as VatTreatment, reason: value?.reason || "" })}>
      <option value="unknown">{t("finance.vat.choose")}</option>{choices.map(treatment => <option value={treatment} key={treatment}>{vatTreatmentLabel(treatment, locale)}</option>)}
    </select></label>
    <label>{t("finance.vat.evidence")}<textarea disabled={disabled} aria-label={t("finance.vat.evidence")} rows={2} maxLength={2000} style={{ width: "100%", minWidth: 0 }} value={value?.reason || ""} onChange={e => onChange({ schema_version: 1, treatment: selected, reason: e.target.value })} /></label>
    {resolveVatEvidence(value, applicable, rate) === "unknown" ? <small>{t("finance.vat.required")}</small> : null}
  </div>;
}
