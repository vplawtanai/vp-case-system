"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileText, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import type { UserPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { Callout, PageShell } from "../../components/ui/patterns";
import { FinanceStatusBadge as StatusBadge } from "../ui/primitives";
import DetailModal from "../ui/FinanceModal";
import ui from "../../components/ui/vp-ui.module.css";
import { currentBangkokMonth, shiftMonth } from "./dashboard-data";
import { externalVatStatus, readTaxMonth, taxMonthSummary, taxYearSummary, withholdingTrace, type ExternalVat, type InputEvidence, type TaxMonth } from "./period-data";
import { filingObligationDisplay, filingObligationsForDisplay, filingYearView, taxPeriodForFilingMonth, taxPeriodsForView } from "./filing-period-view";
import { activeFiling, filingCoverage, type FilingType } from "./filings/shared";
import { TaxFilingWorkspace } from "./filings/workspace";
import { ExternalInputForm } from "./external-input";
import { ExpenseInputReview } from "./expense-input";
import { VatSources } from "./vat-sources";
import css from "./tax-home.module.css";

export default function TaxHome({permissions}:{permissions:UserPermissions}) {
 const {t,locale,date}=useI18n(),tr=(k:string,v?:Record<string,string|number>)=>t(`taxHome.${k}`,v);
 const [view,setView]=useState("month"),[month,setMonth]=useState(currentBangkokMonth),[reload,setReload]=useState(0);
 const [months,setMonths]=useState<TaxMonth[]|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 const [source,setSource]=useState<"vat"|"credit"|"input"|"pendingInput"|"wht"|null>(null),[filing,setFiling]=useState<FilingType|null>(null),[external,setExternal]=useState<ExternalVat|"new"|null>(null);
 const [expenseInput,setExpenseInput]=useState<InputEvidence["expenses"][number]|null>(null);
 const year=month.slice(0,4),taxPeriod=taxPeriodForFilingMonth(month),readPeriod=view==="month"?month:year;
 useEffect(()=>{let active=true;const timer=setTimeout(async()=>{setLoading(true);setError(false);setMonths(null);
  try{const periods=taxPeriodsForView(readPeriod);const next:TaxMonth[]=[];
   // Bounded reads; the year includes the prior December for January filing activity.
   for(const period of periods){next.push(await readTaxMonth(supabase,permissions,period));if(!active)return;}
   if(active)setMonths(next);
  }catch{if(active)setError(true);}finally{if(active)setLoading(false);}},0);return()=>{active=false;clearTimeout(timer);};
 },[readPeriod,permissions,reload]);
 const data=months?.find(m=>m.month===taxPeriod),summary=data?taxMonthSummary(data,taxPeriodForFilingMonth(currentBangkokMonth())):null;
 const inputExpenses=data?.inputs.expenses.filter(e=>source!=="pendingInput"||e.status==="pending")||[];
 const inputExternal=data?.inputs.external.filter(e=>source!=="pendingInput"||externalVatStatus(e)==="pending")||[];
 const annual=months&&view!=="month"?taxYearSummary(months.filter(m=>m.month.startsWith(`${year}-`))):null;
 const filingYear=months&&view!=="month"?filingYearView(months,year):null;
 const displayObligations=data?filingObligationsForDisplay(data):null;
 const money=(v:number|null|undefined)=>v==null?tr("unknown"):`${v.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} THB`;
 const monthName=(m:string)=>new Intl.DateTimeFormat(locale==="th"?"th-TH":"en-GB",{month:"long",year:"numeric",timeZone:"Asia/Bangkok"}).format(new Date(`${m}-01T00:00:00+07:00`));
 const monthLabel=(m:string,format:"long"|"short"="long")=>new Intl.DateTimeFormat(locale==="th"?"th-TH":"en-GB",{month:format,timeZone:"Asia/Bangkok"}).format(new Date(`${m}-01T00:00:00+07:00`));
 const yearLabel=(y:string)=>String(Number(y)+(locale==="th"?543:0));
 function openMonth(m:string){setMonth(m);setView("month");setSource(null);setFiling(null);}
 const refresh=()=>setReload(n=>n+1);
 return <PageShell className={css.page}><div className={css.home}>
  <header className={css.heading}><h1>{tr("title")}</h1><p>{tr("subtitle")}</p></header>
  <nav className={css.tabs} aria-label={tr("title")}>{["month","history","year"].map(v=><button key={v} type="button" aria-current={v===view?"page":undefined} onClick={()=>setView(v)}>{tr(v)}</button>)}</nav>
  <div className={css.toolbar}>
   <div className={css.periodControlGroup}><span className={css.periodLabel}>{tr(view==="month"?"filingMonth":"filingYear")}</span><div className={css.periodControls}>
    <button className={ui.secondary} aria-label={t("taxDashboard.previousMonth")} onClick={()=>setMonth(shiftMonth(month,view==="month"?-1:-12))}><ChevronLeft size={17}/></button>
    <div className={css.periodPicker}><CalendarDays size={17} aria-hidden="true"/>
     {view==="month"?<select aria-label={tr("filingMonth")} value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=>{const value=`${year}-${String(i+1).padStart(2,"0")}`;return <option key={value} value={value}>{monthLabel(value)}</option>;})}</select>:null}
     <select aria-label={tr("filingYear")} value={year} onChange={e=>setMonth(`${e.target.value}-${view==="month"?month.slice(5):"01"}`)}>{Array.from({length:101},(_,i)=>String(2000+i)).map(y=><option key={y} value={y}>{yearLabel(y)}</option>)}</select>
    </div>
    <button className={ui.secondary} aria-label={t("taxDashboard.nextMonth")} onClick={()=>setMonth(shiftMonth(month,view==="month"?1:12))}><ChevronRight size={17}/></button>
   </div></div>
   <button className={`${ui.secondary} ${css.refresh}`} aria-label={t("common.actions.retry")} disabled={loading} onClick={refresh}><RefreshCw size={16}/><span>{tr("refresh")}</span></button>
  </div>
  {loading?<p role="status">{t("common.state.loading")}</p>:null}{error?<Callout tone="negative">{tr("unavailable")}</Callout>:null}
  {view==="month"&&data&&summary&&displayObligations?<>
   <section className={css.obligations} aria-labelledby="tax-month-summary">
    <div className={css.sectionHead}><h2 id="tax-month-summary">{tr("monthlySummary")}</h2><span>{monthName(month)}</span></div>
    <div className={css.cards}>
     {displayObligations.pools.filter(p=>p.filing_type==="vat").map(p=>{const f=activeFiling(data.filing,p.filing_type);const {state,due}=filingObligationDisplay(p,f,data.deadlines[p.filing_type]);
      return <article className={`${css.card} ${css.vatCard}`} key={p.filing_type} data-tax-form={p.filing_type}>
       <div className={css.cardHead}><span className={css.cardTitle}><span className={css.icon}><FileText size={22}/></span><div><h3>{tr("vatForm")}</h3><p className={css.taxPeriod}>{tr("taxPeriod")}: {monthName(p.period_month.slice(0,7))}</p></div></span><StatusBadge status={state==="paid"||state==="filed"?"confirmed":"pending"} label={tr(state)}/></div>
       <div className={css.heroAmount}><strong className={css.amount}>{money(summary.net??summary.estimate)}</strong><p>{tr(summary.net===null?"estimate":"net")}</p></div>
       <dl className={css.facts}>{[["output",summary.output],["input",summary.input],...(summary.pendingCount>0?[["pending",summary.pendingVat]]:[])].map(([key,value])=><div key={String(key)}><dt>{tr(String(key))}</dt><dd>{money(value as number|null)}</dd></div>)}</dl>
       <div className={css.deadline}><CalendarDays size={16}/><div><span>{tr("due")}</span><strong>{due?date(due):tr("dueUnknown")}</strong></div></div>
       <div className={css.actions}><button className={css.actionButton} onClick={()=>setFiling(p.filing_type)}>{tr("filing")}<ArrowRight size={15}/></button><button type="button" className={css.textButton} onClick={()=>setSource("vat")}>{tr("sources")}</button></div>
      </article>;
     })}
     <article className={`${css.card} ${css.whtCard}`} data-tax-summary="wht">
      <div className={css.cardHead}><span className={css.cardTitle}><span className={css.icon}><ArrowDownToLine size={22}/></span><div><h3>{tr("outgoing")}</h3><p className={css.taxPeriod}>{tr("taxPeriod")}: {monthName(data.month)}</p></div></span><span className={css.muted}>{tr("count",{count:summary.whtSources.length})}</span></div>
      <div className={css.heroAmount}><strong className={css.amount}>{money(summary.outgoing)}</strong><p>{tr("actualWithholding")}</p></div>
      {displayObligations.whtNeedsReview?<div className={css.reviewNotice}><Clock3 size={17}/><p>{tr("whtClassification")}</p></div>:null}
      <div className={css.whtForms}>{displayObligations.pools.filter(p=>p.filing_type!=="vat").map(p=>{const f=activeFiling(data.filing,p.filing_type);const {state,due}=filingObligationDisplay(p,f,data.deadlines[p.filing_type]);
       return <section key={p.filing_type} data-tax-form={p.filing_type} className={css.whtForm}><div className={css.cardHead}><h4>{tr(p.filing_type)}</h4><StatusBadge status={state==="paid"||state==="filed"?"confirmed":"pending"} label={tr(state)}/></div><div className={css.cardHead}><span>{tr("count",{count:filingCoverage(p).source_count})}</span><strong>{money(f?.status==="filed"?f.tax_amount:p.tax_amount)}</strong></div><div className={css.whtFormFoot}><p>{tr("remitBy")}<strong>{due?date(due):tr("dueUnknown")}</strong></p><button className={css.textButton} onClick={()=>setFiling(p.filing_type)}>{tr("filing")}<ArrowRight size={14}/></button></div></section>;
      })}</div>
      {!summary.whtSources.length?<p className={css.muted}>{tr("empty")}</p>:null}
      {summary.whtSources.length?<div className={css.actions}><button className={css.actionButton} onClick={()=>setSource("wht")}>{tr("sources")}<ArrowRight size={15}/></button></div>:null}
     </article>
    </div>
   </section>
   <section className={css.credit}><span className={css.icon}><ShieldCheck size={22}/></span><div className={css.creditCopy}><h3>{tr("credit")}</h3><p>{tr("creditHelp")}</p></div><strong data-metric>{money(summary.incoming)}</strong><button className={css.textButton} onClick={()=>setSource("credit")}>{tr("details")}<ChevronRight size={16}/></button></section>
   <section aria-labelledby="tax-attention"><div className={css.sectionHead}><h2 id="tax-attention">{tr("attention")}</h2></div><div className={css.attentionGrid}>
    <div className={css.evidencePanel}><h3><FileText size={18}/>{tr("remaining")}</h3>{summary.pendingCount>0?<button className={css.reviewRow} onClick={()=>setSource("pendingInput")}><span className={css.reviewIcon}><Clock3 size={19}/></span><span><strong>{tr("pending")} · {tr("count",{count:summary.pendingCount})}</strong><small>{money(summary.pendingVat)}</small></span><ChevronRight size={17}/></button>:null}
     <button className={css.textButton} onClick={()=>setSource("input")}>{tr("inputEvidence")}</button>
     {data.inputs.can_manage?<button className={css.actionButton} onClick={()=>setExternal("new")}>{tr("add")}</button>:null}
    </div>
    <section className={css.filingPanel} aria-labelledby="tax-filing-actions"><h3 id="tax-filing-actions">{tr("filingActions")}</h3>
     {displayObligations.pools.map(p=>{const f=activeFiling(data.filing,p.filing_type),isVat=p.filing_type==="vat";const {state,due}=filingObligationDisplay(p,f,data.deadlines[p.filing_type]);return <article key={p.filing_type} className={css.filingObligation} data-filing-action={p.filing_type}>
      <div className={css.cardHead}><h4>{tr(isVat?"vatForm":p.filing_type)}</h4><StatusBadge status={state==="paid"||state==="filed"?"confirmed":"pending"} label={tr(state)}/></div>
      <p>{tr("taxPeriod")}: {monthName(p.period_month.slice(0,7))}</p>
      <div className={css.obligationFacts}><strong>{money(isVat?summary.net??summary.estimate:f?.status==="filed"?f.tax_amount:p.tax_amount)}</strong><p>{tr(isVat?"due":"remitBy")}<strong>{due?date(due):tr("dueUnknown")}</strong></p></div>
      <div className={css.actions}><button className={css.actionButton} onClick={()=>setFiling(p.filing_type)}>{tr(isVat?"manageFiling":"manageRemittance")}<ArrowRight size={14}/></button><a className={css.efiling} href="https://efiling.rd.go.th/" target="_blank" rel="noreferrer" aria-label={`${tr("ef")} · ${tr(isVat?"vatForm":p.filing_type)} · ${tr("taxPeriod")}: ${monthName(p.period_month.slice(0,7))}`}>{tr("ef")}<ExternalLink size={14}/></a></div>
     </article>;})}
     {displayObligations.whtNeedsReview?<article className={css.filingObligation} data-filing-action="wht-review"><h4>{tr("outgoing")}</h4><p>{tr("taxPeriod")}: {monthName(data.month)}</p><p>{tr("whtClassification")}</p><div className={css.actions}><button className={css.actionButton} onClick={()=>setSource("wht")}>{tr("classify")}<ArrowRight size={14}/></button><a className={css.textButton} href="https://efiling.rd.go.th/" target="_blank" rel="noreferrer" aria-label={`${tr("ef")} · ${tr("outgoing")}`}>{tr("ef")}<ExternalLink size={14}/></a></div></article>:null}
     <p>{tr("efHelp")}</p>
    </section>
   </div></section>
   {summary.incomplete?<div className={css.note}><Info size={17}/><p>{tr("incomplete")}</p></div>:null}
  </>:null}
  {filingYear&&view==="history"?<>
   <div className={css.sectionHead}><h2>{tr("history")} {yearLabel(year)}</h2><span>{tr("currency")}</span></div>
   <div className={css.tableWrap}><table className={css.table}><thead><tr>{["filingMonth","net","outgoing","filingState","details"].map(k=><th key={k} scope="col">{tr(k)}</th>)}</tr></thead><tbody>{filingYear.rows.map(r=><tr key={r.filingMonth} data-period-state={r.status} data-current={r.filingMonth===currentBangkokMonth()}><th scope="row">{monthName(r.filingMonth)}<small className={css.historyPeriod}>{tr("taxPeriod")}: {monthName(r.taxPeriod)}</small></th><td data-label={tr("net")}>{money(r.net)}</td><td data-label={tr("outgoing")}>{money(r.outgoing)}</td><td><span className={css.filingState} data-state={r.status}><i/>{tr(r.status)}</span></td><td><button className={css.detailButton} onClick={()=>openMonth(r.filingMonth)} aria-label={`${tr("details")} · ${monthName(r.filingMonth)} · ${tr("taxPeriod")}: ${monthName(r.taxPeriod)}`}>{tr("details")}<ChevronRight size={14}/></button></td></tr>)}</tbody></table></div>
   <div className={css.note}><Info size={17}/><p>{tr("yearNote")}</p></div>
  </>:null}
  {annual&&filingYear&&view==="year"?<>
   <section><div className={css.sectionHead}><h2>{tr("annualSummary")} {yearLabel(year)}</h2><span>{tr("currency")}</span></div>
    <p className={css.periodBasis}>{tr("annualMoneyBasis",{year:yearLabel(year)})}</p><div className={css.yearMetrics}>{(["output","input","net","outgoing","incoming"] as const).map(key=><article className={css.metric} key={key} data-kind={key}><span className={css.icon}>{key==="incoming"?<ShieldCheck size={21}/>:key==="outgoing"?<ArrowDownToLine size={21}/>:<FileText size={21}/>}</span><div><h3>{tr(key==="incoming"?"credit":key)}</h3><strong data-metric>{money(annual[key])}</strong></div></article>)}<article className={css.metric} data-kind="progress"><span className={css.icon}><CalendarDays size={21}/></span><div><h3>{tr("filingState")}</h3><strong>{tr("filedCount",{count:filingYear.complete})}</strong><progress value={filingYear.complete} max={12} aria-label={tr("filedCount",{count:filingYear.complete})}/></div></article></div>
   </section>
   <section className={css.yearPanel}><div className={css.sectionHead}><h2>{tr("filingOverview")}</h2><span>{yearLabel(year)}</span></div><div className={css.yearOverview}>
    <div className={css.completeness}><div className={css.ring} role="img" aria-label={tr("filedCount",{count:filingYear.complete})} style={{background:`conic-gradient(#13835b 0 ${filingYear.complete/12*100}%, #e8eef4 ${filingYear.complete/12*100}% 100%)`}}><div><strong>{filingYear.complete}/12</strong><span>{tr("monthsUnit")}</span></div></div><div className={css.stateLegend}>{(["complete","outstanding","future"] as const).map(state=><div key={state}><span className={css.filingState} data-state={state}><i/>{tr(state)}</span><strong>{filingYear.rows.filter(r=>r.status===state).length}</strong></div>)}</div></div>
    <div className={css.monthGrid}>{filingYear.rows.map(r=><button key={r.filingMonth} className={css.monthTile} data-state={r.status} aria-label={`${tr("details")} · ${monthName(r.filingMonth)} · ${tr("taxPeriod")}: ${monthName(r.taxPeriod)} · ${tr(r.status)}`} onClick={()=>openMonth(r.filingMonth)}><span>{monthLabel(r.filingMonth,"short")}</span><small className={css.tilePeriod}>{tr("taxPeriod")}: {monthLabel(r.taxPeriod,"short")}{r.taxPeriod.slice(0,4)!==year?` ${yearLabel(r.taxPeriod.slice(0,4))}`:""}</small><span className={css.filingState} data-state={r.status}><i/>{tr(r.status)}</span></button>)}</div>
   </div></section>
   <section className={css.yearPanel}><div className={css.sectionHead}><h2>{tr("monthlyTrend")}<span className={css.chartPeriod}>{tr("taxPeriodYear",{year:yearLabel(year)})}</span></h2><div className={css.chartLegend}><span><i/>{tr("net")}</span><span><i/>{tr("outgoing")}</span></div></div><TaxYearChart rows={annual.rows} money={money} monthLabel={m=>monthLabel(m,"short")} labels={[tr("net"),tr("outgoing")]} unknown={tr("unknown")}/></section>
   <div className={css.note}><Info size={17}/><p>{tr("yearNote")}</p></div>
  </>:null}
  {source&&!expenseInput&&data&&summary?<DetailModal variant="detail" open title={tr(source==="credit"?"credit":source==="pendingInput"?"pending":source==="input"?"inputEvidence":"sources")} size="workflow" onClose={()=>setSource(null)}><div className={css.sourceList}>
   {source==="wht"?summary.whtSources.map(s=>{const trace=withholdingTrace(s);const f=data.filing.filings.find(f=>f.status==="filed"&&filingCoverage(f.source_snapshot_json).sources.some(x=>x.id===s.id));return <article key={s.id}><strong>{s.payee_name} · {trace.title}</strong><p>{date(s.date)} · {tr("gross")} {money(trace.gross)} · WHT {money(s.amount)} · {tr("cash")} {money(trace.cash)}</p><p>{tr(f?.remittance?.status==="confirmed"?"paid":f?"filed":"outstanding")}</p>{trace.expenseId?<Link href={`/finance/expenses/${trace.claim?"claims/":""}${trace.expenseId}`}>{tr("expenseSource")}</Link>:null} · <Link href={`/finance/payouts/${s.source_id}`}>{tr("paymentSource")}</Link></article>;}):source==="credit"?summary.credits.map(c=><article key={c.key}><strong>{c.reference}</strong><p>{tr("base")} {money(c.base)} · {c.rate===null?"—":`${c.rate}%`} · {money(c.amount)} · {t(`taxPosition.${c.evidence}`)}</p><Link href={c.source==="payment"?`/finance/payments/${c.sourceId}`:`/finance/direct-money/${c.sourceId}`}>{tr("details")}</Link></article>):source==="vat"?<VatSources data={data}/>:<>
    {inputExpenses.map(e=><article key={e.id}><strong>{e.vendor||tr("sources")} · {e.reference||"—"}</strong><p>{date(e.invoice_date)} · {tr("base")} {money(e.tax_base)} · VAT {money(e.vat_amount)} · {tr(e.status==="pending"?"pendingEvidence":e.status)}</p>{data.inputs.can_manage?<button className={ui.secondary} onClick={()=>setExpenseInput(e)}>{tr(e.status==="pending"?"reviewInput":"correctInput")}</button>:<Link href={`/finance/expenses${e.origin==="employee_claim"?"/claims":""}/${e.id}`}>{tr("details")}</Link>}</article>)}
    {inputExternal.map(e=><article key={e.id}><strong>{e.vendor} · {e.invoice_number}</strong><p>{date(e.invoice_date)} · {tr("base")} {money(e.tax_base)} · VAT {money(e.vat_amount)}</p><p>{tr(externalVatStatus(e)==="pending"?"pendingEvidence":externalVatStatus(e))} · {tr("funding")}</p><p>{e.note}</p>{e.review?<p>{e.review.reason}</p>:null}{data.inputs.can_manage?<button className={ui.secondary} onClick={()=>{setSource(null);setExternal(e);}}>{tr(externalVatStatus(e)==="pending"?"reviewInput":"correctInput")}</button>:null}</article>)}
   </>}
   {(source==="input"||source==="pendingInput")&&!inputExpenses.length&&!inputExternal.length?<p>{tr("empty")}</p>:null}
  </div></DetailModal>:null}
  {filing?<TaxFilingWorkspace permissions={permissions} initialMonth={taxPeriod} initialType={filing} onExit={()=>{setFiling(null);refresh();}}/>:null}
  {external?<ExternalInputForm row={external==="new"?undefined:external} onClose={()=>setExternal(null)} onSaved={()=>{setExternal(null);setSource(null);refresh();}}/>:null}
  {expenseInput?<ExpenseInputReview source={expenseInput} onClose={()=>setExpenseInput(null)} onSaved={()=>{setExpenseInput(null);setSource(null);refresh();}}/>:null}
 </div></PageShell>;
}

