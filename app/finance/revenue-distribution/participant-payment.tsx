"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { compensationRoleLabel } from "../../../lib/i18n/legacy-finance";
import { type Payee, payoutMath, payoutError } from "../payouts/shared";
import { PayeeModal } from "../payouts/payee-modal";
import type { PayableComponent } from "../payables/shared";
import { locationKey, locationName, type Location } from "../treasury/shared";
import css from "./workspace.module.css";

type Context = { component: PayableComponent; payee: Payee; accounts: Location[]; wht_treatment: null; wht_rate: null };
export function ParticipantPayment({ distributionId, entitlementId, onClose, onPaid }: { distributionId: string; entitlementId: string; onClose: () => void; onPaid: () => Promise<void> }) {
 const { t, locale, date } = useI18n(), lock = useRef(false), [requestId] = useState(() => crypto.randomUUID());
 const [data, setData] = useState<Context | null>(null), [rate, setRate] = useState(""), [accountKey, setAccount] = useState("");
 const [paidOn, setPaidOn] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
 const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [editPayee, setEditPayee] = useState(false), [paid, setPaid] = useState(false);
 const w = (key: string) => t(`revenueDistribution.${key}`);
 const load = useCallback(async () => {
  const r = await supabase.rpc("get_finance_distribution_payment_context", { p_distribution_id: distributionId, p_entitlement_id: entitlementId });
  if (r.error || !r.data?.component || !r.data?.payee || !Array.isArray(r.data?.accounts)) throw r.error || Error("PAYOUT_RIGHTS_UNAVAILABLE");
  return r.data as Context;
 }, [distributionId, entitlementId]);
 useEffect(() => { let live = true; void load().then(r => { if (live) setData(r); }).catch(e => { if (live) setError(payoutError(e)); }); return () => { live = false; }; }, [load]);
 const math = payoutMath(data ? [data.component] : [], { [entitlementId]: rate }), account = data?.accounts.find(a => locationKey(a) === accountKey);
 const taxMissing = math.valid && math.wht > 0 && !data?.payee.tax_id;
 const ready = !!data?.payee.is_active && math.valid && !taxMissing && !!account?.is_active && !!account.opening_as_of && account.system_balance !== null && !!paidOn;
 const money = (n: number) => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 async function confirm(event: React.FormEvent) {
  event.preventDefault(); if (lock.current || !ready || !data || !account) return;
  lock.current = true; setBusy(true); setError("");
  try {
   const r = await supabase.rpc("pay_finance_distribution_participant", { p_distribution_id: distributionId, p_entitlement_id: entitlementId, p_request_id: requestId,
    p_expected_payee_version: data.payee.version, p_paid_on: paidOn, p_bank_account_id: account.bank_account_id, p_cash_location_id: account.cash_location_id,
    p_treatment: math.choices[0].treatment, p_rate: math.choices[0].rate, p_note: note, p_acknowledged: true });
   if (r.error || typeof r.data !== "string") throw r.error || Error("response");
   setPaid(true); await onPaid();
  } catch (e) { setError(payoutError(e)); } finally { lock.current = false; setBusy(false); }
 }
 return <DetailModal open size="edit" title={w("payParticipant")} onClose={() => { if (!lock.current) onClose(); }} closeOnBackdrop={!busy}>
  <form className={css.paymentForm} onSubmit={confirm}>
   {error ? <Callout tone="negative" role="alert">{t(`payout.${error}`)}</Callout> : null}
   {paid ? <Callout tone="success" role="status">{w("paymentDone")}<button type="button" className={ui.secondary} disabled={busy} onClick={() => void onPaid()}>{w("retry")}</button></Callout> : !data ? <p role="status">{t("common.state.loading")}</p> : <>
    <dl className={css.facts}><div><dt>{w("recipient")}</dt><dd>{data.component.recipient_name}</dd></div><div><dt>{w("role")}</dt><dd>{compensationRoleLabel(data.component.role_label, locale)}</dd></div><div><dt>{w("amount")}</dt><dd>{money(data.component.gross_amount)}</dd></div></dl>
    {!data.payee.is_active ? <Callout tone="warning">{t("payout.inactive")} <button type="button" className={ui.secondary} disabled={busy} onClick={() => setEditPayee(true)}>{t("payout.fixPayee")}</button></Callout> : null}
    <FieldGroup id="participant-source" label={w("payFrom")}><select required disabled={busy} value={accountKey} onChange={e => setAccount(e.target.value)}><option value="">{t("payout.choose")}</option>{data.accounts.filter(a => a.is_active && a.currency === "THB").map(a => <option key={locationKey(a)} value={locationKey(a)}>{locationName(a, locale)}</option>)}</select></FieldGroup>
    {account && (!account.opening_as_of || account.system_balance === null) ? <Callout tone="warning">{t("payout.unknown")}</Callout> : null}
    {account?.opening_as_of ? <p className={css.muted}>{t("payout.cutoff")}: {date(account.opening_as_of)}</p> : null}
    <FieldGroup id="participant-date" label={w("paidOn")}><input required type="date" value={paidOn} disabled={busy} onChange={e => setPaidOn(e.target.value)} /></FieldGroup>
    <details className={css.disclosure} open><summary>{w("outgoingWht")}</summary><p className={css.muted}>{w("outgoingWhtHelp")}</p>
     <FieldGroup id="participant-wht" label={t("payout.rate")}><select required disabled={busy} value={rate === "" || ["0", "1", "3", "5"].includes(rate) ? rate : "other"} onChange={e => setRate(e.target.value === "other" ? " " : e.target.value)}><option value="" disabled>{t("payout.choose")}</option><option value="0">{t("payout.none")}</option>{[1, 3, 5].map(n => <option key={n} value={String(n)}>{n}%</option>)}<option value="other">{t("payout.other")}</option></select></FieldGroup>
     {rate !== "" && !["0", "1", "3", "5"].includes(rate) ? <FieldGroup id="participant-rate" label={t("payout.rate")}><input inputMode="decimal" required value={rate.trim()} disabled={busy} onChange={e => setRate(e.target.value || " ")} /></FieldGroup> : null}
     {taxMissing ? <Callout tone="warning">{t("payout.taxMissing")} <button type="button" className={ui.secondary} disabled={busy} onClick={() => setEditPayee(true)}>{t("payout.fixPayee")}</button></Callout> : null}
    </details>
    <FieldGroup id="participant-note" label={w("paymentNote")}><textarea maxLength={2000} rows={2} value={note} disabled={busy} onChange={e => setNote(e.target.value)} /></FieldGroup>
    <dl className={css.facts}><div><dt>{t("payout.withheld")}</dt><dd>{math.valid ? money(math.wht) : "—"}</dd></div><div><dt>{w("actualOutflow")}</dt><dd><strong>{math.valid ? money(math.net) : "—"}</strong></dd></div></dl>
    {account?.system_balance != null && math.valid && account.system_balance < math.net ? <Callout tone="warning">{w("negativeBalance")}</Callout> : null}
    <p className={css.muted}>{w("paymentAck")}</p><button className={ui.primary} type="submit" disabled={busy || !ready}>{w("confirmPayment")}</button>
   </>}
  </form>
  {editPayee && data ? <PayeeModal payee={data.payee} onClose={() => setEditPayee(false)} onSaved={() => { setEditPayee(false); void load().then(setData).catch(e => setError(payoutError(e))); }} /> : null}
 </DetailModal>;
}
