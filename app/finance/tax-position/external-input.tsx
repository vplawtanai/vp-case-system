"use client";
import { useRef, useState } from "react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import type { ExternalVat } from "./period-data";
import css from "./tax-home.module.css";
export function ExternalInputForm({ row, onClose, onSaved }: { row?: ExternalVat; onClose: () => void; onSaved: () => void }) {
 const { t } = useI18n(), tr = (k:string) => t(`taxHome.${k}`);
 const [values,setValues]=useState({vendor:"",invoice_date:"",invoice_number:"",tax_base:"",vat_amount:"",note:""});
 const [status,setStatus]=useState("eligible"),[reason,setReason]=useState(""),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const attempt=useRef<{rpc:string;args:Record<string,unknown>}|null>(null),lock=useRef(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);
  if(!attempt.current)attempt.current=row?{rpc:"review_finance_external_input_vat",args:{p_id:crypto.randomUUID(),p_evidence:row.id,p_previous:row.review?.id||null,p_status:status,p_reason:reason,p_acknowledged:ack}}:{rpc:"save_finance_external_input_vat",args:{p_id:crypto.randomUUID(),p_input:{...values,tax_base:Number(values.tax_base),vat_amount:Number(values.vat_amount),funding_source:"third_party_no_reimbursement"},p_acknowledged:ack}};
  try{const r=await supabase.rpc(attempt.current.rpc,attempt.current.args);if(r.error)throw r.error;onSaved();}catch{setFailed(true);}finally{lock.current=false;setBusy(false);}
 }
 return <DetailModal open title={tr("external")} size="edit" onClose={()=>{if(!busy)onClose();}} closeOnBackdrop={false}>
  <form className={css.form} onSubmit={submit}><p>{tr("funding")}</p><Callout tone="info">{tr("noCash")}</Callout>
   <fieldset disabled={busy||failed}>{row?<><strong>{row.vendor} · {row.invoice_number}</strong><FieldGroup id="external-status" label={tr("saveReview")}><select value={status} onChange={e=>setStatus(e.target.value)}>{["eligible","ineligible","pending"].map(s=><option key={s} value={s}>{tr(s==="pending"?"pendingEvidence":s)}</option>)}</select></FieldGroup><FieldGroup id="external-reason" label={tr("reason")}><textarea required maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></FieldGroup></>:Object.entries(values).map(([key,value])=><FieldGroup key={key} id={`external-${key}`} label={tr(({invoice_date:"invoiceDate",invoice_number:"invoiceNumber",tax_base:"base",vat_amount:"vat"} as Record<string,string>)[key]||key)}>{key==="note"?<textarea required maxLength={2000} value={value} onChange={e=>setValues({...values,[key]:e.target.value})}/>:<input required type={key==="invoice_date"?"date":["tax_base","vat_amount"].includes(key)?"number":"text"} min={0.01} step="0.01" max={key==="vat_amount"?Number(values.tax_base)||undefined:undefined} maxLength={key==="vendor"?300:200} value={value} onChange={e=>setValues({...values,[key]:e.target.value})}/>}</FieldGroup>)}
   <label className={css.ack}><input type="checkbox" required checked={ack} onChange={e=>setAck(e.target.checked)}/>{tr("ack")}</label></fieldset>
   {failed?<Callout tone="negative">{tr("failed")}</Callout>:null}<button className={ui.primary} type="submit" disabled={busy}>{failed?t("common.actions.retry"):tr(row?"saveReview":"save")}</button>
  </form>
 </DetailModal>;
}
