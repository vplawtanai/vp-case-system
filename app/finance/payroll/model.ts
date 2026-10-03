export const PAYROLL_COOKIE = 'vp-payroll-session';
export type Engagement = {id:string; kind:'employee'|'contractor'; active:boolean; effective_from:string; reason:string};
export type Rate = {id:string; monthly_amount:number; effective_from:string; reason:string};
export type Person = {id:string;profile_id:string|null;legal_name:string;version:number;is_active:boolean;tax_id:string|null;destination:{id:string}|null;engagements:Engagement[];rates:Rate[]};
export type Period = {id:string;month:string;target_payment_date:string;status:'draft'|'approved';payment_status:'draft'|'approved'|'partially_paid'|'paid';version:number;note:string;line_count:number;net_total:number};
export type Payment = {id:string;version:number;status:'draft'|'confirmed';bank_account_id:string|null;cash_location_id:string|null;paid_on:string;prepare:{payee_version:number;destination_id:string|null}};
export type Line = {id:string;period_id:string;payee_id:string;kind:'employee'|'contractor';name:string;service_from:string;service_to:string;base_amount:number;additions:number;deductions:number;employee_ss:number;employer_ss:number;wht_treatment:'none'|'withhold';wht_amount:number;gross_amount:number;net_amount:number;requires_base_review:boolean;reviewed:boolean;adjustment_reason:string;note:string;payment:Payment|null};
export type Obligation = {id:string;month:string;name:string;kind:'employee_wht'|'contractor_wht'|'employee_ss'|'employer_ss';amount:number;status:'pending'};
export type Account = {bank_account_id:string|null;cash_location_id:string|null;name_th:string;name_en:string};
export type PayrollData = {people:Person[];people_options:import('../payouts/shared').Payee[];periods:Period[];lines:Line[];obligations:Obligation[];accounts:Account[];today:string};
export const accountKey=(a:Account)=>a.bank_account_id||a.cash_location_id||'';
export function effective<T extends {effective_from:string}>(events:T[],on:string):T|undefined{return [...events].filter(e=>e.effective_from<=on).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0];}
// Landing guidance only; period creation/approval still use the existing RPC guards.
// Use the server's Bangkok date and effective history, not login-account existence.
export function payrollLandingTab({people,today}:Pick<PayrollData,'people'|'today'>):'people'|'periods'{
 const ready=people.some(person=>{
  const engagement=effective(person.engagements,today),rate=effective(person.rates,today);
  return person.is_active&&engagement?.active
   &&(engagement.kind==='contractor'||!!person.profile_id)
   &&!!rate&&Number.isFinite(Number(rate.monthly_amount))&&Number(rate.monthly_amount)>0;
 });
 return ready?'periods':'people';
}
export function netPay(l:Pick<Line,'base_amount'|'additions'|'deductions'|'employee_ss'|'wht_amount'>){return Math.round((Number(l.base_amount)+Number(l.additions)-Number(l.deductions)-Number(l.employee_ss)-Number(l.wht_amount))*100)/100;}
export function selectedTotal(lines:Line[]){return lines.reduce((n,l)=>n+Math.round(l.net_amount*100),0)/100;}
export function reviewInput(period:Period,line:Line,form:FormData){
 const number=(k:string)=>{const text=String(form.get(k)??'').trim();if(!/^\d+(\.\d{1,2})?$/.test(text))throw Error('PAYROLL_INPUT_INVALID');return Number(text);};
 return {period_id:period.id,version:period.version,line_id:line.id,base_amount:number('base_amount'),additions:number('additions'),deductions:number('deductions'),
  employee_ss:line.kind==='employee'?number('employee_ss'):0,employer_ss:line.kind==='employee'?number('employer_ss'):0,
  wht_treatment:String(form.get('wht_treatment')),wht_amount:number('wht_amount'),note:String(form.get('note')||'').trim(),adjustment_reason:String(form.get('adjustment_reason')||'').trim()};
}
export function paymentItems(lines:Line[],people:Person[],accounts:Account[],choices:Record<string,{account:string;date:string;id:string}>,action:'prepare'|'confirm'|'cancel'){
 return lines.map(l=>{const person=people.find(p=>p.id===l.payee_id);if(!person)throw Error('PAYROLL_PERSON_INVALID');
  if(action==='prepare'){const choice=choices[l.id],account=accounts.find(a=>accountKey(a)===choice?.account);if(!account||!choice.date)throw Error('PAYROLL_ACCOUNT_DENIED');
   return {line_id:l.id,payout_id:choice.id,bank_account_id:account.bank_account_id,cash_location_id:account.cash_location_id,paid_on:choice.date,payee_version:person.version,destination_id:account.bank_account_id?person.destination?.id||null:null};}
  if(!l.payment||l.payment.status!=='draft')throw Error('PAYROLL_PAYMENT_STALE');
  return {line_id:l.id,payout_id:l.payment.id,payout_version:l.payment.version,payee_version:person.version,destination_id:l.payment.bank_account_id?person.destination?.id||null:null};
 });
}
