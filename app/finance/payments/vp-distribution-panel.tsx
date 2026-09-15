"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import DetailModal from "../../components/DetailModal";
import { StatusBadge } from "../../components/ui/patterns";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import {
  distributionAuditEvent, distributionBlocker, distributionCents, distributionError, distributionExpected, distributionFields,
  distributionLineComplete, distributionPayload, distributionReviewComplete, distributionSource, distributionSourceProven,
  distributionSplitCents, initialDistributionChoices, isDirectCompanyClassification,
  type DistributionChoice, type DistributionDecision, type DistributionSource,
  distributionLineId, distributionCurrency, distributionConfirmed,
} from "./vp-distribution";
import { VpFormulaEditor, FormulaResultEvidence } from "./vp-formula-editor";
import { formulaCatalogCurrent, initialLineFormulas, lineFormulaChoices, type FormulaContext, type LineFormulaInputs } from "./vp-formula";
import { calculateFormula, type FormulaInput, type FormulaPerson } from "../compensation/formula-calculation";
import styles from "./money-allocation.module.css";
import vpStyles from "./vp-distribution.module.css";

function DistributionAmounts({ values, currency }: { values: Record<string, number | string | null>; currency: string }) {
  const { t, locale } = useI18n();
  return <dl className={styles.facts}>{Object.entries(values).map(([key, value]) => <div key={key}>
    <dt>{t(`vpDistribution.${key}`)}</dt><dd>{value !== null && Number.isFinite(Number(value))
      ? `${Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : "-"}</dd>
  </div>)}</dl>;
}

export function VpDistributionEvidence({ source, choices, editable = false, busy = false, invalid = false, formulas = {}, people = [], onChange }: {
  source: DistributionSource; choices: DistributionDecision[]; editable?: boolean; busy?: boolean; invalid?: boolean;
  formulas?: LineFormulaInputs; people?: FormulaPerson[];
  onChange?: (id: string, input: FormulaInput) => void;
}) {
  const { t, locale } = useI18n(), id = useId();
  const currency = distributionCurrency(source);
  const totals = Object.fromEntries(distributionFields.map(field => {
    const values = choices.map(choice => distributionCents(choice[field]));
    const sum = values.reduce<number>((total, value) => total + (value ?? 0), 0);
    return [field, values.every(value => value !== null) && Number.isSafeInteger(sum) ? sum / 100 : null];
  }));
  return <div className={vpStyles.evidence}>
    <DistributionAmounts values={{ [source.received_money_source ? "grossReceived" : "settlement"]: source.received_money_source?.gross_received ?? source.money_source?.payment?.settlement ?? null, ...source.totals }} currency={currency} />
    <DistributionAmounts values={totals} currency={currency} />
    <p className={styles.muted}>{t("vpDistribution.taxBoundary")}</p>
    <p className={styles.muted}>{source.received_money_source ? t("directMoney.source") : source.money_allocation ? t("vpDistribution.moneyRevision", { revision: source.money_allocation.revision }) : t("vpDistribution.noMoneyRecord")}</p>
    {source.blockers.map((blocker, index) => <p className={styles.warning} key={`${blocker}-${index}`}>{distributionBlocker(blocker, locale)}</p>)}
    <h3>{t("vpDistribution.lines")}</h3>
    {source.lines.map((line, index) => {
      const professional = line.classification === "professional_fee", direct = isDirectCompanyClassification(line.classification);
      const lineId = distributionLineId(line), saved = choices.find(choice => distributionLineId(choice) === lineId);
      const choice = saved ? { ...saved, ...Object.fromEntries(distributionFields.map(field => [field, String(saved[field])])) } as DistributionChoice : undefined;
      const preview = editable && formulas[lineId] ? calculateFormula(line.professional_pool, formulas[lineId], people).result : null;
      const sum = editable ? (preview ? preview.recipients.reduce((total, row) => total + (distributionCents(row.amount) ?? 0), 0) : null) : distributionSplitCents(choice);
      const pool = distributionCents(line.professional_pool);
      const lineInvalid = invalid && professional && !distributionLineComplete(line, choice);
      const errorId = `${id}-split-${index}`;
      return <section className={styles.line} key={lineId} aria-label={line.description}>
        <div>{line.invoice_id ? <Link href={`/finance/invoices/${line.invoice_id}`}>{line.invoice_no}</Link> : null}<h4>{line.description}</h4></div>
        <p className={professional || direct ? styles.muted : styles.warning}>{t(`vpDistribution.${professional ? "split" : direct ? "direct" : "unknownClassification"}`)}</p>
        <DistributionAmounts values={{ base: line.base, vat: line.vat, wht: line.wht, cash: line.cash }} currency={currency} />
        {direct ? <DistributionAmounts values={{ company_economic: line.company_economic, company_cash: line.company_cash }} currency={currency} /> : null}
        {professional ? <>
          <DistributionAmounts values={{ professional_pool: line.professional_pool, allocated: sum !== null ? sum / 100 : null, remaining: sum !== null && pool !== null ? (pool - sum) / 100 : null }} currency={currency} />
          <p className={styles.muted}>{t("vpDistribution.poolFormula")}</p>
          {editable ? <VpFormulaEditor pool={line.professional_pool} input={formulas[lineId]} people={people}
            currency={currency} disabled={busy} invalid={invalid} onChange={input => onChange?.(lineId, input)} />
            : saved?.formula_result ? <FormulaResultEvidence result={saved.formula_result} currency={currency} />
            : <><p className={styles.warning}>{t("vpFormula.legacy")}</p><DistributionAmounts values={Object.fromEntries(distributionFields.map(field => [field, saved?.[field] ?? null]))} currency={currency} /></>}
          {lineInvalid ? <p id={errorId} className={styles.error}>{t("vpDistribution.splitInvalid")}</p> : null}
        </> : null}
      </section>;
    })}
  </div>;
}

export function VpDistributionPanel({ paymentId, directMoneyReceiptId }: { paymentId: string; directMoneyReceiptId?: never } | { paymentId?: never; directMoneyReceiptId: string }) {
  const { t, locale, date } = useI18n();
  const [context, setContext] = useState<FormulaContext | null>(null), [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [loadFailed, setLoadFailed] = useState(false);
  const [formulas, setFormulas] = useState<LineFormulaInputs>({}), [note, setNote] = useState("");
  const [ack, setAck] = useState(false), [reason, setReason] = useState(""), [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<unknown>(null), [success, setSuccess] = useState(false), [refreshRequired, setRefreshRequired] = useState(false);
  const lock = useRef(false), formRef = useRef<HTMLDivElement>(null);
  const install = useCallback((value: FormulaContext) => {
    setContext(value); setFormulas(initialLineFormulas(value)); setNote(value.current?.note || "");
    setAck(false); setReason(""); setInvalid(false); setRefreshRequired(false); setLoadFailed(false);
  }, []);
  const fetchContext = useCallback(async () => {
    const result = directMoneyReceiptId
      ? await supabase.rpc("get_finance_direct_vp_formula_context", { p_direct_id: directMoneyReceiptId })
      : await supabase.rpc("get_finance_vp_formula_context", { p_payment_id: paymentId });
    if (result.error || !result.data?.source || result.data.posting_enabled !== false) throw result.error || new Error("response");
    return result.data as FormulaContext;
  }, [paymentId, directMoneyReceiptId]);
  useEffect(() => {
    let cancelled = false;
    void fetchContext().then(value => { if (!cancelled) install(value); })
      .catch(() => { if (!cancelled) setLoadFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchContext, install]);

  const current = context?.current, source = context ? distributionSource(context) : null;
  const calculated = context ? lineFormulaChoices(context, formulas) : null;
  const choices = current && current.status !== "draft" ? initialDistributionChoices(context!) : calculated?.choices || [];
  const catalogCurrent = !!context && formulaCatalogCurrent(context);
  const confirmed = !!context && distributionConfirmed(context.source);
  const editable = !!context?.can_manage && confirmed && (!current || current.status === "draft");
  const dirty = !!context && (JSON.stringify(formulas) !== JSON.stringify(initialLineFormulas(context)) || note !== (current?.note || ""));
  const hasLocalInput = dirty || reason !== "" || ack;
  const needsSave = !current || dirty || !context?.source_current;
  const proven = !!context && distributionSourceProven(context.source);
  const active = !!current && current.status !== "superseded";

  function invalidForm(code: string) {
    setInvalid(true); setError({ message: `VP_DISTRIBUTION_${code}` });
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setSuccess(false);
    try { install(await fetchContext()); }
    catch (failure) { setError(failure); setRefreshRequired(true); }
    finally { lock.current = false; setBusy(false); }
  }
  async function act(action: "save" | "review" | "finalize" | "supersede") {
    if (!context?.can_manage || lock.current || refreshRequired) return;
    if (action === "save" && !editable) return;
    if (action === "review" && current?.status !== "draft") return;
    if (action === "finalize" && current?.status !== "reviewed") return;
    if (action === "supersede" && !active) return;
    setError(null); setSuccess(false);
    if (action !== "save" && !ack) return invalidForm("ACK_REQUIRED");
    if (action === "supersede" && (!reason.trim() || reason.length > 2000)) return invalidForm("REASON_REQUIRED");
    if (action === "save" && (!calculated?.valid || !catalogCurrent)) return invalidForm(proven ? "AMOUNT_INVALID" : "SOURCE_UNPROVEN");
    if ((action === "review" || action === "finalize") && (needsSave || !calculated?.valid || !distributionReviewComplete(context.source, choices))) return invalidForm("REVIEW_REQUIRED");
    lock.current = true; setBusy(true);
    try {
      const result = action === "save"
        ? await supabase.rpc(directMoneyReceiptId ? "save_finance_direct_vp_distribution" : "save_finance_vp_distribution", { ...(directMoneyReceiptId ? { p_direct_id: directMoneyReceiptId } : { p_payment_id: paymentId }), ...distributionExpected(context), p_source: context.source, p_choices: distributionPayload(context.source, choices), p_note: note })
        : await supabase.rpc("transition_finance_vp_distribution", { p_id: current?.id, p_expected_version: current?.version, p_source: context.source, p_action: action, p_acknowledged: ack, p_reason: reason });
      if (result.error || typeof result.data !== "string") throw result.error || new Error("response");
      install(await fetchContext()); setSuccess(true);
    } catch (failure) {
      // A failed response may follow a successful write. Require a fresh read before retrying.
      setError(failure); setRefreshRequired(true);
    } finally { lock.current = false; setBusy(false); }
  }
  function change(id: string, input: FormulaInput) {
    setFormulas(previous => ({ ...previous, [id]: input }));
    setSuccess(false); setError(null); setAck(false);
  }
  const reloadButton = <button className={styles.button} disabled={busy} onClick={() => void refresh()}>{t(`vpDistribution.${hasLocalInput ? "discardReload" : "retry"}`)}</button>;
  return <section className={styles.section}>
    <div className={styles.heading}><h2>{t("vpDistribution.title")}</h2>{context ? <span className={styles.status}>{t(`vpDistribution.${current?.status || "unallocated"}`)}</span> : null}</div>
    <p className={styles.muted}>{t("vpDistribution.boundary")}</p>
    {loading ? <p role="status">{t("vpDistribution.loading")}</p> : null}
    {!open && (loadFailed || error) ? <p className={styles.error} role="alert">{distributionError(error, locale)}</p> : null}
    {!open && current && !context?.source_current ? <p className={styles.warning}>{t("vpDistribution.stale")}</p> : null}
    {context ? <button className={styles.button} disabled={busy} onClick={() => { setOpen(true); setSuccess(false); if (!hasLocalInput) void refresh(); }}>{t("vpDistribution.open")}</button> : !loading ? reloadButton : null}
    <DetailModal open={open} size="workflow" title={t("vpDistribution.title")} status={<StatusBadge status={current?.status || "unallocated"} label={t(`vpDistribution.${current?.status || "unallocated"}`)} />}
      onClose={() => { if (!busy) setOpen(false); }} closeOnBackdrop={!busy && !hasLocalInput}
      footer={context?.can_manage ? <div className={vpStyles.footer}>
        {calculated && source ? <div className={vpStyles.reconciliation} aria-live="polite" aria-atomic="true">
          <DistributionAmounts values={calculated.progress} currency={distributionCurrency(source)} />
          <p className={calculated.valid && proven ? vpStyles.complete : vpStyles.unresolved}>{t(calculated.valid && proven ? "vpFormula.complete" : "vpFormula.unresolved")}</p>
        </div> : null}
        <div className={styles.actions}>
        {editable ? <button className={styles.button} disabled={busy || refreshRequired || !needsSave || !proven || !catalogCurrent} onClick={() => void act("save")}>{t("vpDistribution.save")}</button> : null}
        {current?.status === "draft" ? <button className={styles.primary} disabled={busy || refreshRequired || needsSave || !proven} onClick={() => void act("review")}>{t("vpDistribution.review")}</button> : null}
        {current?.status === "reviewed" ? <button className={styles.primary} disabled={busy || refreshRequired || !context.source_current || !proven} onClick={() => void act("finalize")}>{t("vpDistribution.finalize")}</button> : null}
        </div>
      </div> : undefined}>
      {context && source ? <div className={styles.body} ref={formRef} aria-busy={busy}>
        {error || refreshRequired ? <div className={styles.error} role="alert">{distributionError(error, locale)} {reloadButton}</div> : null}
        {success ? <p className={styles.success} role="status">{t("vpDistribution.saved")}</p> : null}
        {!catalogCurrent ? <p className={styles.warning}>{t("vpFormula.catalogStale")}</p> : null}
        {dirty ? <p className={styles.warning} role="status">{t("vpDistribution.unsaved")}</p> : null}
        {!context.can_manage ? <p className={styles.muted}>{t("vpDistribution.readonly")}</p> : null}
        {current && !context.source_current ? <p className={styles.warning}>{t("vpDistribution.stale")}</p> : null}
        {!confirmed ? <p className={styles.warning}>{t("vpDistribution.reversed")}</p> : null}
        {current && current.status !== "draft" ? <p className={styles.muted}>{t("vpDistribution.snapshot")}</p> : null}
        {source !== context.source ? context.source.blockers.map((blocker, index) => <p className={styles.warning} key={index}>{distributionBlocker(blocker, locale)}</p>) : null}
        <VpDistributionEvidence source={source} choices={choices} editable={editable} busy={busy || refreshRequired || !catalogCurrent} invalid={invalid} formulas={formulas} people={context.formula_people} onChange={change} />
        <label>{t("vpDistribution.note")}<textarea aria-label={t("vpDistribution.note")} rows={2} maxLength={2000} readOnly={!editable} disabled={busy || refreshRequired} value={note} onChange={event => { setNote(event.target.value); setAck(false); setSuccess(false); }} /></label>
        {context.can_manage && active ? <label className={styles.check}><input type="checkbox" checked={ack} disabled={busy || refreshRequired} aria-invalid={invalid && !ack} onChange={event => { setAck(event.target.checked); setError(null); }} />{t("vpDistribution.ack")}</label> : null}
        {context.can_manage && active ? <details className={styles.other}><summary>{t("vpDistribution.otherActions")}</summary>
          <p>{t("vpDistribution.supersedeHelp")}</p><label>{t("vpDistribution.reason")}<textarea aria-label={t("vpDistribution.reason")} rows={2} maxLength={2000} value={reason} disabled={busy || refreshRequired} aria-invalid={invalid && !reason.trim()} onChange={event => { setReason(event.target.value); setError(null); }} /></label>
          <button className={styles.danger} disabled={busy || refreshRequired} onClick={() => void act("supersede")}>{t("vpDistribution.supersede")}</button>
        </details> : null}
        {context.history.length ? <details className={styles.history}><summary>{t("vpDistribution.history")}</summary>{context.history.map(record => <details className={styles.line} key={record.id}>
          <summary>{t("vpDistribution.revision", { revision: record.revision })} · {t(`vpDistribution.${record.status}`)} · {date(record.created_at, true)}</summary>
          <VpDistributionEvidence source={record.source_snapshot_json} choices={record.decisions_json} />
          {record.note ? <p>{record.note}</p> : null}{record.supersede_reason ? <p>{record.supersede_reason}</p> : null}
        </details>)}</details> : null}
        {context.audit.length ? <details className={styles.history}><summary>{t("vpDistribution.audit")}</summary>{context.audit.map(event => <p key={event.id}>{distributionAuditEvent(event.event_type, locale)} · {date(event.created_at, true)}{event.actor_id ? ` · ${event.actor_id}` : ""}</p>)}</details> : null}
      </div> : null}
    </DetailModal>
  </section>;
}
