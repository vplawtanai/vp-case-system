import type { UserPermissions } from "../../../lib/permissions";
import type { TreasuryData } from "../treasury/shared";
import type { CompanyStatementData } from "../statement/company/workspace";
import type { StatementData } from "../statement/workspace";
import type { RevenueWorkspaceData } from "../revenue-distribution/shared";
import type { TaxMonth } from "../tax-position/period-data";
import type { TaxPositionData } from "../tax-position/shared";
import { satang } from "../statement/overview-data";
export type Read = (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown }>;
export type Result<T> = { status: "ready"; value: T } | { status: "denied" | "error" };
export type Currency = { currency: string; [key: string]: string | number | null };
export type Aggregate = { schema_version: 1; semantics: "current" | "period"; as_of: string; timezone: string; currencies: Currency[]; from_date?: string; to_date?: string; due_soon_from?: string; due_soon_through?: string };
export type Economic = { income: CompanyStatementData; expenses: StatementData; alerts: StatementData };
export type Data = { treasury: Result<TreasuryData>; cash: Result<Aggregate>; economic: Result<Economic>; receivables: Result<Aggregate>; payables: Result<Aggregate>; participants: Result<Aggregate>; distribution: Result<RevenueWorkspaceData>; tax: Result<{ month: TaxMonth; register: TaxPositionData }>; loadedAt: string };
const fields = {
 cash: ["external_inflow_count", "external_inflow", "external_outflow_count", "external_outflow", "internal_transfer_count", "internal_transfer_amount"],
 receivables: ["outstanding_count", "outstanding_amount", "overdue_count", "overdue_amount", "due_soon_count", "due_soon_amount", "no_due_date_count", "no_due_date_amount"],
 payables: ["outstanding_count", "outstanding_amount", "company_purchase_count", "company_purchase_amount", "reimbursement_count", "reimbursement_amount", "overdue_count", "overdue_amount", "due_soon_count", "due_soon_amount", "no_due_date_count", "no_due_date_amount"],
 participants: ["unpaid_entitlement_count", "unpaid_participant_count", "unpaid_amount"],
};
export const canOverview = (p: UserPermissions) => p.canViewFinanceCashTransactions || p.canViewFinanceQuotations || p.canViewFinancePayments || p.canViewFinanceTaxInvoices;
export function monthDates(month: string) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Invalid month");
 const [y,m] = month.split("-").map(Number);
 return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(y,m,0)).getUTCDate()}` };
}
const array = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw Error("Invalid rows"); return v; };
const count = (v: unknown) => { if (!Number.isSafeInteger(v) || Number(v)<0) throw Error("Invalid count"); };
export function aggregate(value: unknown, domain: keyof typeof fields): Aggregate {
 const v=value as Aggregate;
 if (!v || v.schema_version!==1 || v.semantics!==(domain==="cash"?"period":"current") || v.timezone!=="Asia/Bangkok" || !Number.isFinite(Date.parse(v.as_of))) throw Error("Invalid summary contract");
 const seen=new Set<string>();
 for (const row of array(v.currencies) as Currency[]) {
  if (!/^[A-Z]{3}$/.test(row.currency) || seen.has(row.currency)) throw Error("Invalid currency"); seen.add(row.currency);
  for (const key of fields[domain]) { if (key.endsWith("_count")) count(row[key]); else { if(satang(row[key])<0) throw Error("Negative amount"); } }
 }
 return v;
}
// Present authoritative account balances from ONE Treasury snapshot. No cash-row scan.
export function liquidity(data: TreasuryData, today: string) {
 const seen=new Set<string>();const cutoff=new Date(`${today}T00:00:00+07:00`).getTime();
 const accounts=data.accounts.map(a=>{const key=`${a.kind}:${a.account_id}`;if(seen.has(key)||!['bank','cash'].includes(a.kind)||!/^[A-Z]{3}$/.test(a.currency)) throw Error("Invalid account");seen.add(key);
  const known=!!a.opening_id && !!a.opening_as_of && new Date(a.opening_as_of).getTime()<cutoff && a.system_balance!==null;
  if(a.system_balance!==null)satang(a.system_balance);
  return {...a,known};
 });
 const currencies=[...new Set(accounts.map(a=>a.currency))].sort();
 return {accounts,unknown:accounts.filter(a=>!a.known).length,totals:currencies.map(currency=>{
  const rows=accounts.filter(a=>a.currency===currency);
  const balance=(kind?:string)=>{const subset=rows.filter(a=>!kind||a.kind===kind);return subset.some(a=>!a.known)?null:add(subset.map(a=>a.system_balance!));};
  return {currency,total:balance(),bank:balance('bank'),cash:balance('cash')};
 })};
}
export function add(values:number[]) { const n=values.reduce((s,v)=>{const next=s+satang(v);if(!Number.isSafeInteger(next))throw Error("Money overflow");return next;},0);return n/100; }
// 069 owns per-currency Company Share. 070 expense sources are THB by schema.
// Never use 070's scalar income total: it has no currency dimension.
export function economics(e: Economic) {
 const values=new Map(e.income.totals.map(r=>[r.currency,r.amount]));
 if (values.size!==e.income.totals.length) throw Error("Duplicate currency");
 if (!values.has('THB')) values.set('THB',0);
 return [...values].sort(([a],[b])=>a.localeCompare(b)).map(([currency,income])=>{
  const expense=currency==='THB'?e.expenses.expense!:0;
  return {currency,income,expense,net:add([income,-expense])};
 });
}
export async function loadOverview(read: Read, p: UserPermissions, month: string, today: string, readTax: ()=>Promise<TaxMonth>): Promise<Data> {
 const {from,to}=monthDates(month);
 async function call<T>(name:string,args?:Record<string,unknown>):Promise<T> { const r=await read(name,args);if(r.error||!r.data||typeof r.data!=="object")throw Error("Read unavailable");return r.data as T; }
 async function optional<T>(enabled:boolean,load:()=>Promise<T>):Promise<Result<T>> { if(!enabled)return {status:'denied'};try{return {status:'ready',value:await load()};}catch{return {status:'error'};} }
 const access=optional(true,async()=>{const a=await call<{can_view_all:boolean}>('get_finance_expense_access');if(typeof a.can_view_all!=='boolean')throw Error('Invalid access');return a;});
 const economicArgs={p_type:'all',p_search:'',p_offset:0};
 const tasks={
  treasury:optional(p.canViewFinanceCashTransactions,async()=>{const r=await call<TreasuryData>('get_finance_treasury',{p_offset:0});array(r.accounts);liquidity(r,today);return r;}),
  cash:optional(p.canViewFinanceCashTransactions,async()=>{const r=aggregate(await call('get_finance_cash_flow_summary',{p_from:from,p_to:to}),'cash');if(r.from_date!==from||r.to_date!==to)throw Error('Stale period');return r;}),
  receivables:optional(p.canViewFinanceQuotations,async()=>aggregate(await call('get_finance_receivables_summary'),'receivables')),
  payables:(async():Promise<Result<Aggregate>>=>{const a=await access;if(a.status!=='ready')return a;return optional(a.value.can_view_all,async()=>aggregate(await call('get_finance_general_payables_summary'),'payables'));})(),
  participants:optional(p.canViewFinancePayments,async()=>aggregate(await call('get_finance_unpaid_participants_summary'),'participants')),
  economic:(async():Promise<Result<Economic>>=>{const a=await access;if(a.status!=='ready')return a;return optional(p.canViewFinancePayments&&a.value.can_view_all,async()=>{
   const [income,expenses,alerts]=await Promise.all([call<CompanyStatementData>('get_finance_company_statement',{p_month:from,p_source_type:'all',p_search:'',p_offset:0}),call<StatementData>('get_finance_unified_company_statement',{...economicArgs,p_from:from,p_to:to}),call<StatementData>('get_finance_unified_company_statement',{...economicArgs,p_from:'0001-01-01',p_to:today})]);
   array(income.totals);array(income.rows);count(income.count);count(income.excluded_count);for(const r of income.totals){if(!/^[A-Z]{3}$/.test(r.currency))throw Error('Invalid currency');satang(r.amount);}
   for(const r of [expenses,alerts]){array(r.rows);count(r.count);count(r.unclassified_count);satang(r.expense);}
   const e={income,expenses,alerts};economics(e);return e;
  });})(),
  distribution:optional(p.canViewFinancePayments,async()=>{const r=await call<RevenueWorkspaceData>('get_finance_revenue_distribution_workspace',{p_month:null,p_source_type:'all',p_status:'pending',p_search:'',p_offset:0});array(r.rows);array(r.summary);count(r.count);for(const row of r.summary){count(row.count);count(row.unresolved);if(!/^[A-Z]{3}$/.test(row.currency))throw Error('Invalid currency');if(row.amount!==null)satang(row.amount);}return r;}),
  tax:optional(p.canViewFinanceTaxInvoices||p.role==='partner',async()=>{const [m,register]=await Promise.all([readTax(),call<TaxPositionData>('get_finance_tax_position')]);array(register.facts);array(register.periods);return {month:m,register};}),
 };
 const [treasury,cash,receivables,payables,participants,economic,distribution,tax]=await Promise.all([tasks.treasury,tasks.cash,tasks.receivables,tasks.payables,tasks.participants,tasks.economic,tasks.distribution,tasks.tax]);
 return {treasury,cash,receivables,payables,participants,economic,distribution,tax,loadedAt:new Date().toISOString()};
}
