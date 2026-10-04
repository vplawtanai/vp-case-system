import 'server-only';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {peopleClientsFor,type PeopleClients} from './people-admin';
import {PAYROLL_COOKIE,payrollPeopleOptions,hasPayrollHistory,newPayrollPeople,type PayrollData} from '../../app/finance/payroll/model';
import type {PeopleProfile} from '../people';
export class PayrollError extends Error {constructor(message:string,public status=400){super(message);}}
export async function authorizePayroll(caller:SupabaseClient){
 const u=await caller.auth.getUser();if(u.error||!u.data.user)throw new PayrollError('PAYROLL_UNAUTHORIZED',401);
 const p=await caller.from('user_profiles').select('id,role,active,must_change_password').eq('id',u.data.user.id).single();
 if(p.error||p.data?.role!=='admin'||p.data.active!==true||p.data.must_change_password!==false)throw new PayrollError('PAYROLL_ADMIN_REQUIRED',403);
}
export async function payrollPageAllowed(token:string){await authorizePayroll(peopleClientsFor(new Request('https://internal.invalid',{headers:{authorization:'Bearer '+token}})).caller);}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function readPayroll(caller:SupabaseClient,period:string|null=null):Promise<PayrollData>{
 const r=await caller.rpc('payroll089_read',{p_period:period});if(r.error)throw r.error;
 if(!r.data||!Array.isArray(r.data.people)||!Array.isArray(r.data.people_options)||!Array.isArray(r.data.periods))throw new PayrollError('PAYROLL_FAILED');
 return r.data;
}
async function readPeople(caller:SupabaseClient):Promise<PeopleProfile[]>{
 const r=await caller.rpc('people_admin_get_users');if(r.error)throw r.error;
 if(!Array.isArray(r.data))throw new PayrollError('PAYROLL_FAILED');return r.data;
}
export async function handlePayrollRequest(request:Request,supplied?:PeopleClients){
 let periodPeople:PayrollData['people']|undefined;
 try{
  const caller=(supplied||peopleClientsFor(request)).caller;await authorizePayroll(caller);
  if(request.method==='GET'){
   const url=new URL(request.url),period=url.searchParams.get('period'),month=url.searchParams.get('month');
   if(month&&!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month))throw new PayrollError('PAYROLL_MONTH_INVALID');
   // One statement snapshot binds the table/modal facts to correction tokens.
   const [snapshot,profiles]=await Promise.all([caller.rpc('payroll092_read',{p_month:month||null,p_period:period||null}),readPeople(caller)]);
   if(snapshot.error)throw snapshot.error;
   const data=snapshot.data;
   if(!data||!Array.isArray(data.people)||!Array.isArray(data.monthly?.rows)||!data.corrections)throw new PayrollError('PAYROLL_FAILED');
   return reply({...data,new_people_options:newPayrollPeople(data,profiles)});
  }
  if(request.method!=='POST')return reply({error:'PAYROLL_INPUT_INVALID'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new PayrollError('PAYROLL_ADMIN_REQUIRED',403);
  if(Number(request.headers.get('content-length')||0)>100000)throw new PayrollError('PAYROLL_INPUT_INVALID');
  const raw=await request.text();if(raw.length>100000)throw new PayrollError('PAYROLL_INPUT_INVALID');
  const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw new PayrollError('PAYROLL_INPUT_INVALID');
  if(b.action==='session'){
   const token=request.headers.get('authorization')?.slice(7)||'';if(!/^[A-Za-z0-9._-]+$/.test(token))throw new PayrollError('PAYROLL_UNAUTHORIZED',401);
   const response=reply({ready:true});response.headers.set('Set-Cookie',`${PAYROLL_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/finance/payroll; Max-Age=1800${new URL(request.url).protocol==='https:'?'; Secure':''}`);return response;
  }
  if(['engagement','rate','setup','setup_correct'].includes(b.action)){
   // Check the caller-visible internal People projection, not client-supplied
   // profile/kind fields. Keep the generic, already-applied 089 RPC unchanged.
   const data=await readPayroll(caller);
   if(!payrollPeopleOptions(data.people_options).some(p=>p.id===b.payload?.payee_id))throw new PayrollError('PAYROLL_INTERNAL_PERSON_REQUIRED');
   const person=data.people.find(p=>p.id===b.payload?.payee_id);
   if(!hasPayrollHistory(person)){
    if(!newPayrollPeople(data,await readPeople(caller)).some(p=>p.id===b.payload?.payee_id))throw new PayrollError('PAYROLL_PERSON_NOT_ELIGIBLE');
   }
   if(b.action==='engagement'&&!person?.engagements.length&&b.payload.active!==true)throw new PayrollError('PAYROLL_NEW_ENGAGEMENT_ACTIVE_REQUIRED');
  }
  let result;
  if(b.action==='setup_correct'){
   result=await caller.rpc('payroll093_correct',{p_kind:b.payload?.kind,p_payee:b.payload?.payee_id,p_target:b.payload?.target,p_expected_hash:b.payload?.expected_hash,p_values:b.payload?.values,p_request_id:b.request_id});
  }else if(b.action==='correct'){
   result=await caller.rpc('payroll092_correct',{p_action:b.payload?.kind,p_payee:b.payload?.payee_id,p_target:b.payload?.target||null,p_expected_hash:b.payload?.expected_hash,p_reason:b.payload?.reason,p_request_id:b.request_id});
  }else if(b.action==='setup'){
   // One modal, existing audited contracts. Each step has a stable retry ID;
   // partial setup may be completed by retry or removed with the 092 correction.
   const p=b.payload;
   if(!p||!['employee','contractor'].includes(p.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(p.effective_from)||!/^\d{1,12}(\.\d{1,2})?$/.test(String(p.monthly_amount))||Number(p.monthly_amount)<=0||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>2000||typeof b.request_id!=='string'||!/^[0-9a-f-]{36}$/.test(b.request_id))throw new PayrollError('PAYROLL_INPUT_INVALID');
   const d=await readPayroll(caller),option=payrollPeopleOptions(d.people_options).find(x=>x.id===p.payee_id)!;
   const dest=p.destination;
   if(dest&&(!['bank_name','account_name','account_number'].every(k=>typeof dest[k]==='string'&&dest[k].trim())||dest.account_number.length<4||dest.account_number.length>50))throw new PayrollError('PAYROLL_INPUT_INVALID');
   if(p.tax_id&&!/^\d{13}$/.test(p.tax_id))throw new PayrollError('PAYROLL_INPUT_INVALID');
   if(!option.version||dest||p.tax_id){
    const saved=await caller.rpc('save_finance_payee',{p_id:option.id,p_profile_id:option.profile_id,p_expected_version:option.version,
     p_input:{legal_name:option.legal_name,entity_type:'natural_person',is_active:option.is_active,tax_id:p.tax_id||option.tax_id||null,destination:dest||option.destination||null}});
    if(saved.error)throw saved.error;
   }
   const child=(name:string)=>createHash('md5').update('payroll-setup:'+b.request_id+':'+name).digest('hex');
   const engagement=await caller.rpc('payroll089_manage',{p_action:'engagement',p_payload:{id:child('engagement'),payee_id:p.payee_id,kind:p.kind,active:true,effective_from:p.effective_from,reason:p.reason},p_request_id:child('engagement-request')});if(engagement.error)throw engagement.error;
   result=await caller.rpc('payroll089_manage',{p_action:'rate',p_payload:{id:child('rate'),payee_id:p.payee_id,monthly_amount:p.monthly_amount,effective_from:p.effective_from,reason:p.reason},p_request_id:child('rate-request')});
  }else if(['monthly_save','monthly_reload','monthly_pay'].includes(b.action)){
   if(typeof b.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(b.month))throw new PayrollError('PAYROLL_MONTH_INVALID');
   periodPeople=(await readPayroll(caller)).people;
   result=await caller.rpc('payroll091_manage',{p_action:b.action.slice(8),p_month:b.month,p_items:b.items,p_request_id:b.request_id,p_acknowledged:b.acknowledged===true});
  }else if(b.action==='cancel')result=await caller.rpc('payroll089_payment_batch',{p_action:'cancel',p_items:b.items,p_request_id:b.request_id,p_acknowledged:b.acknowledged===true});
  else if(['engagement','rate'].includes(b.action))result=await caller.rpc('payroll089_manage',{p_action:b.action,p_payload:b.payload,p_request_id:b.request_id});
  // The old DB APIs remain available for compatibility. This application no
  // longer offers whole-period approval/reload or separate prepare/confirm.
  else throw new PayrollError('PAYROLL_INPUT_INVALID');
  if(result.error)throw result.error;return reply(result.data);
 }catch(e){
  const error=e as {message?:string;status?:number;details?:string},code=error.message?.match(/(?:PAYROLL|FINANCE_CASH)_[A-Z_]+/)?.[0]||'PAYROLL_FAILED';
  // Only an authorized Admin with caller-visible People gets specific evidence.
  // Never return raw SQL/detail or bank data.
  let issue;
  if(code==='PAYROLL_RATE_MISSING'&&periodPeople){
   try{const detail=JSON.parse(error.details||'null');
    const person=periodPeople.find(p=>p.id===detail?.payee_id);
    if(person&&detail.reason==='no_rate_overlap'&&/^\d{4}-\d{2}-01$/.test(detail.month)&&/^\d{4}-\d{2}-\d{2}$/.test(detail.service_from)&&/^\d{4}-\d{2}-\d{2}$/.test(detail.service_to))
     issue={person:person.legal_name,month:detail.month,service_from:detail.service_from,service_to:detail.service_to,reason:'no_rate_overlap'};
   }catch{/* Malformed diagnostics remain a generic fail-closed error. */}
  }
  if(!issue&&periodPeople){try{const detail=JSON.parse(error.details||'null'),person=periodPeople.find(p=>p.id===detail?.payee_id);if(person)issue={person:person.legal_name,reason:'selected_person'};}catch{/* no raw details */}}
  return reply({error:code,...(issue?{issue}:{})},e instanceof PayrollError?e.status:409);
 }
}
