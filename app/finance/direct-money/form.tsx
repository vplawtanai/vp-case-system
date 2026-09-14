"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Plus, Trash2, Save, ChevronDown, CheckCircle2, CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { vatTreatmentLabel, type VatTreatment } from "../document-decision/shared";
import { directLineAmounts, directMoneyError, directTotals, economicClasses, moneyNatures, newDirectInput, newDirectLine, validateDirectInput, type DirectInput, type DirectLine } from "./shared";
import { directAmountPatch, directVatChoiceIncomplete, directVatMode, directVatPatch, directVatQuickPatch, directVatSelection, directVatTreatments, directWhtMode, directWhtQuickPatch, hasCustomWhtBase, nonVatTreatments, reconciliationResult, type DirectVatMode, type DirectWhtMode } from "./form-presentation";
import styles from "./direct-money.module.css";

type Option = { id: string; name: string };
type Matter = { id: string | number; client_id: string; title: string; file_no?: string; matter_no?: string };
export function DirectAmounts({ values }: { values: Record<string, number | null> }) {
  const { t, locale } = useI18n();
  return <dl className={styles.facts}>{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key === "vat" || key === "wht" ? key.toUpperCase() : t(`directMoney.${key === "cash" ? "actualCash" : key}`)}</dt><dd>{value !== null && Number.isFinite(value) ? value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " THB" : "-"}</dd></div>)}</dl>;
}
export function DirectReconciliation({ label, parts, gross, receipt = false }: { label: string; parts: (number | null)[]; gross: number | null; receipt?: boolean }) {
  const { t, locale } = useI18n(), result = reconciliationResult(parts, gross);
  return <div className={styles.reconciliation}>
    <span>{label}</span><div><strong className={result.matches ? styles.matched : styles.unresolved}>
      {result.matches ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
      {t(`directMoney.${receipt ? result.matches ? "receiptMatched" : "receiptNotMatched" : result.matches ? "matched" : "notMatched"}`)}
    </strong>{!result.matches ? <small>{result.difference === null ? t("directMoney.reconcileIncomplete") : t("directMoney.difference", { amount: result.difference.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</small> : null}</div>
  </div>;
}
function TaxChoices({ name, label, value, options, onChange, invalid, describedBy }: { name: string; label: string; value: string; options: [string, string][]; onChange: (value: string) => void; invalid: boolean; describedBy?: string }) {
  return <fieldset className={styles.taxChoices} role="radiogroup" aria-invalid={invalid} aria-describedby={describedBy} tabIndex={invalid ? -1 : undefined}><legend>{label}</legend><div>{options.map(([key, text]) =>
    <label key={key}><input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} aria-describedby={describedBy} /><span>{text}</span></label>
  )}</div></fieldset>;
}
export function DirectLineCalculation({ line }: { line: DirectLine }) {
  const { t, locale } = useI18n(), values = directLineAmounts(line);
  const labels = [t("directMoney.amountBeforeTax"), `+ VAT${line.vat_applicable ? ` ${line.vat_rate}%` : ""}`, `= ${t("directMoney.gross")}`, `- WHT${line.wht_applicability === "applies" && line.wht_rate !== null ? ` ${line.wht_rate}%` : ""}`, `= ${t("directMoney.expectedCash")}`];
  return <dl className={styles.calculation}>{(["base", "vat", "gross", "wht", "cash"] as const).map((key, i) => <div key={key}><dt>{labels[i]}</dt><dd>{values[key] !== null && Number.isFinite(values[key]) ? values[key].toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " THB" : "-"}</dd></div>)}</dl>;
}
export function DirectMoneyForm({ initial, id: existingId, version = 0, onSaved, onBusy }: { initial?: DirectInput; id?: string; version?: number; onSaved?: () => void; onBusy?: (busy: boolean) => void }) {
  const { t, locale } = useI18n(), router = useRouter(), formId = useId();
  const [form, setForm] = useState<DirectInput>(() => initial || newDirectInput());
  const [vatModes, setVatModes] = useState<Record<string, DirectVatMode>>({}), [whtModes, setWhtModes] = useState<Record<string, DirectWhtMode>>({});
  const [whtBases, setWhtBases] = useState<Record<string, boolean>>({});
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
  const field = (key: string, label: string, child: ReactElement<{ id?: string }>) => <div className={styles.field}><label htmlFor={`${formId}-${key}`}>{label}</label>{cloneElement(child, { id: `${formId}-${key}` })}{error(key)}</div>;
  const attrs = (key: string) => ({ "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `${formId}-${key}-error` : undefined });
  const numeric = (value: number | null, change: (value: number) => void, key: string, scale = "0.01") => <input type="number" inputMode="decimal" min="0" step={scale} value={value || ""} onChange={e => change(e.target.value === "" ? 0 : Number(e.target.value))} {...attrs(key)} />;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || loading || lookupFailed) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const issues = validateDirectInput(form, today);
    form.lines.forEach((line, i) => {
      if (vatModes[line.source_line_id] === "non_vat" && !nonVatTreatments.includes(directVatSelection(line))) issues[`line.${i}.vat`] = "vatRequired";
      if (!directVatChoiceIncomplete(line)) return;
      if (directVatSelection(line) === "standard_rate" && line.vat_rate <= 0) {
        delete issues[`line.${i}.vat`];
        issues[`line.${i}.vat_rate`] = "vatPositiveRate";
      }
      else issues[`line.${i}.vat`] = "vatRequired";
    });
    setErrors(issues); setFailure(null);
    if (Object.keys(issues).length) {
      requestAnimationFrame(() => {
        const first = root.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        for (let parent = first?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        first?.focus();
      }); return;
    }
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
      </div><details className={styles.optional}>
        <summary>{tKey("optional")}<ChevronDown size={16} aria-hidden="true" /></summary><div className={styles.grid}>
        {field("matter", tKey("matter"), <select disabled={!form.client_id} value={form.case_id ? `case:${form.case_id}` : form.advisory_matter_id ? `advisory:${form.advisory_matter_id}` : ""} onChange={e => { const [type, value] = e.target.value.split(":"); update({ case_id: type === "case" ? Number(value) : null, advisory_matter_id: type === "advisory" ? value : null }); }}><option value="">{tKey("unlinked")}</option>{cases.filter(c => c.client_id === form.client_id).map(c => <option key={c.id} value={`case:${c.id}`}>{c.file_no} · {c.title}</option>)}{advisories.filter(c => c.client_id === form.client_id).map(c => <option key={c.id} value={`advisory:${c.id}`}>{c.matter_no} · {c.title}</option>)}</select>)}
        {field("reference", tKey("reference"), <input maxLength={200} value={form.reference_no || ""} onChange={e => update({ reference_no: e.target.value || null })} />)}
        {field("evidence", tKey("evidence"), <input maxLength={1000} value={form.evidence_reference || ""} onChange={e => update({ evidence_reference: e.target.value || null })} />)}
        {field("note", tKey("note"), <textarea rows={2} maxLength={2000} value={form.note} onChange={e => update({ note: e.target.value })} />)}
      </div></details></section>
      <section className={styles.section}><h2>{tKey("lines")}</h2>{error("lines")}{form.lines.map((line, index) => {
        const key = `line.${index}.`, treatment = directVatSelection(line), vatMode = vatModes[line.source_line_id] ?? directVatMode(line), whtMode = whtModes[line.source_line_id] ?? directWhtMode(line);
        const customBase = whtBases[line.source_line_id] ?? hasCustomWhtBase(line);
        const needsVatReason = treatment !== "unknown" && treatment !== "standard_rate";
        return <div className={styles.line} key={line.source_line_id}><div className={styles.lineHeader}><h3>{index + 1}. {line.description || tKey("description")}</h3><button type="button" className={styles.button} title={tKey(form.lines.length === 1 ? "lastLine" : "removeLine")} aria-label={`${tKey("removeLine")} ${index + 1}`} disabled={form.lines.length === 1} onClick={() => update({ lines: form.lines.filter((_, i) => i !== index) })}><Trash2 size={16} aria-hidden="true" /></button></div><div className={styles.grid}>
          {field(key + "description", tKey("description"), <input maxLength={1000} value={line.description} onChange={e => lineUpdate(index, { description: e.target.value })} {...attrs(key + "description")} />)}
          {field(key + "nature", tKey("nature"), <select value={line.money_nature} onChange={e => lineUpdate(index, { money_nature: e.target.value as DirectLine["money_nature"], classification: null })}>{moneyNatures.map(value => <option key={value} value={value}>{tKey(`nature.${value}`)}</option>)}</select>)}
          {line.money_nature === "business_revenue" ? field(key + "classification", tKey("classification"), <select value={line.classification || ""} onChange={e => lineUpdate(index, { classification: e.target.value || null })} {...attrs(key + "classification")}><option value="">{tKey("choose")}</option>{economicClasses.map(value => <option key={value} value={value}>{t(`finance.invoice.classification.${value}`)}</option>)}</select>) : null}
        </div><div className={styles.primaryAmount}>{field(key + "base", tKey("amountBeforeTax"), numeric(line.base, base => lineUpdate(index, directAmountPatch(line, base, customBase)), key + "base"))}</div>
        <div className={styles.taxGrid}>
          <div><TaxChoices name={`${formId}-${key}vatChoice`} label={tKey("vatQuick")} value={vatMode} options={[["non_vat", tKey("noVat")], ["7", "7%"], ["0", "0%"], ["other", tKey("taxOther")]]} invalid={!!errors[key + "vat"]} describedBy={attrs(key + "vat")["aria-describedby"]} onChange={value => {
            setVatModes(previous => ({ ...previous, [line.source_line_id]: value as DirectVatMode })); lineUpdate(index, directVatQuickPatch(line, value as DirectVatMode));
          }} />{error(key + "vat")}
          {vatMode === "non_vat" || vatMode === "other" ? <div className={styles.taxDetail}>
            {vatMode === "non_vat" ? <p className={styles.muted}>{tKey("noVatDetail")}</p> : null}
            {field(key + "vat_treatment", tKey("vatTreatment"), <select value={treatment} onChange={e => lineUpdate(index, directVatPatch(line, e.target.value as VatTreatment))} {...attrs(key + "vat")}>{(vatMode === "non_vat" ? ["unknown", ...nonVatTreatments] : directVatTreatments).map(value => <option key={value} value={value}>{value === "standard_rate" ? tKey("vatStandard") : vatTreatmentLabel(value as VatTreatment, locale)}</option>)}</select>)}
            {treatment === "standard_rate" ? field(key + "vat_rate", tKey("vatRate"), numeric(line.vat_rate, vat_rate => lineUpdate(index, { vat_rate, vat_treatment_json: { ...line.vat_treatment_json, schema_version: 1, treatment: "standard_rate" } }), key + "vat_rate", "0.0001")) : null}
          </div> : null}
          {needsVatReason ? <div className={styles.taxDetail}>{field(key + "vat_reason", tKey("vatReason"), <textarea rows={2} maxLength={2000} value={line.vat_treatment_json?.reason || ""} onChange={e => lineUpdate(index, { vat_treatment_json: { ...line.vat_treatment_json, schema_version: 1, treatment, reason: e.target.value } })} {...attrs(key + "vat")} />)}</div> : null}</div>
          <div><TaxChoices name={`${formId}-${key}whtChoice`} label={tKey("whtQuick")} value={whtMode} options={[["none", tKey("noWht")], ...["1", "2", "3", "5"].map(value => [value, `${value}%`] as [string, string]), ["other", tKey("taxOther")]]} invalid={!!errors[key + "wht"]} describedBy={attrs(key + "wht")["aria-describedby"]} onChange={value => {
            setWhtModes(previous => ({ ...previous, [line.source_line_id]: value as DirectWhtMode }));
            if (value === "none") setWhtBases(previous => ({ ...previous, [line.source_line_id]: false }));
            lineUpdate(index, directWhtQuickPatch(line, value as DirectWhtMode, customBase));
          }} />{error(key + "wht")}
          {whtMode === "other" ? <div className={styles.taxDetail}>{field(key + "wht_rate", tKey("whtRate"), numeric(line.wht_rate, wht_rate => lineUpdate(index, { wht_rate }), key + "wht", "0.0001"))}</div> : null}</div>
        </div><DirectLineCalculation line={line} />
        <details className={styles.optional} open={customBase || undefined}><summary>{tKey("lineEvidence")}<ChevronDown size={16} aria-hidden="true" /></summary><div className={styles.grid}>
          {field(key + "reason", tKey("lineReasonRequired"), <input maxLength={2000} value={line.reason} onChange={e => lineUpdate(index, { reason: e.target.value })} {...attrs(key + "reason")} />)}
          {line.wht_applicability === "applies" ? <div><DirectAmounts values={{ whtBaseEvidence: line.wht_base }} /><label className={styles.check}><input type="checkbox" checked={customBase} onChange={e => { setWhtBases(previous => ({ ...previous, [line.source_line_id]: e.target.checked })); if (!e.target.checked) lineUpdate(index, { wht_base: line.base }); }} />{tKey("customWhtBase")}</label>
            {customBase ? field(key + "wht_base", tKey("whtBase"), numeric(line.wht_base, wht_base => lineUpdate(index, { wht_base }), key + "wht")) : null}</div> : null}
          <p className={`${styles.muted} ${styles.taxHelp}`}>{tKey("vatHelp")}</p>
        </div></details>{line.money_nature === "unclassified" ? <p className={styles.warning}>{tKey("classificationWarning")}</p> : null}</div>;
      })}<button className={styles.button} type="button" disabled={form.lines.length >= 100} onClick={() => update({ lines: [...form.lines, newDirectLine()] })}><Plus size={16} />{tKey("addLine")}</button></section>
      <section className={styles.review}><h2>{tKey("review")}</h2><DirectAmounts values={{ expectedCash: totals.cash, actualCash: form.cash_amount }} /><div className={styles.reconciliations} aria-live="polite" aria-atomic="true"><DirectReconciliation label={tKey("receiptComparison")} parts={[form.cash_amount]} gross={totals.cash} receipt /></div>{error("reconcile")}
        <details className={styles.optional}><summary>{tKey("accountingEvidence")}<ChevronDown size={16} aria-hidden="true" /></summary><DirectAmounts values={{ base: totals.base, vat: totals.vat, wht: totals.wht, gross: totals.gross }} /><DirectReconciliation label={tKey("reconcileCash")} parts={[form.cash_amount, totals.wht]} gross={totals.gross} /><DirectReconciliation label={tKey("reconcileVat")} parts={[totals.base, totals.vat]} gross={totals.gross} /></details>
        <div className={styles.actions}><button className={styles.primary} type="submit"><Save size={16} aria-hidden="true" />{tKey("save")}</button></div></section>
    </fieldset>
  </form>;
}
