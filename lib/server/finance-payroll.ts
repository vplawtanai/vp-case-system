import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {peopleClientsFor,type PeopleClients} from './people-admin';
import {PAYROLL_COOKIE} from '../../app/finance/payroll/model';
export class PayrollError extends Error {constructor(message:string,public status=400){super(message);}}
export async function authorizePayroll(caller:SupabaseClient){
 const u=await caller.auth.getUser();if(u.error||!u.data.user)throw new PayrollError('PAYROLL_UNAUTHORIZED',401);
 const p=await caller.from('user_profiles').select('id,role,active,must_change_password').eq('id',u.data.user.id).single();
 if(p.error||p.data?.role!=='admin'||p.data.active!==true||p.data.must_change_password!==false)throw new PayrollError('PAYROLL_ADMIN_REQUIRED',403);
}
export async function payrollPageAllowed(token:string){await authorizePayroll(peopleClientsFor(new Request('https://internal.invalid',{headers:{authorization:'Bearer '+token}})).caller);}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handlePayrollRequest(request:Request,supplied?:PeopleClients){
 try{
  const caller=(supplied||peopleClientsFor(request)).caller;await authorizePayroll(caller);
  if(request.method==='GET'){const period=new URL(request.url).searchParams.get('period');const r=await caller.rpc('payroll089_read',{p_period:period||null});if(r.error)throw r.error;return reply(r.data);}
  if(request.method!=='POST')return reply({error:'PAYROLL_INPUT_INVALID'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new PayrollError('PAYROLL_ADMIN_REQUIRED',403);
  if(Number(request.headers.get('content-length')||0)>100000)throw new PayrollError('PAYROLL_INPUT_INVALID');
  const raw=await request.text();if(raw.length>100000)throw new PayrollError('PAYROLL_INPUT_INVALID');
  const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw new PayrollError('PAYROLL_INPUT_INVALID');
  if(b.action==='session'){
   const token=request.headers.get('authorization')?.slice(7)||'';if(!/^[A-Za-z0-9._-]+$/.test(token))throw new PayrollError('PAYROLL_UNAUTHORIZED',401);
   const response=reply({ready:true});response.headers.set('Set-Cookie',`${PAYROLL_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/finance/payroll; Max-Age=1800${new URL(request.url).protocol==='https:'?'; Secure':''}`);return response;
  }
  let result;
  if(['prepare','confirm','cancel'].includes(b.action))result=await caller.rpc('payroll089_payment_batch',{p_action:b.action,p_items:b.items,p_request_id:b.request_id,p_acknowledged:b.acknowledged===true});
  else if(['engagement','rate','create_period','line','period','approve','reload_period'].includes(b.action))result=await caller.rpc('payroll089_manage',{p_action:b.action,p_payload:b.payload,p_request_id:b.request_id});
  else throw new PayrollError('PAYROLL_INPUT_INVALID');
  if(result.error)throw result.error;return reply(result.data);
 }catch(e){const error=e as {message?:string;status?:number};return reply({error:error.message?.match(/(?:PAYROLL|FINANCE_CASH)_[A-Z_]+/)?.[0]||'PAYROLL_FAILED'},e instanceof PayrollError?e.status:409);}
}
