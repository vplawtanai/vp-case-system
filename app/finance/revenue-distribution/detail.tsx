"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { VpFormulaEditor } from "../payments/vp-formula-editor";
import { initialLineFormulas, lineFormulaChoices, type LineFormulaInputs } from "../payments/vp-formula";
import { initialDistributionChoices, distributionBlocker, distributionError, distributionExpected, distributionLineId, distributionPayload, distributionSource, distributionSourceProven } from "../payments/vp-distribution";
import { compensationRoleLabel } from "../../../lib/i18n/legacy-finance";
import { distributionTotals, receiptHref, type RevenueDetailData } from "./shared";
import { RevenueBadge } from "./workspace";
import css from "./workspace.module.css";
import { ParticipantPayment } from "./participant-payment";
export function RevenueDetail({ sourceType, sourceId }: { sourceType: string; sourceId: string }) {
 const { t, locale, date } = useI18n(), lock = useRef(false);
 const [data, setData] = useState<RevenueDetailData | null>(null), [formulas, setFormulas] = useState<LineFormulaInputs>({}), [note, setNote] = useState("");
 const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [reloadRequired, setReloadRequired] = useState(false), [invalid, setInvalid] = useState(false), [success, setSuccess] = useState("");
 const w = (key: string) => t(`revenueDistribution.${key}`);
 const install = useCallback((context: RevenueDetailData) => { setData(context); setFormulas(initialLineFormulas(context)); setNote(context.current?.note || ""); setInvalid(false); setReloadRequired(false); }, []);
 const fetchData = useCallback(async () => {
  if (!["payment", "direct_money_receipt"].includes(sourceType) || !/^[a-f0-9-]{36}$/i.test(sourceId)) throw Error("VP_DISTRIBUTION_SOURCE_UNPROVEN");
  const r = await supabase.rpc("get_finance_revenue_distribution_detail", { p_source_type: sourceType, p_source_id: sourceId });
  if (r.error || !r.data?.source || !r.data?.summary || r.data.posting_enabled !== false) throw r.error || Error("response"); return r.data as RevenueDetailData;
 }, [sourceType, sourceId]);
 useEffect(() => { let live = true; void fetchData().then(r => { if (live) install(r); }).catch(e => { if (live) setError(e); }); return () => { live = false; }; }, [fetchData, install]);
 async function reload() { if (lock.current) return; lock.current = true; setBusy(true); try { install(await fetchData()); setError(null); } catch (e) { setError(e); } finally { lock.current = false; setBusy(false); } }
 const [paying, setPaying] = useState<string | null>(null);
 const current = data?.current, source = data ? distributionSource(data) : null, calculated = data ? lineFormulaChoices(data, formulas) : null;
 const choices = current && current.status !== "draft" ? initialDistributionChoices(data!) : calculated?.choices || [];
 const totals = distributionTotals(choices), basis = source?.totals.professional_pool ?? null;
 const editable = !!data?.can_manage && (!current || current.status === "draft");
 const allocationValid = !editable || !!calculated?.valid;
 const proven = !!data && distributionSourceProven(data.source);
 const ready = proven && !!calculated?.valid && !reloadRequired && (!current || current.status === "draft" || (current.status === "reviewed" && data?.source_current));
 async function act(confirm: boolean) {
  if (lock.current || !data?.can_manage || !source || reloadRequired) return;
  if (!ready) { setInvalid(true); setError({ message: "VP_DISTRIBUTION_REVIEW_REQUIRED" }); return; }
  lock.current = true; setBusy(true); setError(null); setSuccess("");
  try {
   const args = { p_payment_id: sourceType === "payment" ? sourceId : null, p_direct_id: sourceType === "direct_money_receipt" ? sourceId : null, ...distributionExpected(data), p_source: data.source, p_choices: distributionPayload(source, choices), p_note: note };
   const r = confirm ? await supabase.rpc("confirm_finance_vp_received_distribution", { ...args, p_acknowledged: true })
    : await supabase.rpc(sourceType === "payment" ? "save_finance_vp_distribution" : "save_finance_direct_vp_distribution", { ...(sourceType === "payment" ? { p_payment_id: sourceId } : { p_direct_id: sourceId }), ...distributionExpected(data), p_source: data.source, p_choices: args.p_choices, p_note: note });
   if (r.error || typeof r.data !== "string") throw r.error || Error("response");
   install(await fetchData()); setSuccess(confirm ? "success" : "saved");
  } catch (e) { setError(e); setReloadRequired(true); } finally { lock.current = false; setBusy(false); }
 }
 const money = (n: number | null | undefined) => n == null ? "—" : `${Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data?.summary.currency || "THB"}`;
 return <PageShell className={css.page}><Link className={css.back} href="/finance/revenue-distribution"><ArrowLeft size={16} />{w("title")}</Link>
  {error ? <Callout tone="negative" role="alert">{distributionError(error, locale)}{reloadRequired ? <p>{w("conflict")}</p> : null}<button className={ui.secondary} disabled={busy} onClick={() => void reload()}>{w("retry")}</button></Callout> : null}
  {!data || !source ? !error ? <p role="status">{t("common.state.loading")}</p> : null : <>
   <header className={css.header}><div><h1>{w("title")} — {data.summary.reference}</h1><p>{w(sourceType)} · {data.summary.client}</p></div><RevenueBadge state={data.summary.state} /><Link className={ui.secondary} href={receiptHref(data.summary)}>{w("sourceLink")}<ArrowUpRight size={15} /></Link></header>
   {success ? <Callout tone="success" role="status">{w(success)}</Callout> : null}
   {!data.can_manage ? <Callout tone="info">{w("readonly")}</Callout> : null}
   {source.policy_version === "vp_distribution_v1" ? <Callout tone="info">{w("v1")}</Callout> : null}
   {data.source.blockers.map((b, i) => <Callout tone="warning" key={i}>{b === "partial_line_evidence_missing" ? w("partialBlock") : distributionBlocker(b, locale)}</Callout>)}
   <div className={css.detailGrid} aria-busy={busy}>
    <aside className={css.panel}><h2>{w("facts")}</h2><dl className={css.facts}>{[
     ["date", date(data.summary.received_on)], ["reference", data.summary.reference], ["source", w(sourceType)], ["client", data.summary.client], ["matter", data.summary.matter], ["account", data.summary.account], ["cash", money(data.summary.cash)], ["vat", money(data.summary.vat)], ["wht", money(data.summary.wht)], ["gross", money(data.summary.gross)],
    ].map(([key, value]) => <div key={key}><dt>{w(key!)}</dt><dd>{value || "—"}</dd></div>)}</dl>
     <section className={css.basis}><h3>{w("basisTitle")} <Info size={15} /></h3><strong>{proven ? money(basis) : w("unknown")}</strong><p>{w(source.policy_version === "vp_distribution_v2" ? "basisHelp" : "v1")}</p></section>
     <details className={css.disclosure}><summary>{w("breakdown")}</summary>{source.lines.map(line => <div className={css.line} key={distributionLineId(line)}><strong>{line.description}</strong><dl className={css.facts}><div><dt>{w("basis")}</dt><dd>{money(line.professional_pool)}</dd></div><div><dt>VAT</dt><dd>{money(line.vat)}</dd></div><div><dt>WHT</dt><dd>{money(line.wht)}</dd></div></dl>{line.classification !== "professional_fee" ? <p>{w("sourceOnly")}: {money(line.company_economic)}</p> : null}</div>)}</details>
    </aside>
    <section className={`${css.panel} ${css.formula}`}><h2>{w("formula")}</h2>{source.lines.filter(l => l.classification === "professional_fee").map(line => <section className={css.line} key={distributionLineId(line)}>
     <div className={css.lineTitle}><h3>{line.description}</h3><strong>{money(line.professional_pool)}</strong></div>
     {editable ? <VpFormulaEditor pool={line.professional_pool} input={formulas[distributionLineId(line)]} people={data.formula_people} currency={data.summary.currency} disabled={busy || reloadRequired || !proven} invalid={invalid} onChange={value => { setFormulas(prev => ({ ...prev, [distributionLineId(line)]: value })); setSuccess(""); setError(null); }} /> : null}
     {(!editable || calculated?.errors[distributionLineId(line)]?.length === 0) && choices.find(c => distributionLineId(c) === distributionLineId(line))?.formula_result ? <div className={css.participants}><table className={`${css.table} ${current?.status === "finalized" ? css.settlementTable : ""}`}><thead><tr><th>{w("recipient")}</th><th>{w("role")}</th><th>{w("percent")}</th><th>{w("amount")}</th>{current?.status === "finalized" ? <><th>{w("status")}</th><th>{w("actions")}</th></> : null}</tr></thead><tbody>{choices.find(c => distributionLineId(c) === distributionLineId(line))!.formula_result!.recipients.map(r => { const settlement = data.participants?.find(p => p.source_line_id === distributionLineId(line) && p.component_no === r.component_no); return <tr key={r.component_no}><td>{r.recipient_kind === "company" ? w("company") : r.recipient_name}</td><td>{compensationRoleLabel(r.role_label, locale)}</td><td>{r.percent ?? (line.professional_pool ? (r.amount / line.professional_pool * 100).toFixed(2) : "—")}{line.professional_pool ? "%" : ""}</td><td className={css.number}>{money(r.amount)}</td>{current?.status === "finalized" ? <><td>{r.recipient_kind === "company" ? w("company") : settlement?.payout_id ? <><span className={css.settled}>{w("participantPaid")}</span><small className={css.paidEvidence}>{date(settlement.paid_on!)} · {settlement.account}<br />{w("actualOutflow")}: {money(settlement.net_amount)}{settlement.wht_amount ? ` · WHT ${money(settlement.wht_amount)}` : ""}</small></> : w("participantUnpaid")}</td><td>{r.recipient_kind !== "company" && settlement && !settlement.payout_id && data.can_manage ? <button type="button" className={ui.primary} disabled={busy} onClick={() => setPaying(settlement.id)}>{w("pay")}</button> : "—"}</td></> : null}</tr>; })}</tbody><tfoot><tr><th colSpan={2}>{w("total")}</th><th>{line.professional_pool ? "100%" : "—"}</th><th className={css.number}>{money(choices.find(c => distributionLineId(c) === distributionLineId(line))!.formula_result!.recipients.reduce((n, r) => n + Math.round(r.amount * 100), 0) / 100)}</th>{current?.status === "finalized" ? <td colSpan={2} /> : null}</tr></tfoot></table></div> : null}
    </section>)}<label>{w("note")}<textarea rows={2} maxLength={2000} value={note} readOnly={!editable} disabled={busy || reloadRequired} onChange={e => setNote(e.target.value)} /></label></section>
    <aside className={`${css.panel} ${css.summary}`}><h2>{w("summary")}</h2><dl className={css.facts}>{[["basis", proven ? basis : null], ["company", allocationValid ? totals.company : null], ["individuals", allocationValid ? totals.individuals : null], ["total", allocationValid ? totals.total : null], ["remaining", !allocationValid || basis === null ? null : (Math.round(basis * 100) - Math.round(totals.total * 100)) / 100]].map(([key, value]) => <div key={String(key)}><dt>{w(String(key))}</dt><dd>{money(value as number | null)}</dd></div>)}</dl><p className={css.explanation}>{w("confirmHelp")}</p>
     {current?.status === "reviewed" ? <p>{w("review")}</p> : current?.status === "draft" ? <p>{w("drafting")}</p> : null}
     {invalid ? <p role="alert" className={css.warning}>{w("invalid")}</p> : null}
     {data.can_manage && (!current || ["draft", "reviewed"].includes(current.status)) ? <div className={css.actions}>{editable ? <button className={ui.secondary} disabled={busy || reloadRequired || !proven} onClick={() => void act(false)}>{w("draft")}</button> : null}<button className={ui.primary} disabled={busy || reloadRequired || !proven} onClick={() => void act(true)}><CheckCircle2 size={16} />{w("confirm")}</button></div> : null}
    </aside>
   </div>
   {data.history.length ? <details className={`${css.panel} ${css.disclosure}`}><summary>{w("audit")}</summary>{data.history.map(h => <details key={h.id} className={css.line}><summary>{t("vpDistribution.revision", { revision: h.revision })} · {t(`vpDistribution.${h.status}`)} · {date(h.created_at, true)}</summary><p>{w("basis")}: {money(h.source_snapshot_json.totals.professional_pool)} · {h.source_snapshot_json.policy_version}</p>{h.decisions_json.flatMap(c => c.formula_result?.recipients || []).map((r, i) => <p key={i}>{r.recipient_kind === "company" ? w("company") : r.recipient_name} · {compensationRoleLabel(r.role_label, locale)} · {money(r.amount)}</p>)}{h.supersede_reason ? <p>{h.supersede_reason}</p> : null}</details>)}</details> : null}
  </>}
  {paying && current?.status === "finalized" ? <ParticipantPayment key={paying} distributionId={current.id} entitlementId={paying} onClose={() => setPaying(null)} onPaid={async () => { install(await fetchData()); setPaying(null); setSuccess("paymentDone"); }} /> : null}
 </PageShell>;
}
