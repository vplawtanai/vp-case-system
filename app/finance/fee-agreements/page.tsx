"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FinanceSubNav, QuotationGuard } from "../quotations/shared";
import { supabase } from "../../../lib/supabase";

type Agreement = Record<string, unknown>;
const label = (v: unknown, fallback = "-") => String(v || fallback);

export default function FeeAgreementsPage() {
  return <QuotationGuard>{(access) => <List access={access} />}</QuotationGuard>;
}
function List({ access }: { access: { permissions: { canViewFinanceQuotations: boolean } } }) {
  const [rows, setRows] = useState<Agreement[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [method, setMethod] = useState("all"); const [source, setSource] = useState("all");
  useEffect(() => { (async () => { const r = await supabase.from("finance_fee_agreements").select("id,agreement_no,title,client_id,case_id,advisory_matter_id,source_type,source_reference,status,billing_method,amount_before_tax,vat_amount,total_amount,effective_date,created_at,client_snapshot_json,matter_snapshot_json,source_document_snapshot_json").order("created_at", { ascending: false }); if (r.error) setError("Unable to load Fee Agreements."); else setRows((r.data || []) as Agreement[]); setLoading(false); })(); }, []);
  const filtered = useMemo(() => rows.filter((r) => { const c=(r.client_snapshot_json as Record<string,unknown>|null)?.name; const m=(r.matter_snapshot_json as Record<string,unknown>|null)?.title; const q=(r.source_document_snapshot_json as Record<string,unknown>|null)?.quotation_no; const hay=[r.title,r.agreement_no,c,m,q,r.source_reference].map(x=>String(x||"").toLowerCase()).join(" "); return (!search || hay.includes(search.toLowerCase())) && (status==="all"||r.status===status) && (method==="all"||r.billing_method===method) && (source==="all"||r.source_type===source); }),[rows,search,status,method,source]);
  return <main style={{maxWidth:1180,margin:"0 auto",padding:24}}><FinanceSubNav activePage="fee-agreements" permissions={access.permissions as never}/><h1>Fee Agreements</h1><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}><input placeholder="Search agreements" value={search} onChange={e=>setSearch(e.target.value)}/>{[[status,setStatus,["all","draft","active","completed","cancelled"]],[method,setMethod,["all","single","installments","milestone","recurring","manual"]],[source,setSource,["all","quotation","master_rate","retainer","manual","legacy"]]].map(([v,set,opts],i)=><select key={i} value={v as string} onChange={e=>(set as (x:string)=>void)(e.target.value)}>{(opts as string[]).map(x=><option key={x}>{x}</option>)}</select>)}</div>{loading?<p>Loading Fee Agreements...</p>:error?<p>{error}</p>:filtered.length===0?<p>{rows.length?"No results matching filters.":"No Fee Agreements."}</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th>Agreement</th><th>Client / Matter</th><th>Source</th><th>Status</th><th>Method</th><th>Total</th><th>Effective</th><th>Created</th></tr></thead><tbody>{filtered.map(r=><tr key={label(r.id)}><td><Link href={`/finance/fee-agreements/${label(r.id)}`}>{label(r.title)}{r.agreement_no?` (${label(r.agreement_no)})`:""}</Link></td><td>{label((r.client_snapshot_json as Record<string,unknown>|null)?.name)}<br/><small>{label((r.matter_snapshot_json as Record<string,unknown>|null)?.title,"Client-level agreement")}</small></td><td>{label((r.source_document_snapshot_json as Record<string,unknown>|null)?.quotation_no,r.source_reference?label(r.source_reference):label(r.source_type))}</td><td>{label(r.status)}</td><td>{label(r.billing_method)}</td><td>{Number(r.total_amount||0).toLocaleString("en-US",{minimumFractionDigits:2})} THB</td><td>{label(r.effective_date)}</td><td>{label(r.created_at).slice(0,10)}</td></tr>)}</tbody></table></div>}</main>;
}
