"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import type { UserPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { Callout, PageShell, StatusBadge } from "../../components/ui/patterns";
import DetailModal from "../../components/DetailModal";
import ui from "../../components/ui/vp-ui.module.css";
import { currentBangkokMonth, shiftMonth } from "./dashboard-data";
import { readTaxMonth, taxMonthSummary, taxYearSummary, withholdingTrace, type ExternalVat, type TaxMonth } from "./period-data";
import { activeFiling, filingCoverage, type FilingType } from "./filings/shared";
import { TaxFilingWorkspace } from "./filings/workspace";
import { ExternalInputForm } from "./external-input";
import css from "./tax-home.module.css";

export default function TaxHome({permissions}:{permissions:UserPermissions}) {
 const {t,locale,date}=useI18n(),tr=(k:string,v?:Record<string,string|number>)=>t(`taxHome.${k}`,v);
 const [view,setView]=useState("month"),[month,setMonth]=useState(currentBangkokMonth),[reload,setReload]=useState(0);
 const [months,setMonths]=useState<TaxMonth[]|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 const [source,setSource]=useState<"vat"|"credit"|"input"|"wht"|null>(null),[filing,setFiling]=useState<FilingType|null>(null),[external,setExternal]=useState<ExternalVat|"new"|null>(null);
 const year=month.slice(0,4),readPeriod=view==="month"?month:year;
 useEffect(()=>{let active=true;const timer=setTimeout(async()=>{setLoading(true);setError(false);setMonths(null);
  try{const periods=readPeriod.length===7?[readPeriod]:Array.from({length:12},(_,i)=>`${readPeriod}-${String(i+1).padStart(2,"0")}`);const next:TaxMonth[]=[];
   // Bounded year read, avoid twelve concurrent full-period queries.
   for(const period of periods){next.push(await readTaxMonth(supabase,permissions,period));if(!active)return;}
   if(active)setMonths(next);
  }catch{if(active)setError(true);}finally{if(active)setLoading(false);}},0);return()=>{active=false;clearTimeout(timer);};
 },[readPeriod,permissions,reload]);
 const data=months?.find(m=>m.month===month),summary=data?taxMonthSummary(data):null,annual=months&&view!=="month"?taxYearSummary(months):null;
 const money=(v:number|null|undefined)=>v==null?tr("unknown"):`${v.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} THB`;
 const monthName=(m:string)=>new Intl.DateTimeFormat(locale==="th"?"th-TH":"en-GB",{month:"long",year:"numeric",timeZone:"Asia/Bangkok"}).format(new Date(`${m}-01T00:00:00+07:00`));
 function openMonth(m:string){setMonth(m);setView("month");setSource(null);setFiling(null);}
 const refresh=()=>setReload(n=>n+1);
 return <PageShell><div className={css.home}>
  <header><h1>{tr("title")}</h1><p>{tr("subtitle")}</p></header>
  <nav className={css.tabs} aria-label={tr("title")}>{["month","history","year"].map(v=><button key={v} type="button" aria-current={v===view?"page":undefined} onClick={()=>setView(v)}>{tr(v)}</button>)}</nav>
  <div className={css.toolbar}><button className={ui.secondary} aria-label={t("taxDashboard.previousMonth")} onClick={()=>setMonth(shiftMonth(month,view==="month"?-1:-12))}><ChevronLeft size={18}/></button>
   <label>{tr(view==="month"?"month":"year")}<input aria-label={tr(view==="month"?"month":"year")} type={view==="month"?"month":"number"} min={view==="month"?"2000-01":2000} max={view==="month"?"2100-12":2100} value={view==="month"?month:year} onChange={e=>{const value=e.target.value;if(view==="month"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value))setMonth(value);else if(view!=="month"&&/^\d{4}$/.test(value)&&Number(value)>=2000&&Number(value)<=2100)setMonth(`${value}-01`);}}/></label>
   <button className={ui.secondary} aria-label={t("taxDashboard.nextMonth")} onClick={()=>setMonth(shiftMonth(month,view==="month"?1:12))}><ChevronRight size={18}/></button><button className={ui.secondary} aria-label={t("common.actions.retry")} disabled={loading} onClick={refresh}><RefreshCw size={18}/></button>
  </div>
  {loading?<p role="status">{t("common.state.loading")}</p>:null}{error?<Callout tone="negative">{tr("unavailable")}</Callout>:null}
  {view==="month"&&data&&summary?<>
   <h2>{monthName(month)}</h2><div className={css.cards}>{summary.obligations.filter(p=>p.filing_type==="vat"||filingCoverage(p).source_count>0||activeFiling(data.filing,p.filing_type)).map(p=>{const f=activeFiling(data.filing,p.filing_type),isVat=p.filing_type==="vat";const state=f?.status==="filed"?f.remittance?.status==="confirmed"?"paid":"filed":!p.ready||f?.source_changed?"review":"ready";const due=f?.deadline_snapshot_json?.channel==="online"?f.due_date:data.deadlines[p.filing_type]?.due_date;
    return <article className={css.card} key={p.filing_type} data-tax-form={p.filing_type}><div className={css.cardHead}><h3>{tr(isVat?"vatForm":p.filing_type)}</h3><StatusBadge status={state==="paid"||state==="filed"?"confirmed":"pending"} label={tr(state)}/></div>
     <strong className={css.amount}>{money(isVat?summary.net??summary.estimate:f?.status==="filed"?f.tax_amount:p.tax_amount)}</strong>
     {isVat?<><p>{tr(summary.net===null?"estimate":"net")}</p><dl>{[["output",summary.output],["input",summary.input],["pending",summary.pendingVat]].map(([key,value])=><div key={String(key)}><dt>{tr(String(key))}</dt><dd>{money(value as number|null)}</dd></div>)}</dl></>:<p>{tr("count",{count:filingCoverage(p).source_count})}</p>}
     <p>{tr("due")}: <strong>{due?date(due):tr("dueUnknown")}</strong></p>
     <div className={css.actions}>{isVat?<button type="button" className={ui.secondary} onClick={()=>setSource("vat")}>{tr("sources")}</button>:null}<button className={ui.secondary} onClick={()=>setFiling(p.filing_type)}>{tr("filing")}</button><a href="https://efiling.rd.go.th/" target="_blank" rel="noreferrer">{tr("ef")}</a></div>
    </article>;
   })}</div>
   {summary.whtSources.length?<section className={css.credit}><div><h3>{tr("outgoing")}</h3><strong>{money(summary.outgoing)}</strong>{summary.unclassified.length?<p>{tr("whtClassification")}</p>:null}</div><button className={ui.secondary} onClick={()=>setSource("wht")}>{tr("sources")}</button></section>:null}
   {summary.incomplete?<p className={css.muted}>{tr("incomplete")}</p>:null}
   <section className={css.credit}><div><h3>{tr("credit")}</h3><strong>{money(summary.incoming)}</strong><p>{tr("creditHelp")}</p></div><button className={ui.secondary} onClick={()=>setSource("credit")}>{tr("details")}</button></section>
   <section><div className={css.cardHead}><h2>{tr("remaining")}</h2>{data.inputs.can_manage?<button className={ui.primary} onClick={()=>setExternal("new")}>{tr("add")}</button>:null}</div><button className={ui.secondary} onClick={()=>setSource("input")}>{tr("pending")} · {tr("count",{count:summary.pendingCount})}</button></section>
  </>:null}
  {annual?<>
   {view==="year"?<><div className={css.cards}>{(["output","input","net","outgoing","incoming"] as const).map(key=><article className={css.card} key={key}><h3>{tr(key==="incoming"?"credit":key)}</h3><strong className={css.amount}>{money(annual[key])}</strong></article>)}</div><section className={css.credit}><strong>{tr("filedCount",{count:annual.complete})}</strong><span>{tr("owedCount",{count:annual.outstanding})}</span></section></>:null}
   <table className={css.table}><thead><tr>{["month","net","outgoing","filed","details"].map(k=><th key={k}>{tr(k)}</th>)}</tr></thead><tbody>{annual.rows.map(r=><tr key={r.month}><td>{monthName(r.month)}</td><td data-label={tr("net")}>{money(r.net)}</td><td data-label={tr("outgoing")}>{money(r.outgoing)}</td><td><StatusBadge status={r.status==="complete"?"confirmed":"pending"} label={tr(r.status)}/></td><td><button className={ui.secondary} onClick={()=>openMonth(r.month)}>{tr("details")}</button></td></tr>)}</tbody></table><p className={css.muted}>{tr("yearNote")}</p>
  </>:null}
  {source&&data&&summary?<DetailModal open title={tr(source==="credit"?"credit":source==="input"?"input":"sources")} size="workflow" onClose={()=>setSource(null)}><div className={css.sourceList}>
   {source==="wht"?summary.whtSources.map(s=>{const trace=withholdingTrace(s);const f=data.filing.filings.find(f=>f.status==="filed"&&filingCoverage(f.source_snapshot_json).sources.some(x=>x.id===s.id));return <article key={s.id}><strong>{s.payee_name} · {trace.title}</strong><p>{date(s.date)} · {tr("gross")} {money(trace.gross)} · WHT {money(s.amount)} · {tr("cash")} {money(trace.cash)}</p><p>{tr(f?.remittance?.status==="confirmed"?"paid":f?"filed":"outstanding")}</p>{trace.expenseId?<Link href={`/finance/expenses/${trace.claim?"claims/":""}${trace.expenseId}`}>{tr("expenseSource")}</Link>:null} · <Link href={`/finance/payouts/${s.source_id}`}>{tr("paymentSource")}</Link></article>;}):source==="credit"?summary.credits.map(c=><article key={c.key}><strong>{c.reference}</strong><p>{tr("base")} {money(c.base)} · {c.rate===null?"—":`${c.rate}%`} · {money(c.amount)} · {t(`taxPosition.${c.evidence}`)}</p><Link href={c.source==="payment"?`/finance/payments/${c.sourceId}`:`/finance/direct-money/${c.sourceId}`}>{tr("details")}</Link></article>):source==="vat"?summary.movements.filter(m=>m.vat!==null).map(m=><article key={m.key}><strong>{m.reference}</strong><p>{date(m.date)} · {m.payer} · VAT {money(m.vat)}</p><Link href={m.href}>{tr("details")}</Link></article>):<>
    {data.inputs.expenses.map(e=><article key={e.id}><strong>{e.vendor||tr("sources")} · {e.reference||"—"}</strong><p>{date(e.invoice_date)} · {tr("base")} {money(e.tax_base)} · VAT {money(e.vat_amount)} · {tr(e.status==="pending"?"pendingEvidence":e.status)}</p><Link href={`/finance/expenses${e.origin==="employee_claim"?"/claims":""}/${e.id}`}>{tr("details")}</Link></article>)}
    {data.inputs.external.map(e=><article key={e.id}><strong>{e.vendor} · {e.invoice_number}</strong><p>{date(e.invoice_date)} · {tr("base")} {money(e.tax_base)} · VAT {money(e.vat_amount)}</p><p>{tr(e.review?.status==="eligible"?"eligible":e.review?.status==="ineligible"?"ineligible":"pendingEvidence")} · {tr("funding")}</p><p>{e.note}</p>{e.review?<p>{e.review.reason}</p>:null}{data.inputs.can_manage?<button className={ui.secondary} onClick={()=>{setSource(null);setExternal(e);}}>{tr("saveReview")}</button>:null}</article>)}
   </>}
   {source==="input"&&!data.inputs.expenses.length&&!data.inputs.external.length?<p>{tr("empty")}</p>:null}
  </div></DetailModal>:null}
  {filing?<TaxFilingWorkspace permissions={permissions} initialMonth={month} initialType={filing} onExit={()=>{setFiling(null);refresh();}}/>:null}
  {external?<ExternalInputForm row={external==="new"?undefined:external} onClose={()=>setExternal(null)} onSaved={()=>{setExternal(null);setSource(null);refresh();}}/>:null}
 </div></PageShell>;
}
