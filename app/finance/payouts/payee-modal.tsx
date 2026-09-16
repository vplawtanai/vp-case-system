"use client";
import { useRef, useState } from "react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { payoutError, type Payee } from "./shared";
import css from "./payout.module.css";

export function PayeeModal({ payee, onClose, onSaved }: { payee?: Payee; onClose: () => void; onSaved: (id: string) => void }) {
 const { t } = useI18n(), lock = useRef(false), [id] = useState(() => payee?.id || crypto.randomUUID());
 const [name, setName] = useState(payee?.legal_name || ""), [entity, setEntity] = useState(payee?.entity_type || "natural_person"), [tax, setTax] = useState(payee?.tax_id || "");
 const [bank, setBank] = useState(payee?.destination?.bank_name || ""), [account, setAccount] = useState(payee?.destination?.account_name || ""), [number, setNumber] = useState(payee?.destination?.account_number || "");
 const [active, setActive] = useState(payee?.is_active ?? true), [busy, setBusy] = useState(false), [error, setError] = useState("");
 async function save(event: React.FormEvent) {
  event.preventDefault(); if (lock.current) return;
  if (!name.trim() || (tax && !/^\d{13}$/.test(tax)) || ((bank || account || number) && (!bank.trim() || !account.trim() || number.trim().length < 4))) { setError("required"); return; }
  lock.current = true; setBusy(true); setError("");
  try {
   const r = await supabase.rpc("save_finance_payee", { p_id: id, p_profile_id: payee?.profile_id || null, p_expected_version: payee?.version ?? null,
    p_input: { legal_name: name.trim(), entity_type: entity, tax_id: tax || null, is_active: active, destination: bank ? { bank_name: bank.trim(), account_name: account.trim(), account_number: number.trim() } : null } });
   if (r.error) throw r.error; onSaved(id);
  } catch (e) { setError(payoutError(e)); } finally { lock.current = false; setBusy(false); }
 }
 return <DetailModal open title={t(payee ? "payout.edit" : "payout.add")} size="edit" onClose={() => { if (!lock.current) onClose(); }} closeOnBackdrop={!busy}>
  <form className={css.form} onSubmit={save} noValidate><p className={css.muted}>{t("payout.identityHelp")}</p>
   {error ? <Callout tone="negative" role="alert">{t(`payout.${error}`)}</Callout> : null}
   <FieldGroup id="payee-name" label={t("payout.name")}><input required maxLength={300} value={name} disabled={busy || payee?.kind === "internal"} onChange={e => setName(e.target.value)} /></FieldGroup>
   <FieldGroup id="payee-type" label={t("payout.entity")}><select value={entity} disabled={busy || payee?.kind === "internal"} onChange={e => setEntity(e.target.value as typeof entity)}>{["natural_person", "juristic_person"].map(k => <option key={k} value={k}>{t(`payout.${k}`)}</option>)}</select></FieldGroup>
   <FieldGroup id="payee-tax" label={t("payout.taxId")}><input maxLength={13} inputMode="numeric" value={tax} disabled={busy} onChange={e => setTax(e.target.value)} /></FieldGroup>
   {([["bank", bank, setBank], ["accountName", account, setAccount], ["accountNumber", number, setNumber]] as const).map(([key, value, setter]) => <FieldGroup id={`payee-${key}`} key={key} label={t(`payout.${key}`)}><input value={value} maxLength={key === "accountNumber" ? 50 : 200} disabled={busy} onChange={e => setter(e.target.value)} /></FieldGroup>)}
   {payee?.version ? <label className={css.check}><input type="checkbox" checked={active} disabled={busy} onChange={e => setActive(e.target.checked)} /><span>{t("payout.active")}</span></label> : null}
   <button className={ui.primary} disabled={busy} type="submit">{t("common.actions.save")}</button>
  </form>
 </DetailModal>;
}
