"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DetailModal from "../../components/DetailModal";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { initialMoneyChoices, moneyAllocationError, moneyCategories, moneyReviewComplete, moneyStatus, type MoneyChoice, type MoneyContext, type MoneySource } from "./money-allocation";
import styles from "./money-allocation.module.css";

export function MoneyAllocationFacts({ source }: { source: MoneySource }) {
  const { t, locale } = useI18n();
  const facts = { settlement: source.payment.settlement, cash: source.payment.cash, wht: source.payment.wht, vat: source.proven_vat, base: source.proven_base, remaining: source.unallocated_settlement };
  return <dl className={styles.facts}>{Object.entries(facts).map(([key, value]) => <div key={key}><dt>{t(`moneyAllocation.${key}`)}</dt><dd>{Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {source.payment.currency}</dd></div>)}</dl>;
}

export function MoneyAllocationPanel({ paymentId }: { paymentId: string }) {
  const { t, locale, date } = useI18n();
  const [context, setContext] = useState<MoneyContext | null>(null), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [choices, setChoices] = useState<MoneyChoice[]>([]), [note, setNote] = useState("");
  const [ack, setAck] = useState(false), [reason, setReason] = useState(""), [success, setSuccess] = useState(false);
  const [invalid, setInvalid] = useState(false), lock = useRef(false), formRef = useRef<HTMLDivElement>(null);
  const install = useCallback((c: MoneyContext) => { setContext(c); setChoices(initialMoneyChoices(c)); setNote(c.current?.note || ""); setAck(false); setReason(""); setInvalid(false); }, []);
  const reload = useCallback(async () => {
    const r = await supabase.rpc("get_finance_money_allocation", { p_payment_id: paymentId });
    if (r.error || !r.data?.source) throw r.error || new Error("response");
    install(r.data as MoneyContext);
  }, [paymentId, install]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await supabase.rpc("get_finance_money_allocation", { p_payment_id: paymentId });
        if (r.error || !r.data?.source) throw r.error || new Error("response");
        if (!cancelled) { install(r.data as MoneyContext); setLoadFailed(false); }
      } catch { if (!cancelled) setLoadFailed(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [paymentId, install]);
  const current = context?.current, editable = !!context?.can_manage && (!current || current.status === "draft");
  const dirty = !!context && (JSON.stringify(choices) !== JSON.stringify(initialMoneyChoices(context)) || note !== (current?.note || ""));
  const needsSave = !current || dirty || !context?.source_current;
  function invalidForm(code: string) {
    setInvalid(true); setError(t(`moneyAllocation.error.${code}`));
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
  async function act(action: "save" | "review" | "finalize" | "supersede") {
    if (!context?.can_manage || lock.current) return;
    setError(""); setSuccess(false);
    if (action !== "save" && !ack) return invalidForm("ACK_REQUIRED");
    if (action === "supersede" && !reason.trim()) return invalidForm("REASON_REQUIRED");
    if ((action === "review" || action === "finalize") && (!moneyReviewComplete(context.source, choices) || needsSave)) return invalidForm("REVIEW_REQUIRED");
    lock.current = true; setBusy(true);
    try {
      const result = action === "save"
        ? await supabase.rpc("save_finance_money_allocation", { p_payment_id: paymentId, p_expected_id: current?.id || null, p_expected_version: current?.version || null, p_source: context.source, p_choices: choices, p_note: note })
        : await supabase.rpc("transition_finance_money_allocation", { p_id: current?.id, p_expected_version: current?.version, p_source: context.source, p_action: action, p_acknowledged: ack, p_reason: reason });
      if (result.error || typeof result.data !== "string") throw result.error || new Error("response");
      await reload(); setSuccess(true);
    } catch (e) { console.error("Money allocation operation failed", e); setError(moneyAllocationError(e, locale)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await reload(); setLoadFailed(false); } catch (e) { setError(moneyAllocationError(e, locale)); } finally { lock.current = false; setBusy(false); }
  }
  function change(index: number, patch: Partial<MoneyChoice>) { setChoices(c => c.map((v, n) => n === index ? { ...v, ...patch } : v)); setSuccess(false); setError(""); }
  const amount = (value: number) => Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className={styles.section}>
    <div className={styles.heading}><h2>{t("moneyAllocation.title")}</h2>{context ? <span className={styles.status}>{t(`moneyAllocation.${moneyStatus(context)}`)}</span> : null}</div>
    {loading ? <p role="status">{t("moneyAllocation.loading")}</p> : null}
    {!open && (error || loadFailed) ? <p className={styles.error} role="alert">{error || t("moneyAllocation.error.unknown")}</p> : null}
    <p className={styles.muted}>{t("moneyAllocation.boundary")}</p>
    {context ? <button className={styles.button} disabled={busy} onClick={() => { setSuccess(false); setError(""); setOpen(true); if (!dirty) void refresh(); }}>{t("moneyAllocation.open")}</button> : !loading ? <button className={styles.button} disabled={busy} onClick={() => void refresh()}>{t("moneyAllocation.retry")}</button> : null}
    <DetailModal open={open} title={t("moneyAllocation.title")} status={current ? t(`moneyAllocation.${current.status}`) : t("moneyAllocation.unallocated")}
      onClose={() => { if (!busy) setOpen(false); }} closeOnBackdrop={!busy && !dirty}
      footer={context?.can_manage ? <div className={styles.actions}>
        {editable ? <button className={styles.button} disabled={busy || !needsSave} onClick={() => void act("save")}>{t("moneyAllocation.save")}</button> : null}
        {current?.status === "draft" ? <button className={styles.primary} disabled={busy || needsSave || !!context.source.blockers.length} onClick={() => void act("review")}>{t("moneyAllocation.review")}</button> : null}
        {current?.status === "reviewed" ? <button className={styles.primary} disabled={busy || !context.source_current} onClick={() => void act("finalize")}>{t("moneyAllocation.finalize")}</button> : null}
      </div> : undefined}>
      {context ? <div className={styles.body} ref={formRef} aria-busy={busy}>
        {error ? <div className={styles.error} role="alert">{error} <button className={styles.button} disabled={busy} onClick={() => void refresh()}>{t("moneyAllocation.retry")}</button></div> : null}
        {success ? <p className={styles.success} role="status">{t("moneyAllocation.saved")}</p> : null}
        {dirty ? <p className={styles.warning} role="status">{t("moneyAllocation.unsaved")}</p> : null}
        {current && !context.source_current ? <p className={styles.warning}>{t("moneyAllocation.stale")}</p> : null}
        <MoneyAllocationFacts source={context.source} />
        {context.source.blockers.map(b => <p className={styles.warning} key={b}>{t(`moneyAllocation.block.${b}`)}</p>)}
        <h3>{t("moneyAllocation.lines")}</h3>
        <fieldset disabled={!editable || busy} className={styles.fields}>
          {context.source.lines.map((line, index) => <div className={styles.line} key={line.invoice_item_id}>
            <div><Link href={`/finance/invoices/${line.invoice_id}`}>{line.invoice_no}</Link><h4>{line.description}</h4></div>
            <dl className={styles.facts}>{(["base", "vat", "settlement", "cash", "wht"] as const).map(key => <div key={key}><dt>{t(`moneyAllocation.${key}`)}</dt><dd>{amount(line[key])} {context.source.payment.currency}</dd></div>)}</dl>
            <p className={styles.muted}>{t("moneyAllocation.vatTreatment")}: {t(`moneyAllocation.vat.${line.vat_treatment.treatment}`)}
              {line.wht_evidence?.rate_percent != null ? <> · {t("moneyAllocation.whtBasis")}: {amount(line.wht_evidence.base_amount)} · {t("moneyAllocation.whtRate")}: {line.wht_evidence.rate_percent}%</> : null}</p>
            <div className={styles.choiceGrid}><label>{t("moneyAllocation.category")}<select value={choices[index]?.category || "unallocated"} aria-invalid={invalid && choices[index]?.category === "unallocated"} onChange={e => change(index, { category: e.target.value as MoneyChoice["category"] })}>{moneyCategories.map(c => <option key={c} value={c}>{t(`moneyAllocation.category.${c}`)}</option>)}</select></label>
              <label>{t("moneyAllocation.evidence")}<textarea rows={2} maxLength={2000} value={choices[index]?.reason || ""} aria-invalid={invalid && !choices[index]?.reason.trim()} onChange={e => change(index, { reason: e.target.value })} /></label></div>
          </div>)}
          <label>{t("moneyAllocation.note")}<textarea rows={2} maxLength={2000} value={note} onChange={e => { setNote(e.target.value); setSuccess(false); }} /></label>
        </fieldset>
        {context.can_manage && current ? <label className={styles.check}><input type="checkbox" checked={ack} disabled={busy} aria-invalid={invalid && !ack} onChange={e => { setAck(e.target.checked); setError(""); }} />{t("moneyAllocation.ack")}</label> : null}
        {context.can_manage && current ? <details className={styles.other}><summary>{t("moneyAllocation.otherActions")}</summary><p>{t("moneyAllocation.supersedeHelp")}</p><label>{t("moneyAllocation.reason")}<textarea rows={2} maxLength={2000} disabled={busy} value={reason} aria-invalid={invalid && !reason.trim()} onChange={e => { setReason(e.target.value); setError(""); }} /></label><button className={styles.danger} disabled={busy} onClick={() => void act("supersede")}>{t("moneyAllocation.supersede")}</button></details> : null}
        {context.history.length ? <details className={styles.history}><summary>{t("moneyAllocation.history")}</summary>{context.history.map(h => <details className={styles.line} key={h.id}><summary>{t("moneyAllocation.revision", { revision: h.revision })} · {t(`moneyAllocation.${h.status}`)} · {date(h.created_at, true)}</summary>
          <MoneyAllocationFacts source={h.source_snapshot_json} />{h.decisions_json.map(c => <p key={c.invoice_item_id}>{h.source_snapshot_json.lines.find(l => l.invoice_item_id === c.invoice_item_id)?.description} · {t(`moneyAllocation.category.${c.category}`)}: {c.reason}</p>)}{h.supersede_reason ? <p>{h.supersede_reason}</p> : null}
        </details>)}</details> : null}
      </div> : null}
    </DetailModal>
  </section>;
}
