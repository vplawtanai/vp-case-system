-- FJ-1 / 086: HUMAN APPLY ONLY. No existing Matter/Stage row mutation or backfill.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.advisory_matters,public.advisory_issues,public.advisory_issue_tasks,public.advisory_advice_records,public.advisory_time_logs,public.advisory_matter_counters,public.advisory_matter_control,public.advisory_matter_team,public.advisory_matter_stages,public.advisory_stage_visits,public.advisory_work_state_events,public.advisory_matter_activities,public.advisory_deliverables,public.advisory_control_requests IN SHARE MODE;
CREATE TEMP TABLE advisory086_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory086_before WITH structure AS (WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
catalog AS (
 SELECT t.relname name,jsonb_build_object(
  'schema',t.nspname,'kind',t.relkind,'owner',pg_get_userbyid(t.relowner),
  'rls_enabled',t.relrowsecurity,'rls_forced',t.relforcerowsecurity,'acl',t.relacl::text,
  'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
    'acl',a.attacl::text) ORDER BY a.attnum),'[]') FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'validated',c.convalidated,
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname COLLATE "C"),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f' AND c.conrelid NOT IN (select c2.oid from pg_class c2 join pg_namespace n2 on n2.oid=c2.relnamespace where n2.nspname='public' and c2.relname in ('advisory_journey_variants','advisory_journey_versions','advisory_journey_snapshots','advisory_journey_requests'))),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text COLLATE "C"),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname COLLATE "C"),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname COLLATE "C"),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section','advisory_workflow_checks','advisory_overdue_work')))
 select jsonb_build_object('catalog',
 (select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs','advisory_matter_counters','advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'contract',jsonb_build_object('tables',(select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'functions',(select jsonb_object_agg(name,evidence) from new_functions),
 'deltas',(select jsonb_object_agg(name,jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where name='advisory_issue_tasks' and x->>'name' in ('advisory_matter_id','advisory_issue_id','assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id'),
 'constraints',(select coalesce(jsonb_agg(x order by (x->>'name') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' like '%INDEX advisory076_%'),
 'triggers',(select coalesce(jsonb_agg(x order by (x->>'definition') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'triggers') x where x->>'definition' like '%TRIGGER advisory076_%'))) from catalog where name in ('advisory_matters','advisory_issue_tasks','advisory_time_logs','advisory_issues'))))), rows AS (with raw(name,j) as (select 'advisory_matters',to_jsonb(t) from public.advisory_matters t union all select 'advisory_issues',to_jsonb(t) from public.advisory_issues t union all select 'advisory_issue_tasks',to_jsonb(t) from public.advisory_issue_tasks t union all select 'advisory_advice_records',to_jsonb(t) from public.advisory_advice_records t union all select 'advisory_time_logs',to_jsonb(t) from public.advisory_time_logs t union all select 'advisory_matter_counters',to_jsonb(t) from public.advisory_matter_counters t union all select 'advisory_matter_control',to_jsonb(t) from public.advisory_matter_control t union all select 'advisory_matter_team',to_jsonb(t) from public.advisory_matter_team t union all select 'advisory_matter_stages',to_jsonb(t) from public.advisory_matter_stages t union all select 'advisory_stage_visits',to_jsonb(t) from public.advisory_stage_visits t union all select 'advisory_work_state_events',to_jsonb(t) from public.advisory_work_state_events t union all select 'advisory_matter_activities',to_jsonb(t) from public.advisory_matter_activities t union all select 'advisory_deliverables',to_jsonb(t) from public.advisory_deliverables t union all select 'advisory_control_requests',to_jsonb(t) from public.advisory_control_requests t), scope(name) as (values ('advisory_matters'),('advisory_issues'),('advisory_issue_tasks'),('advisory_advice_records'),('advisory_time_logs'),('advisory_matter_counters'),('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests'))
 select jsonb_object_agg(name,evidence) from (select s.name,jsonb_build_object('count',count(j),'sha256',encode(sha256(convert_to(coalesce(string_agg(j::text,E'\n' order by j::text COLLATE "C"),''),'UTF8')),'hex')) evidence from scope s left join raw r using(name) group by s.name) fingerprints)
 SELECT s.state||jsonb_build_object('rows',(select * from rows)) AS state FROM structure s(state);
DO $guard$ declare b jsonb; f jsonb; begin
 if current_user<>'postgres' then raise exception 'ADVISORY086_OWNER_REQUIRED'; end if;
 select state into b from advisory086_before; WITH rels as (select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'advisory_journey_%' and c.relkind in ('r','p')),
 funcs as (select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'advisory086_%' or p.proname in ('advisory_journey_catalog','advisory_journey_manage')))
 select jsonb_build_object('tables',coalesce((select jsonb_object_agg(r.relname,jsonb_build_object('owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'acl',r.relacl::text,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true),'validated',convalidated) order by conname collate "C"),'[]') from pg_constraint where conrelid=r.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text collate "C"),'[]') from pg_index where indrelid=r.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'roles',(select jsonb_agg(rolname order by rolname collate "C") from pg_roles where oid=any(polroles)),'permissive',polpermissive,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname collate "C"),'[]') from pg_policy where polrelid=r.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(oid,true),'enabled',tgenabled) order by tgname collate "C"),'[]') from pg_trigger where tgrelid=r.oid and not tgisinternal))) from rels r),'{}'),
 'functions',coalesce((select jsonb_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'execute',(select jsonb_object_agg(role,has_function_privilege(role,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role))) from funcs p),'{}')) into f;
 if encode(sha256(convert_to((b->'contract')::text,'UTF8')),'hex')<>'3f0a22461e57bfee0d4c91b91e26167553948836e078fd89b1cc3a3b2f39aa9f' or f<>'{"tables":{},"functions":{}}'::jsonb then raise exception 'ADVISORY086_BASELINE_MISMATCH'; end if;
end; $guard$;
create function public.advisory086_family(p_type text) returns text language sql immutable set search_path=public as $$ select case p_type when 'general_advisory' then 'general_advisory' when 'contract_business_documents' then 'contract_business_documents' when 'legal_opinion' then 'legal_analysis_compliance' when 'negotiation' then 'negotiation_pre_litigation' when 'corporate_registration' then 'corporate_transactions' when 'license_regulatory' then 'government_regulatory' when 'government_coordination' then 'government_regulatory' when 'administrative_challenge' then 'administrative_challenge' when 'employment_hr' then 'employment_foreign_workforce' when 'intellectual_property' then 'ip_registration' when 'compliance' then 'legal_analysis_compliance' when 'data_privacy' then 'legal_analysis_compliance' when 'real_estate_review' then 'real_estate_due_diligence' when 'pre_litigation_debt' then 'negotiation_pre_litigation' when 'transactions_review' then 'corporate_transactions' when 'foreign_investment' then 'government_regulatory' when 'foreign_workforce' then 'employment_foreign_workforce' when 'other' then 'general_advisory' end; $$;
create function public.advisory086_family_valid(p_family text) returns boolean language sql immutable set search_path=public as $$ select coalesce(p_family=any(array['general_advisory','contract_business_documents','legal_analysis_compliance','negotiation_pre_litigation','corporate_transactions','government_regulatory','administrative_challenge','employment_foreign_workforce','ip_registration','real_estate_due_diligence']),false); $$;
-- FJ-1 definitions only; offline builder embeds this in the transaction-wrapped Human Gate.
create function public.advisory086_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_profiles where id=auth.uid() and role='admin' and active and not must_change_password);
$$;
create function public.advisory086_valid_version(p jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare s jsonb; n integer; keys text[]:='{}';
begin
 if jsonb_typeof(p) is distinct from 'object' or p-'name_th'-'name_en'-'stages'<>'{}' then return false; end if;
 if jsonb_typeof(p->'name_th') is distinct from 'string' or jsonb_typeof(p->'name_en') is distinct from 'string'
 or length(btrim(coalesce(p->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(p->>'name_en',''))) not between 1 and 160
 or jsonb_typeof(p->'stages') is distinct from 'array' then return false; end if;
 n:=jsonb_array_length(p->'stages'); if n not between 2 and 20 then return false; end if;
 for s in select value from jsonb_array_elements(p->'stages') loop
  if jsonb_typeof(s) is distinct from 'object' or s-'key'-'name_th'-'name_en'-'required'<>'{}'
  or jsonb_typeof(s->'key') is distinct from 'string' or (s->>'key')!~'^[a-z][a-z0-9_]{1,59}$'
  or jsonb_typeof(s->'required') is distinct from 'boolean'
  or jsonb_typeof(s->'name_th') is distinct from 'string' or jsonb_typeof(s->'name_en') is distinct from 'string'
  or length(btrim(coalesce(s->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(s->>'name_en',''))) not between 1 and 160
  or (s->>'key')=any(keys) then return false; end if;
  keys:=array_append(keys,s->>'key');
 end loop;
 return p#>>'{stages,0,key}'<>'close' and (p#>>'{stages,0,required}')::boolean
 and p#>>array['stages',(n-1)::text,'key']='close' and (p#>>array['stages',(n-1)::text,'required'])::boolean
 and array_position(keys,'close')=n;
end; $$;
create table public.advisory_journey_variants (
 id uuid primary key default gen_random_uuid(), family_key text not null,
 active boolean not null default true, is_default boolean not null default false,
 revision bigint not null default 1 check(revision>0), created_at timestamptz not null default clock_timestamp(),
 check(not is_default or active)
);
create unique index advisory086_one_default on public.advisory_journey_variants(family_key) where is_default;
create table public.advisory_journey_versions (
 id uuid primary key default gen_random_uuid(), variant_id uuid not null references public.advisory_journey_variants(id) on delete restrict,
 version integer not null check(version>0), definition jsonb not null check(public.advisory086_valid_version(definition)),
 created_at timestamptz not null default clock_timestamp(), created_by uuid references public.user_profiles(id),
 unique(variant_id,version)
);
create table public.advisory_journey_snapshots (
 matter_id uuid primary key references public.advisory_matters(id) on delete restrict,
 version_id uuid not null references public.advisory_journey_versions(id) on delete restrict,
 family_key text not null, variant_id uuid not null references public.advisory_journey_variants(id) on delete restrict,
 version integer not null, definition jsonb not null check(public.advisory086_valid_version(definition)),
 captured_at timestamptz not null default clock_timestamp(), captured_by uuid not null references public.user_profiles(id)
);
create table public.advisory_journey_requests (
 request_id uuid primary key, actor_id uuid not null references public.user_profiles(id),
 body jsonb not null, response jsonb not null, previous_state jsonb, resulting_state jsonb,
 recorded_at timestamptz not null default clock_timestamp()
);
create function public.advisory086_immutable() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'ADVISORY_JOURNEY_IMMUTABLE'; end; $$;
create trigger advisory086_version_immutable before update or delete on public.advisory_journey_versions for each row execute function public.advisory086_immutable();
create trigger advisory086_snapshot_immutable before update or delete on public.advisory_journey_snapshots for each row execute function public.advisory086_immutable();
create trigger advisory086_request_immutable before update or delete on public.advisory_journey_requests for each row execute function public.advisory086_immutable();

create function public.advisory_journey_catalog(p_family text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('manage',public.advisory086_admin(),'variants',coalesce((
  select jsonb_agg(to_jsonb(v)||jsonb_build_object('version_id',d.id,'version',d.version,'definition',d.definition) order by v.family_key collate "C",v.is_default desc,v.id)
  from public.advisory_journey_variants v cross join lateral(select * from public.advisory_journey_versions where variant_id=v.id order by version desc limit 1) d
  where (p_family is null or v.family_key=p_family) and (v.active or public.advisory086_admin())
 ),'[]'::jsonb));
end; $$;

create function public.advisory_journey_manage(p_id uuid,p_action text,p_payload jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); body jsonb; saved public.advisory_journey_requests%rowtype;
 v public.advisory_journey_variants%rowtype; family text; before_state jsonb; result jsonb; ver integer;
begin
 if not public.advisory086_admin() then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32000 then raise exception 'ADVISORY_INVALID_INPUT'; end if;
 body:=jsonb_build_object('id',p_id,'action',p_action,'payload',p_payload,'revision',p_expected_revision);
 perform pg_advisory_xact_lock(hashtextextended('advisory086-request:'||p_request_id,0));
 select * into saved from public.advisory_journey_requests where request_id=p_request_id;
 if found then if saved.actor_id<>actor or saved.body<>body then raise exception 'ADVISORY_RETRY_MISMATCH'; end if; return saved.response; end if;
 if p_action='create' then
  if p_id is not null or p_payload-'family_key'-'definition'<>'{}' then raise exception 'ADVISORY_INVALID_INPUT'; end if;
  family:=p_payload->>'family_key';
 else select family_key into family from public.advisory_journey_variants where id=p_id; end if;
 if family is null or not public.advisory086_family_valid(family) then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('advisory086-family:'||family,0));
 if p_action='create' then
  insert into public.advisory_journey_variants(family_key,is_default) values(family,not exists(select 1 from public.advisory_journey_variants where family_key=family and active)) returning * into v;
 else
  select * into v from public.advisory_journey_variants where id=p_id for update;
  if p_expected_revision is distinct from v.revision then raise exception 'ADVISORY_CHANGED'; end if;
  before_state:=to_jsonb(v);
 end if;
 if p_action in ('create','publish') then
  if (p_action='publish' and p_payload-'definition'<>'{}') or not public.advisory086_valid_version(p_payload->'definition') then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
  select coalesce(max(version),0)+1 into ver from public.advisory_journey_versions where variant_id=v.id;
  insert into public.advisory_journey_versions(variant_id,version,definition,created_by) values(v.id,ver,p_payload->'definition',actor);
 elsif p_action='configure' then
  if p_payload-'active'-'is_default'<>'{}' or jsonb_typeof(p_payload->'active') is distinct from 'boolean' or jsonb_typeof(p_payload->'is_default') is distinct from 'boolean'
  or ((p_payload->>'is_default')::boolean and not (p_payload->>'active')::boolean) then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
  if (p_payload->>'is_default')::boolean then
   update public.advisory_journey_variants set is_default=false,revision=revision+1 where family_key=family and is_default and id<>v.id;
  end if;
  update public.advisory_journey_variants set active=(p_payload->>'active')::boolean,is_default=(p_payload->>'is_default')::boolean where id=v.id;
 else raise exception 'ADVISORY_ACTION_INVALID'; end if;
 if not exists(select 1 from public.advisory_journey_variants where family_key=family and active and is_default) then raise exception 'ADVISORY_JOURNEY_DEFAULT_REQUIRED'; end if;
 if p_action<>'create' then update public.advisory_journey_variants set revision=revision+1 where id=v.id; end if;
 select to_jsonb(x) into result from public.advisory_journey_variants x where id=v.id;
 insert into public.advisory_journey_requests(request_id,actor_id,body,response,previous_state,resulting_state) values(p_request_id,actor,body,result,before_state,result||jsonb_build_object('published_version',ver));
 return result;
end; $$;

-- Private create helper: called within the original create transaction and retry ledger.
create function public.advisory086_snapshot(p_matter uuid,p_type text,p_variant uuid,p_version uuid) returns void
language plpgsql security definer set search_path=public as $$
declare family text:=public.advisory086_family(p_type); v public.advisory_journey_variants%rowtype; d public.advisory_journey_versions%rowtype;
begin
 if family is null then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('advisory086-family:'||family,0));
 select * into v from public.advisory_journey_variants where family_key=family and active and (case when p_variant is null then is_default else id=p_variant end);
 if not found then raise exception 'ADVISORY_JOURNEY_UNAVAILABLE'; end if;
 select * into d from public.advisory_journey_versions where variant_id=v.id order by version desc limit 1;
 if not found or (p_version is not null and p_version<>d.id) then raise exception 'ADVISORY_JOURNEY_CHANGED'; end if;
 insert into public.advisory_journey_snapshots(matter_id,version_id,family_key,variant_id,version,definition,captured_by) values(p_matter,d.id,family,v.id,d.version,d.definition,auth.uid());
 insert into public.advisory_matter_stages(matter_id,template_key,stage_key,position)
 select p_matter,family,s->>'key',n-1 from jsonb_array_elements(d.definition->'stages') with ordinality x(s,n);
end; $$;

alter table public.advisory_journey_variants enable row level security;
alter table public.advisory_journey_versions enable row level security;
alter table public.advisory_journey_snapshots enable row level security;
alter table public.advisory_journey_requests enable row level security;
create policy advisory086_read on public.advisory_journey_variants for select to authenticated using(public.advisory076_allowed('read') and (active or public.advisory086_admin()));
create policy advisory086_read on public.advisory_journey_versions for select to authenticated using(public.advisory086_admin());
create policy advisory086_read on public.advisory_journey_snapshots for select to authenticated using(public.advisory076_allowed('read'));
create policy advisory086_read on public.advisory_journey_requests for select to authenticated using(public.advisory086_admin());
revoke all on public.advisory_journey_variants,public.advisory_journey_versions,public.advisory_journey_snapshots,public.advisory_journey_requests from public,anon,authenticated,service_role;
grant select on public.advisory_journey_variants,public.advisory_journey_versions,public.advisory_journey_snapshots,public.advisory_journey_requests to authenticated;

CREATE OR REPLACE FUNCTION public.advisory_control_write(p_matter_id uuid, p_action text, p_payload jsonb, p_request_id uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 actor uuid:=auth.uid(); body jsonb; saved public.advisory_control_requests%rowtype;
 m public.advisory_matters%rowtype; c public.advisory_matter_control%rowtype;
 task public.advisory_issue_tasks%rowtype; d public.advisory_deliverables%rowtype;
 person uuid; item_id uuid; stage public.advisory_matter_stages%rowtype;
 template text; keys text[]; moment timestamptz; result jsonb; event_kind text;
 current_visit public.advisory_stage_visits%rowtype; next_stage public.advisory_matter_stages%rowtype;
 checks jsonb; event_detail jsonb:='{}'; remaining bigint; old_role text;
 fj jsonb; fj_stage jsonb; fj_skip_current boolean:=false;
begin
 if p_request_id is null or p_payload is null or octet_length(p_payload::text)>64000 or jsonb_typeof(p_payload)<>'object' then raise exception 'ADVISORY_INVALID_INPUT'; end if;
 if not public.advisory076_allowed(case when p_action in ('task_save','task_complete') then 'task'
  when p_action in ('task_delete','task_restore') then 'delete' else 'manage' end) then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 body:=jsonb_build_object('matter',p_matter_id,'action',p_action,'payload',p_payload,'version',p_expected_version);
 perform pg_advisory_xact_lock(hashtextextended('advisory076-request:'||p_request_id::text,0));
 select * into saved from public.advisory_control_requests where request_id=p_request_id;
 if found then
  if saved.actor_id<>actor or saved.request_body<>body then raise exception 'ADVISORY_RETRY_MISMATCH'; end if;
  return saved.response;
 end if;
 if p_action='create' then
  if p_matter_id is not null then raise exception 'ADVISORY_INVALID_INPUT'; end if;
  person:=nullif(p_payload->>'lead_id','')::uuid;
  if person is null or length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 500 then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
  perform public.advisory076_check_person(person,true);
  result:=public.create_advisory_matter_with_number((p_payload->>'client_id')::uuid,btrim(p_payload->>'title'),
   coalesce(nullif(p_payload->>'matter_type',''),'general_advisory'),'no_retainer','active',null,
   (clock_timestamp() at time zone 'Asia/Bangkok')::date,null,null,null,null);
  p_matter_id:=(result->>'id')::uuid;
 end if;
 select * into m from public.advisory_matters where id=p_matter_id for update;
 if not found then raise exception 'ADVISORY_MATTER_NOT_FOUND'; end if;
 insert into public.advisory_matter_control(matter_id) values(m.id) on conflict do nothing;
 select * into c from public.advisory_matter_control where matter_id=m.id for update;
 if p_action<>'create' and (p_expected_version is null or p_expected_version<>c.version) then raise exception 'ADVISORY_CHANGED'; end if;
 if (c.closed_at is not null or m.status in ('completed','cancelled')) and p_action<>'reopen' then raise exception 'ADVISORY_CLOSED'; end if;
 moment:=clock_timestamp();
 event_kind:=p_action;
 select definition into fj from public.advisory_journey_snapshots where matter_id=m.id;
 if fj is not null and p_action='stage' and (exists(select 1 from public.advisory_stage_visits where matter_id=m.id and kind='visit' and exited_at is null) or not exists(select 1 from public.advisory_stage_visits v join public.advisory_matter_stages s on s.id=v.stage_id where v.matter_id=m.id and s.stage_key=p_payload->>'stage_key' and v.kind='visit' and v.exited_at is not null)) then raise exception 'ADVISORY_JOURNEY_USE_ADVANCE'; end if;
 if fj is not null and p_action='stage_skip' then
  select value into fj_stage from jsonb_array_elements(fj->'stages') where value->>'key'=p_payload->>'stage_key';
  if fj_stage is null or (fj_stage->>'required')::boolean or fj_stage->>'key'='close' then raise exception 'ADVISORY_JOURNEY_REQUIRED_STAGE'; end if;
  if length(btrim(coalesce(p_payload->>'reason',''))) not between 1 and 4000 then raise exception 'ADVISORY_JOURNEY_REASON_REQUIRED'; end if;
  select * into stage from public.advisory_matter_stages where matter_id=m.id and stage_key=p_payload->>'stage_key';
  select exists(select 1 from public.advisory_stage_visits where stage_id=stage.id and kind='visit' and exited_at is null) into fj_skip_current;
  if exists(select 1 from public.advisory_issue_tasks where stage_id=stage.id and advisory_matter_id=m.id and deleted_at is null and status not in ('completed','cancelled')) then raise exception 'ADVISORY_STAGE_TASKS_OPEN'; end if;
  if not fj_skip_current and exists(select 1 from public.advisory_issue_tasks where id=c.next_task_id and stage_id=stage.id) then raise exception 'ADVISORY_NEXT_ACTION_RESOLUTION_REQUIRED'; end if;
 end if;

 if p_action='create' then
  insert into public.advisory_matter_team values(m.id,person,'lead');
  update public.advisory_matter_control set work_state='working' where matter_id=m.id;
  insert into public.advisory_work_state_events(matter_id,work_state,started_at,actor_id) values(m.id,'working',moment,actor);
 elsif p_action='team' then
  person:=(p_payload->>'user_id')::uuid;
  if p_payload->>'role' not in ('lead','co_work','assistant','qa') or person is null then raise exception 'ADVISORY_INVALID_INPUT'; end if;
  if coalesce((p_payload->>'remove')::boolean,false) then
   delete from public.advisory_matter_team where matter_id=m.id and user_id=person and team_role=p_payload->>'role';
  else
   perform public.advisory076_check_person(person,p_payload->>'role'='lead');
   if p_payload->>'role'='lead' then delete from public.advisory_matter_team where matter_id=m.id and team_role='lead'; end if;
   insert into public.advisory_matter_team values(m.id,person,p_payload->>'role') on conflict do nothing;
  end if;
 elsif p_action='team_edit' then
  person:=nullif(p_payload->>'user_id','')::uuid;
  old_role:=p_payload->>'previous_role';
  if person is null or old_role is null or p_payload->>'role' is null
   or old_role not in ('lead','co_work','assistant','qa')
   or p_payload->>'role' not in ('lead','co_work','assistant','qa') then raise exception 'ADVISORY_INVALID_INPUT'; end if;
  if not exists(select 1 from public.advisory_matter_team where matter_id=m.id and user_id=person and team_role=old_role) then raise exception 'ADVISORY_TEAM_MEMBER_NOT_FOUND'; end if;
  if old_role=p_payload->>'role' then raise exception 'ADVISORY_NO_CHANGE'; end if;
  perform public.advisory076_check_person(person,p_payload->>'role'='lead');
  if exists(select 1 from public.advisory_matter_team where matter_id=m.id and user_id=person and team_role=p_payload->>'role') then raise exception 'ADVISORY_TEAM_ROLE_EXISTS'; end if;
  if p_payload->>'role'='lead' and exists(select 1 from public.advisory_matter_team where matter_id=m.id and team_role='lead') then raise exception 'ADVISORY_LEAD_EXISTS'; end if;
  update public.advisory_matter_team set team_role=p_payload->>'role' where matter_id=m.id and user_id=person and team_role=old_role;
 elsif p_action='stage_complete' or fj_skip_current then
  select * into current_visit from public.advisory_stage_visits where matter_id=m.id and kind='visit' and exited_at is null;
  if not found or current_visit.id is distinct from nullif(p_payload->>'visit_id','')::uuid then raise exception 'ADVISORY_CURRENT_STAGE_CHANGED'; end if;
  select * into stage from public.advisory_matter_stages where id=current_visit.stage_id;
  select * into next_stage from public.advisory_matter_stages where matter_id=m.id and position>stage.position
   and not exists(select 1 from public.advisory_stage_visits v where v.stage_id=advisory_matter_stages.id and v.kind='skip')
   order by position limit 1;
  select count(*) into remaining from public.advisory_issue_tasks where advisory_matter_id=m.id and stage_id=stage.id and deleted_at is null and status not in ('completed','cancelled');
  if remaining>0 then raise exception 'ADVISORY_STAGE_TASKS_OPEN' using detail=jsonb_build_object('count',remaining)::text; end if;
  -- A Task in the next operational Stage stays authoritative; all other Next
  -- Actions need an explicit resolution. Clearing never completes a Task.
  if c.next_task_id is not null then
   select * into task from public.advisory_issue_tasks where id=c.next_task_id and advisory_matter_id=m.id;
  end if;
  if c.next_action is not null or (c.next_task_id is not null and
   (task.stage_id is distinct from next_stage.id or next_stage.stage_key='close' or next_stage.id is null)) then
   if coalesce((p_payload->>'resolve_next_action')::boolean,false) is not true then raise exception 'ADVISORY_NEXT_ACTION_RESOLUTION_REQUIRED'; end if;
   update public.advisory_matter_control set next_task_id=null,next_action=null,next_owner_id=null,next_due=null where matter_id=m.id;
  end if;
  update public.advisory_stage_visits set exited_at=moment,exit_reason=case when fj_skip_current then 'skipped' else 'completed' end where id=current_visit.id;
  if fj_skip_current then insert into public.advisory_stage_visits(matter_id,stage_id,kind,actor_id) values(m.id,stage.id,'skip',actor); end if;
  if next_stage.id is not null and next_stage.stage_key<>'close' then
   insert into public.advisory_stage_visits(matter_id,stage_id,kind,entered_at,actor_id) values(m.id,next_stage.id,'visit',moment,actor);
  end if;
  -- 'close' is a terminal plan marker, not a fabricated visit or lifecycle flip.
  event_detail:=jsonb_build_object(case when fj_skip_current then 'skipped_stage_id' else 'completed_stage_id' end,stage.id,case when fj_skip_current then 'skipped_stage_key' else 'completed_stage_key' end,stage.stage_key,
   'entered_at',current_visit.entered_at,'completed_at',moment,
   'next_stage_id',case when next_stage.stage_key<>'close' then next_stage.id end,
   'next_stage_key',next_stage.stage_key,'ready_for_closing',next_stage.id is null or next_stage.stage_key='close');
 elsif p_action='work_state' then
  if p_payload->>'state' not in ('working','waiting_client','waiting_external','waiting_internal','on_hold') or p_payload->>'state' is null then raise exception 'ADVISORY_INVALID_INPUT'; end if;
  if c.work_state is not distinct from p_payload->>'state' then raise exception 'ADVISORY_NO_CHANGE'; end if;
  update public.advisory_work_state_events set ended_at=moment where matter_id=m.id and ended_at is null;
  insert into public.advisory_work_state_events(matter_id,work_state,started_at,reason,actor_id) values(m.id,p_payload->>'state',moment,nullif(btrim(p_payload->>'reason'),''),actor);
  update public.advisory_matter_control set work_state=p_payload->>'state' where matter_id=m.id;
 elsif p_action in ('stage','stage_skip') then
  null; -- Plan creation and transition below, in this same transaction.
 elsif p_action='next_action' then
  item_id:=nullif(p_payload->>'task_id','')::uuid;
  if item_id is not null then
   select * into task from public.advisory_issue_tasks where id=item_id and advisory_matter_id=m.id and deleted_at is null for update;
   if not found or task.status not in ('pending','in_progress','waiting') or task.completed_at is not null then raise exception 'ADVISORY_TASK_NOT_AVAILABLE'; end if;
   update public.advisory_matter_control set next_task_id=item_id,next_action=null,next_owner_id=null,next_due=null where matter_id=m.id;
  else
   person:=nullif(p_payload->>'owner_id','')::uuid;
   perform public.advisory076_check_person(person);
   if nullif(btrim(p_payload->>'title'),'') is null and (person is not null or nullif(p_payload->>'due_date','') is not null) then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
   update public.advisory_matter_control set next_task_id=null,next_action=nullif(btrim(p_payload->>'title'),''),next_owner_id=person,next_due=nullif(p_payload->>'due_date','')::date where matter_id=m.id;
  end if;
 elsif p_action in ('task_save','task_complete','task_delete','task_restore') then
  item_id:=nullif(p_payload->>'id','')::uuid;
  if item_id is not null then
   select * into task from public.advisory_issue_tasks where id=item_id and advisory_matter_id=m.id for update;
   if not found then raise exception 'ADVISORY_TASK_NOT_FOUND'; end if;
   if (task.deleted_at is not null)<>(p_action='task_restore') then raise exception 'ADVISORY_TASK_NOT_AVAILABLE'; end if;
  elsif p_action<>'task_save' then raise exception 'ADVISORY_TASK_NOT_FOUND'; end if;
  if p_action='task_complete' then
   if task.status in ('completed','cancelled') then raise exception 'ADVISORY_NO_CHANGE'; end if;
   update public.advisory_issue_tasks set status='completed',completed_at=moment,updated_at=moment where id=item_id;
  elsif p_action='task_delete' then
   update public.advisory_issue_tasks set deleted_at=moment,deleted_by=actor::text,updated_at=moment where id=item_id;
  elsif p_action='task_restore' then
   update public.advisory_issue_tasks set deleted_at=null,deleted_by=null,updated_at=moment where id=item_id;
  else
   if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 500 then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
   person:=nullif(p_payload->>'assignee_user_id','')::uuid;
   if item_id is null or person is distinct from task.assignee_user_id then perform public.advisory076_check_person(person); end if;
   if item_id is null then
    insert into public.advisory_issue_tasks(advisory_matter_id,advisory_issue_id,client_id,title,task_type,status,priority,assignee_user_id,stage_id,due_date,completed_at,note)
    values(m.id,nullif(p_payload->>'issue_id','')::uuid,m.client_id,btrim(p_payload->>'title'),coalesce(p_payload->>'task_type','general'),coalesce(p_payload->>'status','pending'),coalesce(p_payload->>'priority','normal'),person,
     nullif(p_payload->>'stage_id','')::uuid,nullif(p_payload->>'due_date','')::date,case when p_payload->>'status'='completed' then moment end,p_payload->>'note') returning id into item_id;
   else
    update public.advisory_issue_tasks set title=btrim(p_payload->>'title'),
     advisory_issue_id=case when p_payload ? 'issue_id' then nullif(p_payload->>'issue_id','')::uuid else task.advisory_issue_id end,
     status=coalesce(p_payload->>'status',task.status),priority=coalesce(p_payload->>'priority',task.priority),
     assignee_user_id=person,stage_id=nullif(p_payload->>'stage_id','')::uuid,due_date=nullif(p_payload->>'due_date','')::date,
     completed_at=case when coalesce(p_payload->>'status',task.status)=task.status then task.completed_at when p_payload->>'status'='completed' then moment end,
     note=p_payload->>'note',updated_at=moment where id=item_id;
    -- assignee_name is intentionally never overwritten, even on explicit reassignment.
   end if;
  end if;
  event_kind:=null; -- The table trigger records Task Activity and raw audit once.
 elsif p_action='deliverable' then
  item_id:=nullif(p_payload->>'id','')::uuid;
  person:=nullif(p_payload->>'owner_id','')::uuid;
  if item_id is not null then
   select * into d from public.advisory_deliverables where id=item_id and matter_id=m.id for update;
   if not found then raise exception 'ADVISORY_DELIVERABLE_NOT_FOUND'; end if;
  end if;
  if item_id is null or person is distinct from d.owner_id then perform public.advisory076_check_person(person); end if;
  if item_id is null then
   insert into public.advisory_deliverables(matter_id,title,status,owner_id,due_date,version_label,drive_url)
   values(m.id,btrim(p_payload->>'title'),coalesce(p_payload->>'status','draft'),person,nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'version_label',''),nullif(p_payload->>'drive_url','')) returning id into item_id;
  else
   update public.advisory_deliverables set title=btrim(p_payload->>'title'),status=p_payload->>'status',owner_id=person,due_date=nullif(p_payload->>'due_date','')::date,
   version_label=nullif(p_payload->>'version_label',''),drive_url=nullif(p_payload->>'drive_url',''),updated_at=moment where id=item_id;
  end if;
 elsif p_action='note' then
  if length(btrim(coalesce(p_payload->>'text',''))) not between 1 and 4000 then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
 elsif p_action='close' then
  if nullif(btrim(p_payload->>'summary'),'') is null or p_payload->>'outcome' is null then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
  checks:=public.advisory_workflow_checks(m.id);
  -- No override architecture. An early cancellation/other outcome still reports
  -- unresolved work; an explicit reason acknowledges it without completing it.
  if not (checks->>'ready_to_close')::boolean then
   if p_payload->>'outcome' in ('completed','agreement') then
    raise exception 'ADVISORY_CLOSING_BLOCKED' using detail=checks::text;
   elsif nullif(btrim(p_payload->>'unresolved_reason'),'') is null then
    raise exception 'ADVISORY_CLOSING_RESOLUTION_REQUIRED' using detail=checks::text;
   end if;
  end if;
  event_detail:=jsonb_build_object('closing_checks',checks,'unresolved_reason',nullif(btrim(p_payload->>'unresolved_reason'),''));
  update public.advisory_stage_visits set exited_at=moment,exit_reason='closed' where matter_id=m.id and kind='visit' and exited_at is null;
  update public.advisory_work_state_events set ended_at=moment where matter_id=m.id and ended_at is null;
  update public.advisory_matter_control set closed_at=moment,outcome=p_payload->>'outcome',outcome_summary=btrim(p_payload->>'summary'),
   follow_up=nullif(btrim(p_payload->>'follow_up'),''),case_reference=nullif(btrim(p_payload->>'case_reference'),''),next_task_id=null,next_action=null,next_owner_id=null,next_due=null,work_state=null where matter_id=m.id;
  update public.advisory_matters set status=case when p_payload->>'outcome'='cancelled' then 'cancelled' else 'completed' end,updated_at=moment where id=m.id;
 elsif p_action='reopen' then
  if (c.closed_at is null and m.status not in ('completed','cancelled')) or nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
  update public.advisory_matter_control set closed_at=null,outcome=null,outcome_summary=null,follow_up=null,case_reference=null,work_state='working' where matter_id=m.id;
  update public.advisory_matters set status='active',updated_at=moment where id=m.id;
  insert into public.advisory_work_state_events(matter_id,work_state,started_at,reason,actor_id) values(m.id,'working',moment,p_payload->>'reason',actor);
  -- Previous closing evidence stays in Activity; reopening does not fake a current visit.
 else raise exception 'ADVISORY_ACTION_INVALID'; end if;

 if p_action='create' then
  perform public.advisory086_snapshot(m.id,m.matter_type,nullif(p_payload->>'variant_id','')::uuid,nullif(p_payload->>'journey_version_id','')::uuid);
 end if;
 if p_action in ('create','stage','stage_skip') and not fj_skip_current then
  if not exists(select 1 from public.advisory_matter_stages where matter_id=m.id) then
   template:=coalesce(nullif(p_payload->>'template',''),case m.matter_type when 'contract_review' then 'contract' when 'legal_opinion' then 'opinion' when 'license_regulatory' then 'license' when 'negotiation' then 'negotiation' else 'general' end);
   keys:=public.advisory076_template(template);
   if keys is null then raise exception 'ADVISORY_TEMPLATE_INVALID'; end if;
   insert into public.advisory_matter_stages(matter_id,template_key,stage_key,position) select m.id,template,k,n-1 from unnest(keys) with ordinality s(k,n);
  end if;
  if p_action='create' then
   -- Start only this newly created Matter, using its actual ordered plan.
   select * into stage from public.advisory_matter_stages
    where matter_id=m.id and stage_key<>'close' order by position asc limit 1;
   if not found then raise exception 'ADVISORY_INITIAL_STAGE_NOT_FOUND'; end if;
   insert into public.advisory_stage_visits(matter_id,stage_id,kind,entered_at,actor_id)
    values(m.id,stage.id,'visit',moment,actor)
    returning jsonb_build_object('initial_stage',jsonb_build_object(
     'stage_id',stage.id,'stage_key',stage.stage_key,'template_key',stage.template_key,
     'visit_id',id,'kind',kind,'entered_at',entered_at)) into event_detail;
  elsif p_action in ('stage','stage_skip') then
   select * into stage from public.advisory_matter_stages where matter_id=m.id and stage_key=p_payload->>'stage_key';
   if not found then raise exception 'ADVISORY_STAGE_NOT_FOUND'; end if;
   if stage.stage_key='close' then raise exception 'ADVISORY_USE_CLOSE'; end if;
   if exists(select 1 from public.advisory_stage_visits where stage_id=stage.id and kind='visit' and exited_at is null) then raise exception 'ADVISORY_STAGE_ALREADY_CURRENT'; end if;
   if p_action='stage' then
    select * into current_visit from public.advisory_stage_visits where matter_id=m.id and kind='visit' and exited_at is null;
    if found then
     -- Old manual stage selection cannot bypass the normal Task/Next Action guard.
     if exists(select 1 from public.advisory_issue_tasks where advisory_matter_id=m.id and stage_id=current_visit.stage_id and deleted_at is null and status not in ('completed','cancelled')) then raise exception 'ADVISORY_STAGE_TASKS_OPEN'; end if;
     if c.next_task_id is not null or c.next_action is not null then raise exception 'ADVISORY_NEXT_ACTION_RESOLUTION_REQUIRED'; end if;
    end if;
   end if;
   if p_action='stage_skip' then
    if exists(select 1 from public.advisory_stage_visits where stage_id=stage.id) then raise exception 'ADVISORY_STAGE_HAS_HISTORY'; end if;
    insert into public.advisory_stage_visits(matter_id,stage_id,kind,actor_id) values(m.id,stage.id,'skip',actor);
   else
    update public.advisory_stage_visits set exited_at=moment,exit_reason='transition' where matter_id=m.id and kind='visit' and exited_at is null;
    insert into public.advisory_stage_visits(matter_id,stage_id,kind,entered_at,actor_id) values(m.id,stage.id,'visit',moment,actor);
   end if;
  end if;
 end if;
 if event_kind is not null then
  insert into public.advisory_matter_activities(matter_id,kind,actor_id,detail) values(m.id,event_kind,actor,
   jsonb_build_object('input',p_payload,'previous_control',to_jsonb(c),'previous_lifecycle',m.status,'previous_deliverable',case when p_action='deliverable' then to_jsonb(d) end,'item_id',item_id)||event_detail);
 end if;
 update public.advisory_matter_control set version=version+1 where matter_id=m.id returning jsonb_build_object('matter_id',m.id,'version',version,'item_id',item_id) into result;
 if p_action='stage_complete' or fj_skip_current then result:=result||event_detail; end if;
 insert into public.advisory_control_requests(request_id,actor_id,request_body,response) values(p_request_id,actor,body,result);
 return result;
end; $function$
;
CREATE OR REPLACE FUNCTION public.advisory_control_read(p_matter_id uuid DEFAULT NULL::uuid, p_query jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare result jsonb; today date:=(current_timestamp at time zone 'Asia/Bangkok')::date;
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 with overdue_items as materialized (select * from public.advisory_overdue_work()),
 ranked_overdue as (
  select o.*,row_number() over(partition by matter_id order by due_date,source COLLATE "C",source_id) position from overdue_items o
 ), overdue as (
  select matter_id,count(*) overdue_item_count,min(due_date) oldest_overdue_due,max(overdue_days) oldest_overdue_days,
   coalesce(max(overdue_days) filter(where is_next_action),0) next_action_overdue_days,
   jsonb_agg(to_jsonb(o)-'matter_id'-'position' order by due_date,source COLLATE "C",source_id) filter(where position<=3) overdue_preview
  from ranked_overdue o group by matter_id
 ), items as (
 select m.*,coalesce(o.overdue_item_count,0)>0 has_overdue_work,
 coalesce(o.overdue_item_count,0) overdue_item_count,o.oldest_overdue_due,coalesce(o.oldest_overdue_days,0) oldest_overdue_days,
 coalesce(o.next_action_overdue_days,0) next_action_overdue_days,coalesce(o.overdue_preview,'[]'::jsonb) overdue_preview,
 cl.name client_name,coalesce(c.version,0) version,c.work_state,c.closed_at,c.outcome,c.outcome_summary,c.follow_up,c.case_reference,
 c.next_task_id,coalesce(t.title,c.next_action) next_action,coalesce(t.assignee_user_id,c.next_owner_id) next_owner_id,
 coalesce(nullif(np.staff_name,''),np.full_name,t.assignee_name) next_owner_name,coalesce(t.due_date,c.next_due) next_due,
 lead.user_id lead_id,coalesce(nullif(lp.staff_name,''),lp.full_name,m.responsible_lawyer) lead_name,
 st.stage_key,st.template_key,v.entered_at,
 (select s->>'name_th' from public.advisory_journey_snapshots j,lateral jsonb_array_elements(j.definition->'stages') s where j.matter_id=m.id and s->>'key'=st.stage_key) stage_name_th,
 (select s->>'name_en' from public.advisory_journey_snapshots j,lateral jsonb_array_elements(j.definition->'stages') s where j.matter_id=m.id and s->>'key'=st.stage_key) stage_name_en,
 case when v.entered_at is not null then greatest(0,today-(v.entered_at at time zone 'Asia/Bangkok')::date) end stage_days,
 greatest(0,coalesce((c.closed_at at time zone 'Asia/Bangkok')::date,today)-coalesce(m.start_date,(m.created_at at time zone 'Asia/Bangkok')::date)) age_days
 from public.advisory_matters m join public.clients cl on cl.id=m.client_id
 left join overdue o on o.matter_id=m.id
 left join public.advisory_matter_control c on c.matter_id=m.id
 left join public.advisory_issue_tasks t on t.id=c.next_task_id and t.deleted_at is null and t.status in ('pending','in_progress','waiting') and t.completed_at is null
 left join public.user_profiles np on np.id=coalesce(t.assignee_user_id,c.next_owner_id)
 left join public.advisory_matter_team lead on lead.matter_id=m.id and lead.team_role='lead'
 left join public.user_profiles lp on lp.id=lead.user_id
 left join public.advisory_stage_visits v on v.matter_id=m.id and v.kind='visit' and v.exited_at is null
 left join public.advisory_matter_stages st on st.id=v.stage_id
 ), filtered as (
 select * from items i where (p_matter_id is null or i.id=p_matter_id)
 and (coalesce(p_query->>'search','')='' or concat_ws(' ',i.matter_no,i.title,i.client_name,i.lead_name) ilike '%'||(p_query->>'search')||'%')
 and (coalesce(p_query->>'client_id','')='' or i.client_id::text=p_query->>'client_id')
 and (coalesce(p_query->>'type','')='' or i.matter_type=p_query->>'type')
 and (coalesce(p_query->>'lead','')='' or i.lead_id::text=p_query->>'lead')
 and (coalesce(p_query->>'state','')='' or i.work_state=p_query->>'state')
 and case coalesce(p_query->>'tab','all') when 'mine' then exists(select 1 from public.advisory_matter_team tm where tm.matter_id=i.id and tm.user_id=auth.uid()) or i.next_owner_id=auth.uid()
 when 'overdue' then i.has_overdue_work
 when 'missing' then i.closed_at is null and i.next_action is null
 when 'closed' then i.closed_at is not null else true end
 ), page as (
 select * from filtered order by case when p_query->>'sort'='due' then next_due end asc nulls last,created_at desc,id
 limit least(50,greatest(1,coalesce((p_query->>'limit')::int,20))) offset greatest(0,coalesce((p_query->>'offset')::int,0))
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'),'total',(select count(*) from filtered),
 'summary',(select jsonb_build_object('open',count(*) filter(where closed_at is null and status not in ('completed','cancelled')),
 'overdue',count(*) filter(where has_overdue_work),'overdue_items',coalesce(sum(overdue_item_count),0),'waiting',count(*) filter(where closed_at is null and work_state='waiting_client'),
 'closed_week',count(*) filter(where closed_at>=date_trunc('week',current_timestamp at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')) from items),
 'permissions',jsonb_build_object('manage',public.advisory076_allowed('manage'),'task',public.advisory076_allowed('task'),'delete',public.advisory076_allowed('delete'))) into result;
 if p_matter_id is not null then
  if jsonb_array_length(result->'items')<>1 then raise exception 'ADVISORY_MATTER_NOT_FOUND'; end if;
  result:=result||jsonb_build_object(
   'journey_snapshot',(select to_jsonb(j) from public.advisory_journey_snapshots j where matter_id=p_matter_id),
   'state_history',(select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]') from (select work_state,started_at,ended_at,reason from public.advisory_work_state_events where matter_id=p_matter_id order by started_at desc limit 10) x),
   'team',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('name',coalesce(nullif(p.staff_name,''),p.full_name)) order by t.team_role,p.full_name),'[]') from public.advisory_matter_team t join public.user_profiles p on p.id=t.user_id where t.matter_id=p_matter_id),
   'stages',(select coalesce(jsonb_agg(to_jsonb(s)||coalesce((select element-'key' from public.advisory_journey_snapshots j, lateral jsonb_array_elements(j.definition->'stages') element where j.matter_id=s.matter_id and element->>'key'=s.stage_key),'{}'::jsonb)||jsonb_build_object('visits',coalesce(v.rows,'[]'),'minutes',tm.minutes,'elapsed_seconds',(select sum(extract(epoch from coalesce(exited_at,current_timestamp)-entered_at)) from public.advisory_stage_visits where stage_id=s.id and kind='visit'),'task_total',(select count(*) from public.advisory_issue_tasks where stage_id=s.id and deleted_at is null),'task_completed',(select count(*) from public.advisory_issue_tasks where stage_id=s.id and deleted_at is null and status='completed'),'unclassified',tm.unclassified) order by s.position),'[]')
    from public.advisory_matter_stages s
    left join lateral(select jsonb_agg(to_jsonb(x) order by recorded_at desc) rows from (select * from public.advisory_stage_visits where stage_id=s.id order by recorded_at desc limit 20) x) v on true
    left join lateral(select sum(minutes) minutes,count(*) filter(where stage_id is null) unclassified from public.advisory_time_logs where advisory_matter_id=p_matter_id and stage_id=s.id and deleted_at is null) tm on true where s.matter_id=p_matter_id),
   'time',(select jsonb_build_object('minutes',coalesce(sum(minutes),0),'core',coalesce(sum(minutes) filter(where billable),0),'support',coalesce(sum(minutes) filter(where not billable),0),'unclassified',count(*) filter(where stage_id is null)) from public.advisory_time_logs where advisory_matter_id=p_matter_id and deleted_at is null),
   'other_matters',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,matter_no,title,status from public.advisory_matters where client_id=(select client_id from public.advisory_matters where id=p_matter_id) and id<>p_matter_id order by created_at desc limit 5) x));
 end if;
 return result;
end; $function$
;
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'general_advisory')::uuid,'general_advisory',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'general_advisory')::uuid,md5('advisory086-variant:'||'general_advisory')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"intake","name_th":"รับเรื่อง","name_en":"Intake","required":true},{"key":"information","name_th":"เก็บข้อมูล","name_en":"Information gathering","required":true},{"key":"analysis","name_th":"วิเคราะห์","name_en":"Analysis","required":true},{"key":"execution","name_th":"ดำเนินการและให้คำแนะนำ","name_en":"Advice and execution","required":true},{"key":"follow_up","name_th":"ติดตาม","name_en":"Follow-up","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'contract_business_documents')::uuid,'contract_business_documents',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'contract_business_documents')::uuid,md5('advisory086-variant:'||'contract_business_documents')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"intake","name_th":"รับเรื่อง","name_en":"Intake","required":true},{"key":"requirements","name_th":"รวบรวมความต้องการ","name_en":"Requirements","required":true},{"key":"draft_review","name_th":"ร่างและตรวจเอกสาร","name_en":"Drafting and review","required":true},{"key":"internal_review","name_th":"ตรวจภายใน","name_en":"Internal review","required":false},{"key":"delivery_negotiation","name_th":"ส่งมอบและเจรจา","name_en":"Delivery and negotiation","required":false},{"key":"final","name_th":"ฉบับสุดท้าย","name_en":"Final version","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'legal_analysis_compliance')::uuid,'legal_analysis_compliance',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'legal_analysis_compliance')::uuid,md5('advisory086-variant:'||'legal_analysis_compliance')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"brief","name_th":"กำหนดประเด็น","name_en":"Issue scoping","required":true},{"key":"facts","name_th":"เก็บข้อเท็จจริง","name_en":"Fact gathering","required":true},{"key":"analysis","name_th":"วิเคราะห์","name_en":"Analysis","required":true},{"key":"draft_recommendation","name_th":"ร่างข้อเสนอและความเห็น","name_en":"Draft recommendations and opinion","required":true},{"key":"review","name_th":"ตรวจทาน","name_en":"Review","required":true},{"key":"delivery_implementation","name_th":"ส่งมอบและนำไปใช้","name_en":"Delivery and implementation","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'negotiation_pre_litigation')::uuid,'negotiation_pre_litigation',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'negotiation_pre_litigation')::uuid,md5('advisory086-variant:'||'negotiation_pre_litigation')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"intake","name_th":"รับเรื่อง","name_en":"Intake","required":true},{"key":"evidence_position","name_th":"หลักฐานและจุดยืน","name_en":"Evidence and position","required":true},{"key":"strategy","name_th":"วางกลยุทธ์","name_en":"Strategy","required":true},{"key":"contact","name_th":"ติดต่อและทวงถาม","name_en":"Contact and demand","required":true},{"key":"negotiation","name_th":"เจรจา","name_en":"Negotiation","required":true},{"key":"agreement","name_th":"ข้อตกลง","name_en":"Agreement","required":true},{"key":"follow_up","name_th":"ติดตาม","name_en":"Follow-up","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'corporate_transactions')::uuid,'corporate_transactions',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'corporate_transactions')::uuid,md5('advisory086-variant:'||'corporate_transactions')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"intake","name_th":"รับเรื่อง","name_en":"Intake","required":true},{"key":"document_review","name_th":"เอกสารและตรวจสอบ","name_en":"Documents and review","required":true},{"key":"structure_preparation","name_th":"โครงสร้างและเตรียมการ","name_en":"Structure and preparation","required":true},{"key":"transaction_documents","name_th":"เอกสารดำเนินการ","name_en":"Transaction documents","required":true},{"key":"filing_signing","name_th":"ยื่น ลงนาม และปิดธุรกรรม","name_en":"Filing, signing and closing","required":true},{"key":"follow_up","name_th":"ติดตาม","name_en":"Follow-up","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'government_regulatory')::uuid,'government_regulatory',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'government_regulatory')::uuid,md5('advisory086-variant:'||'government_regulatory')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"legal_route","name_th":"ตรวจเส้นทางกฎหมาย","name_en":"Legal route assessment","required":true},{"key":"preparation","name_th":"เตรียมเอกสาร","name_en":"Document preparation","required":true},{"key":"submission_contact","name_th":"ยื่นและติดต่อ","name_en":"Submission and contact","required":true},{"key":"clarification_follow_up","name_th":"ชี้แจงและติดตาม","name_en":"Clarification and follow-up","required":true},{"key":"authority_result","name_th":"ผลอนุมัติและตอบกลับ","name_en":"Authority response","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'administrative_challenge')::uuid,'administrative_challenge',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'administrative_challenge')::uuid,md5('advisory086-variant:'||'administrative_challenge')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"order_deadline","name_th":"ตรวจคำสั่งและกำหนดเวลา","name_en":"Order and deadline review","required":true},{"key":"evidence","name_th":"รวบรวมหลักฐาน","name_en":"Evidence gathering","required":true},{"key":"legal_grounds","name_th":"วิเคราะห์ข้อกฎหมาย","name_en":"Legal grounds","required":true},{"key":"draft_challenge","name_th":"ร่างอุทธรณ์และโต้แย้ง","name_en":"Draft appeal or challenge","required":true},{"key":"submission","name_th":"ยื่น","name_en":"Submission","required":true},{"key":"decision_follow_up","name_th":"ติดตามคำวินิจฉัย","name_en":"Decision follow-up","required":true},{"key":"close","name_th":"ปิดงานหรือส่งต่อคดี","name_en":"Close or refer to litigation","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'employment_foreign_workforce')::uuid,'employment_foreign_workforce',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'employment_foreign_workforce')::uuid,md5('advisory086-variant:'||'employment_foreign_workforce')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"brief","name_th":"รับประเด็น","name_en":"Issue intake","required":true},{"key":"workforce_information","name_th":"ข้อมูลพนักงานและบริษัท","name_en":"Employee and company information","required":true},{"key":"analysis","name_th":"วิเคราะห์","name_en":"Analysis","required":true},{"key":"documents_guidance","name_th":"เอกสารและแนวทาง","name_en":"Documents and guidance","required":true},{"key":"execution","name_th":"ดำเนินการ","name_en":"Execution","required":true},{"key":"follow_up","name_th":"ติดตาม","name_en":"Follow-up","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'ip_registration')::uuid,'ip_registration',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'ip_registration')::uuid,md5('advisory086-variant:'||'ip_registration')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"search_review","name_th":"ตรวจข้อมูลและค้น","name_en":"Information review and search","required":true},{"key":"strategy","name_th":"วางกลยุทธ์","name_en":"Strategy","required":true},{"key":"application_preparation","name_th":"เตรียมคำขอ","name_en":"Application preparation","required":true},{"key":"submission","name_th":"ยื่น","name_en":"Submission","required":true},{"key":"registrar_review","name_th":"ตรวจโดยนายทะเบียนและแก้ไข","name_en":"Registrar review and amendments","required":true},{"key":"registration","name_th":"จดทะเบียน","name_en":"Registration","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||'real_estate_due_diligence')::uuid,'real_estate_due_diligence',true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||'real_estate_due_diligence')::uuid,md5('advisory086-variant:'||'real_estate_due_diligence')::uuid,1,'{"name_th":"มาตรฐาน","name_en":"Standard","stages":[{"key":"review_scope","name_th":"กำหนดขอบเขตตรวจ","name_en":"Review scope","required":true},{"key":"title_documents","name_th":"เอกสารสิทธิ","name_en":"Title documents","required":true},{"key":"encumbrances_restrictions","name_th":"ตรวจภาระและข้อจำกัด","name_en":"Encumbrances and restrictions","required":true},{"key":"risk_analysis","name_th":"วิเคราะห์ความเสี่ยง","name_en":"Risk analysis","required":true},{"key":"report_recommendations","name_th":"รายงานและคำแนะนำ","name_en":"Report and recommendations","required":true},{"key":"close","name_th":"ปิดงาน","name_en":"Close","required":true}]}'::jsonb);
DO $permissions$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'advisory086_%' or p.proname in ('advisory_journey_catalog','advisory_journey_manage')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f); end loop; end; $permissions$;
grant execute on function public.advisory086_admin(),public.advisory_journey_catalog(text),public.advisory_journey_manage(uuid,text,jsonb,uuid,bigint) to authenticated;

