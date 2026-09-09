"use client";

import { useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import DetailModal from "../../components/DetailModal";
import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage } from "../../../lib/i18n/core";
import { resolveVatEvidence, vatTreatmentLabel, type VatEvidence } from "../document-decision/shared";
import { chargeVatChoice, defaultChargeVatRate, hasChargeVatErrors, noVatTreatments, selectChargeVat, validateChargeVat, type ChargeVatChoice, type ChargeVatErrors, type ChargeVatValue } from "./vat-workflow";
import styles from "./charge-vat.module.css";

export type ChargeVatHandle = { focusErrors: (errors: ChargeVatErrors) => boolean };
type Props = { value: ChargeVatValue; onChange: (value: ChargeVatValue) => void; disabled?: boolean; errors?: ChargeVatErrors; ref?: Ref<ChargeVatHandle> };

export function ChargeValidationSummary({ errors }: { errors: ChargeVatErrors }) {
  const { t, text } = useI18n();
  const entries = Object.entries(errors).filter(([, message]) => Boolean(message));
  return entries.length ? <div className={styles.errorSummary} role="alert"><strong>{t("finance.charge.vat.validationSummary")}</strong><ul>{entries.map(([key, message]) => <li key={key}>{text(message)}</li>)}</ul></div> : null;
}

export function ChargeVatSummary({ value }: { value: ChargeVatValue }) {
  const { t, locale } = useI18n();
  const choice = chargeVatChoice(value);
  const treatment = resolveVatEvidence(value.vatTreatment, value.priceTaxMode !== "non_vat", Number(value.vatRate));
  return <span className={styles.summaryText}><strong>{choice === "none" ? t("finance.charge.vat.none") : t("finance.vat.standardRate", { rate: value.vatRate })}</strong>
    {choice === "none" || treatment === "unknown" ? <small>{vatTreatmentLabel(treatment, locale)}</small> : null}
  </span>;
}

