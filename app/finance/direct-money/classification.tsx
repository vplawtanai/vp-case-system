"use client";
import { useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { VatTreatmentInput } from "../document-decision/vat-input";
import { resolveVatEvidence } from "../document-decision/shared";
import { DirectAmounts } from "./form";
import { directMoneyError, economicClasses, moneyNatures, type DirectLine, type DirectRecord } from "./shared";
import styles from "./direct-money.module.css";

export function DirectMoneyClassification({ record, onSaved, onBusy }: { record: DirectRecord; onSaved: () => void; onBusy?: (busy: boolean) => void }) {
  const { t, locale } = useI18n();
  const [lines, setLines] = useState(() => record.classification_json?.lines || record.lines_json);
  const [reason, setReason] = useState(""), [ack, setAck] = useState(false), [busy, setBusy] = useState(false), [invalid, setInvalid] = useState(false), [failure, setFailure] = useState<unknown>(null);
  const lock = useRef(false), root = useRef<HTMLFormElement>(null);
  const validLine = (l: DirectLine) => l.money_nature !== "unclassified" && (l.money_nature !== "business_revenue" || economicClasses.some(c => c === l.classification)) && resolveVatEvidence(l.vat_treatment_json, l.vat_applicable, l.vat_rate) !== "unknown";
  function update(index: number, patch: Partial<DirectLine>) { setLines(previous => previous.map((l, i) => i === index ? { ...l, ...patch } : l)); setInvalid(false); setFailure(null); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return;
    if (!ack || !reason.trim() || !lines.every(validLine)) { setInvalid(true); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    lock.current = true; setBusy(true); onBusy?.(true); setFailure(null);
    try {
      const result = await supabase.rpc("classify_finance_direct_money_receipt", { p_id: record.id, p_expected_version: record.version, p_acknowledged: ack, p_reason: reason,
        p_choices: lines.map(l => ({ source_line_id: l.source_line_id, money_nature: l.money_nature, classification: l.classification, vat_treatment_json: l.vat_treatment_json })) });
      if (result.error || result.data !== record.id) throw result.error || new Error("response"); onSaved();
    } catch (error) { setFailure(error); } finally { lock.current = false; setBusy(false); onBusy?.(false); }
  }
  return <form ref={root} className={styles.form} onSubmit={submit} noValidate>
    <p className={styles.muted}>{t("directMoney.classifyHelp")}</p>
    {invalid || failure ? <p className={styles.summaryError} role="alert">{failure ? directMoneyError(failure, locale) : t("directMoney.error.summary")}</p> : null}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>{lines.map((line, i) => <section className={styles.line} key={line.source_line_id}>
      <h3>{line.description}</h3><DirectAmounts values={{ base: line.base, vat: line.vat, wht: line.wht, gross: line.gross, actualCash: line.cash }} />
      <div className={styles.grid}><label className={styles.field}>{t("directMoney.nature")}<select value={line.money_nature} aria-invalid={invalid && line.money_nature === "unclassified"} onChange={e => update(i, { money_nature: e.target.value as DirectLine["money_nature"], classification: null })}>{moneyNatures.map(n => <option key={n} value={n}>{t(`directMoney.nature.${n}`)}</option>)}</select></label>
        {line.money_nature === "business_revenue" ? <label className={styles.field}>{t("directMoney.classification")}<select value={line.classification || ""} aria-invalid={invalid && !line.classification} onChange={e => update(i, { classification: e.target.value || null })}><option value="">{t("directMoney.choose")}</option>{economicClasses.map(c => <option key={c} value={c}>{t(`finance.invoice.classification.${c}`)}</option>)}</select></label> : null}
        {line.vat_applicable && line.vat_rate > 0 ? <p>VAT {line.vat_rate}%</p> : <VatTreatmentInput value={line.vat_treatment_json} applicable={line.vat_applicable} rate={line.vat_rate} onChange={vat_treatment_json => update(i, { vat_treatment_json })} />}
      </div>{invalid && !validLine(line) ? <p className={styles.error}>{t("directMoney.error.vatRequired")}</p> : null}
    </section>)}
      <label className={styles.field}>{t("directMoney.reason")}<textarea value={reason} maxLength={2000} rows={2} aria-invalid={invalid && !reason.trim()} onChange={e => { setReason(e.target.value); setInvalid(false); }} /></label>
      <label className={styles.check}><input type="checkbox" checked={ack} aria-invalid={invalid && !ack} onChange={e => { setAck(e.target.checked); setInvalid(false); }} />{t("directMoney.classifyAck")}</label>
      <button className={styles.primary} type="submit">{t("directMoney.classify")}</button>
    </fieldset>
  </form>;
}
