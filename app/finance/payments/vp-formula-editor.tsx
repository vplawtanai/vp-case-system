"use client";

import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { PayeeModal } from "../payouts/payee-modal";
import type { Payee } from "../payouts/shared";
import { useI18n } from "../../../lib/i18n/provider";
import { compensationRoleLabel } from "../../../lib/i18n/legacy-finance";
import { compensationFormulaDefinitions, createAllocation, formatPercent, getDisplayPercent, isFixedSourceWorkerRow,
  isSourcePoolOwnerRow, isSourcePoolRow, rebalanceOwnerWorkPool, type AllocationRow, type FormulaCode } from "../compensation/formula-engine";
import { calculateFormula, initialFormula, type FormulaBucket, type FormulaInput, type FormulaPerson, type FormulaResult } from "../compensation/formula-calculation";
import { allocationBucket, allocationRole, contextualFormulaLabel, controlledWorkRole, distributionRoleIssues,
  formulaBuckets, formulasForContext, missingFormulaRecipient, workRoles, workRoleType } from "../compensation/formula-presentation";
import styles from "./money-allocation.module.css";
import css from "./vp-distribution.module.css";

const bucketStyle = { referral_amount: css.referral, company_share_amount: css.company, work_compensation_amount: css.work };
const bucketLabel = { referral_amount: "vpFormula.referral", company_share_amount: "vpFormula.company", work_compensation_amount: "vpFormula.work" };

