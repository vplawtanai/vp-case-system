"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, RefreshCw } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, Disclosure, EmptyState, FieldGroup, PageHeader, PageShell, ReadOnlyGrid, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { locationKey, locationName, openingStart, sourceBlock, sourceHref, treasuryError, type Location, type Opening, type TreasuryData, type TreasurySource } from "./shared";
import styles from "./treasury.module.css";

type OpeningForm = { id: string; account: string; start: string; amount: string; note: string; expected: string | null; prior: string | null; saved: Opening | null };
export default function TreasuryPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinanceCashTransactions}>
  {a => <><FinanceSubNav activePage="treasury" permissions={a.permissions} /><TreasuryWorkspace /></>}
 </QuotationGuard>;
}

export function TreasuryWorkspace() {
 const { t, locale, date } = useI18n();
 const [data, setData] = useState<TreasuryData | null>(null), [offset, setOffset] = useState(0), [loading, setLoading] = useState(true);
 const [failure, setFailure] = useState<string | null>(null), [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [invalid, setInvalid] = useState(false);
 const [opening, setOpening] = useState<OpeningForm | null>(null), [selected, setSelected] = useState<TreasurySource | null>(null), [cashLocation, setCashLocation] = useState("");
 const lock = useRef(false), request = useRef(0), formRef = useRef<HTMLFormElement>(null), ackRef = useRef<HTMLInputElement>(null);
 const load = useCallback(async () => {
  const sequence = ++request.current; setLoading(true);
  try {
   const r = await supabase.rpc("get_finance_treasury", { p_offset: offset });
   if (r.error || !Array.isArray(r.data?.accounts) || !Array.isArray(r.data?.transactions) || !Array.isArray(r.data?.pending_sources)) throw r.error || new Error("response");
   if (sequence === request.current) { setData(r.data); return r.data as TreasuryData; }
  } catch (e) { if (sequence === request.current) { setData(null); setFailure(treasuryError(e, locale)); } }
  finally { if (sequence === request.current) setLoading(false); }
  return null;
 }, [offset, locale]);
 const invalidate = useCallback(() => { request.current++; }, []);
 useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
 const amount = (value: number | null, currency = "THB") => value === null ? t("treasury.unknown") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 const accountFor = (row: { bank_account_id: string | null; cash_location_id: string | null }) => data?.accounts.find(a => locationKey(a) === locationKey(row));
 function close() { if (lock.current) return; setOpening(null); setSelected(null); setAck(false); setInvalid(false); setFailure(null); }
 function editOpening(account: Location, saved: Opening | null = null, replace = false) {
  setFailure(null); setAck(false); setInvalid(false);
  setOpening({ id: saved?.id || crypto.randomUUID(), account: locationKey(account), start: saved ? openingStart(saved.as_of) : "", amount: saved ? String(saved.balance_amount) : "", note: saved?.note || "", expected: saved?.updated_at || null, prior: saved?.supersedes_opening_balance_id || (replace ? account.opening_id : null), saved });
 }
 async function run(action: () => Promise<void>) {
  if (lock.current) return; lock.current = true; setBusy(true); setFailure(null);
  try { await action(); } catch (e) { setFailure(treasuryError(e, locale)); }
  finally { lock.current = false; setBusy(false); }
 }
 function saveOpening(event: React.FormEvent) {
  event.preventDefault(); if (!opening || !data?.can_manage) return;
  const account = data.accounts.find(a => locationKey(a) === opening.account);
  if (!account || !opening.start || !/^\d+(?:\.\d{1,2})?$/.test(opening.amount) || !opening.note.trim()) {
   setInvalid(true); setFailure(t("treasury.error.required")); formRef.current?.querySelector<HTMLElement>("input:invalid,textarea:invalid,select:invalid")?.focus(); return;
  }
  void run(async () => {
   const r = await supabase.rpc("save_finance_treasury_opening", { p_id: opening.id, p_bank_account_id: account.bank_account_id, p_cash_location_id: account.cash_location_id,
    p_start_date: opening.start, p_amount: opening.amount, p_note: opening.note, p_expected_updated_at: opening.expected, p_supersedes_id: opening.prior });
   if (r.error) throw r.error;
   const fresh = await load(), saved = fresh?.openings.find(o => o.id === opening.id);
   if (!saved) throw new Error("read required");
   setOpening({ ...opening, saved, expected: saved.updated_at }); setAck(false); setInvalid(false);
  });
 }
 function confirmOpening() {
  if (!opening?.saved || !data?.can_manage) return;
  if (!ack) { setInvalid(true); setFailure(t("treasury.error.required")); ackRef.current?.focus(); return; }
  void run(async () => {
   const r = await supabase.rpc("confirm_finance_treasury_opening", { p_id: opening.id, p_expected_updated_at: opening.saved!.updated_at, p_acknowledged: ack });
   if (r.error) throw r.error; await load(); setOpening(null); setAck(false);
  });
 }
 const selectedAccount = selected ? accountFor({ bank_account_id: selected.bank_account_id, cash_location_id: selected.cash_location_id || cashLocation || null }) : undefined;
 const blocker = selected ? sourceBlock(selected, selectedAccount) : null;
 function materialize() {
  if (!selected || !data?.can_manage || blocker) return;
  if (!ack) { setInvalid(true); setFailure(t("treasury.error.required")); ackRef.current?.focus(); return; }
  void run(async () => {
   const r = await supabase.rpc("materialize_finance_treasury_source", { p_source_type: selected.source_type, p_source_id: selected.source_id,
    p_expected_source: selected, p_acknowledged: ack, p_cash_location_id: cashLocation || null });
   if (r.error || r.data?.outcome !== "posted") throw r.error || new Error("unresolved");
   await load(); setSelected(null); setAck(false);
  });
 }
 return <PageShell>
  <PageHeader title={t("treasury.title")} actions={<button className={ui.secondary} type="button" disabled={loading || busy} onClick={() => { setFailure(null); void load(); }} title={t("common.actions.retry")} aria-label={t("common.actions.retry")}><RefreshCw size={18} /></button>} />
  <p className={styles.muted}>{t("treasury.unreconciled")}</p>
  {failure && !opening && !selected ? <Callout tone="negative" role="alert">{failure}</Callout> : null}
  {loading ? <p role="status">{t("common.state.loading")}</p> : null}
  {data ? <>
   <ul className={styles.rows}>{data.accounts.map(a => <li className={styles.row} key={locationKey(a)}>
    <div><h2>{locationName(a, locale)}</h2><span className={styles.muted}>{t(`treasury.${a.kind}`)}</span>
     {a.kind === "bank" && (a.bank_name || a.account_number) ? <p className={styles.muted}>{[a.bank_name, a.account_number].filter(Boolean).join(" · ")}</p> : null}
     <p className={styles.muted}>{t("treasury.currency")}: {a.currency}</p>
    </div>
    <div><span className={styles.muted}>{t("treasury.balance")}</span><strong className={styles.amount}>{amount(a.system_balance, a.currency)}</strong>
     {a.opening_id ? <span className={styles.muted}>{t("treasury.openingSet")}</span> : null}
    </div>
    {data.can_manage && a.is_active ? <button type="button" className={ui.secondary} onClick={() => editOpening(a, data.openings.find(o => o.status === "draft" && locationKey(o) === locationKey(a)) || null, !!a.opening_id)}><Plus size={16} />{t(a.opening_id ? "treasury.replacement" : "treasury.opening")}</button> : null}
   </li>)}</ul>
   {data.can_manage && data.pending_sources.length ? <section className={styles.section}><h2>{t("treasury.pending")}</h2><Callout tone="warning">{t("treasury.pendingHelp")}</Callout>
    {data.pending_sources.map(s => <article className={styles.row} key={`${s.source_type}:${s.source_id}`}>
     <div><h3><Link href={sourceHref(s)}>{t(`treasury.${s.source_type}`)} · {s.reference}</Link></h3><span className={styles.muted}>{s.payer_name || "-"} · {date(s.received_on)}</span></div>
     <div><strong>{amount(s.cash_amount, s.currency)}</strong><p className={styles.muted}>{locationName(accountFor(s), locale)}</p></div>
     <button type="button" className={ui.secondary} onClick={() => { setSelected(s); setCashLocation(""); setAck(false); setInvalid(false); setFailure(null); }}>{t("treasury.materialize")}</button>
    </article>)}</section> : null}
   <section className={styles.section}><h2>{t("treasury.history")}</h2>
    {!data.transactions.length ? <EmptyState>{t("treasury.empty")}</EmptyState> : data.transactions.map(c => <article className={styles.history} key={c.id}>
     <div className={styles.actions}><strong>{locationName(accountFor(c), locale)}</strong><StatusBadge status={c.status} label={t(`treasury.${c.status}`)} /></div>
     <dl className={styles.facts}>
      <div><dt>{t("treasury.date")}</dt><dd>{date(c.source_snapshot_json?.received_on || c.occurred_at)}</dd></div>
      <div><dt>{t(`treasury.${c.direction}`)}</dt><dd>{amount(c.cash_amount, c.currency)}</dd></div>
      <div><dt>{t("treasury.source")}</dt><dd>{c.source_snapshot_json ? <Link href={sourceHref(c.source_snapshot_json)}>{t(`treasury.${c.source_snapshot_json.source_type}`)} · {c.source_snapshot_json.reference}</Link> : c.reference_no || "-"}</dd></div>
      <div><dt>{t("treasury.payer")}</dt><dd>{c.source_snapshot_json?.payer_name || "-"}</dd></div>
     </dl><p className={styles.muted}>{c.description}</p>
     <Disclosure title={t("treasury.technical")}><pre className={styles.technical}>{JSON.stringify(c.source_snapshot_json, null, 2)}</pre></Disclosure>
    </article>)}
    {offset || data.has_next ? <div className={styles.actions}><button className={ui.secondary} disabled={!offset || loading} aria-label={t("finance.receipt.previous")} onClick={() => setOffset(Math.max(0, offset - 50))}><ArrowLeft size={18} /></button><button className={ui.secondary} disabled={!data.has_next || loading} aria-label={t("finance.receipt.next")} onClick={() => setOffset(offset + 50)}><ArrowRight size={18} /></button></div> : null}
   </section>
   <Disclosure title={t("treasury.openingHistory")}>{data.openings.map(o => <article className={styles.history} key={o.id}>
    <div className={styles.actions}><strong>{locationName(accountFor(o), locale)}</strong><StatusBadge status={o.status} label={t(`treasury.${o.status}`)} /><span>{date(openingStart(o.as_of))} · {amount(o.balance_amount, o.currency)}</span></div>
    <p>{o.note}</p>{o.status === "draft" && data.can_manage && accountFor(o) ? <button className={ui.secondary} onClick={() => editOpening(accountFor(o)!, o)}>{t("common.actions.edit")}</button> : null}
   </article>)}</Disclosure>
  </> : null}
  <DetailModal open={!!opening} title={t("treasury.opening")} size="edit" onClose={close} closeOnBackdrop={!busy}>
   {opening ? <><p>{t("treasury.openingHelp")}</p>{opening.prior ? <Callout tone="warning">{t("treasury.replaceHelp")}</Callout> : null}
    <form className={styles.form} noValidate ref={formRef} onSubmit={saveOpening}>
     <FieldGroup id="opening-account" label={t("treasury.account")}><select required disabled={busy || !!opening.prior} value={opening.account} onChange={e => { setOpening({ ...opening, account: e.target.value, saved: null }); setAck(false); }}><option value="">-</option>{data?.accounts.filter(a => a.is_active).map(a => <option key={locationKey(a)} value={locationKey(a)}>{locationName(a, locale)}</option>)}</select></FieldGroup>
     <FieldGroup id="opening-start" label={t("treasury.startDate")}><input type="date" required disabled={busy} aria-invalid={invalid && !opening.start} value={opening.start} onChange={e => { setOpening({ ...opening, start: e.target.value, saved: null }); setAck(false); }} /></FieldGroup>
     <FieldGroup id="opening-amount" label={t("treasury.amount")}><input inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" disabled={busy} aria-invalid={invalid && !/^\d+(?:\.\d{1,2})?$/.test(opening.amount)} value={opening.amount} onChange={e => { setOpening({ ...opening, amount: e.target.value, saved: null }); setAck(false); }} /></FieldGroup>
     <FieldGroup id="opening-note" label={t("treasury.note")} help={t("treasury.noteRequired")}><textarea required maxLength={4000} disabled={busy} aria-invalid={invalid && !opening.note.trim()} value={opening.note} onChange={e => { setOpening({ ...opening, note: e.target.value, saved: null }); setAck(false); }} /></FieldGroup>
     <div className={`${styles.full} ${styles.actions}`}><button type="submit" className={ui.secondary} disabled={busy || !!opening.saved}>{t(opening.saved ? "treasury.saved" : "treasury.saveOpening")}</button></div>
    </form>
    {failure ? <Callout tone="negative" role="alert">{failure}</Callout> : null}
    {opening.saved ? <><label className={styles.check}><input ref={ackRef} type="checkbox" checked={ack} disabled={busy} aria-invalid={invalid && !ack} onChange={e => { setAck(e.target.checked); setInvalid(false); setFailure(null); }} />{t("treasury.openingAck")}</label><button className={ui.primary} disabled={busy} onClick={confirmOpening}>{t("treasury.confirmOpening")}</button></> : null}
   </> : null}
  </DetailModal>
  <DetailModal open={!!selected} title={t("treasury.materialize")} size="edit" onClose={close} closeOnBackdrop={!busy}>
   {selected ? <><ReadOnlyGrid items={[
    { key: "source", label: t("treasury.source"), value: selected.reference }, { key: "date", label: t("treasury.date"), value: date(selected.received_on) },
    { key: "cash", label: t("treasury.amount"), value: amount(selected.cash_amount, selected.currency) }, { key: "account", label: t("treasury.account"), value: locationName(selectedAccount, locale) },
   ]} />
    {selected.source_type === "direct_money_receipt" && !selected.bank_account_id && !selected.cash_location_id ? <div className={styles.form}><FieldGroup id="source-cash-location" label={t("treasury.account")} help={selected.legacy_cash_location || undefined}><select disabled={busy} value={cashLocation} onChange={e => { setCashLocation(e.target.value); setAck(false); }}><option value="">-</option>{data?.accounts.filter(a => a.kind === "cash" && a.is_active).map(a => <option value={a.account_id} key={a.account_id}>{locationName(a, locale)}</option>)}</select></FieldGroup></div> : null}
    {blocker ? <Callout tone="warning">{t(`treasury.${blocker}`)}</Callout> : null}
    {failure ? <Callout tone="negative" role="alert">{failure}</Callout> : null}
    <label className={styles.check}><input type="checkbox" ref={ackRef} checked={ack} disabled={busy || !!blocker} aria-invalid={invalid && !ack} onChange={e => { setAck(e.target.checked); setInvalid(false); setFailure(null); }} />{t("treasury.materializeAck")}</label>
    <button className={ui.primary} disabled={busy || !!blocker} onClick={materialize}>{t("treasury.materialize")}</button>
   </> : null}
  </DetailModal>
 </PageShell>;
}