export default function ChargeVatControl({ value, onChange, disabled = false, errors = {}, ref }: Props) {
  const { t, text, locale } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<ChargeVatValue>(value);
  const [modalErrors, setModalErrors] = useState<ChargeVatErrors>({});
  const rateDetails = useRef<HTMLDetailsElement>(null);
  const rateInput = useRef<HTMLInputElement>(null);
  const [positiveRate, setPositiveRate] = useState(Number(value.vatRate) > 0 ? value.vatRate : defaultChargeVatRate);
  const choice = chargeVatChoice(value);
  const modalChoice = chargeVatChoice(candidate);
  const focusModal = (nextErrors: ChargeVatErrors) => {
    // DetailModal mounts its portal and restores focus on close; focus the invalid field after mount.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const treatment = nextErrors.vatTreatment ? document.getElementById(`${id}-treatment`) : null;
      (treatment || document.getElementById(`${id}-reason`))?.focus();
    }));
  };
  const edit = (next: ChargeVatValue, nextErrors: ChargeVatErrors = {}) => {
    setCandidate(next); setModalErrors(nextErrors); setOpen(true);
    focusModal(nextErrors.vatReason || next.vatTreatment?.treatment ? nextErrors : { vatTreatment: uiMessage("finance.charge.vat.treatmentRequired") });
  };
  useImperativeHandle(ref, () => ({ focusErrors(nextErrors) {
    if (!hasChargeVatErrors(nextErrors)) return false;
    if (choice !== "standard") edit(value, nextErrors);
    else {
      if (rateDetails.current) rateDetails.current.open = true;
      requestAnimationFrame(() => rateInput.current?.focus());
    }
    return true;
  } }));
  const choose = (nextChoice: ChargeVatChoice) => {
    const retainedRate = Number(value.vatRate) > 0 ? value.vatRate : positiveRate;
    setPositiveRate(retainedRate);
    const next = selectChargeVat(value, nextChoice, retainedRate);
    onChange(next);
    if (nextChoice !== "standard") edit(next);
  };
  const updateEvidence = (evidence: VatEvidence) => {
    const next = { ...candidate, vatTreatment: evidence };
    setCandidate(next);
    if (Object.keys(modalErrors).length) setModalErrors(validateChargeVat(next));
  };
  const apply = () => {
    const nextErrors = validateChargeVat(candidate);
    setModalErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusModal(nextErrors); return; }
    onChange(candidate); setOpen(false);
  };
  return <div className={styles.control}>
    <fieldset className={`${styles.choices} ${hasChargeVatErrors(errors) ? styles.invalid : ""}`} disabled={disabled}>
      <legend>VAT</legend>
      {(["standard", "zero", "none"] as const).map(option => <label key={option} className={choice === option ? styles.selected : ""}>
        <input type="radio" name={`${id}-vat`} value={option} checked={choice === option} onChange={() => choose(option)} onClick={() => { if (option === choice && option !== "standard") edit(value); }} />
        {option === "none" ? t("finance.charge.vat.none") : t("finance.vat.standardRate", { rate: option === "zero" ? "0" : choice === "standard" ? value.vatRate : positiveRate })}
      </label>)}
    </fieldset>
    <div className={styles.summary}><ChargeVatSummary value={value} />
      {choice !== "standard" ? <button className={styles.edit} type="button" disabled={disabled} onClick={() => edit(value)}>{t("finance.charge.vat.edit")}</button> : null}
    </div>
    {choice !== "none" ? <label className={styles.field}>{t("finance.charge.vat.priceBasis")}<select disabled={disabled} value={value.priceTaxMode} onChange={event => onChange({ ...value, priceTaxMode: event.target.value as ChargeVatValue["priceTaxMode"] })}>
      <option value="vat_exclusive">{t("finance.charge.ui.vatExclusive")}</option><option value="vat_inclusive">{t("finance.charge.ui.vatInclusive")}</option>
    </select></label> : null}
    {choice === "standard" ? <details ref={rateDetails} className={styles.rateDetails}><summary>{t("finance.charge.vat.otherRate")}</summary><label className={styles.field}>{t("finance.charge.ui.vatRate")}<input ref={rateInput} disabled={disabled} inputMode="decimal" value={value.vatRate} aria-invalid={Boolean(errors.vatRate)} onChange={event => onChange({ ...value, vatRate: event.target.value, vatTreatment: null })} /></label></details> : null}
    {Object.entries(errors).filter(([key, error]) => error && ["vatRate", "priceTaxMode", "vatTreatment", "vatReason"].includes(key)).map(([key, error]) => <p className={styles.error} key={key}>{text(error)}</p>)}
    <DetailModal open={open} title={t(modalChoice === "none" ? "finance.charge.vat.reasonTitle" : "finance.charge.vat.zeroTitle")} onClose={() => setOpen(false)} closeOnBackdrop={false}
      footer={<div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setOpen(false)}>{t("finance.charge.vat.close")}</button><button type="button" className={styles.primary} disabled={disabled} onClick={apply}>{t("finance.charge.vat.apply")}</button></div>}>
      <div className={styles.modalBody}>
        <ChargeValidationSummary errors={modalErrors} />
        {modalChoice === "none" ? <fieldset className={`${styles.treatments} ${modalErrors.vatTreatment ? styles.invalid : ""}`} disabled={disabled}><legend>{t("finance.charge.vat.treatmentLabel")}</legend>
          {noVatTreatments.map((treatment, index) => <label key={treatment}><input id={index === 0 ? `${id}-treatment` : undefined} type="radio" name={`${id}-treatment`} value={treatment} checked={candidate.vatTreatment?.treatment === treatment} onChange={() => updateEvidence({ schema_version: 1, treatment, reason: "" })} /><span><strong>{vatTreatmentLabel(treatment, locale)}</strong><small>{t(`finance.charge.vat.help.${treatment}`)}</small></span></label>)}
        </fieldset> : <p>{t("finance.charge.vat.zeroHelp")}</p>}
        {modalChoice === "zero" || noVatTreatments.some(item => item === candidate.vatTreatment?.treatment) ? <label className={styles.field}>{t("finance.charge.vat.evidence")}<textarea id={`${id}-reason`} rows={3} maxLength={2000} disabled={disabled} value={candidate.vatTreatment?.reason || ""} aria-invalid={Boolean(modalErrors.vatReason)} aria-describedby={`${id}-reason-help`} onChange={event => updateEvidence({ schema_version: 1, treatment: candidate.vatTreatment?.treatment || "zero_rated", reason: event.target.value })} /><small id={`${id}-reason-help`}>{t("finance.charge.vat.evidenceHelp")}</small></label> : null}
      </div>
    </DetailModal>
  </div>;
}
