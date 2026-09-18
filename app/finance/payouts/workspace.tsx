"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Calculator, Check, CircleAlert, Clock, FileText, Save, Send, UserRound, Wallet } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, EmptyState, FieldGroup, PageHeader, PageShell, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { payableRoleLabel, type PayableComponent } from "../payables/shared";
import { locationKey, locationName } from "../treasury/shared";
import { mask, payoutError, payoutHref, type Payee, type Workspace } from "./shared";
import { bangkokToday, payoutComponentPreview, payoutReviewState } from "./review";
import { PayeeModal } from "./payee-modal";
import css from "./payout.module.css";

export function PayoutWorkspace({ id, payeeId, fixture }: { id: string; payeeId: string; fixture?: Workspace }) {
 const { t, locale, date } = useI18n(), router = useRouter(), lock = useRef(false), sequence = useRef(0);
 const [data, setData] = useState<Workspace | null>(fixture || null), [loading, setLoading] = useState(!fixture), [error, setError] = useState("");
 const [selected, setSelected] = useState<string[]>([]), [rates, setRates] = useState<Record<string, string>>({}), [accountKey, setAccountKey] = useState("");
 const [paidOn, setPaidOn] = useState(bangkokToday);
 const [note, setNote] = useState(""), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [ack, setAck] = useState(false);
 const [modal, setModal] = useState<"confirm" | "cancel" | null>(null), [editPayee, setEditPayee] = useState<Payee | "new" | null>(null);
 const [newId] = useState(() => crypto.randomUUID());
 const apply = useCallback((next: Workspace) => {
  setData(next); const p = next.payout;
  setSelected(p?.choices_json.map(c => c.entitlement_id) || []); setRates(Object.fromEntries(p?.choices_json.map(c => [c.entitlement_id, String(c.rate)]) || []));
  if (p) { setPaidOn(p.paid_on); setNote(p.note); setAccountKey(locationKey(p)); } setDirty(false); setAck(false);
 }, []);
 const load = useCallback(async (preserveForm = false) => {
  if (fixture) { apply(fixture); return; }
  const request = ++sequence.current; setLoading(true); setError("");
  try {
   const r = await supabase.rpc("get_finance_payout_workspace", { p_payee_id: payeeId || null, p_payout_id: id === "new" ? null : id });
   if (r.error || !Array.isArray(r.data?.payees)) throw r.error || new Error("response");
   if (request === sequence.current) { if (preserveForm) setData(r.data as Workspace); else apply(r.data as Workspace); }
  } catch (e) { if (request === sequence.current) setError(payoutError(e)); }
  finally { if (request === sequence.current) setLoading(false); }
 }, [apply, fixture, id, payeeId]);
 const invalidate = useCallback(() => { sequence.current++; }, []);
 useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
 const p = data?.payout, frozen = p?.confirmed_snapshot_json, readonly = !data?.can_manage || (!!p && p.status !== "draft");
 const payee = frozen ? { ...frozen.payee, destination: frozen.destination } : data?.payees.find(x => x.id === (p?.payee_id || payeeId));
 const allRows = new Map<string, PayableComponent>();
 for (const c of p?.choices_json || []) if (c.entitlement) allRows.set(c.entitlement_id, c.entitlement);
 if (!p || p.status === "draft") for (const c of data?.components || []) allRows.set(c.id, c);
 const rows = [...allRows.values()], picked = rows.filter(r => selected.includes(r.id));
 const account = frozen?.account || data?.accounts.find(a => locationKey(a) === accountKey);
 const review = payoutReviewState(payee, account, picked, rates, paidOn, p?.status), math = review.math;
 const values = readonly && p ? { gross: p.gross_amount, wht: p.wht_amount, net: p.net_amount } : math;
 const previewReady = readonly || math.valid;
 const money = (v: number | null | undefined) => v == null ? "-" : `${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const balance = !account ? t("payout.chooseAccount") : account.system_balance == null ? t("payout.unknown") : money(account.system_balance);
 const destination = payee?.destination ? `${payee.destination.bank_name} ${mask(payee.destination.account_number)}` : t("payout.missing");
 const disabledReasons = [...review.blockers, ...(!p ? ["saveFirst"] : dirty ? ["dirty"] : []), ...(busy ? ["working"] : []), ...(loading ? ["checking"] : [])];
 const checklist = [
  { key: "checkRecipient", ready: review.payeeReady, detail: payee?.legal_name || t("payout.choosePayee") },
  { key: "destination", ready: review.accountSelected ? !review.bankRequired || !!payee?.destination : null, detail: !review.accountSelected ? t("payout.chooseAccount") : review.bankRequired ? destination : t("payout.cashDestination") },
  { key: "requiredTax", ready: math.valid ? !review.taxRequired || !!payee?.tax_id : null, detail: !math.valid ? t("payout.chooseTreatments") : review.taxRequired ? payee?.tax_id ? mask(payee.tax_id) : t("payout.missing") : t("payout.notRequired") },
  { key: "selectedRights", ready: review.rightsReady, detail: `${t("payout.selected", { count: picked.length })} · ${money(values.gross)}` },
  { key: "withheld", ready: math.valid, detail: math.valid ? money(values.wht) : t("payout.chooseTreatments") },
  { key: "account", ready: review.accountSelected && review.openingReady, detail: review.accountSelected ? `${locationName(account, locale)}${review.openingReady ? "" : ` · ${t("payout.unknown")}`}` : t("payout.chooseAccount") },
  { key: "date", ready: !review.dateReady ? false : !review.openingReady ? null : review.afterCutoff, detail: !review.dateReady ? t("payout.dateInvalid") : account && review.openingReady && !review.afterCutoff ? t("payout.cutoff") : date(paidOn) },
  { key: "net", ready: math.valid, detail: math.valid ? money(values.net) : "-" },
 ];
 const valid = math.valid && !!payee && !!account && !!paidOn;
 const change = (fn: () => void) => { fn(); setDirty(true); setError(""); };
 async function act(action: "save" | "confirm" | "cancel") {
  if (lock.current || fixture || !data?.can_manage) return;
  if (action === "save" && !valid) { setError("required"); return; }
  lock.current = true; setBusy(true); setError("");
  try {
   let r;
   if (action === "save") {
    if (!payee!.version) {
     const master = await supabase.rpc("save_finance_payee", { p_id: payee!.id, p_profile_id: payee!.profile_id, p_expected_version: null, p_input: { legal_name: payee!.legal_name, entity_type: payee!.entity_type } });
     if (master.error) throw master.error;
    }
    r = await supabase.rpc("save_finance_payout", { p_id: p?.id || newId, p_payee_id: payee!.id, p_paid_on: paidOn, p_bank_account_id: account!.bank_account_id, p_cash_location_id: account!.cash_location_id, p_choices: math.choices, p_note: note, p_expected_version: p?.version ?? null });
   } else if (action === "confirm") r = await supabase.rpc("confirm_finance_payout", { p_id: p!.id, p_expected_version: p!.version, p_expected_payee_version: payee!.version, p_expected_destination_id: payee!.destination?.id || null, p_acknowledged: ack });
   else r = await supabase.rpc("cancel_finance_payout", { p_id: p!.id, p_expected_version: p!.version, p_acknowledged: ack });
   if (r.error) throw r.error; setModal(null);
   if (!p) router.replace(payoutHref(payee!.id, r.data)); else await load();
  } catch (e) { setError(payoutError(e)); } finally { lock.current = false; setBusy(false); }
 }
 const summary = <dl className={css.summary}><div><dt>{t("payout.gross")}</dt><dd>{money(values.gross)}</dd></div><div><dt>{t("payout.withheld")}</dt><dd>{previewReady ? money(values.wht) : "-"}</dd></div><div className={css.net}><dt>{t("payout.net")}</dt><dd>{previewReady ? money(values.net) : "-"}</dd></div></dl>;
 const componentPreview = (row: PayableComponent) => {
  const value = payoutComponentPreview(row, rates, p ?? undefined);
  return <dl className={css.componentPreview} data-component-preview={row.id}>{(["gross", "wht", "net"] as const).map(key => <div key={key}><dt>{t(`payout.component${key[0].toUpperCase()}${key.slice(1)}`)}</dt><dd>{money(value[key])}</dd></div>)}</dl>;
 };
 return <PageShell className={css.page}>
  <div className={css.breadcrumb}><span>{t("common.nav.finance")} / <Link href="/finance/payables">{t("payables.title")}</Link> / {t("payout.title")}</span><Link className={ui.secondary} href="/finance/payables"><ArrowLeft size={16} />{t("payables.title")}</Link></div>
  <div className={css.intro}><PageHeader title={t("payout.title")} description={t("payout.subtitle")} />
  <ol className={css.steps} aria-label={t("payout.progress")}>{["stepRecipient", "stepTax", "review", "done"].map((s, i) => <li key={s} data-state={review.completed[i] ? "complete" : review.activeStep === i ? "active" : "pending"} aria-current={review.activeStep === i ? "step" : undefined}><span aria-hidden="true">{review.completed[i] ? <Check size={16} /> : i + 1}</span><div>{t(`payout.${s}`)}<small>{t(`payout.${review.completed[i] ? "stepComplete" : review.activeStep === i ? "stepActive" : "stepPending"}`)}</small></div></li>)}</ol>
  </div>{loading ? <p role="status">{t("common.state.loading")}</p> : !data ? <Callout tone="negative">{t(`payout.${error || "failed"}`)} <button onClick={() => void load()}>{t("common.actions.retry")}</button></Callout> : <>
   {error ? <Callout role="alert" tone="negative">{t(`payout.${error}`)}</Callout> : null}
   {readonly && p ? <Callout tone="info"><StatusBadge status={p.status} label={t(`payout.${p.status}`)} /> {t("payout.reference")}: {p.id.slice(0, 8).toUpperCase()} · {p.status === "confirmed" ? t("payout.readOnly") : null}</Callout> : null}
   <div className={css.layout}><div className={css.main}>
    <section className={css.section}><h2><UserRound />1. {t("payout.recipient")}</h2><div className={css.recipient}>
     {!readonly ? <div className={css.form}><FieldGroup id="payout-payee" label={t("payout.recipient")}><select value={payee?.id || ""} disabled={busy || !!p} onChange={e => router.push(payoutHref(e.target.value))}><option value="">{t("payout.choose")}</option>{data.payees.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.legal_name} · {t(`payout.${p.kind}`)}</option>)}</select></FieldGroup><button className={ui.secondary} disabled={busy} onClick={() => setEditPayee("new")}>{t("payout.add")}</button></div> : null}
     {payee ? <div className={css.payee}><strong>{payee.legal_name}</strong><span>{t(`payout.${payee.kind}`)} · {t(`payout.${payee.entity_type}`)}</span><span>{t("payout.taxId")}: {payee.tax_id ? mask(payee.tax_id) : t("payout.missing")}</span><span>{t("payout.destination")}: {destination}</span>{!readonly ? <><span className={css.muted}>{review.recipientIssues.length ? review.recipientIssues.map(key => t(`payout.${key}`)).join(" · ") : review.accountSelected && math.valid ? t("payout.ready") : t("payout.detailsPending")}</span><button className={ui.secondary} disabled={busy} onClick={() => setEditPayee(payee)}>{t("payout.edit")}</button></> : null}</div> : null}
    </div></section>
    <section className={css.section}><div className={css.heading}><h2><FileText />2. {t("payout.rights")}</h2><span>{t("payout.selected", { count: picked.length })}</span>{!readonly ? <button className={ui.secondary} disabled={busy || !rows.length} onClick={() => change(() => setSelected(selected.length === rows.length ? [] : rows.map(r => r.id)))}>{t("payout.selectAll")}</button> : null}</div>
     {rows.length ? <div className={css.rights}>{rows.map(r => <label className={css.right} key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={readonly || busy} onChange={e => change(() => setSelected(e.target.checked ? [...selected, r.id] : selected.filter(id => id !== r.id)))} /><span><strong>{payableRoleLabel(r.role_label, locale)}</strong><small>{r.distribution_id.slice(0, 8).toUpperCase()} · {date(r.finalized_at)}</small></span><strong>{money(r.gross_amount)}</strong></label>)}</div> : <EmptyState>{t("payout.noRights")}</EmptyState>}
    </section>
    <div className={css.pair}><section className={css.section}><h2><Calculator />3. {t("payout.wht")}</h2><p className={css.muted}>{t("payout.whtHelp")}</p>{picked.map(r => <div className={css.rate} key={r.id}><span>{payableRoleLabel(r.role_label, locale)}</span><FieldGroup id={`wht-${r.id}`} label={t("payout.rate")}><select disabled={readonly || busy} value={rates[r.id] === undefined ? "" : ["0", "1", "3", "5"].includes(rates[r.id]) ? rates[r.id] : "other"} onChange={e => change(() => setRates({ ...rates, [r.id]: e.target.value === "other" ? "" : e.target.value }))}><option value="" disabled>{t("payout.choose")}</option><option value="0">{t("payout.none")}</option>{[1, 3, 5].map(n => <option key={n} value={n}>{n}%</option>)}<option value="other">{t("payout.other")}</option></select></FieldGroup>{rates[r.id] !== undefined && !["0", "1", "3", "5"].includes(rates[r.id]) ? <input aria-label={t("payout.rate")} type="text" inputMode="decimal" value={rates[r.id]} disabled={readonly || busy} onChange={e => change(() => setRates({ ...rates, [r.id]: e.target.value }))} /> : null}{componentPreview(r)}</div>)}</section>
     <section className={css.section}><h2><Wallet />4. {t("payout.account")}</h2>{readonly ? <p>{locationName(account, locale)}</p> : <FieldGroup id="payout-account" label={t("payout.account")}><select value={accountKey} disabled={busy} onChange={e => change(() => setAccountKey(e.target.value))}><option value="">{t("payout.choose")}</option>{data.accounts.filter(a => a.is_active).map(a => <option key={locationKey(a)} value={locationKey(a)}>{locationName(a, locale)}</option>)}</select></FieldGroup>}<div className={css.balance}><span>{t("payout.before")}</span><strong>{balance}</strong><small>{t("payout.balanceHelp")}</small></div><FieldGroup id="payout-date" label={t("payout.date")}><input type="date" value={paidOn} disabled={readonly || busy} onChange={e => change(() => setPaidOn(e.target.value))} /></FieldGroup></section></div>
    <section className={css.section}><FieldGroup id="payout-note" label={`5. ${t("payout.note")}`}><input value={note} maxLength={2000} disabled={readonly || busy} onChange={e => change(() => setNote(e.target.value))} /></FieldGroup></section>
   </div><aside className={css.side}><h2><Banknote />{t("payout.summary")}</h2>{summary}<dl className={css.summary}><div><dt>{t("payout.account")}</dt><dd>{account ? locationName(account, locale) : t("payout.chooseAccount")}</dd></div><div><dt>{t("payout.before")}</dt><dd>{balance}</dd></div><div><dt>{t("payout.after")}</dt><dd>{!account || account.system_balance == null ? balance : previewReady ? money(account.system_balance - values.net) : "-"}</dd></div></dl>
    {!readonly ? <>
     {review.recipientIssues.length ? <Callout tone="warning"><strong>{t("payout.recipientMissing")}</strong><ul>{review.recipientIssues.map(key => <li key={key}>{t(`payout.${key}`)}</li>)}</ul><button className={ui.secondary} disabled={busy} onClick={() => setEditPayee(payee!)}>{t("payout.fixPayee")}</button></Callout> : null}
     {previewReady && account?.system_balance != null && account.system_balance < values.net ? <Callout tone="warning">{t("payout.negative")}</Callout> : null}
     <div className={css.reviewList}><strong>{t("payout.checkTitle")}</strong><ul>{checklist.map(item => <li key={item.key} data-check={item.key} data-state={item.ready === null ? "pending" : item.ready ? "ready" : "missing"}>{item.ready === null ? <Clock size={16} aria-hidden="true" /> : item.ready ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}<div><strong>{t(`payout.${item.key}`)}</strong><small>{t(`payout.${item.ready === null ? "statePending" : item.ready ? "stateReady" : "stateMissing"}`)}</small><span>{item.detail}</span></div></li>)}</ul></div>
     <p className={css.muted}>{t(dirty ? "payout.dirty" : p ? "payout.saved" : "payout.confirmHelp")}</p>
     <button className={ui.secondary} disabled={busy} onClick={() => void act("save")}><Save size={18} />{t("payout.save")}</button>
     {disabledReasons.length ? <div id="payout-review-blockers" className={css.disabledReason}><strong>{t("payout.cannotConfirm")}</strong><ul>{disabledReasons.map(key => <li key={key}>{t(`payout.${key}`)}</li>)}</ul></div> : null}
     <button className={ui.primary} disabled={disabledReasons.length > 0} aria-describedby={disabledReasons.length ? "payout-review-blockers" : undefined} onClick={() => { setAck(false); setModal("confirm"); }}><Send size={18} />{t("payout.review")}</button>{p ? <div className={css.other}><button className={ui.danger} disabled={busy} onClick={() => { setAck(false); setModal("cancel"); }}>{t("payout.cancel")}</button></div> : null}
    </> : null}
   </aside></div>
   <section className={css.section}><h2><Clock />{t("payout.history")}</h2>{data.history.length ? <div className={css.history}>{data.history.map(h => <div key={h.id}><span>{date(h.paid_on)}</span><Link href={payoutHref(payee?.id || payeeId, h.id)}>{h.id.slice(0, 8).toUpperCase()}</Link><span>{t("payout.gross")}: {money(h.gross)}</span><span>{t("payout.net")}: {money(h.net)}</span><span>WHT: {money(h.wht)}</span><StatusBadge status={h.status} label={t(`payout.${h.status}`)} /></div>)}</div> : <p className={css.muted}>{t("payout.emptyHistory")}</p>}</section>
  </>}
  {editPayee ? <PayeeModal payee={editPayee === "new" ? undefined : editPayee} onClose={() => setEditPayee(null)} onSaved={payee => { setEditPayee(null); if (id === "new" && payee !== payeeId) router.push(payoutHref(payee)); else void load(true); }} /> : null}
  <DetailModal open={!!modal} title={t(modal === "cancel" ? "payout.cancel" : "payout.review")} size="edit" onClose={() => { if (!busy) setModal(null); }} closeOnBackdrop={!busy}>
   <div className={css.form}><p>{t(modal === "cancel" ? "payout.cancelHelp" : "payout.confirmHelp")}</p>{modal === "confirm" ? <><dl className={css.summary}><div><dt>{t("payout.checkRecipient")}</dt><dd>{payee?.legal_name}</dd></div><div><dt>{t("payout.destination")}</dt><dd>{account?.kind === "bank" ? destination : t("payout.cashDestination")}</dd></div><div><dt>{t("payout.account")}</dt><dd>{locationName(account, locale)}</dd></div><div><dt>{t("payout.date")}</dt><dd>{date(paidOn)}</dd></div></dl><div className={css.modalComponents}>{picked.map(row => <div key={row.id}><strong>{payableRoleLabel(row.role_label, locale)}</strong><small>{rates[row.id] === "0" ? t("payout.none") : `${t("payout.componentWht")} ${rates[row.id]}%`}</small>{componentPreview(row)}</div>)}</div>{summary}</> : null}
    {error ? <Callout tone="negative" role="alert">{t(`payout.${error}`)}</Callout> : null}
    <label className={css.check}><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} /><span>{t(modal === "cancel" ? "payout.cancelHelp" : "payout.ack")}</span></label><button className={modal === "cancel" ? ui.danger : ui.primary} disabled={busy || !ack} onClick={() => void act(modal === "cancel" ? "cancel" : "confirm")}><Check size={18} />{t(modal === "cancel" ? "payout.cancel" : "payout.confirm")}</button>
   </div>
  </DetailModal>
 </PageShell>;
}
