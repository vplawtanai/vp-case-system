-- Phase 8B.5 — temporary-password onboarding. MANUAL APPLY ONLY.
-- Existing users remain false. No Auth identity/password or historical-row DML.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
do $preflight$
begin
 if to_regprocedure('public.admin074_session_allowed()') is null
 or to_regprocedure('public.people_admin_save_profile(uuid,jsonb,jsonb,uuid)') is null
 then raise exception '075 requires accepted 073/074'; end if;
 if exists(select 1 from pg_attribute where attrelid='public.user_profiles'::regclass and attname='must_change_password' and not attisdropped)
 or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname like 'people075_%')
 then raise exception '075 target already exists: STOP'; end if;
 if (select md5(prosrc) from pg_proc where oid='public.people_profile_update_guard()'::regprocedure) is distinct from 'b8637bcc39e71f5b787b2766a53368d1'
 then raise exception '075 existing update guard differs: STOP'; end if;
end; $preflight$;
-- Read-only snapshot/hash preservation, under bounded locks. These temporary
-- objects disappear at COMMIT; no broader unresolved catalog is accepted.
create function pg_temp.people075_snapshot() returns jsonb language plpgsql as $snap$
declare r record; rows jsonb:='{}'; n bigint; h text;
begin
 for r in select c.oid::regclass rel,ns.nspname||'.'||c.relname name from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
 where c.relkind in ('r','p') and (ns.nspname='public' or (ns.nspname='auth' and c.relname='users')) order by c.oid loop
  execute format('select count(*),md5(coalesce(string_agg(v,E''\n'' order by v),'''')) from (select (%s)::text v from %s t) s',
    case when r.name='public.user_profiles' then 'to_jsonb(t)-''must_change_password''' else 'to_jsonb(t)' end,r.rel) into n,h;
  rows:=rows||jsonb_build_object(r.name,jsonb_build_object('count',n,'hash',h));
 end loop;
 return jsonb_build_object('rows',rows,
 'functions',(select coalesce(jsonb_object_agg(p.oid::regprocedure::text,to_jsonb(p)-'prosrc'-'prosqlbody'||case when p.proname='people_profile_update_guard' then '{}'::jsonb else jsonb_build_object('definition',pg_get_functiondef(p.oid)) end),'{}') from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not like 'people075_%'),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]') from pg_policy p),
 'security',(select coalesce(jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.oid),'[]') from pg_class c where c.relnamespace in ('public'::regnamespace,'auth'::regnamespace) and c.relkind in ('r','p')),
 'triggers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.oid),'[]') from pg_trigger t where not t.tgisinternal and t.tgname not like 'people075_%'));
end; $snap$;
do $locks$ declare r record; begin
 for r in select c.oid::regclass rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and (n.nspname='public' or (n.nspname='auth' and c.relname='users')) order by c.oid
 loop execute format('lock table %s in share mode',r.rel); end loop;
end; $locks$;
create temp table people075_before on commit drop as select pg_temp.people075_snapshot() snapshot;

alter table public.user_profiles add column must_change_password boolean not null default false;
comment on column public.user_profiles.must_change_password is 'Onboarding workflow only. Server-managed after Auth password operations; existing profiles remain false.';

create or replace function public.people_profile_update_guard() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
 -- Only the private completion RPC / nested Auth reset trigger can change this
 -- field. Preserve the original 073 guard byte-for-byte for every other edit.
 if new.must_change_password is distinct from old.must_change_password then
  if (to_jsonb(new)-'must_change_password') is distinct from (to_jsonb(old)-'must_change_password')
    or current_setting('people.password_target',true) is distinct from new.id::text
    or not (pg_trigger_depth()>1 or current_setting('role',true)='service_role')
  then raise exception 'PASSWORD_STATE_MANAGED'; end if;
  return new;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('people-admin',0));
 if not public.people_is_active_admin() then raise exception 'FORBIDDEN'; end if;
 if new.id is distinct from old.id or new.email is distinct from old.email then raise exception 'INVALID_INPUT'; end if;
 if old.id=auth.uid() and (new.role is distinct from 'admin' or new.active is not true) then raise exception 'SELF_PROTECTION'; end if;
 if new.active is not true or new.account_type is distinct from 'operational' then new.assignable:=false; end if;
 return new;
end;
$fn$;

-- New profiles derive the flag from server-owned app_metadata, never user_metadata.
create function public.people075_profile_insert() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
 new.must_change_password:=exists(select 1 from auth.users a where a.id=new.id and nullif(a.raw_app_meta_data->>'vp_temporary_password_nonce','') is not null);
 return new;
end; $fn$;
create trigger people075_profile_insert before insert on public.user_profiles for each row execute function public.people075_profile_insert();