export function FormulaResultEvidence({ result, currency }: { result: FormulaResult; currency: string }) {
  const { t, locale } = useI18n();
  const money = (value: number) => `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  return <div className={css.result}>
    <p>{contextualFormulaLabel(result.formula_code, "vp_revenue_distribution", locale)}</p>
    {formulaBuckets.map(bucket => <section className={`${css.bucket} ${bucketStyle[bucket]}`} key={bucket}>
      <header className={css.bucketHeading}><h5>{t(bucketLabel[bucket])}</h5><strong>{money(result[bucket])}</strong></header>
      {result.recipients.filter(row => row.bucket === bucket).map(row => <div className={css.resultRow} key={row.component_no}>
        <div><strong>{row.recipient_kind === "company" ? t("vpFormula.companyName") : row.recipient_name}</strong>
          <p className={styles.muted}>{row.recipient_kind === "company" ? t("vpFormula.company") : workRoles.some(role => role.value === row.role_label)
            ? t(workRoles.find(role => role.value === row.role_label)!.label) : compensationRoleLabel(row.role_label, locale)}
            {row.percent !== null ? ` · ${t("vpFormula.wholeShare", { percent: row.percent })}` : null}</p></div>
        <strong>{money(row.amount)}</strong>
      </div>)}
      {!result.recipients.some(row => row.bucket === bucket) ? <p className={styles.muted}>{t("vpFormula.noComponents")}</p> : null}
    </section>)}
    <details className={styles.history}><summary>{t("vpFormula.evidence")}</summary>
      <p>{t("vpFormula.version", { version: result.formula_version })} · {result.formula_code}</p>
      {result.recipients.map(row => <p key={row.component_no}>{t("vpFormula.component", { number: row.component_no })}: {row.role_label} · {t("vpFormula.rounding", { cents: row.rounding_adjustment_cents })}</p>)}
    </details>
  </div>;
}

export function VpFormulaEditor({ pool, input, people, currency, disabled, invalid, onChange }: {
  pool: number; input?: FormulaInput; people: FormulaPerson[]; currency: string;
  disabled: boolean; invalid: boolean; onChange: (value: FormulaInput) => void;
}) {
  const { t, locale } = useI18n(), id = useId(), root = useRef<HTMLDivElement>(null);
  const [payees, setPayees] = useState<Payee[]>([]), [newPayee, setNewPayee] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void supabase.rpc("get_finance_payees").then(r => { if (live && !r.error && Array.isArray(r.data)) setPayees(r.data.filter((p: Payee) => p.kind === "external" && p.is_active)); });
    return () => { live = false; };
  }, [revision]);
  const money = (value: number | undefined) => value === undefined ? "-" : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const calculated = input ? calculateFormula(pool, input, people) : { result: null, errors: ["formulaRequired"] };
  const issues = [...new Set([...calculated.errors, ...(input ? distributionRoleIssues(input, people) : [])])];
  const fixed = input?.code === "custom", workPool = input?.code === "source_worker_qc";
  const available = formulasForContext("vp_revenue_distribution");
  function rowsChanged(rows: AllocationRow[]) {
    if (input) onChange({ ...input, rows: rebalanceOwnerWorkPool(rows, pool, input.code) });
  }
  function change(index: number, patch: Partial<AllocationRow>) {
    if (input) rowsChanged(input.rows.map((row, n) => n === index ? { ...row, ...patch } : row));
  }
  function add(bucket: FormulaBucket) {
    if (!input) return;
    const referral = bucket === "referral_amount";
    rowsChanged([...input.rows, { ...createAllocation(referral ? "source" : "worker", "", 0, false,
      referral ? "Client Source / Broker" : "Co-Lawyer / Co-Worker"), amount: "0" }]);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-component="${input.rows.length}"] select`)?.focus());
  }
  return <div className={css.editor} ref={root}>
    <label>{t("vpFormula.select")}<select aria-label={t("vpFormula.select")} disabled={disabled} value={input && available.includes(input.code) ? input.code : ""}
      aria-invalid={invalid && (!input || !available.includes(input.code))} onChange={event => onChange(initialFormula(event.target.value as FormulaCode, pool))}>
      <option value="" disabled>{t("vpFormula.choose")}</option>
      {available.map(code => <option key={code} value={code}>{contextualFormulaLabel(code, "vp_revenue_distribution", locale)}</option>)}
    </select></label>
    {input && !available.includes(input.code) ? <p className={styles.warning}>{t("vpFormula.contextUnavailable")}</p> : null}
    {input && input.version !== compensationFormulaDefinitions.version ? <div className={styles.warning}>
      <p>{t("vpFormula.presetStale")}</p><button type="button" className={styles.button} disabled={disabled}
        onClick={() => onChange(initialFormula(input.code, pool))}>{t("vpFormula.refreshPreset")}</button>
    </div> : null}
    {input ? <p className={styles.muted}>{t(workPool ? "vpFormula.workPool" : fixed ? "vpFormula.fixedHelp" : "vpFormula.percentHelp")}</p> : null}
    {input ? formulaBuckets.map(bucket => {
      const rows = input.rows.map((row, index) => ({ row, index })).filter(({ row }) => allocationBucket(row) === bucket);
      const canAdd = input.code !== "travel_fee" && (bucket === "work_compensation_amount" || (bucket === "referral_amount" && !workPool));
      return <section className={`${css.bucket} ${bucketStyle[bucket]}`} key={bucket} aria-label={t(bucketLabel[bucket])}>
        <header className={css.bucketHeading}><h5>{t(bucketLabel[bucket])}</h5><strong>{money(calculated.result?.[bucket])}</strong></header>
        {!rows.length ? <p className={styles.muted}>{t("vpFormula.noComponents")}</p> : null}
        {rows.map(({ row, index }) => {
          const locked = isFixedSourceWorkerRow(row, input.code) || input.code === "travel_fee";
          const company = bucket === "company_share_amount", work = bucket === "work_compensation_amount";
          const residual = isSourcePoolOwnerRow(row, input.code), role = allocationRole(row);
          const missingPerson = missingFormulaRecipient(row, people), missingRole = !controlledWorkRole(row);
          const parameterLabel = fixed ? "vpFormula.fixed" : isSourcePoolRow(row, input.code) ? "vpFormula.workPercent" : "vpFormula.percent";
          return <fieldset disabled={disabled} className={css.recipient} key={index} data-component={index} aria-describedby={invalid && issues.length ? id : undefined}>
            <legend>{t("vpFormula.component", { number: index + 1 })}</legend>
            <div className={css.recipientFields}>
              {company ? <div className={css.readonly}><span>{t("vpFormula.recipient")}</span><strong>{t("vpFormula.companyName")}</strong></div> : <label>{t("vpFormula.recipient")}
                <select aria-label={t("vpFormula.recipient")} value={people.some(person => person.id === row.recipient_user_id) || row.recipient_user_id === "__other__" ? row.recipient_user_id : ""}
                  aria-invalid={invalid && missingPerson} onChange={event => change(index, { recipient_user_id: event.target.value,
                    recipient_payee_id: undefined,
                    recipient_name: event.target.value === "__other__" ? "" : people.find(person => person.id === event.target.value)?.name || "" })}>
                  <option value="">{t("vpFormula.chooseRecipient")}</option>
                  {people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}
                  <option value="__other__">{t("vpFormula.external")}</option>
                </select>
                {invalid && missingPerson ? <span className={css.fieldError}>{t(residual ? "vpFormula.error.leadRecipient" : bucket === "referral_amount" ? "vpFormula.error.referralRecipient" : "vpFormula.error.recipientRequired")}</span> : null}
              </label>}
              {work && !locked ? <label>{t("vpFormula.role")}<select aria-label={t("vpFormula.role")} value={missingRole ? "" : role} aria-invalid={invalid && missingRole}
                onChange={event => change(index, { role_label: event.target.value, custom_role: "", recipient_type: workRoleType(event.target.value) })}>
                {missingRole ? <option value="">{role || t("vpFormula.chooseRole")}</option> : null}
                {workRoles.filter(option => !workPool || option.value !== "Lead Lawyer / Case Owner").map(option => <option value={option.value} key={option.value}>{t(option.label)}</option>)}
              </select>{invalid && missingRole ? <span className={css.fieldError}>{t("vpFormula.error.controlledRole")}</span> : null}</label>
                : <div className={css.readonly}><span>{t("vpFormula.type")}</span><strong>{t(residual ? "vpFormula.lead" : bucketLabel[bucket])}</strong></div>}
              {!company && row.recipient_user_id === "__other__" ? <div><label>{t("payout.external")}<select aria-label={t("payout.external")} value={row.recipient_payee_id || ""}
                aria-invalid={invalid && !row.recipient_payee_id} onChange={event => change(index, { recipient_payee_id: event.target.value, recipient_name: payees.find(p => p.id === event.target.value)?.legal_name || "" })}>
                <option value="">{row.recipient_name || t("vpFormula.chooseRecipient")}</option>{payees.map(p => <option key={p.id} value={p.id}>{p.legal_name}</option>)}</select></label>
                <button type="button" className={styles.button} onClick={() => setNewPayee(true)}>{t("payout.add")}</button></div> : null}
              {locked ? <div className={css.readonly}><span>{t(parameterLabel)}</span><strong>{getDisplayPercent(row, input.code)}%</strong>
                {residual ? <span>{t("vpFormula.remainderOwner")}</span> : <span>{t("vpFormula.fixedShare")}</span>}</div>
                : <label>{t(parameterLabel)}<input aria-label={t(parameterLabel)} type="text" inputMode="decimal" maxLength={24} value={fixed ? row.amount : getDisplayPercent(row, input.code)}
                  aria-invalid={invalid && calculated.errors.some(error => ["reconcile", "parameterInvalid", "formulaContract"].includes(error))}
                  onChange={event => change(index, fixed ? { amount: event.target.value } : { percent: isSourcePoolRow(row, input.code)
                    ? formatPercent(Number(event.target.value) * 40 / 100) : event.target.value })} /></label>}
              <div className={css.amount}><span>{t("vpFormula.calculated")}</span><strong>{money(calculated.result?.recipients[index]?.amount)}</strong></div>
            </div>
            {!locked && !company ? <button type="button" className={`${styles.button} ${css.remove}`} onClick={() => {
              rowsChanged(input.rows.filter((_, n) => n !== index));
              requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-add="${bucket}"]`)?.focus());
            }}>{t("common.actions.remove")}</button> : null}
          </fieldset>;
        })}
        {canAdd ? <button type="button" className={styles.button} data-add={bucket} disabled={disabled || input.rows.length >= 50} onClick={() => add(bucket)}>
          {t(bucket === "referral_amount" ? "vpFormula.addReferral" : "vpFormula.addWorker")}</button> : null}
      </section>;
    }) : null}
    {invalid && issues.length ? <div id={id} role="alert" className={styles.error}>{issues.map(error => <p key={error}>{t(`vpFormula.error.${error}`)}</p>)}</div> : null}
    {newPayee ? <PayeeModal onClose={() => setNewPayee(false)} onSaved={() => { setNewPayee(false); setRevision(n => n + 1); }} /> : null}
  </div>;
}
