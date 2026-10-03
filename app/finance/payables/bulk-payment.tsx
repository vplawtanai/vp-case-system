"use client";
import { useEffect, useRef, useState } from "react";
import FinanceModal from "../ui/FinanceModal";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { readExpenses } from "../expenses/data";
import { bangkokToday } from "../payouts/review";
import type { ExpenseObligation } from "../expenses/shared";
import { bulkCopy } from "./bulk-payment-copy";
import { confirmItems, eligiblePayable, prepareItems, submissionLatch, validBatchResult, type BulkEntry, type BulkResult } from "./bulk-payment-model";
import css from "./bulk-payment.module.css";

export function BulkPayment({ rows, onClose, onDone }: { rows: ExpenseObligation[]; onClose: () => void; onDone: () => void }) {
 const { locale } = useI18n(), c = bulkCopy[locale];
 const [entries, setEntries] = useState<BulkEntry[]>([]), [phase, setPhase] = useState<"edit" | "prepared" | "done">("edit");
 const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState(""), [ack, setAck] = useState(false);
 const latch = useRef(submissionLatch()), prepareRequest = useRef<ReturnType<typeof prepareItems> | null>(null), confirmRequest = useRef<ReturnType<typeof confirmItems> | null>(null), prepared = useRef<BulkResult | null>(null);
 const money = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 useEffect(() => {
  let active = true;
  void Promise.all(rows.map(async obligation => {
   const data = await readExpenses(obligation.expense_id, obligation.source_type === "employee_reimbursement"), row = data.record;
   if (!data.access.is_admin || !row || row.obligation?.id !== obligation.id || !eligiblePayable(obligation) || row.obligation.waived !== false || row.obligation.settled !== false || row.payout?.status === "confirmed") throw Error("changed");
   const p = row.payout?.status === "draft" ? row.payout : null;
   return { obligation: { ...obligation, ...row.obligation }, row, accounts: data.accounts, payoutId: p?.id || crypto.randomUUID(), accountId: p?.bank_account_id || p?.cash_location_id || "", paidOn: p?.paid_on || bangkokToday(), withhold: Boolean(p?.wht) };
  })).then(data => { if (active) setEntries(data); }).catch(() => { if (active) setError(c.invalid); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [rows, c.invalid]);
 const change = (index: number, patch: Partial<BulkEntry>) => { if (prepareRequest.current) return; setEntries(old => old.map((e, i) => i === index ? { ...e, ...patch } : e)); };
 async function readPrepared() {
  setReady(false);
  try {
   const updated = await Promise.all(entries.map(async e => {
    const data = await readExpenses(e.row.id, e.obligation.source_type === "employee_reimbursement"), p = data.record?.payout;
    if (!data.access.is_admin || !data.record || p?.id !== e.payoutId || p.status !== "draft" || p.version !== prepared.current?.items.find(i => i.payout_id === p.id)?.version) throw Error("changed");
    return { ...e, row: data.record, accounts: data.accounts };
   }));
   confirmItems(updated); setEntries(updated); setReady(true); setError("");
  } catch { setError(c.readFailed); }
 }
 async function submit(action: "prepare" | "confirm") {
  if (!latch.current.enter()) return;
  setBusy(true); setError("");
  try {
   const items = action === "prepare" ? (prepareRequest.current ||= prepareItems(entries)) : (confirmRequest.current ||= confirmItems(entries));
   const result = await supabase.rpc("finance_expense_payout_batch", { p_action: action, p_items: items, p_acknowledged: action === "confirm" && ack });
   if (result.error) {
    let reference = "";
    try { const detail = JSON.parse(result.error.details || "{}"); reference = entries.find(e => e.obligation.id === detail.obligation_id)?.obligation.reference || ""; } catch { /* Network errors have no item evidence. */ }
    // A database rejection rolls the entire statement back. Transport uncertainty
    // keeps the exact original payload so retry cannot cause another payment.
    setError(`${reference ? reference + ": " : ""}${result.error.code && result.error.code !== "" ? c.failed : c.uncertain}`); return;
   }
   if (!validBatchResult(result.data, action, entries)) { setError(c.uncertain); return; }
   if (action === "prepare") { prepared.current = result.data; setPhase("prepared"); await readPrepared(); }
   else { setPhase("done"); }
  } catch { setError(c.uncertain); }
  finally { latch.current.leave(); setBusy(false); }
 }
 return <FinanceModal open title={c.title} variant="payment" size="edit" onClose={() => { if (!busy) { if (phase === "done") onDone(); else onClose(); } }}>
  {phase === "done" ? <Callout tone="success" role="status">{c.done.replaceAll("{n}", String(entries.length))}</Callout> : <>
   <Callout tone="info">{phase === "edit" ? c.help : c.review}<br />{c.separate}</Callout>
   {loading ? <p role="status">{c.loading}</p> : <form id="bulk-payments" onSubmit={e => { e.preventDefault(); void submit(phase === "edit" ? "prepare" : "confirm"); }}>
    <div className={css.items}>{entries.map((e, index) => { const p = e.row.payout, review = phase === "prepared" && ready; return <article className={css.item} key={e.obligation.id}>
     <header><strong>{index + 1}. {e.obligation.payee_name}</strong><small>{e.obligation.reference}</small></header><p>{e.obligation.description}</p>
     <dl className={css.amounts}><div><dt>{c.gross}</dt><dd>{money(review && p ? p.gross : e.obligation.gross_amount)} THB</dd></div>{review && p ? <><div><dt>{c.wht}</dt><dd>{money(p.wht)}</dd></div><div><dt>{c.net}</dt><dd><strong>{money(p.net)} THB</strong></dd></div></> : null}</dl>
     {phase === "edit" ? <fieldset disabled={busy || Boolean(prepareRequest.current)} className={css.fields}>
      <label>{c.account}<select required value={e.accountId} onChange={v => change(index, { accountId: v.target.value })}><option value="">{c.choose}</option>{e.accounts.filter(a => a.can_record && a.can_confirm && a.opening_as_of && (e.row.settlement?.mode !== "company_bank" || a.kind === "bank") && (e.row.settlement?.mode !== "company_cash" || a.kind === "cash")).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>{c.date}<input type="date" required min={e.row.expense_date} max={bangkokToday()} value={e.paidOn} onChange={v => change(index, { paidOn: v.target.value })} /></label>
      {!e.row.personally_paid && e.row.tax_review?.request_json?.schema_version !== 2 ? <label className={css.check}><input type="checkbox" checked={e.withhold} onChange={v => change(index, { withhold: v.target.checked })} />{c.withhold}</label> : null}
     </fieldset> : review && p ? <dl className={css.amounts}><div><dt>{c.account}</dt><dd>{e.accounts.find(a => a.bank_account_id === p.bank_account_id && a.cash_location_id === p.cash_location_id)?.name || "—"}</dd></div><div><dt>{c.date}</dt><dd>{p.paid_on}</dd></div>{p.destination ? <div><dt>{c.destination}</dt><dd>{p.destination.bank_name} · {p.destination.account_name} · {p.destination.account_number}</dd></div> : null}</dl> : null}
    </article>; })}</div>
    {phase === "prepared" && ready ? <><p>{c.noPartial}</p><label className={css.check}><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} />{c.ack}</label></> : null}
   </form>}
   {phase === "prepared" ? <p className={css.help}>{c.draft}</p> : null}
  </>}
  {error ? <Callout tone="negative" role="alert">{error}</Callout> : null}
  <footer className={css.actions}><button type="button" className={ui.secondary} disabled={busy} onClick={() => phase === "done" ? onDone() : onClose()}>{c.close}</button>
   {phase === "prepared" && !ready ? <button type="button" className={ui.secondary} disabled={busy} onClick={() => void readPrepared()}>{c.reload}</button> : null}
   {phase !== "done" ? <button type="submit" form="bulk-payments" className={ui.primary} disabled={busy || loading || !entries.length || (phase === "prepared" && (!ready || !ack))}>{busy ? c.busy : phase === "edit" ? c.prepare : c.confirm}</button> : null}
  </footer>
 </FinanceModal>;
}
