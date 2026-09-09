import { resolveVatEvidence, vatTreatmentLabels, type VatEvidence, type VatTreatment } from "./shared";

export function VatTreatmentInput({ value, applicable, rate, onChange, disabled = false }: { value?: VatEvidence | null; applicable: boolean; rate: number; onChange: (value: VatEvidence) => void; disabled?: boolean }) {
  if (applicable && rate > 0) return <p>VAT {rate}% · ใบเสร็จรับเงิน/ใบกำกับภาษี</p>;
  const choices: VatTreatment[] = applicable ? ["zero_rated"] : ["exempt", "outside_scope", "disbursement", "pass_through"];
  const selected = value && choices.includes(value.treatment) ? value.treatment : "unknown";
  return <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
    <label>VAT Treatment<select disabled={disabled} aria-label="VAT Treatment" style={{ width: "100%", minWidth: 0 }} value={selected} onChange={e => onChange({ schema_version: 1, treatment: e.target.value as VatTreatment, reason: value?.reason || "" })}>
      <option value="unknown">เลือกประเภท VAT</option>{choices.map(t => <option value={t} key={t}>{vatTreatmentLabels[t]}</option>)}
    </select></label>
    <label>เหตุผล / หลักฐาน<textarea disabled={disabled} aria-label="เหตุผล VAT Treatment" rows={2} maxLength={2000} style={{ width: "100%", minWidth: 0 }} value={value?.reason || ""} onChange={e => onChange({ schema_version: 1, treatment: selected, reason: e.target.value })} /></label>
    {resolveVatEvidence(value, applicable, rate) === "unknown" ? <small>ต้องระบุประเภทและเหตุผลก่อนออกเอกสาร</small> : null}
  </div>;
}
