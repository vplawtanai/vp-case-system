"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n/provider";
import { customerTaxError, customerTaxErrors, customerTaxForm, customerTaxPayload, type CustomerTaxForm, type CustomerTaxProfileResult } from "./tax-identity";
import styles from "./tax-identity.module.css";

export function CustomerTaxIdentityEditor({ clientId: id, embedded = false, onStateChange, onEditClient }: {
  clientId: string; embedded?: boolean; onStateChange?: (state: { dirty: boolean; busy: boolean }) => void; onEditClient?: () => void;
}) {
  const { t, date } = useI18n();
  const [result, setResult] = useState<CustomerTaxProfileResult | null>(null);
  const [form, setForm] = useState<CustomerTaxForm | null>(null);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof customerTaxErrors>>({});
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const lock = useRef(false), alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await supabase.rpc("get_finance_customer_tax_profile", { p_client_id: id });
        if (response.error) throw response.error;
        if (response.data?.identity?.id !== id) throw new Error("response");
        if (active) { setResult(response.data); setForm(customerTaxForm(response.data)); }
      } catch (cause) { if (active) setError(customerTaxError(cause)); }
    }
    void load();
    return () => { active = false; };
  }, [id]);
  const dirty = !!result && !!form && JSON.stringify(form) !== JSON.stringify(customerTaxForm(result));
  useEffect(() => { onStateChange?.({ dirty, busy }); }, [dirty, busy, onStateChange]);
  function change<K extends keyof CustomerTaxForm>(key: K, value: CustomerTaxForm[K]) {
    setForm(previous => previous ? { ...previous, [key]: value, ...(key !== "verified" ? { verified: false } : {}) } : previous);
    setErrors({}); setError(""); setSaved(false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!result?.can_manage || !form || !dirty || lock.current) return;
    const invalid = customerTaxErrors(form, result.identity);
    setErrors(invalid);
    if (Object.keys(invalid).length) { requestAnimationFrame(() => alert.current?.focus()); return; }
    lock.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const response = await supabase.rpc("save_finance_customer_tax_profile", customerTaxPayload(result, form));
      if (response.error) throw response.error;
      if (response.data?.identity?.id !== id) throw new Error("response");
      setResult(response.data); setForm(customerTaxForm(response.data)); setSaved(true);
    } catch (cause) { setError(customerTaxError(cause)); requestAnimationFrame(() => alert.current?.focus()); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
    {!embedded ? <><Link href="/clients" className={styles.button}>{t("client.tax.back")}</Link>
    <header className={styles.header}><h1>{t("client.tax.title")}</h1>{result ? <p>{result.identity.name || "-"}</p> : null}</header></> : null}
    <div ref={alert} tabIndex={-1}>{error ? <p role="alert" className={styles.error}>{t(error)}</p> : null}
      {Object.keys(errors).length ? <div role="alert" className={styles.error}>{Object.entries(errors).map(([key, message]) => <p key={key}>{t(message)}</p>)}</div> : null}</div>
    {!result || !form ? (!error ? <p>{t("common.state.loading")}</p> : null) : <form onSubmit={save} noValidate>
      <section className={styles.section}><h2>{t("client.tax.source")}</h2><dl className={styles.facts}>
        <div><dt>{t("client.tax.name")}</dt><dd>{result.identity.name || "-"}</dd></div>
        <div><dt>{t("client.tax.taxId")}</dt><dd>{result.identity.tax_id || "-"}</dd></div>
        <div><dt>{t("client.tax.address")}</dt><dd>{result.identity.address || "-"}</dd></div>
      </dl>{onEditClient ? <button type="button" className={styles.button} disabled={busy} onClick={onEditClient}>{t("client.tax.editClient")}</button> : !embedded ? <Link href="/clients">{t("client.tax.editClient")}</Link> : null}</section>
      <fieldset className={styles.section} disabled={!result.can_manage || busy}>
        <div className={styles.grid}>
          <label>{t("client.tax.vat")}<select aria-invalid={!!errors.vat} value={form.vat} onChange={e => change("vat", e.target.value as CustomerTaxForm["vat"])}>
            <option value="">{t("client.tax.unknown")}</option><option value="true">{t("client.tax.registered")}</option><option value="false">{t("client.tax.notRegistered")}</option>
          </select></label>
          {form.vat === "true" ? <>
            <label>{t("client.tax.branch")}<select aria-invalid={!!errors.branch} value={form.branch} onChange={e => change("branch", e.target.value as CustomerTaxForm["branch"])}>
              <option value="">{t("client.tax.choose")}</option><option value="head_office">{t("client.tax.headOffice")}</option><option value="branch">{t("client.tax.branchOffice")}</option>
            </select></label>
            {form.branch === "branch" ? <label>{t("client.tax.branchCode")}<input aria-invalid={!!errors.code} inputMode="numeric" maxLength={5} value={form.code} onChange={e => change("code", e.target.value)} /></label> : null}
            <p className={styles.help}>{t("client.tax.branchHelp")}</p>
          </> : null}
        </div>
        <label className={styles.evidence}>{t("client.tax.evidence")}<textarea aria-invalid={!!errors.evidence} rows={2} maxLength={2000} value={form.evidence} onChange={e => change("evidence", e.target.value)} /></label>
        <p className={styles.help}>{t("client.tax.evidenceHelp")}</p>
        <label className={styles.check}><input type="checkbox" checked={form.verified} onChange={e => change("verified", e.target.checked)} />{t("client.tax.ack")}</label>
      </fieldset>
      <div className={styles.actions}><div role="status">{dirty ? t("common.state.unsaved") : t(`client.tax.${result.status}`)}
        {saved ? <p className={styles.help}>{t("client.tax.saved")}</p> : null}
        {!dirty && result.status === "verified" ? <p className={styles.help}>{date(result.profile?.verified_at, true)}</p> : null}</div>
        {result.can_manage ? <button className={styles.primary} type="submit" disabled={!dirty || busy}>{t("common.actions.saveChanges")}</button> : null}
      </div>
    </form>}
  </div>;
}
