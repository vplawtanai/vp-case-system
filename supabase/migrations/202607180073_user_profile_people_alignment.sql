-- Phase 8B.2. ONE manual gate; no automatic classification or historical writes.
-- Run complete file once. Any failed assertion aborts before COMMIT.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $preflight$
declare r record;
begin
 if to_regclass('public.user_profiles') is null or to_regclass('auth.users') is null
   or to_regprocedure('public.create_case_with_number(uuid)') is null
   or to_regprocedure('public.create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)') is null
 then raise exception '073 requires the existing profile/Auth and applied 072 contracts'; end if;
 if exists(select 1 from pg_attribute where attrelid='public.user_profiles'::regclass and attname in ('account_type','assignable') and not attisdropped)
   or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname like 'people\_%' escape '\')
 then raise exception '073 target already exists or partial apply: STOP'; end if;
 if not (select relrowsecurity from pg_class where oid='public.user_profiles'::regclass)
 then raise exception 'user_profiles RLS must already be enabled'; end if;
 -- Freeze business rows for before/after comparison; fail on busy tables, never wait indefinitely.
 for r in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') order by c.oid
 loop execute format('lock table %s in share row exclusive mode',r.rel); end loop;
 lock table auth.users in share row exclusive mode;
end;
$preflight$;

create function pg_temp.people073_snapshot() returns jsonb language plpgsql as $snapshot$
declare r record; rows jsonb:='{}'; h text; n bigint;
begin
 for r in select c.oid::regclass as rel, ns.nspname||'.'||c.relname as name from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
   where (ns.nspname='public' and c.relkind in ('r','p')) or c.oid='auth.users'::regclass order by c.oid
 loop
  execute format('select count(*),md5(coalesce(string_agg(v,E''\n'' order by v),'''')) from (select (%s)::text v from %s t) s',
   case when r.name='public.user_profiles' then 'to_jsonb(t)-''account_type''-''assignable''' else 'to_jsonb(t)' end,r.rel) into n,h;
  rows:=rows||jsonb_build_object(r.name,jsonb_build_object('count',n,'hash',h));
 end loop;
 return jsonb_build_object('rows',rows,
  'functions',(select coalesce(jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',md5(pg_get_functiondef(p.oid)),
    'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'security',p.prosecdef)),'{}') from pg_proc p
    where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not like 'people\_%' escape '\'),
  'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]') from pg_policy p
    where p.polname not like 'people\_%' escape '\'),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',t.tgrelid,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.oid),'[]')
    from pg_trigger t where not t.tgisinternal and t.tgname not like 'people\_%' escape '\'),
  'profile_rls',(select jsonb_build_object('owner',relowner,'rls',relrowsecurity,'forced',relforcerowsecurity) from pg_class where oid='public.user_profiles'::regclass));
end;
$snapshot$;
create temp table people073_before as select pg_temp.people073_snapshot() snapshot;

alter table public.user_profiles
 add column account_type text,
 add column assignable boolean not null default false,
 add constraint people_account_type_check check (account_type is null or account_type in ('operational','uat')),
 add constraint people_assignable_check check (not assignable or (account_type is not distinct from 'operational' and active is true));
comment on column public.user_profiles.account_type is 'Explicit Admin classification; NULL means unclassified. Never infer from name/email/role.';
comment on column public.user_profiles.assignable is 'Future assignment pool only: active AND operational AND assignable. Existing assignments unchanged.';

create function public.people_is_active_admin() returns boolean language sql stable security definer set search_path=public as $fn$
 select exists(select 1 from public.user_profiles where id=auth.uid() and active is true and role='admin');
$fn$;
create function public.people_is_assignable(p_id uuid) returns boolean language sql stable security invoker set search_path=public as $fn$
 select exists(select 1 from public.user_profiles where id=p_id and active is true and account_type='operational' and assignable);
$fn$;

-- Keep existing SELECT policies and every Finance guard. Restrictive policies add a ceiling,
-- so an older permissive/self policy cannot grant user-administration access.
create policy people_admin_insert on public.user_profiles as restrictive for insert to authenticated
 with check (public.people_is_active_admin());
create policy people_admin_update on public.user_profiles as restrictive for update to authenticated
 using (public.people_is_active_admin()) with check (public.people_is_active_admin());
