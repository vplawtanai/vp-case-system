import {isAssignablePerson,type PeopleProfile} from '../../../lib/people';
export const PAYROLL_COOKIE = 'vp-payroll-session';
export type Engagement = {id:string; kind:'employee'|'contractor'; active:boolean; effective_from:string; reason:string};
export type Rate = {id:string; monthly_amount:number; effective_from:string; reason:string};
export type Person = {id:string;profile_id:string|null;legal_name:string;version:number;is_active:boolean;tax_id:string|null;destination:{id:string;bank_name?:string;account_number?:string;is_active?:boolean}|null;engagements:Engagement[];rates:Rate[]};
export type Period = {id:string;month:string;target_payment_date:string;status:'draft'|'approved';payment_status:'draft'|'approved'|'partially_paid'|'paid';version:number;note:string;line_count:number;net_total:number};
export type Payment = {id:string;version:number;status:'draft'|'confirmed';bank_account_id:string|null;cash_location_id:string|null;paid_on:string;prepare:{payee_version:number;destination_id:string|null}};
export type Line = {id:string;period_id:string;payee_id:string;kind:'employee'|'contractor';name:string;service_from:string;service_to:string;base_amount:number;additions:number;deductions:number;employee_ss:number;employer_ss:number;wht_treatment:'none'|'withhold';wht_amount:number;gross_amount:number;net_amount:number;requires_base_review:boolean;reviewed:boolean;adjustment_reason:string;note:string;payment:Payment|null;source_json?:{manual_review_reasons?:ReviewReason[];rate_intervals?:{rate:Rate;overlap_from:string;overlap_to:string}[]}};
export type Obligation = {id:string;month:string;name:string;kind:'employee_wht'|'contractor_wht'|'employee_ss'|'employer_ss';amount:number;status:'pending'};
export type Account = {bank_account_id:string|null;cash_location_id:string|null;name_th:string;name_en:string};
export type PayrollNewPerson = import('../payouts/shared').Payee & {display_label:string};
export type PayrollData = {people:Person[];people_options:import('../payouts/shared').Payee[];new_people_options:PayrollNewPerson[];periods:Period[];lines:Line[];obligations:Obligation[];accounts:Account[];today:string};
// Finance's internal payee identity is the existing user_profile ID. External
// payees remain valid in Expense/Payables, but are not a Payroll setup source.
export const isInternalPayrollIdentity=(person:{id:string;profile_id:string|null})=>!!person.profile_id&&person.id===person.profile_id;
export function payrollPeopleOptions(options:PayrollData['people_options']){
 return options.filter(p=>p.kind==='internal'&&p.entity_type==='natural_person'&&isInternalPayrollIdentity(p));
}
export function payrollSetupPeople(data:Pick<PayrollData,'people'|'people_options'>){
 const ids=new Set(payrollPeopleOptions(data.people_options).map(p=>p.id));
 return data.people.filter(p=>isInternalPayrollIdentity(p)&&ids.has(p.id));
}
export const hasPayrollHistory=(person:Person|undefined)=>!!person&&(person.engagements.length>0||person.rates.length>0);
// Eligibility applies to first entry only, never to historical People or period facts.
export function newPayrollPeople(data:Pick<PayrollData,'people'|'people_options'>,profiles:PeopleProfile[]):PayrollNewPerson[]{
 const existing=new Set(data.people.filter(hasPayrollHistory).map(p=>p.id));
 const options=payrollPeopleOptions(data.people_options).flatMap(payee=>{
  const profile=profiles.find(p=>p.id===payee.profile_id);
  if(!profile||!isAssignablePerson(profile)||existing.has(payee.id))return [];
  const name=profile.staff_name?.trim()||profile.full_name?.trim()||payee.legal_name;
  return [{...payee,display_label:`${name} · ${profile.email?.trim()||profile.id}`}];
 });
 // Never merge identities by name. Even identical names/emails retain distinct IDs.
 return options.map(p=>({...p,display_label:options.filter(x=>x.display_label===p.display_label).length>1?`${p.display_label} · ${p.id}`:p.display_label}));
}
// Do not silently turn an existing external engagement into new Payroll lines.
// This is an application scope check only; the RPC still owns period validation.
export function hasExternalPayrollSource(data:Pick<PayrollData,'people'|'people_options'>,month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month))throw Error('PAYROLL_MONTH_INVALID');
 const internalIds=new Set(payrollSetupPeople(data).map(p=>p.id));
 return data.people.some(p=>!internalIds.has(p.id)&&(
  effective(p.engagements,month)?.active||p.engagements.some(e=>e.active&&e.effective_from.slice(0,7)===month.slice(0,7))
 ));
}
export const accountKey=(a:Account)=>a.bank_account_id||a.cash_location_id||'';
export function effective<T extends {effective_from:string}>(events:T[],on:string):T|undefined{return [...events].filter(e=>e.effective_from<=on).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0];}
// Landing guidance only; period creation/approval still use the existing RPC guards.
// Use the server's Bangkok date and effective history, not login-account existence.
export function payrollLandingTab({people,today}:Pick<PayrollData,'people'|'today'>):'people'|'periods'{
 const ready=people.some(person=>{
  const engagement=effective(person.engagements,today),rate=effective(person.rates,today);
  return person.is_active&&engagement?.active
   &&isInternalPayrollIdentity(person)
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

// Read-only guidance using the same half-open effective intervals as 090.
// The database owns draft creation, review and approval.
export type ReviewReason='engagement_starts_mid_month'|'engagement_ends_mid_month'|'rate_starts_after_service_start'|'rate_ends_before_service_end'|'rate_changes_during_service';
export function payrollMonthReadiness(person:Person,month:string){
 const from=month.slice(0,7)+'-01';
 const end=new Date(Date.UTC(Number(from.slice(0,4)),Number(from.slice(5,7)),1)).toISOString().slice(0,10);
 const events=[...person.engagements].sort((a,b)=>a.effective_from.localeCompare(b.effective_from));
 const rates=[...person.rates].sort((a,b)=>a.effective_from.localeCompare(b.effective_from));
 const segments=events.flatMap((e,i)=>{
  const start=e.effective_from>from?e.effective_from:from,until=events[i+1]?.effective_from||'9999-12-31',to=until<end?until:end;
  if(!e.active||start>=to)return [];
  const overlapping=rates.flatMap((r,j)=>{const until=rates[j+1]?.effective_from||'9999-12-31';return r.effective_from<to&&until>start?[{rate:r,until}]:[];});
  const reasons:ReviewReason[]=[];
  if(start>from)reasons.push('engagement_starts_mid_month');
  if(to<end)reasons.push('engagement_ends_mid_month');
  if(overlapping[0]?.rate.effective_from>start)reasons.push('rate_starts_after_service_start');
  if(overlapping.some(r=>r.until<to))reasons.push('rate_ends_before_service_end');
  if(overlapping.length>1)reasons.push('rate_changes_during_service');
  return [{from:start,to,rates:overlapping.map(r=>r.rate),reasons}];
 });
 const missing=!segments.length?'engagement':segments.some(s=>!s.rates.length)?'rate':segments.length>1?'mixed':!person.is_active?'payee':null;
 return {missing,reasons:[...new Set(segments.flatMap(s=>s.reasons))],segments} as const;
}
export function payrollPaymentReadiness(person:Person){
 const recipient=person.is_active&&person.version>0&&!!person.legal_name.trim();
 const destination=person.destination;
 const bank=recipient&&!!destination?.id&&destination.is_active!==false&&!!destination.bank_name?.trim()&&!!destination.account_number?.trim();
 const last=destination?.account_number?.replace(/\D/g,'').slice(-4)||'';
 return {recipient,bank,summary:bank?`${destination!.bank_name} \u2022\u2022\u2022\u2022${last}`:''};
}
