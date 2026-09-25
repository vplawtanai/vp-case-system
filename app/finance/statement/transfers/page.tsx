"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { QuotationGuard } from "../../quotations/shared";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "../../../../lib/i18n/provider";
import { Callout, PageShell } from "../../../components/ui/patterns";
import ui from "../../../components/ui/vp-ui.module.css";
import { accountHref, accountName, bangkokToday, useStatementAccounts } from "../shared";
import css from "../statement.module.css";
export default function TransferPage() { return <QuotationGuard canAccess={a => a.permissions.canViewFinanceCashTransactions}>{() => <TransferForm/>}</QuotationGuard>; }
export function TransferForm() {
 const { t, locale } = useI18n(), w = (k: string) => t(`statement.${k}`), { data, failed } = useStatementAccounts();
 const [from, setFrom] = useState(""), [to, setTo] = useState(""), [amount, setAmount] = useState(""), [date, setDate] = useState(bangkokToday), [note, setNote] = useState(""), [ack, setAck] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(false), [done, setDone] = useState(false), [uncertain, setUncertain] = useState(false);
 const lock = useRef(false), attempt = useRef<Record<string,unknown> | null>(null);
 const accounts = data?.accounts.filter(a => a.is_active) || [], source = accounts.find(a => `${a.kind}:${a.account_id}` === from), destination = accounts.find(a => `${a.kind}:${a.account_id}` === to);
 async function submit(e: React.FormEvent) { e.preventDefault(); if (lock.current || !data?.can_transfer) return;
  if (!attempt.current) { if (!source || !destination || from === to || !/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !ack) { setError(true); return; }
   attempt.current = { p_id: crypto.randomUUID(), p_from_bank: source.bank_account_id, p_from_cash: source.cash_location_id, p_to_bank: destination.bank_account_id, p_to_cash: destination.cash_location_id, p_amount: amount, p_date: date, p_note: note, p_acknowledged: ack };
  }
  lock.current = true; setBusy(true); setError(false);
  try { const r = await supabase.rpc("confirm_finance_treasury_transfer", attempt.current); if (r.error) { if (["P0001","42501","23514"].includes(r.error.code)) { attempt.current=null;setError(true);setUncertain(false);return; } throw r.error; } setDone(true); setUncertain(false); }
  catch { setError(true); setUncertain(true); } finally { lock.current = false; setBusy(false); }
 }
 return <PageShell className={css.page}><header className={css.header}><div><h1>{w("transferTitle")}</h1><p>{w("transferDescription")}</p></div></header>
  {failed ? <Callout tone="negative">{w("failure")}</Callout> : !data ? <p role="status">{t("common.state.loading")}</p> : !data.can_transfer ? <Callout tone="warning">{w("noTransferAccess")}</Callout> : done ? <><Callout tone="success">{w("transferSuccess")}</Callout><div className={css.actions}>{[source,destination].map(a => a ? <Link className={ui.secondary} key={a.account_id} href={accountHref(a)}>{accountName(a,locale)}</Link> : null)}</div></> : <form className={css.form} onSubmit={e => void submit(e)}>
   <fieldset disabled={busy || uncertain}><div className={css.pair}>{[["fromAccount",from,setFrom],["toAccount",to,setTo]].map(([label,value,setter]) => <label key={String(label)}>{w(String(label))}<select aria-label={w(String(label))} required value={String(value)} onChange={e => (setter as (v:string)=>void)(e.target.value)}><option value="">{w("choose")}</option>{accounts.map(a => <option key={`${a.kind}:${a.account_id}`} value={`${a.kind}:${a.account_id}`} disabled={label === "toAccount" && `${a.kind}:${a.account_id}` === from}>{accountName(a,locale)}{a.account_number ? ` · ${a.account_number}` : ""}</option>)}</select></label>)}</div>
    <div className={css.pair}><label>{w("amount")}<input required type="number" min="0.01" step="0.01" max="999999999999.99" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{w("transferDate")}<input required type="date" max={bangkokToday()} value={date} onChange={e=>setDate(e.target.value)}/></label></div>
    <label>{w("note")}<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><p className={css.note}>{w("transferImmutable")}</p><label className={css.ack}><input required type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{w("transferAck")}</label>
   </fieldset>{error ? <Callout tone="negative" role="alert">{w("failure")}</Callout> : null}<button className={ui.primary} disabled={busy} type="submit">{w(uncertain ? "retryTransfer" : "confirmTransfer")}</button>
  </form>}
 </PageShell>;
}
