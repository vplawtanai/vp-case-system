"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import type { Expense } from "./shared";
import css from "../statement/statement.module.css";
export type EconomicChoiceValue = { treatment: string; vatChoice: string; vat: string };
export const emptyEconomicChoice: EconomicChoiceValue = { treatment: "", vatChoice: "", vat: "" };
export function reducedVatRequired(gross: number, original: number, vat: number) { return gross > 0 && gross < original && vat > 0; }
export function economicChoiceValid(v: EconomicChoiceValue, reduced: boolean, maximum: number) {
 return ["COMPANY_COST","CLIENT_RECOVERABLE"].includes(v.treatment) && (!reduced || v.vatChoice === "none" || (v.vatChoice === "specified" && /^\d+(?:\.\d{1,2})?$/.test(v.vat) && Number(v.vat) >= 0 && Number(v.vat) <= maximum));
}
export const economicVat = (v: EconomicChoiceValue, reduced: boolean) => !reduced ? null : v.vatChoice === "none" ? 0 : Number(v.vat);
export function EconomicChoice({ value, onChange, disabled, reduced = false, originalVat = 0, maximum = 0 }: { value: EconomicChoiceValue; onChange: (v:EconomicChoiceValue)=>void; disabled?: boolean; reduced?: boolean; originalVat?: number; maximum?: number }) {
 const { t, locale } = useI18n(), w = (k:string)=>t(`statement.${k}`);
 return <div className={css.choice} data-economic-choice><label>{w("burden")}<select aria-label={w("burden")} required disabled={disabled} value={value.treatment} onChange={e=>onChange({...value,treatment:e.target.value})}><option value="">{w("choose")}</option>{["COMPANY_COST","CLIENT_RECOVERABLE"].map(k=><option key={k} value={k}>{w(k)}</option>)}</select></label><p>{w("unitNote")}</p>
  {reduced ? <><p>{w("originalVat")}: {originalVat.toLocaleString(locale,{minimumFractionDigits:2})} THB</p><label>{w("approvedVat")}<select aria-label={w("approvedVat")} required disabled={disabled} value={value.vatChoice} onChange={e=>onChange({...value,vatChoice:e.target.value})}><option value="">{w("choose")}</option><option value="none">{w("noVat")}</option><option value="specified" disabled={maximum===0}>{w("specifyVat")}</option></select></label>{value.vatChoice==="specified"?<label>{w("approvedVat")}<input required type="number" min="0" max={maximum} step="0.01" disabled={disabled} value={value.vat} onChange={e=>onChange({...value,vat:e.target.value})}/></label>:null}</> : null}
 </div>;
}
type Context = { approved_gross: number; original_gross: number; source_vat: number; recoverable_vat: number | null };
type Economics = { context: Context; effective: boolean; can_manage: boolean; decision: {id:string;treatment:string;approved_recoverable_vat:number|null;reason:string;created_at:string} | null };
export function ExpenseEconomicPanel({ row, canManage }: { row: Expense; canManage: boolean }) {
 const {t}=useI18n(),w=(k:string)=>t(`statement.${k}`);
 const [data,setData]=useState<Economics|null>(null),[choice,setChoice]=useState(emptyEconomicChoice),[reason,setReason]=useState(""),[error,setError]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const attempt=useRef<Record<string,unknown>|null>(null),lock=useRef(false);
 useEffect(()=>{let live=true;void supabase.rpc("get_finance_expense_economics",{p_expense:row.id}).then(r=>{if(live){if(r.error||!r.data?.context)setError(true);else setData(r.data);}},()=>{if(live)setError(true);});return()=>{live=false;};},[row.id,row.tax_review?.id,row.settlement?.id,reload]);
 const c=data?.context,reduced=c?reducedVatRequired(c.approved_gross,c.original_gross,c.source_vat):false,max=c?Math.min(c.approved_gross,c.recoverable_vat||0):0;
 async function save(e:React.FormEvent){e.preventDefault();if(lock.current||!data?.can_manage)return;if(!attempt.current){if(!economicChoiceValid(choice,reduced,max)||!reason.trim()||c?.recoverable_vat==null)return;attempt.current={p_id:crypto.randomUUID(),p_expense:row.id,p_previous:data.decision?.id||null,p_treatment:choice.treatment,p_approved_vat:economicVat(choice,reduced),p_reason:reason};}
  lock.current=true;setBusy(true);setError(false);try{const r=await supabase.rpc("classify_finance_expense",attempt.current);if(r.error)throw r.error;attempt.current=null;setUncertain(false);setChoice(emptyEconomicChoice);setReason("");setReload(n=>n+1);}catch{setError(true);setUncertain(true);}finally{lock.current=false;setBusy(false);}}
 return <details className={css.economic}><summary>{w(data?.effective&&data.decision?data.decision.treatment:"UNCLASSIFIED")}</summary>
  {data?.decision&&!data.effective&&c?.recoverable_vat!=null?<Callout tone="warning">{w("stale")}</Callout>:null}{data?.decision?<p className={css.note}>{data.decision.reason}</p>:null}
  {error?<Callout tone="negative">{w("failure")}</Callout>:null}
  {canManage&&data?.can_manage&&c&&c.approved_gross>0?<form className={css.form} onSubmit={e=>void save(e)}><strong>{w(data.decision?"correct":"classify")}</strong>{c.recoverable_vat==null?<Callout tone="warning">{w("vatUnresolved")}</Callout>:<>
   <EconomicChoice value={choice} onChange={setChoice} disabled={busy||uncertain} reduced={reduced} maximum={max} originalVat={c.source_vat}/><label>{w("reason")}<textarea required maxLength={2000} disabled={busy||uncertain} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className={ui.secondary} disabled={busy||(!uncertain&&(!reason.trim()||!economicChoiceValid(choice,reduced,max)))}>{w("save")}</button>
  </>}</form>:null}
 </details>;
}