create policy people_no_direct_delete on public.user_profiles as restrictive for delete to authenticated using (false);
revoke insert,update,delete,truncate,references,trigger on public.user_profiles from anon;
revoke delete,truncate on public.user_profiles from public,authenticated;

create function public.people_profile_update_guard() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
 perform pg_advisory_xact_lock(hashtextextended('people-admin',0));
 if not public.people_is_active_admin() then raise exception 'FORBIDDEN'; end if;
 if new.id is distinct from old.id or new.email is distinct from old.email then raise exception 'INVALID_INPUT'; end if;
 if old.id=auth.uid() and (new.role is distinct from 'admin' or new.active is not true) then raise exception 'SELF_PROTECTION'; end if;
 if new.active is not true or new.account_type is distinct from 'operational' then new.assignable:=false; end if;
 return new;
end;
$fn$;
create trigger people_profile_update_guard before update on public.user_profiles for each row execute function public.people_profile_update_guard();

create function public.people_admin_get_users() returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.people_is_active_admin() then raise exception 'FORBIDDEN'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(u) order by lower(email),id),'[]') from public.user_profiles u);
end;
$fn$;

create function public.people_admin_save_profile(p_id uuid,p_input jsonb,p_expected jsonb,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare old public.user_profiles%rowtype; candidate public.user_profiles%rowtype; result jsonb;
 k text; set_clause text; identity auth.users%rowtype; allowed text[];
begin
 perform pg_advisory_xact_lock(hashtextextended('people-admin',0));
 if not public.people_is_active_admin() then raise exception 'FORBIDDEN'; end if;
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object' or p_input='{}' then raise exception 'INVALID_INPUT'; end if;
 allowed:=array['full_name','staff_name','role','active','account_type','assignable','financial_access',
  'can_submit_expense_claim','can_view_own_expense_claims','can_view_all_expense_claims','can_approve_expense_claims','can_pay_expense_claims',
  'can_view_company_ledger','can_edit_company_ledger','can_void_company_ledger','can_view_lawyer_compensation','can_edit_lawyer_compensation','can_void_lawyer_compensation',
  'can_manage_finance_payments','can_confirm_finance_payments','can_reverse_finance_payments','can_reallocate_finance_payments',
  'can_view_finance_receipts','can_manage_finance_receipts','can_issue_finance_receipts','can_void_finance_receipts',
  'can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices',
  'can_view_finance_cash_transactions','can_manage_finance_cash_transactions','can_confirm_finance_cash_transactions','can_reverse_finance_cash_transactions',
  'can_view_finance_billable_charges','can_manage_finance_billable_charges','can_approve_finance_billable_charges',
  'can_submit_office_work_log','can_view_own_office_work_logs','can_view_all_office_work_logs','can_edit_office_work_logs','can_void_office_work_logs'];
 for k in select jsonb_object_keys(p_input) loop
  if k in ('full_name','staff_name','role') and jsonb_typeof(p_input->k) is distinct from 'string' then raise exception 'INVALID_INPUT'; end if;
  if not k=any(allowed) or not exists(select 1 from pg_attribute where attrelid='public.user_profiles'::regclass and attname=k and not attisdropped)
  then raise exception 'INVALID_INPUT'; end if;
  if (k in ('active','assignable','financial_access') or k like 'can\_%' escape '\') and jsonb_typeof(p_input->k) is distinct from 'boolean'
  then raise exception 'INVALID_INPUT'; end if;
 end loop;
 select * into old from public.user_profiles where id=p_id for update;
 if p_request_id is not null then
  select * into identity from auth.users where id=p_id for update;
  if identity.id is null or identity.raw_app_meta_data->>'vp_people_created_by' is distinct from auth.uid()::text
   or identity.raw_app_meta_data->>'vp_people_request' is distinct from p_request_id::text
   or identity.created_at < now()-interval '10 minutes' or identity.last_sign_in_at is not null
   or identity.banned_until is null or identity.banned_until < now()+interval '1 day'
   or p_expected is not null or (old.id is not null and old.account_type is not null)
  then raise exception 'FORBIDDEN'; end if;
  if p_input->>'account_type' not in ('operational','uat') or p_input->>'account_type' is null
   or not p_input ?& array['full_name','staff_name','role','active','account_type','assignable']
   or exists(select 1 from jsonb_object_keys(p_input) q(k) where q.k not in ('full_name','staff_name','role','active','account_type','assignable'))
  then raise exception 'INVALID_INPUT'; end if;
 else
  if old.id is null then raise exception 'NOT_FOUND'; end if;
  if p_expected is distinct from to_jsonb(old) then raise exception 'PROFILE_CHANGED'; end if;
 end if;
 candidate:=jsonb_populate_record(old,p_input);
 if candidate.role is null or candidate.role not in ('admin','partner','lawyer','assistant_lawyer','staff','viewer')
  or nullif(trim(candidate.full_name),'') is null or length(candidate.full_name)>200 or length(candidate.staff_name)>200
  or candidate.active is null or candidate.assignable is null
 then raise exception 'INVALID_INPUT'; end if;
 if candidate.assignable and (candidate.account_type is distinct from 'operational' or candidate.active is not true) then raise exception 'NOT_ASSIGNABLE'; end if;
 if old.id is null then
  insert into public.user_profiles(id,email,full_name,staff_name,role,active,account_type,assignable)
   values(p_id,identity.email,trim(candidate.full_name),trim(candidate.staff_name),candidate.role,candidate.active,candidate.account_type,candidate.assignable);
 else
  -- Only explicitly supplied keys are written; never derive Finance flags from role.
  select string_agg(format('%1$I = (jsonb_populate_record(null::public.user_profiles,$1)).%1$I',key),', ' order by key)
    into set_clause from jsonb_object_keys(p_input) q(key);
  execute format('update public.user_profiles set %s where id=$2',set_clause) using p_input,p_id;
 end if;
 select to_jsonb(u) into result from public.user_profiles u where id=p_id;
 if p_request_id is null and result is distinct from to_jsonb(old) then
  insert into public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_email,user_name,user_role,old_data,new_data,note,created_at)
  select null,'user_profiles',p_id::text,'update',u.id,u.email,coalesce(u.full_name,u.email),'admin',to_jsonb(old),result,
    'Admin updated user profile',now() from public.user_profiles u where u.id=auth.uid();
 end if;
 return result;
end;
$fn$;

-- Conservative history guard. All live incoming FKs, including SET NULL/CASCADE, are protected.
-- Also check legacy UUID/text/email/name/JSON references that lack FKs. A name collision BLOCKS
-- deletion; it never classifies users or assigns permissions. Soft-deleted history still counts.
create function public.people_history_references(p_id uuid,p_lock boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $fn$
declare u public.user_profiles%rowtype; r record; c record; matched boolean; result jsonb:='[]'; aliases text[]; predicate text; column_predicate text;
begin
 select * into u from public.user_profiles where id=p_id;
 aliases:=array_remove(array[nullif(lower(trim(u.staff_name)),''),nullif(lower(trim(u.full_name)),''),nullif(lower(trim(u.email)),'')],null);
 for r in select t.oid,t.oid::regclass rel,n.nspname,t.relname from pg_class t join pg_namespace n on n.oid=t.relnamespace
  where t.relkind in ('r','p') and (
   n.nspname in ('public','storage') or (n.nspname<>'auth' and exists(select 1 from pg_constraint fk
    where fk.contype='f' and fk.conrelid=t.oid and fk.confrelid in ('public.user_profiles'::regclass,'auth.users'::regclass)))) order by t.oid
 loop
  if p_lock then execute format('lock table %s in share mode',r.rel); end if;
  predicate:=null;
  for c in select a.attname,a.atttypid from pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped and (
    a.atttypid in ('uuid'::regtype,'json'::regtype,'jsonb'::regtype,'text'::regtype,'varchar'::regtype,'bpchar'::regtype) or
    a.attname in ('user_id','actor_id','actor_user_id','created_by_user_id','updated_by_user_id','deleted_by_user_id','staff_user_id','recipient_id','owner_id','profile_id','record_id',
     'staff_name','user_name','actor_name','created_by_name','updated_by_name','deleted_by','owner_name','responsible_lawyer','assignee_name','assigned_to','user_email','actor_email','created_by_email','updated_by_email','owner') or
    exists(select 1 from pg_constraint fk where fk.conrelid=r.oid and fk.contype='f' and a.attnum=any(fk.conkey)
      and fk.confrelid in ('public.user_profiles'::regclass,'auth.users'::regclass)))
  loop
   column_predicate:=case when c.atttypid in ('json'::regtype,'jsonb'::regtype) then format('(strpos(coalesce(%1$I::text,''''),$1::text)>0 or exists(select 1 from unnest($2::text[]) alias(name) where strpos(lower(coalesce(%1$I::text,'''')),to_jsonb(alias.name)::text)>0))',c.attname)
    else format('(strpos(coalesce(%1$I::text,''''),$1::text)>0 or lower(trim(%1$I::text))=any($2))',c.attname) end;
   -- Preserve a prior Admin's deactivation audit as a self-contained snapshot.
   -- It alone is not work history. Other profile edits, actor references and ALL
   -- business audits remain blockers. Never delete or rewrite this audit row.
   if r.nspname='public' and r.relname='case_audit_logs' and c.attname in ('record_id','old_data','new_data') then
    column_predicate:=column_predicate||' and not coalesce((table_name=''user_profiles'' and record_id=$1::text and user_id is distinct from $1
      and old_data->>''active''=''true'' and new_data->>''active''=''false''
      and (old_data::jsonb-''active''-''assignable'')=(new_data::jsonb-''active''-''assignable'')),false)';
   end if;
   predicate:=concat_ws(' or ',predicate,'('||column_predicate||')');
  end loop;
  if predicate is not null then
   -- A self-referencing profile FK must not cascade into another profile.
   -- Exclude only the target's own identity row, not the entire profiles table.
   if r.oid='public.user_profiles'::regclass then predicate:='id is distinct from $1 and ('||predicate||')'; end if;
   execute format('select exists(select 1 from %s where %s)',r.rel,predicate) into matched using p_id,aliases;
   if matched then result:=result||jsonb_build_array(r.nspname||'.'||r.relname); end if;
  end if;
 end loop;
 return result;
end;
$fn$;

create function public.people_admin_delete_check(p_id uuid) returns jsonb language plpgsql security definer set search_path=public as $fn$
declare u public.user_profiles%rowtype; refs jsonb;
begin
 if not public.people_is_active_admin() then raise exception 'FORBIDDEN'; end if;
 if p_id=auth.uid() then raise exception 'SELF_PROTECTION'; end if;
 select * into u from public.user_profiles where id=p_id;
 if u.id is null then raise exception 'NOT_FOUND'; end if;
 if u.active is not false or u.account_type is null then return jsonb_build_object('deletable',false,'code','DELETE_REQUIRES_INACTIVE'); end if;
 refs:=public.people_history_references(p_id);
 return jsonb_build_object('deletable',refs='[]','code',case when refs='[]' then null else 'USER_HISTORY_REQUIRED' end,'references',refs);
end;
$fn$;

create function public.people_auth_delete_guard() returns trigger language plpgsql security definer set search_path=public as $fn$
declare u public.user_profiles%rowtype; provisioning boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('people-admin',0));
 lock table public.user_profiles in share row exclusive mode;
 select * into u from public.user_profiles where id=old.id for update;
 -- Compensation of a NEW, still-banned, never-used Auth identity is allowed.
 provisioning:=old.raw_app_meta_data ? 'vp_people_request' and old.created_at>now()-interval '10 minutes'
  and old.last_sign_in_at is null and old.banned_until>now()+interval '1 day';
 if u.id is not null and not coalesce(provisioning,false) and (u.active is not false or u.account_type is null)
 then raise exception 'DELETE_REQUIRES_INACTIVE'; end if;
 if public.people_history_references(old.id,true)<>'[]' then raise exception 'USER_HISTORY_REQUIRED'; end if;
 perform set_config('people.delete_target',old.id::text,true);
 -- This runs INSIDE Auth's deletion transaction; any Auth/FK/Finance error rolls both back.
 -- Existing payout_profile_delete_guard remains enabled and is not bypassed.
 delete from public.user_profiles where id=old.id;
 return old;
end;
$fn$;
create trigger people_auth_delete_guard before delete on auth.users for each row execute function public.people_auth_delete_guard();
create function public.people_profile_delete_guard() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
 if pg_trigger_depth()<2 or current_setting('people.delete_target',true) is distinct from old.id::text
 then raise exception 'Use the guarded Auth deletion operation'; end if;
 return old;
end;
$fn$;
create trigger people_profile_delete_guard before delete on public.user_profiles for each row execute function public.people_profile_delete_guard();

do $security$
declare r record;
begin
 for r in select p.oid::regprocedure sig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'people\_%' escape '\' loop
  execute format('alter function %s owner to postgres',r.sig);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.sig);
 end loop;
end;
$security$;
grant execute on function public.people_is_active_admin(),public.people_is_assignable(uuid),public.people_admin_get_users(),
 public.people_admin_save_profile(uuid,jsonb,jsonb,uuid),public.people_admin_delete_check(uuid) to authenticated;

create temp table people073_result(result jsonb);
do $verify$
declare before_state jsonb; after_state jsonb; checks jsonb; failures jsonb;
begin
 select snapshot into before_state from people073_before;
 after_state:=pg_temp.people073_snapshot();
 checks:=jsonb_build_object(
  'historical_business_rows_unchanged',before_state->'rows'=after_state->'rows',
  'existing_functions_072_finance_unchanged',before_state->'functions'=after_state->'functions',
  'existing_policies_unchanged',before_state->'policies'=after_state->'policies',
  'existing_triggers_including_finance_unchanged',before_state->'triggers'=after_state->'triggers',
  'profile_owner_rls_preserved',before_state->'profile_rls'=after_state->'profile_rls',
  'existing_profiles_unclassified',not exists(select 1 from public.user_profiles where account_type is not null or assignable),
  'people_columns_exact',(select count(*)=2 and bool_and(case when a.attname='account_type'
    then a.atttypid='text'::regtype and not a.attnotnull and d.oid is null
    else a.atttypid='boolean'::regtype and a.attnotnull and pg_get_expr(d.adbin,d.adrelid)='false' end)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid='public.user_profiles'::regclass and a.attname in ('account_type','assignable') and not a.attisdropped),
  'people_constraints_valid',(select count(*)=2 and bool_and(convalidated) from pg_constraint where conrelid='public.user_profiles'::regclass and conname in ('people_account_type_check','people_assignable_check')),
  'active_admin_write_ceiling',(select count(*)=3 and bool_and(not polpermissive) from pg_policy where polrelid='public.user_profiles'::regclass and polname in ('people_admin_insert','people_admin_update','people_no_direct_delete')),
  'delete_guards_enabled',(select count(*)=2 and bool_and(tgenabled='O') from pg_trigger where tgname in ('people_profile_delete_guard','people_auth_delete_guard')),
  'profile_update_guard_enabled',(select count(*)=1 and bool_and(tgenabled='O') from pg_trigger
    where tgrelid='public.user_profiles'::regclass and tgname='people_profile_update_guard'),
  'function_security',(select count(*)=9 and bool_and(pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=public']
    and p.prosecdef=(p.proname<>'people_is_assignable') and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('service_role',p.oid,'EXECUTE')
    and has_function_privilege('authenticated',p.oid,'EXECUTE')=(p.proname in ('people_is_active_admin','people_is_assignable','people_admin_get_users','people_admin_save_profile','people_admin_delete_check')))
   from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'people\_%' escape '\'),
  'direct_profile_delete_denied',not has_table_privilege('authenticated','public.user_profiles','DELETE') and not has_table_privilege('anon','public.user_profiles','UPDATE'));
 select coalesce(jsonb_agg(key order by key),'[]') into failures from jsonb_each(checks) where value is distinct from 'true'::jsonb;
 if failures<>'[]' then raise exception '073 verification FAILED: %',failures; end if;
 insert into people073_result values(jsonb_build_object('gate_pass',true,'failed_checks',failures,'checks',checks,
  'user_profiles_before_after',before_state->'rows'->'public.user_profiles','auth_users_before_after',before_state->'rows'->'auth.users',
  'historical_rows_unchanged',true,'roles_active_finance_permissions_unchanged',true,'existing_accounts_auto_classified',false));
end;
$verify$;
commit;
-- SELECT-only final verifier result. The transaction above aborted if any check failed.
select result as migration_073_verifier from pg_temp.people073_result;
