import 'server-only';
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
   const [data,profiles]=await Promise.all([readPayroll(caller,period||null),readPeople(caller)]);
   const monthly=await caller.rpc('payroll091_month',{p_month:month||data.today.slice(0,7)+'-01'});if(monthly.error)throw monthly.error;
   return reply({...data,new_people_options:newPayrollPeople(data,profiles),monthly:monthly.data});
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
  if(['engagement','rate'].includes(b.action)){
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
  if(['monthly_save','monthly_reload','monthly_pay'].includes(b.action)){
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
