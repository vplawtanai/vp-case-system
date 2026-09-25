"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup, PageHeader, PageShell, ReadOnlyGrid } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { locationKey, locationName, openingStart, sourceBlock, treasuryError, type Location, type Opening, type TreasuryData, type TreasurySource } from "./shared";
import { StatementMaintenanceView } from "./maintenance-view";
import styles from "./treasury.module.css";

type OpeningForm = { id: string; account: string; start: string; amount: string; note: string; expected: string | null; prior: string | null; saved: Opening | null };
export function StatementMaintenance() {
 const { t, locale, date } = useI18n();
 const [data, setData] = useState<TreasuryData | null>(null), [loading, setLoading] = useState(true);
 const [failure, setFailure] = useState<string | null>(null), [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [invalid, setInvalid] = useState(false);
 const [opening, setOpening] = useState<OpeningForm | null>(null), [selected, setSelected] = useState<TreasurySource | null>(null), [cashLocation, setCashLocation] = useState("");
 const lock = useRef(false), request = useRef(0), formRef = useRef<HTMLFormElement>(null), ackRef = useRef<HTMLInputElement>(null);
 const load = useCallback(async () => {
  const sequence = ++request.current; setLoading(true);
  try {
   const r = await supabase.rpc("get_finance_treasury", { p_offset: 0 });
   if (r.error || !Array.isArray(r.data?.accounts) || !Array.isArray(r.data?.transactions) || !Array.isArray(r.data?.pending_sources)) throw r.error || new Error("response");
   if (sequence === request.current) { setData(r.data); return r.data as TreasuryData; }
  } catch (e) { if (sequence === request.current) { setData(null); setFailure(treasuryError(e, locale)); } }
  finally { if (sequence === request.current) setLoading(false); }
  return null;
 }, [locale]);
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
 return <PageShell className={styles.page}>
  <PageHeader title={t("statement.manageOpenings")} actions={<button className={ui.secondary} type="button" disabled={loading || busy} onClick={() => { setFailure(null); void load(); }} title={t("common.actions.retry")} aria-label={t("common.actions.retry")}><RefreshCw size={18} /></button>} />
  <Link href="/finance/statement">{t("statement.backOverview")}</Link>
  {failure && !opening && !selected ? <Callout tone="negative" role="alert">{failure}</Callout> : null}
  {loading ? <p role="status">{t("common.state.loading")}</p> : null}
  {data ? <StatementMaintenanceView data={data} busy={busy} onOpening={editOpening}
   onMaterialize={s => { setSelected(s); setCashLocation(""); setAck(false); setInvalid(false); setFailure(null); }} /> : null}
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