// Scale existing monthly amounts for display only; missing VAT is never plotted as zero.
function TaxYearChart({rows,money,monthLabel,labels,unknown}:{rows:ReturnType<typeof taxYearSummary>["rows"];money:(value:number|null)=>string;monthLabel:(month:string)=>string;labels:[string,string];unknown:string}) {
 const values=rows.flatMap(r=>[r.net,r.outgoing]).filter((v):v is number=>v!==null);
 const maximum=Math.max(1,...values),minimum=Math.min(0,...values),range=maximum-minimum;
 const y=(value:number)=>150-(value-minimum)/range*130,zero=y(0);
 return <div className={css.chart}><svg viewBox="0 0 960 185" role="img" aria-label={labels.join(" / ")}>
  {[0,0.5,1].map(fraction=>{const value=minimum+range*fraction;return <g key={fraction}><line x1="72" x2="955" y1={y(value)} y2={y(value)} stroke="#e5ebf2"/><text x="62" y={y(value)+4} textAnchor="end" className={css.axis}>{value.toLocaleString(undefined,{maximumFractionDigits:0})}</text></g>;})}
  {rows.map((row,i)=><g key={row.month}><title>{monthLabel(row.month)} · {labels[0]}: {money(row.net)} · {labels[1]}: {money(row.outgoing)}</title>{[row.net,row.outgoing].map((value,j)=>value===null?<text key={j} x={93+i*73+j*19} y={zero-5} textAnchor="middle" className={css.axis}>—</text>:<rect key={j} x={85+i*73+j*19} y={Math.min(zero,y(value))} width="14" height={Math.abs(zero-y(value))} rx="2" fill={j===0?"#3579cd":"#e8a04a"}/>)}<text x={103+i*73} y="178" textAnchor="middle" className={css.axis}>{monthLabel(row.month)}</text></g>)}
 </svg><div className={css.chartMonths}>{rows.map(row=><span key={row.month} title={`${labels[0]}: ${money(row.net)} · ${labels[1]}: ${money(row.outgoing)}`}><strong>{monthLabel(row.month)}</strong><span>{row.net===null?"—":money(row.net).replace(" THB","")}</span><span>{money(row.outgoing).replace(" THB","")}</span></span>)}</div>{rows.some(r=>r.net===null)?<p className={css.muted}>— {labels[0]}: {unknown}</p>:null}</div>;
}
