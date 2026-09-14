"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { VatTreatmentInput } from "../document-decision/vat-input";
import { directLineAmounts, directMoneyError, directTotals, economicClasses, moneyNatures, newDirectInput, newDirectLine, validateDirectInput, type DirectInput, type DirectLine } from "./shared";
import styles from "./direct-money.module.css";

type Option = { id: string; name: string };
type Matter = { id: string | number; client_id: string; title: string; file_no?: string; matter_no?: string };
export function DirectAmounts({ values }: { values: Record<string, number | null> }) {
  const { t, locale } = useI18n();
  return <dl className={styles.facts}>{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key === "vat" || key === "wht" ? key.toUpperCase() : t(`directMoney.${key}`)}</dt><dd>{value !== null && Number.isFinite(value) ? value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " THB" : "-"}</dd></div>)}</dl>;
}
export function DirectMoneyForm({ initial, id: existingId, version = 0, onSaved, onBusy }: { initial?: DirectInput; id?: string; version?: number; onSaved?: () => void; onBusy?: (busy: boolean) => void }) {
  const { t, locale } = useI18n(), router = useRouter(), formId = useId();
  const [form, setForm] = useState<DirectInput>(() => initial || newDirectInput());
  const id = useRef<string>(existingId || ""), lock = useRef(false), root = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false), [errors, setErrors] = useState<Record<string, string>>({}), [failure, setFailure] = useState<unknown>(null);
  const [clients, setClients] = useState<Option[]>([]), [banks, setBanks] = useState<Option[]>([]), [cases, setCases] = useState<Matter[]>([]), [advisories, setAdvisories] = useState<Matter[]>([]);
  const [lookupFailed, setLookupFailed] = useState(false), [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const c = await supabase.from("clients").select("id,name").order("name");
        const b = await supabase.from("finance_bank_accounts").select("id,short_name,bank_name").eq("is_active", true).order("short_name");
        const cs = await supabase.from("cases").select("id,client_id,title,file_no").order("created_at", { ascending: false });
        const ad = await supabase.from("advisory_matters").select("id,client_id,title,matter_no").order("created_at", { ascending: false });
        if (c.error || b.error || cs.error || ad.error) throw new Error("lookup");
        if (!cancelled) { setClients(c.data || []); setBanks((b.data || []).map(row => ({ id: row.id, name: `${row.short_name} · ${row.bank_name}` }))); setCases(cs.data || []); setAdvisories(ad.data || []); }
      } catch { if (!cancelled) setLookupFailed(true); } finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, []);
  function update(patch: Partial<DirectInput>) { setForm(value => ({ ...value, ...patch })); setErrors({}); setFailure(null); }
  function lineUpdate(index: number, patch: Partial<DirectLine>) { update({ lines: form.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }); }
  const error = (key: string) => errors[key] ? <small id={`${formId}-${key}-error`} className={styles.error}>{t(`directMoney.error.${errors[key]}`)}</small> : null;
  const field = (key: string, label: string, child: ReactNode) => <label className={styles.field}><span>{label}</span>{child}{error(key)}</label>;
  const attrs = (key: string) => ({ "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `${formId}-${key}-error` : undefined });
  const numeric = (value: number | null, change: (value: number) => void, key: string, scale = "0.01") => <input type="number" inputMode="decimal" min="0" step={scale} value={value || ""} onChange={e => change(e.target.value === "" ? 0 : Number(e.target.value))} {...attrs(key)} />;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || loading || lookupFailed) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const issues = validateDirectInput(form, today); setErrors(issues); setFailure(null);
    if (Object.keys(issues).length) { requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    lock.current = true; setBusy(true); onBusy?.(true); id.current ||= crypto.randomUUID();
    try {
      const result = await supabase.rpc("save_finance_direct_money_receipt", { p_id: id.current, p_expected_version: version, p_input: form });
      if (result.error || result.data !== id.current) throw result.error || new Error("response");
      if (onSaved) onSaved(); else router.push(`/finance/direct-money/${id.current}`);
    } catch (e) { setFailure(e); } finally { lock.current = false; setBusy(false); onBusy?.(false); }
  }
  const totals = directTotals(form.lines), tKey = (key: string) => t(`directMoney.${key}`);
  return <form className={styles.form} ref={root} onSubmit={submit} noValidate aria-busy={busy}>
    {Object.keys(errors).length ? <p className={styles.summaryError} role="alert">{tKey("error.summary")}</p> : null}
    {failure || lookupFailed ? <p className={styles.summaryError} role="alert">{directMoneyError(failure, locale)}</p> : null}
    {loading ? <p role="status">{t("common.state.loading")}</p> : null}
    <fieldset disabled={busy || loading || lookupFailed} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section className={styles.section}><h2>{tKey("facts")}</h2><div className={styles.grid}>
        {field("received_on", tKey("date"), <input type="date" value={form.received_on} onChange={e => update({ received_on: e.target.value })} {...attrs("received_on")} />)}
        {field("method", tKey("method"), <select value={form.method} onChange={e => update({ method: e.target.value as DirectInput["method"], receiving_bank_account_id: null, cash_location: null })}>{["bank_transfer", "cash", "other"].map(value => <option key={value} value={value}>{tKey(value)}</option>)}</select>)}
        {field("account", tKey(form.method === "bank_transfer" ? "account" : "location"), form.method === "bank_transfer" ? <select value={form.receiving_bank_account_id || ""} onChange={e => update({ receiving_bank_account_id: e.target.value || null })} {...attrs("account")}><option value="">{tKey("choose")}</option>{banks.map(bank => <option value={bank.id} key={bank.id}>{bank.name}</option>)}</select> : <input value={form.cash_location || ""} maxLength={300} onChange={e => update({ cash_location: e.target.value })} {...attrs("account")} />)}
        {field("cash_amount", tKey("actualCash"), numeric(form.cash_amount, cash_amount => update({ cash_amount }), "cash_amount"))}
        {field("client_id", tKey("client"), <select value={form.client_id || ""} onChange={e => update({ client_id: e.target.value || null, payer_name: clients.find(c => c.id === e.target.value)?.name || form.payer_name, case_id: null, advisory_matter_id: null })}><option value="">{tKey("unlinked")}</option>{clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</select>)}
        {field("payer_name", tKey("payer"), <input value={form.payer_name} maxLength={500} onChange={e => update({ payer_name: e.target.value })} {...attrs("payer_name")} />)}
        {field("matter", tKey("matter"), <select disabled={!form.client_id} value={form.case_id ? `case:${form.case_id}` : form.advisory_matter_id ? `advisory:${form.advisory_matter_id}` : ""} onChange={e => { const [type, value] = e.target.value.split(":"); update({ case_id: type === "case" ? Number(value) : null, advisory_matter_id: type === "advisory" ? value : null }); }}><option value="">{tKey("unlinked")}</option>{cases.filter(c => c.client_id === form.client_id).map(c => <option key={c.id} value={`case:${c.id}`}>{c.file_no} · {c.title}</option>)}{advisories.filter(c => c.client_id === form.client_id).map(c => <option key={c.id} value={`advisory:${c.id}`}>{c.matter_no} · {c.title}</option>)}</select>)}
        {field("reference", tKey("reference"), <input maxLength={200} value={form.reference_no || ""} onChange={e => update({ reference_no: e.target.value || null })} />)}
        {field("evidence", tKey("evidence"), <input maxLength={1000} value={form.evidence_reference || ""} onChange={e => update({ evidence_reference: e.target.value || null })} />)}
        {field("note", tKey("note"), <textarea rows={2} maxLength={2000} value={form.note} onChange={e => update({ note: e.target.value })} />)}
      </div></section>
      <section className={styles.section}><h2>{tKey("lines")}</h2>{error("lines")}{form.lines.map((line, index) => {
        const key = `line.${index}.`, amount = directLineAmounts(line);
        return <div className={styles.line} key={line.source_line_id}><div className={styles.lineHeader}><h3>{index + 1}. {line.description || tKey("description")}</h3><button type="button" className={styles.button} title={tKey("removeLine")} aria-label={`${tKey("removeLine")} ${index + 1}`} disabled={form.lines.length === 1} onClick={() => update({ lines: form.lines.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></div><div className={styles.grid}>
          {field(key + "description", tKey("description"), <input maxLength={1000} value={line.description} onChange={e => lineUpdate(index, { description: e.target.value })} {...attrs(key + "description")} />)}
          {field(key + "reason", tKey("reason"), <input maxLength={2000} value={line.reason} onChange={e => lineUpdate(index, { reason: e.target.value })} {...attrs(key + "reason")} />)}
          {field(key + "nature", tKey("nature"), <select value={line.money_nature} onChange={e => lineUpdate(index, { money_nature: e.target.value as DirectLine["money_nature"], classification: null })}>{moneyNatures.map(value => <option key={value} value={value}>{tKey(`nature.${value}`)}</option>)}</select>)}
          {line.money_nature === "business_revenue" ? field(key + "classification", tKey("classification"), <select value={line.classification || ""} onChange={e => lineUpdate(index, { classification: e.target.value || null })} {...attrs(key + "classification")}><option value="">{tKey("choose")}</option>{economicClasses.map(value => <option key={value} value={value}>{t(`finance.invoice.classification.${value}`)}</option>)}</select>) : null}
          {field(key + "base", tKey("base"), numeric(line.base, base => lineUpdate(index, { base }), key + "base"))}
          <div><label className={styles.check}><input type="checkbox" checked={line.vat_applicable} onChange={e => lineUpdate(index, { vat_applicable: e.target.checked, vat_rate: 0, vat_treatment_json: null })} />{tKey("vatApplies")}</label>{line.vat_applicable ? field(key + "vat_rate", tKey("vatRate"), numeric(line.vat_rate, vat_rate => lineUpdate(index, { vat_rate, vat_treatment_json: null }), key + "vat_rate", "0.0001")) : null}</div>
          <div className={styles.field}>{line.vat_applicable && line.vat_rate > 0 ? <p>VAT {line.vat_rate}%</p> : <VatTreatmentInput value={line.vat_treatment_json} applicable={line.vat_applicable} rate={line.vat_rate} onChange={vat_treatment_json => lineUpdate(index, { vat_treatment_json })} />}{error(key + "vat")}</div>
          {field(key + "wht", tKey("wht"), <select value={line.wht_applicability} onChange={e => lineUpdate(index, { wht_applicability: e.target.value as DirectLine["wht_applicability"], wht_base: null, wht_rate: null })} {...attrs(key + "wht")}><option value="unknown">{tKey("choose")}</option>{["applies", "does_not_apply"].map(value => <option key={value} value={value}>{tKey(value)}</option>)}</select>)}
          {line.wht_applicability === "applies" ? <>{field(key + "wht_base", tKey("whtBase"), numeric(line.wht_base, wht_base => lineUpdate(index, { wht_base }), key + "wht"))}{field(key + "wht_rate", tKey("whtRate"), numeric(line.wht_rate, wht_rate => lineUpdate(index, { wht_rate }), key + "wht", "0.0001"))}</> : null}
        </div><DirectAmounts values={amount} />{line.money_nature === "unclassified" ? <p className={styles.warning}>{tKey("classificationWarning")}</p> : null}</div>;
      })}<button className={styles.button} type="button" disabled={form.lines.length >= 100} onClick={() => update({ lines: [...form.lines, newDirectLine()] })}><Plus size={16} />{tKey("addLine")}</button></section>
      <section className={styles.review}><h2>{tKey("review")}</h2><DirectAmounts values={{ actualCash: form.cash_amount, wht: totals.wht, gross: totals.gross, base: totals.base, vat: totals.vat }} /><p>{tKey("reconcileCash")}</p><p>{tKey("reconcileVat")}</p>{error("reconcile")}<div className={styles.actions}><button className={styles.primary} type="submit"><Save size={16} />{tKey("save")}</button></div></section>
    </fieldset>
  </form>;
}