DO $preserve$ declare b jsonb; a jsonb; f jsonb; begin
 select state into b from advisory086_before; WITH structure AS (WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
catalog AS (
 SELECT t.relname name,jsonb_build_object(
  'schema',t.nspname,'kind',t.relkind,'owner',pg_get_userbyid(t.relowner),
  'rls_enabled',t.relrowsecurity,'rls_forced',t.relforcerowsecurity,'acl',t.relacl::text,
  'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
    'acl',a.attacl::text) ORDER BY a.attnum),'[]') FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'validated',c.convalidated,
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname COLLATE "C"),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f' AND c.conrelid NOT IN (select c2.oid from pg_class c2 join pg_namespace n2 on n2.oid=c2.relnamespace where n2.nspname='public' and c2.relname in ('advisory_journey_variants','advisory_journey_versions','advisory_journey_snapshots','advisory_journey_requests'))),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text COLLATE "C"),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname COLLATE "C"),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname COLLATE "C"),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section','advisory_workflow_checks','advisory_overdue_work')))
 select jsonb_build_object('catalog',
 (select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs','advisory_matter_counters','advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'contract',jsonb_build_object('tables',(select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'functions',(select jsonb_object_agg(name,evidence) from new_functions),
 'deltas',(select jsonb_object_agg(name,jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where name='advisory_issue_tasks' and x->>'name' in ('advisory_matter_id','advisory_issue_id','assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id'),
 'constraints',(select coalesce(jsonb_agg(x order by (x->>'name') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' like '%INDEX advisory076_%'),
 'triggers',(select coalesce(jsonb_agg(x order by (x->>'definition') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'triggers') x where x->>'definition' like '%TRIGGER advisory076_%'))) from catalog where name in ('advisory_matters','advisory_issue_tasks','advisory_time_logs','advisory_issues'))))), rows AS (with raw(name,j) as (select 'advisory_matters',to_jsonb(t) from public.advisory_matters t union all select 'advisory_issues',to_jsonb(t) from public.advisory_issues t union all select 'advisory_issue_tasks',to_jsonb(t) from public.advisory_issue_tasks t union all select 'advisory_advice_records',to_jsonb(t) from public.advisory_advice_records t union all select 'advisory_time_logs',to_jsonb(t) from public.advisory_time_logs t union all select 'advisory_matter_counters',to_jsonb(t) from public.advisory_matter_counters t union all select 'advisory_matter_control',to_jsonb(t) from public.advisory_matter_control t union all select 'advisory_matter_team',to_jsonb(t) from public.advisory_matter_team t union all select 'advisory_matter_stages',to_jsonb(t) from public.advisory_matter_stages t union all select 'advisory_stage_visits',to_jsonb(t) from public.advisory_stage_visits t union all select 'advisory_work_state_events',to_jsonb(t) from public.advisory_work_state_events t union all select 'advisory_matter_activities',to_jsonb(t) from public.advisory_matter_activities t union all select 'advisory_deliverables',to_jsonb(t) from public.advisory_deliverables t union all select 'advisory_control_requests',to_jsonb(t) from public.advisory_control_requests t), scope(name) as (values ('advisory_matters'),('advisory_issues'),('advisory_issue_tasks'),('advisory_advice_records'),('advisory_time_logs'),('advisory_matter_counters'),('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests'))
 select jsonb_object_agg(name,evidence) from (select s.name,jsonb_build_object('count',count(j),'sha256',encode(sha256(convert_to(coalesce(string_agg(j::text,E'\n' order by j::text COLLATE "C"),''),'UTF8')),'hex')) evidence from scope s left join raw r using(name) group by s.name) fingerprints)
 SELECT s.state||jsonb_build_object('rows',(select * from rows)) AS state FROM structure s(state) into a; WITH rels as (select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'advisory_journey_%' and c.relkind in ('r','p')),
 funcs as (select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'advisory086_%' or p.proname in ('advisory_journey_catalog','advisory_journey_manage')))
 select jsonb_build_object('tables',coalesce((select jsonb_object_agg(r.relname,jsonb_build_object('owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'acl',r.relacl::text,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true),'validated',convalidated) order by conname collate "C"),'[]') from pg_constraint where conrelid=r.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text collate "C"),'[]') from pg_index where indrelid=r.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'roles',(select jsonb_agg(rolname order by rolname collate "C") from pg_roles where oid=any(polroles)),'permissive',polpermissive,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname collate "C"),'[]') from pg_policy where polrelid=r.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(oid,true),'enabled',tgenabled) order by tgname collate "C"),'[]') from pg_trigger where tgrelid=r.oid and not tgisinternal))) from rels r),'{}'),
 'functions',coalesce((select jsonb_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'execute',(select jsonb_object_agg(role,has_function_privilege(role,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role))) from funcs p),'{}')) into f;
 if a->'rows' is distinct from b->'rows' or a->'catalog' is distinct from b->'catalog' or encode(sha256(convert_to((a->'contract')::text,'UTF8')),'hex')<>'3c516597a3c6d66b8bb0185b904014df0af04b282b1e28114695ba93aaae20f1' then raise exception 'ADVISORY086_PRESERVATION_FAILED'; end if;
 if encode(sha256(convert_to((f)::text,'UTF8')),'hex')<>'a9e6df88761de388f25deaf908659e2011b888cde45ecf6589c24e0549ab2cde' then raise exception 'ADVISORY086_FOOTPRINT_MISMATCH'; end if;
end; $preserve$;
COMMIT;
