/* eslint-disable @typescript-eslint/no-require-imports */
// SYNTHETIC local PostgreSQL fixture. Never imports Supabase/environment secrets.
// Captured security is installed INTO a disposable fixture, never learned from it.
const fs=require('node:fs'),A=require('./finance-authority-artifacts.cjs');
const phase=require('./unified-statement-postgres.test.cjs');
const {db,query,scalar,migration,ids}=require('./receipt-foundation.test.cjs');
async function setup(){
 await phase.setup();await db.exec(migration('71'));
 await db.exec('set check_function_bodies=off');
 const present=await query("select table_name,column_name from information_schema.columns where table_schema='public'");
 const has=(t,c)=>present.some(x=>x.table_name===t&&x.column_name===c);
 for(const c of A.B.profile.columns)if(!has('user_profiles',c.name))await db.exec(`alter table user_profiles add column "${c.name}" ${c.type}${c.default?' default '+c.default:''}`);
 // The existing receipt fixture omits the earliest UI-only document masters.
 for(const t of Object.keys(A.B.columns))if(!(await scalar('select to_regclass($1)',[t])))await db.exec(`create table public.${t}(id uuid primary key)`);
 for(const t of ['finance_fee_agreements','finance_billing_plans'])if(!(await scalar('select to_regclass($1)',[t])))await db.exec(`create table public.${t}(id uuid primary key,status text)`);
 for(const [name,columns]of Object.entries(A.B.columns))for(const c of columns)if(!(await scalar('select exists(select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3)',['public',name,c.name])))await db.exec(`alter table public.${name} add column "${c.name}" ${c.type}`);
 await db.exec(`create schema if not exists storage;create table if not exists storage.objects(id uuid,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
 create table if not exists auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz);
 alter table finance_compensation_allocations add column if not exists batch_id uuid,add column if not exists recipient_user_id uuid,add column if not exists recipient_name text,add column if not exists payment_status text,add column if not exists paid_at timestamptz,add column if not exists is_company_share boolean default false,add column if not exists created_at timestamptz default now();
 alter table finance_compensation_batches add column if not exists status text default 'draft';
 alter table finance_cash_locations add column if not exists created_by_user_id uuid;`);
 // Functions needed by old policies, unrelated to 078's authority decisions.
 await db.exec(`create or replace function public.people_is_active_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from user_profiles where id=auth.uid() and active and role='admin')$$;
 create or replace function public.admin074_session_allowed() returns boolean language sql stable security definer set search_path=public as $$select not exists(select 1 from user_profiles where id=auth.uid() and role='admin' and not active)$$;
 create or replace function public.current_user_is_admin() returns boolean language sql security definer set search_path=public as $$select public.people_is_active_admin()$$;
 create or replace function public.current_user_is_admin_or_partner() returns boolean language sql security definer set search_path=public as $$select exists(select 1 from user_profiles where id=auth.uid() and role in ('admin','partner'))$$;
 create or replace function public.compensation_batch_is_draft(uuid) returns boolean language sql stable as $$select true$$;`);
 for(const f of A.B.functions){
  await db.exec(f.definition+';');
  // Exact captured ACL, including NULL/default-ACL representation, is fixture
  // setup only. This statement never appears in the candidate or manual gates.
  await query('update pg_proc set proacl=$1::aclitem[],proowner=(select oid from pg_roles where rolname=$2) where oid=to_regprocedure($3)',[f.acl,f.owner,f.signature]);
 }
 for(const [name,t]of Object.entries(A.B.security)){
  const old=await query('select policyname from pg_policies where schemaname=$1 and tablename=$2',['public',name]);
  for(const p of old)await db.exec(`drop policy ${'"'+p.policyname.replaceAll('"','""')+'"'} on ${name}`);
  for(const p of t.policies)await db.exec(`create policy "${p.policyname}" on ${name} as ${p.permissive} for ${p.cmd} to ${p.roles.join(',')}${p.qual?' using('+p.qual+')':''}${p.with_check?' with check('+p.with_check+')':''}`);
  await query('update pg_class set relacl=$1::aclitem[],relrowsecurity=$2,relforcerowsecurity=$3 where oid=to_regclass($4)',[t.acl,t.rls,t.force_rls,name]);
 }
 await db.exec('reset check_function_bodies');
 await db.exec(`create table case_audit_logs(id bigint generated always as identity primary key,case_id bigint,table_name text,record_id text,action text,user_id uuid,user_email text,user_name text,user_role text,old_data jsonb,new_data jsonb,note text,created_at timestamptz);`);
 await db.exec('update user_profiles set must_change_password=false');
}
async function apply(){
 // Full transaction-wrapped candidate, including baseline and preservation guards.
 // Outer test transaction ends first because 078 deliberately owns BEGIN/COMMIT.
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');
}
module.exports={setup,apply,ids};