-- Auth Admin updates password + nonce in one Auth transaction. This trigger does
-- not change the password. It freezes a requirement even for an inactive target.
create function public.people075_auth_reset() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
 if (new.raw_app_meta_data->>'vp_temporary_password_nonce') is distinct from (old.raw_app_meta_data->>'vp_temporary_password_nonce') then
  perform set_config('people.password_target',new.id::text,true);
  update public.user_profiles set must_change_password=true where id=new.id and not must_change_password;
  perform set_config('people.password_target','',true);
 end if;
 return new;
end; $fn$;
create trigger people075_auth_reset after update of raw_app_meta_data on auth.users for each row execute function public.people075_auth_reset();

-- Server-only, invoked only AFTER caller Auth PUT /user confirms success. The
-- nonce check and Auth-row lock prevent an old completion racing a newer reset.
create function public.people075_complete_password_change(p_id uuid,p_nonce text) returns boolean
language plpgsql security definer set search_path=public as $fn$
declare actual_nonce text;
begin
 select raw_app_meta_data->>'vp_temporary_password_nonce' into actual_nonce from auth.users where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if actual_nonce is distinct from p_nonce then raise exception 'PASSWORD_RESET_CHANGED'; end if;
 if not exists(select 1 from public.user_profiles where id=p_id and active is true) then raise exception 'FORBIDDEN'; end if;
 perform set_config('people.password_target',p_id::text,true);
 update public.user_profiles set must_change_password=false where id=p_id and must_change_password;
 perform set_config('people.password_target','',true);
 return true;
end; $fn$;

alter function public.people075_profile_insert() owner to postgres;
alter function public.people075_auth_reset() owner to postgres;
alter function public.people075_complete_password_change(uuid,text) owner to postgres;
revoke all on function public.people075_profile_insert(),public.people075_auth_reset(),public.people075_complete_password_change(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.people075_complete_password_change(uuid,text) to service_role;

create temp table people075_result(result jsonb) on commit preserve rows;
do $verify$
declare before_state jsonb; after_state jsonb; checks jsonb; failures jsonb;
begin
 select snapshot into before_state from people075_before;
 after_state:=pg_temp.people075_snapshot();
 checks:=jsonb_build_object(
 'historical_rows_unchanged',before_state->'rows'=after_state->'rows',
 'auth_users_passwords_unchanged',before_state->'rows'->'auth.users'=after_state->'rows'->'auth.users',
 'existing_profiles_not_forced',not exists(select 1 from public.user_profiles where must_change_password),
 'existing_contracts_security_preserved',(before_state-'rows')=(after_state-'rows'),
 'private_functions_contract',(select count(*)=3 and bool_and(p.prosecdef and p.provolatile='v' and pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=public'] and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') and has_function_privilege('service_role',p.oid,'execute')=(p.proname='people075_complete_password_change')) from pg_proc p where p.oid in ('public.people075_profile_insert()'::regprocedure,'public.people075_auth_reset()'::regprocedure,'public.people075_complete_password_change(uuid,text)'::regprocedure)),
 'onboarding_triggers_contract',exists(select 1 from pg_trigger where tgname='people075_profile_insert' and tgrelid='public.user_profiles'::regclass and tgfoid='public.people075_profile_insert()'::regprocedure and tgtype=7 and tgenabled='O') and exists(select 1 from pg_trigger where tgname='people075_auth_reset' and tgrelid='auth.users'::regclass and tgfoid='public.people075_auth_reset()'::regprocedure and tgtype=17 and tgenabled='O' and tgattr::text=(select attnum::text from pg_attribute where attrelid='auth.users'::regclass and attname='raw_app_meta_data')),
 'column_contract',exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.user_profiles'::regclass and a.attname='must_change_password' and a.atttypid='boolean'::regtype and a.attnotnull and pg_get_expr(d.adbin,d.adrelid)='false'),
 'server_only_completion',not has_function_privilege('anon','public.people075_complete_password_change(uuid,text)','execute') and not has_function_privilege('authenticated','public.people075_complete_password_change(uuid,text)','execute') and has_function_privilege('service_role','public.people075_complete_password_change(uuid,text)','execute'));
 select coalesce(jsonb_agg(key),'[]') into failures from jsonb_each(checks) where value is distinct from 'true'::jsonb;
 if failures<>'[]' then raise exception '075 preservation/security checks failed: %',failures; end if;
 insert into people075_result values(checks||jsonb_build_object('gate_pass',true,'failed_checks',failures,'existing_profile_count',(before_state->'rows'->'public.user_profiles'->>'count')::bigint));
end; $verify$;
commit;
select result from people075_result;
drop table people075_result;
