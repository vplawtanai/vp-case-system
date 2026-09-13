"use client";

import { useId } from "react";
import { useI18n } from "../../../lib/i18n/provider";
import { compensationRoleLabel } from "../../../lib/i18n/legacy-finance";
import { compensationFormulaDefinitions, createAllocation, formulaCodes, formatPercent, getDisplayPercent, getWorkPoolRecipientType, isFixedSourceWorkerRow,
  isSourcePoolRow, rebalanceOwnerWorkPool, recipientTypes, renderFormula, roleLabels, type AllocationRow, type FormulaCode } from "../compensation/formula-engine";
import { calculateFormula, initialFormula, type FormulaInput, type FormulaPerson, type FormulaResult } from "../compensation/formula-calculation";
import styles from "./money-allocation.module.css";
import css from "./vp-distribution.module.css";

const formulaRoles = [...new Set([...roleLabels, ...compensationFormulaDefinitions.formulas.flatMap(formula => formula.defaults.map(row => row.role))])];

export function FormulaResultEvidence({ result, currency }: { result: FormulaResult; currency: string }) {
  const { t, locale } = useI18n();
  return <div className={css.result}>
    <p>{renderFormula(result.formula_code, locale)} · {t("vpFormula.version", { version: result.formula_version })}</p>
    {result.recipients.map(row => <div className={css.resultRow} key={row.component_no}>
      <div><strong>{row.recipient_kind === "company" ? t("finance.compensation.type.company") : row.recipient_name}</strong>
        <p className={styles.muted}>{row.role_label === "Company" ? t("finance.compensation.type.company") : row.role_label === "Lawyer" ? t("finance.compensation.type.lawyer") : compensationRoleLabel(row.role_label, locale)} · {t(`vpDistribution.${row.bucket}`)}
          {row.percent !== null ? ` · ${row.percent}%` : null}</p></div>
      <strong>{row.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
    </div>)}
  </div>;
}

export function VpFormulaEditor({ pool, input, people, currency, disabled, invalid, onChange }: {
  pool: number; input?: FormulaInput; people: FormulaPerson[]; currency: string;
  disabled: boolean; invalid: boolean; onChange: (value: FormulaInput) => void;
}) {
  const { t, locale } = useI18n(), id = useId();
  const roleLabel = (role: string) => role === "Company" ? t("finance.compensation.type.company")
    : role === "Lawyer" ? t("finance.compensation.type.lawyer") : compensationRoleLabel(role, locale);
  const calculated = input ? calculateFormula(pool, input, people) : { result: null, errors: ["formulaRequired"] };
  const fixed = input?.code === "custom", workPool = input?.code === "source_worker_qc";
  function rowsChanged(rows: AllocationRow[]) {
    if (input) onChange({ ...input, rows: rebalanceOwnerWorkPool(rows, pool, input.code) });
  }
  function change(index: number, patch: Partial<AllocationRow>) {
    if (input) rowsChanged(input.rows.map((row, n) => n === index ? { ...row, ...patch } : row));
  }
  return <div className={css.editor}>
    <label>{t("vpFormula.select")}<select aria-label={t("vpFormula.select")} disabled={disabled} value={input?.code || ""}
      aria-invalid={invalid && !input} onChange={event => onChange(initialFormula(event.target.value as FormulaCode, pool))}>
      <option value="" disabled>{t("vpFormula.choose")}</option>
      {formulaCodes.map(code => <option key={code} value={code}>{renderFormula(code, locale)}</option>)}
    </select></label>
    {input && input.version !== compensationFormulaDefinitions.version ? <div className={styles.warning}>
      <p>{t("vpFormula.presetStale")}</p><button type="button" className={styles.button} disabled={disabled}
        onClick={() => onChange(initialFormula(input.code, pool))}>{t("vpFormula.refreshPreset")}</button>
    </div> : null}
    {workPool ? <p className={styles.muted}>{t("vpFormula.workPool")}</p> : null}
    {input?.rows.map((row, index) => {
      const locked = isFixedSourceWorkerRow(row, input.code) || input.code === "travel_fee";
      const company = row.recipient_type === "company";
      const displayRole = row.role_label === "Other" && formulaRoles.includes(row.custom_role || "") ? row.custom_role! : row.role_label;
      const missingPerson = !company && (row.recipient_user_id === "__other__" ? !row.recipient_name.trim() : !people.some(person => person.id === row.recipient_user_id));
      return <fieldset disabled={disabled} className={css.recipient} key={index} aria-describedby={invalid ? id : undefined}>
        <legend>{t("vpFormula.component", { number: index + 1 })}</legend>
        <div className={css.recipientFields}>
          <label>{t("vpFormula.type")}<select aria-label={t("vpFormula.type")} value={row.recipient_type} disabled={locked || workPool}
            onChange={event => change(index, { recipient_type: event.target.value, is_company_share: event.target.value === "company",
              recipient_user_id: "", recipient_name: "", role_label: event.target.value === "company" ? "Company Share" : event.target.value === "source" ? "Client Source / Broker" : "Co-Lawyer / Co-Worker", custom_role: "" })}>
            {recipientTypes.map(type => <option key={type} value={type}>{t(`finance.compensation.type.${type}`)}</option>)}
          </select></label>
          <label>{t("vpFormula.role")}<select aria-label={t("vpFormula.role")} value={displayRole} disabled={locked} onChange={event => change(index, {
            role_label: event.target.value, custom_role: "", ...(workPool ? { recipient_type: getWorkPoolRecipientType(event.target.value) } : {}),
          })}>{(workPool ? roleLabels : formulaRoles).filter(role => !workPool || locked || !["Client Source / Broker", "Company Share", "Lead Lawyer / Case Owner"].includes(role)).map(role => <option value={role} key={role}>{roleLabel(role)}</option>)}</select></label>
          {displayRole === "Other" ? <label>{t("vpFormula.customRole")}<input value={row.custom_role || ""} maxLength={200}
            aria-invalid={invalid && !row.custom_role?.trim()} onChange={event => change(index, { custom_role: event.target.value })} /></label> : null}
          {company ? <p className={styles.muted}>{t("finance.compensation.type.company")}</p> : <label>{t("vpFormula.recipient")}
            <select aria-label={t("vpFormula.recipient")} value={people.some(person => person.id === row.recipient_user_id) || row.recipient_user_id === "__other__" ? row.recipient_user_id : ""}
              aria-invalid={invalid && missingPerson} onChange={event => change(index, { recipient_user_id: event.target.value,
                recipient_name: event.target.value === "__other__" ? "" : people.find(person => person.id === event.target.value)?.name || "" })}>
              <option value="">{t("vpFormula.chooseRecipient")}</option>
              {people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}
              <option value="__other__">{t("vpFormula.external")}</option>
            </select></label>}
          {!company && row.recipient_user_id === "__other__" ? <label>{t("vpFormula.externalName")}<input value={row.recipient_name}
            aria-invalid={invalid && missingPerson} maxLength={300} onChange={event => change(index, { recipient_name: event.target.value })} /></label> : null}
          <label>{t(fixed ? "vpFormula.fixed" : isSourcePoolRow(row, input.code) ? "vpFormula.workPercent" : "vpFormula.percent")}
            <input type="text" inputMode="decimal" maxLength={24} disabled={locked} value={fixed ? row.amount : getDisplayPercent(row, input.code)}
              aria-invalid={invalid && calculated.errors.some(error => ["reconcile", "parameterInvalid", "formulaContract"].includes(error))}
              onChange={event => change(index, fixed ? { amount: event.target.value } : { percent: isSourcePoolRow(row, input.code)
                ? formatPercent(Number(event.target.value) * 40 / 100) : event.target.value })} /></label>
          {!locked ? <button type="button" className={styles.button} onClick={() => rowsChanged(input.rows.filter((_, n) => n !== index))}>{t("common.actions.remove")}</button> : null}
        </div>
      </fieldset>;
    })}
    {input && input.code !== "travel_fee" ? <button type="button" className={styles.button} disabled={disabled || input.rows.length >= 50}
      onClick={() => rowsChanged([...input.rows, { ...createAllocation(workPool ? "worker" : "lawyer", "", 0, false, "Co-Lawyer / Co-Worker"), amount: "0" }])}>{t("vpFormula.addRecipient")}</button> : null}
    {invalid && calculated.errors.length ? <div id={id} role="alert" className={styles.error}>{calculated.errors.map(error => <p key={error}>{t(`vpFormula.error.${error}`)}</p>)}</div> : null}
    {calculated.result ? <FormulaResultEvidence result={calculated.result} currency={currency} /> : null}
  </div>;
}
