-- Phase 8C: Non-Litigation Matter Control. MANUAL HUMAN GATE ONLY.
-- Existing identities, names, dates, statuses, time and Finance rows are preserved.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- BEGIN GENERATED PRESERVATION PRELUDE
lock table public.advisory_matters,public.advisory_issues,public.advisory_issue_tasks,public.advisory_time_logs,public.advisory_advice_records,public.advisory_matter_counters,public.clients,public.user_profiles,public.case_audit_logs in share mode;
lock table public.finance_expenses in share mode;
lock table public.finance_invoices in share mode;
lock table public.finance_quotations in share mode;
lock table public.finance_company_ledger in share mode;
lock table public.finance_expense_claims in share mode;
lock table public.finance_fee_agreements in share mode;
lock table public.finance_billable_charges in share mode;
lock table public.finance_compensation_batches in share mode;
lock table public.finance_direct_money_receipts in share mode;
lock table public.finance_billing_installment_charge_bridges in share mode;
create temporary table advisory076_before(state jsonb) on commit drop;
insert into advisory076_before WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
 ('clients'), ('user_profiles'), ('case_audit_logs')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
raw(table_name,j) AS MATERIALIZED (
 SELECT 'advisory_matters',to_jsonb(t) FROM public.advisory_matters t UNION ALL
 SELECT 'advisory_issues',to_jsonb(t) FROM public.advisory_issues t UNION ALL
 SELECT 'advisory_issue_tasks',to_jsonb(t) FROM public.advisory_issue_tasks t UNION ALL
 SELECT 'advisory_advice_records',to_jsonb(t) FROM public.advisory_advice_records t UNION ALL
 SELECT 'advisory_time_logs',to_jsonb(t) FROM public.advisory_time_logs t UNION ALL
 SELECT 'advisory_matter_counters',to_jsonb(t) FROM public.advisory_matter_counters t UNION ALL
 SELECT 'clients',to_jsonb(t) FROM public.clients t UNION ALL
 SELECT 'user_profiles',to_jsonb(t) FROM public.user_profiles t UNION ALL
 SELECT 'case_audit_logs',to_jsonb(t) FROM public.case_audit_logs t
 WHERE t.table_name IN ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs')
),
rows AS MATERIALIZED (
 SELECT table_name,j,j->>'id' id,nullif(j->>'deleted_at','') IS NULL live FROM raw
),
fingerprints AS (
 SELECT s.name,count(r.j) row_count,
  encode(sha256(convert_to(coalesce(string_agg(r.j::text,E'\n' ORDER BY r.j::text),''),'UTF8')),'hex') rows_sha256
 FROM scope s LEFT JOIN rows r ON r.table_name=s.name GROUP BY s.name
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
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text,c.conname),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
),
function_roots(oid) AS (
 SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
  ('create_advisory_matter_with_number','can_create_advisory_matter','generate_advisory_matter_no',
   'people_is_assignable','people_is_active_admin','admin074_session_allowed')
 UNION SELECT g.tgfoid FROM pg_trigger g JOIN relations t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'
 UNION SELECT d.refobjid FROM pg_policy p JOIN relations t ON t.oid=p.polrelid
  JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
),
function_edges(parent,child) AS (
 SELECT p.oid,q.oid FROM pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace
 JOIN pg_proc q ON q.prokind='f' JOIN pg_namespace qn ON qn.oid=q.pronamespace
 WHERE p.prokind='f' AND pn.nspname IN ('public','auth') AND qn.nspname IN ('public','auth')
 AND q.proname ~ '^[a-zA-Z_][a-zA-Z_0-9]*$'
 AND p.prosrc ~ ('\m'||q.proname||'\M[[:space:]]*\(')
 UNION SELECT d.objid,d.refobjid FROM pg_depend d
 WHERE d.classid='pg_proc'::regclass AND d.refclassid='pg_proc'::regclass
),
function_walk(oid,path,depth) AS (
 SELECT oid,ARRAY[oid],0 FROM function_roots
 UNION ALL SELECT e.child,w.path||e.child,w.depth+1 FROM function_walk w
 JOIN function_edges e ON e.parent=w.oid WHERE w.depth<8 AND NOT e.child=ANY(w.path)
),
functions AS (
 SELECT p.oid,jsonb_build_object('signature',p.oid::regprocedure::text,'arguments',pg_get_function_arguments(p.oid),
  'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,
  'proconfig',p.proconfig,'acl',p.proacl::text,
  'effective_execute',(SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE'))
   FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))) evidence
 FROM pg_proc p WHERE p.oid IN (SELECT oid FROM function_walk) AND p.prokind='f'
),
finance_relations AS (
 SELECT n.nspname,c.relname,c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='advisory_matter_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND left(c.relname,8)='finance_'
),
finance_refs AS (
 SELECT f.relname,x.evidence::jsonb evidence FROM finance_relations f
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
  'SELECT jsonb_build_object(''count'',count(*),''orphan_matter_refs'',count(*) FILTER (WHERE NOT EXISTS
   (SELECT 1 FROM public.advisory_matters m WHERE m.id::text=t.advisory_matter_id::text)),
   ''rows_sha256'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E''\n'' ORDER BY to_jsonb(t)::text),''''),''UTF8'')),''hex''))::text evidence
   FROM %I.%I t WHERE t.advisory_matter_id IS NOT NULL',f.nspname,f.relname),false,false,'')
  COLUMNS evidence text PATH 'evidence') x
),
normalized_catalog as (select name,evidence evidence from catalog)
 SELECT jsonb_build_object('catalog',(select jsonb_object_agg(name,evidence) from normalized_catalog),
 'functions',(select jsonb_agg(evidence order by (evidence->>'signature') COLLATE "C") from functions),
 'rows',(select jsonb_object_agg(name,jsonb_build_object('count',row_count,'sha256',rows_sha256)) from fingerprints),
 'finance',(select coalesce(jsonb_object_agg(relname,evidence),'{}') from finance_refs));
do $guard$ declare actual jsonb; expected jsonb:='{"catalog":"826c1ebb656245109269bbe3a4bf032dc26ab0ca0bf5cb587bd78b19b6536a43","functions":"dffbc07fcd28887910eebe96323cc1b21e756aa71fad061f28b8d454dbdf4372","rows":"14b6915885070b1994c94be51ed6f389acc29db3bd05d9aa39d9ac49808fb1f1","finance":"2a0f0f1ea78103ccfe15f827b10e4163ce9ce14d9685cc6aa8a76cb0cb2c28b8"}'; k text; begin
 select state into actual from advisory076_before;
 for k in select jsonb_object_keys(expected) loop
  if encode(sha256(convert_to((actual->k)::text,'UTF8')),'hex') is distinct from expected->>k then raise exception 'ADVISORY076_BASELINE_MISMATCH: %',k; end if;
 end loop;
end; $guard$;
-- END GENERATED PRESERVATION PRELUDE

create table public.advisory_matter_control (
 matter_id uuid primary key references public.advisory_matters(id) on delete restrict,
 version bigint not null default 0 check(version>=0),
 work_state text check(work_state in ('working','waiting_client','waiting_external','waiting_internal','on_hold')),
 next_task_id uuid references public.advisory_issue_tasks(id) on delete restrict,
 next_action text, next_owner_id uuid references public.user_profiles(id) on delete restrict, next_due date,
 closed_at timestamptz, outcome text check(outcome in ('completed','client_stopped','external_refusal','agreement','litigation','cancelled')),
 outcome_summary text, follow_up text, case_reference text,
 check(next_task_id is null or (next_action is null and next_owner_id is null and next_due is null)),
 check((closed_at is null)=(outcome is null))
);
create table public.advisory_matter_team (
 matter_id uuid not null references public.advisory_matters(id) on delete restrict,
 user_id uuid not null references public.user_profiles(id) on delete restrict,
 team_role text not null check(team_role in ('lead','co_work','assistant','qa')),
 primary key(matter_id,user_id,team_role)
);
create unique index advisory076_one_lead on public.advisory_matter_team(matter_id) where team_role='lead';
create table public.advisory_matter_stages (
 id uuid primary key default gen_random_uuid(),
 matter_id uuid not null references public.advisory_matters(id) on delete restrict,
 template_key text not null, stage_key text not null, position integer not null check(position>=0),
 unique(matter_id,position), unique(matter_id,stage_key), unique(id,matter_id)
);
create table public.advisory_stage_visits (
 id uuid primary key default gen_random_uuid(), matter_id uuid not null,
 stage_id uuid not null, kind text not null check(kind in ('visit','skip')),
 entered_at timestamptz, exited_at timestamptz, exit_reason text,
 recorded_at timestamptz not null default clock_timestamp(), actor_id uuid not null references public.user_profiles(id),
 foreign key(stage_id,matter_id) references public.advisory_matter_stages(id,matter_id),
 check((kind='skip' and entered_at is null and exited_at is null) or
       (kind='visit' and entered_at is not null and (exited_at is null or exited_at>=entered_at))),
 check((exited_at is null)=(exit_reason is null))
);
create unique index advisory076_one_current_stage on public.advisory_stage_visits(matter_id) where kind='visit' and exited_at is null;
create table public.advisory_work_state_events (
 id uuid primary key default gen_random_uuid(), matter_id uuid not null references public.advisory_matters(id),
 work_state text not null check(work_state in ('working','waiting_client','waiting_external','waiting_internal','on_hold')),
 started_at timestamptz not null, ended_at timestamptz, reason text,
 actor_id uuid not null references public.user_profiles(id), check(ended_at is null or ended_at>=started_at)
);
create unique index advisory076_one_current_state on public.advisory_work_state_events(matter_id) where ended_at is null;
create table public.advisory_matter_activities (
 id uuid primary key default gen_random_uuid(), matter_id uuid not null references public.advisory_matters(id),
 kind text not null, actor_id uuid not null references public.user_profiles(id),
 occurred_at timestamptz not null default clock_timestamp(), detail jsonb not null default '{}'
);
create index advisory076_activity_order on public.advisory_matter_activities(matter_id,occurred_at desc,id);
create table public.advisory_deliverables (
 id uuid primary key default gen_random_uuid(), matter_id uuid not null references public.advisory_matters(id),
 title text not null check(length(btrim(title)) between 1 and 500),
 status text not null default 'draft' check(status in ('draft','in_progress','ready','delivered','cancelled')),
 owner_id uuid references public.user_profiles(id), due_date date, version_label text, drive_url text,
 updated_at timestamptz not null default clock_timestamp(),
 check(drive_url is null or drive_url ~ '^https://(drive|docs)\.google\.com/')
);
create table public.advisory_control_requests (
 request_id uuid primary key, actor_id uuid not null references public.user_profiles(id),
 request_body jsonb not null, response jsonb not null, created_at timestamptz not null default clock_timestamp()
);

alter table public.advisory_issue_tasks alter column advisory_issue_id drop not null;
alter table public.advisory_issue_tasks add column assignee_user_id uuid,
 add column stage_id uuid,
 add constraint advisory076_task_person foreign key(assignee_user_id) references public.user_profiles(id),
 add constraint advisory076_task_stage foreign key(stage_id) references public.advisory_matter_stages(id);
alter table public.advisory_time_logs add column stage_id uuid,
 add constraint advisory076_time_stage foreign key(stage_id) references public.advisory_matter_stages(id);
create index advisory076_task_matter_due on public.advisory_issue_tasks(advisory_matter_id,due_date,id) where deleted_at is null;
create index advisory076_time_matter on public.advisory_time_logs(advisory_matter_id,stage_id) where deleted_at is null;

create function public.advisory076_allowed(p_action text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_profiles p where p.id=auth.uid() and p.active and not p.must_change_password
 and case when p_action in ('read','task','time') then p.role in ('admin','partner','lawyer','assistant_lawyer','staff')
 when p_action='delete' then p.role in ('admin','partner')
 when p_action='manage' then p.role in ('admin','partner','lawyer','assistant_lawyer') else false end);
$$;
create function public.advisory076_check_person(p_id uuid,p_lead boolean default false) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_id is not null and not exists(select 1 from public.user_profiles where id=p_id and active
 and account_type='operational' and assignable and (not p_lead or role in ('admin','partner','lawyer','assistant_lawyer')) for share)
 then raise exception 'ADVISORY_PERSON_NOT_ASSIGNABLE'; end if;
end; $$;
create function public.advisory076_template(p_key text) returns text[]
language sql immutable set search_path=public as $$
 select case p_key
 when 'contract' then array['intake','information','analysis','draft','review','client_delivery','negotiation','final','close']
 when 'license' then array['intake','requirements','preparation','submission','authority_wait','amendment','result','close']
 when 'opinion' then array['brief','facts','research','analysis','review','opinion_delivery','close']
 when 'negotiation' then array['intake','facts','strategy','contact','negotiation','result','close']
 when 'general' then array['intake','information','analysis','execution','delivery','close'] end;
$$;

-- Guard additive relationships on ALL writes, while allowing unchanged legacy
-- inconsistencies to remain readable and to survive unrelated edits.
create function public.advisory076_task_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare m public.advisory_matters%rowtype; changed_link boolean;
begin
 select * into m from public.advisory_matters where id=new.advisory_matter_id for update;
 if not found then raise exception 'ADVISORY_MATTER_NOT_FOUND'; end if;
 if tg_op='UPDATE' and new.advisory_matter_id<>old.advisory_matter_id then raise exception 'ADVISORY_PARENT_IMMUTABLE'; end if;
 changed_link:=tg_op='INSERT' or new.advisory_issue_id is distinct from old.advisory_issue_id or (old.deleted_at is not null and new.deleted_at is null);
 if changed_link and new.advisory_issue_id is not null and not exists(select 1 from public.advisory_issues where id=new.advisory_issue_id and advisory_matter_id=m.id and deleted_at is null for share)
 then raise exception 'ADVISORY_ISSUE_NOT_AVAILABLE'; end if;
 if (tg_op='INSERT' or new.client_id is distinct from old.client_id) and new.client_id is not null and new.client_id<>m.client_id then raise exception 'ADVISORY_CLIENT_MISMATCH'; end if;
 if new.stage_id is not null and not exists(select 1 from public.advisory_matter_stages where id=new.stage_id and matter_id=m.id) then raise exception 'ADVISORY_STAGE_MISMATCH'; end if;
 if tg_op='INSERT' or new.assignee_user_id is distinct from old.assignee_user_id then perform public.advisory076_check_person(new.assignee_user_id); end if;
 if tg_op='INSERT' or new.status is distinct from old.status or new.completed_at is distinct from old.completed_at then
  if new.status not in ('pending','in_progress','waiting','completed','cancelled') or (new.status='completed')<>(new.completed_at is not null) then raise exception 'ADVISORY_TASK_COMPLETION_INVALID'; end if;
 end if;
 if tg_op='INSERT' or new.priority is distinct from old.priority then
  if new.priority not in ('low','normal','high','urgent') then raise exception 'ADVISORY_PRIORITY_INVALID'; end if;
 end if;
 return new;
end; $$;
create trigger advisory076_task_guard before insert or update on public.advisory_issue_tasks for each row execute function public.advisory076_task_guard();

create function public.advisory076_task_activity() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'ADVISORY_ACTOR_REQUIRED'; end if;
 update public.advisory_matter_control set version=version+1, next_task_id=case when next_task_id=new.id and (new.status in ('completed','cancelled') or new.deleted_at is not null) then null else next_task_id end where matter_id=new.advisory_matter_id;
 insert into public.advisory_matter_activities(matter_id,kind,actor_id,detail) values(new.advisory_matter_id,
 case when tg_op='INSERT' then 'task_created' when new.deleted_at is not null then 'task_deleted' when new.status='completed' and old.status<>'completed' then 'task_completed' else 'task_updated' end,
 auth.uid(),jsonb_build_object('task_id',new.id,'title',new.title,'old',case when tg_op='UPDATE' then to_jsonb(old) end,'new',to_jsonb(new)));
 insert into public.case_audit_logs(table_name,record_id,action,user_id,old_data,new_data)
 values('advisory_issue_tasks',new.id::text,lower(tg_op),auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end; $$;
create trigger advisory076_task_activity after insert or update on public.advisory_issue_tasks for each row execute function public.advisory076_task_activity();

create function public.advisory076_time_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.advisory_matter_id<>old.advisory_matter_id then raise exception 'ADVISORY_PARENT_IMMUTABLE'; end if;
 if new.stage_id is not null and not exists(select 1 from public.advisory_matter_stages where id=new.stage_id and matter_id=new.advisory_matter_id) then raise exception 'ADVISORY_STAGE_MISMATCH'; end if;
 if (tg_op='INSERT' or new.advisory_issue_id is distinct from old.advisory_issue_id or (old.deleted_at is not null and new.deleted_at is null)) and new.advisory_issue_id is not null and not exists(select 1 from public.advisory_issues where id=new.advisory_issue_id and advisory_matter_id=new.advisory_matter_id and deleted_at is null for share) then raise exception 'ADVISORY_ISSUE_NOT_AVAILABLE'; end if;
 if (tg_op='INSERT' or new.client_id is distinct from old.client_id) and new.client_id is not null and new.client_id is distinct from (select client_id from public.advisory_matters where id=new.advisory_matter_id) then raise exception 'ADVISORY_CLIENT_MISMATCH'; end if;
 if (tg_op='INSERT' or new.minutes is distinct from old.minutes) and new.minutes<0 then raise exception 'ADVISORY_TIME_INVALID'; end if;
 return new;
end; $$;
create trigger advisory076_time_guard before insert or update on public.advisory_time_logs for each row execute function public.advisory076_time_guard();

-- Prevent new live children of deleted Issues without rewriting legacy anomalies.
create function public.advisory076_issue_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.advisory_matter_id<>old.advisory_matter_id then raise exception 'ADVISORY_PARENT_IMMUTABLE'; end if;
 if old.deleted_at is null and new.deleted_at is not null and (
  exists(select 1 from public.advisory_issue_tasks where advisory_issue_id=old.id and deleted_at is null)
  or exists(select 1 from public.advisory_time_logs where advisory_issue_id=old.id and deleted_at is null)
  or exists(select 1 from public.advisory_advice_records where advisory_issue_id=old.id and deleted_at is null)) then
  raise exception 'ADVISORY_ISSUE_HAS_LIVE_RECORDS';
 end if;
 return new;
end; $$;
create trigger advisory076_issue_guard before update on public.advisory_issues for each row execute function public.advisory076_issue_guard();

-- Once an operational control exists, legacy registry edits cannot bypass closing.
-- Existing Matters without control retain their historical lifecycle behavior.
create function public.advisory076_lifecycle_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.advisory_matter_control%rowtype;
begin
 if new.status is distinct from old.status then
  select * into c from public.advisory_matter_control where matter_id=old.id;
  if found and (case when c.closed_at is null then new.status not in ('active','waiting')
   else new.status is distinct from case when c.outcome='cancelled' then 'cancelled' else 'completed' end end)
  then raise exception 'ADVISORY_USE_CONTROL_LIFECYCLE'; end if;
 end if;
 return new;
end; $$;
create trigger advisory076_lifecycle_guard before update on public.advisory_matters for each row execute function public.advisory076_lifecycle_guard();

-- CONTROLLED_WRITES
create function public.advisory_control_write(p_matter_id uuid,p_action text,p_payload jsonb,p_request_id uuid,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 actor uuid:=auth.uid(); body jsonb; saved public.advisory_control_requests%rowtype;
 m public.advisory_matters%rowtype; c public.advisory_matter_control%rowtype;
 task public.advisory_issue_tasks%rowtype; d public.advisory_deliverables%rowtype;
 person uuid; item_id uuid; stage public.advisory_matter_stages%rowtype;
 template text; keys text[]; moment timestamptz; result jsonb; event_kind text;
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
 if c.closed_at is not null and p_action<>'reopen' then raise exception 'ADVISORY_CLOSED'; end if;
 moment:=clock_timestamp();
 event_kind:=p_action;

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
  if nullif(btrim(p_payload->>'summary'),'') is null then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
  update public.advisory_stage_visits set exited_at=moment,exit_reason='closed' where matter_id=m.id and kind='visit' and exited_at is null;
  update public.advisory_work_state_events set ended_at=moment where matter_id=m.id and ended_at is null;
  update public.advisory_matter_control set closed_at=moment,outcome=p_payload->>'outcome',outcome_summary=btrim(p_payload->>'summary'),
   follow_up=nullif(btrim(p_payload->>'follow_up'),''),case_reference=nullif(btrim(p_payload->>'case_reference'),''),next_task_id=null,next_action=null,next_owner_id=null,next_due=null,work_state=null where matter_id=m.id;
  update public.advisory_matters set status=case when p_payload->>'outcome'='cancelled' then 'cancelled' else 'completed' end,updated_at=moment where id=m.id;
 elsif p_action='reopen' then
  if c.closed_at is null or nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'ADVISORY_REQUIRED_FIELDS'; end if;
  update public.advisory_matter_control set closed_at=null,outcome=null,outcome_summary=null,follow_up=null,case_reference=null,work_state='working' where matter_id=m.id;
  update public.advisory_matters set status='active',updated_at=moment where id=m.id;
  insert into public.advisory_work_state_events(matter_id,work_state,started_at,reason,actor_id) values(m.id,'working',moment,p_payload->>'reason',actor);
  -- Previous closing evidence stays in Activity; reopening does not fake a current visit.
 else raise exception 'ADVISORY_ACTION_INVALID'; end if;

 if p_action in ('create','stage','stage_skip') then
  if not exists(select 1 from public.advisory_matter_stages where matter_id=m.id) then
   template:=coalesce(nullif(p_payload->>'template',''),case m.matter_type when 'contract_review' then 'contract' when 'legal_opinion' then 'opinion' when 'license_regulatory' then 'license' when 'negotiation' then 'negotiation' else 'general' end);
   keys:=public.advisory076_template(template);
   if keys is null then raise exception 'ADVISORY_TEMPLATE_INVALID'; end if;
   insert into public.advisory_matter_stages(matter_id,template_key,stage_key,position) select m.id,template,k,n-1 from unnest(keys) with ordinality s(k,n);
  end if;
  if p_action in ('stage','stage_skip') then
   select * into stage from public.advisory_matter_stages where matter_id=m.id and stage_key=p_payload->>'stage_key';
   if not found then raise exception 'ADVISORY_STAGE_NOT_FOUND'; end if;
   if stage.stage_key='close' then raise exception 'ADVISORY_USE_CLOSE'; end if;
   if exists(select 1 from public.advisory_stage_visits where stage_id=stage.id and kind='visit' and exited_at is null) then raise exception 'ADVISORY_STAGE_ALREADY_CURRENT'; end if;
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
   jsonb_build_object('input',p_payload,'previous_control',to_jsonb(c),'previous_deliverable',case when p_action='deliverable' then to_jsonb(d) end,'item_id',item_id));
 end if;
 update public.advisory_matter_control set version=version+1 where matter_id=m.id returning jsonb_build_object('matter_id',m.id,'version',version,'item_id',item_id) into result;
 insert into public.advisory_control_requests(request_id,actor_id,request_body,response) values(p_request_id,actor,body,result);
 return result;
end; $$;

-- Invoker reads retain every existing Matter/Time/Audit RLS restriction.
create function public.advisory_control_read(p_matter_id uuid default null,p_query jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; today date:=(current_timestamp at time zone 'Asia/Bangkok')::date;
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 with items as (
 select m.*,cl.name client_name,coalesce(c.version,0) version,c.work_state,c.closed_at,c.outcome,c.outcome_summary,c.follow_up,c.case_reference,
 c.next_task_id,coalesce(t.title,c.next_action) next_action,coalesce(t.assignee_user_id,c.next_owner_id) next_owner_id,
 coalesce(nullif(np.staff_name,''),np.full_name,t.assignee_name) next_owner_name,coalesce(t.due_date,c.next_due) next_due,
 lead.user_id lead_id,coalesce(nullif(lp.staff_name,''),lp.full_name,m.responsible_lawyer) lead_name,
 st.stage_key,st.template_key,v.entered_at,
 case when v.entered_at is not null then greatest(0,today-(v.entered_at at time zone 'Asia/Bangkok')::date) end stage_days,
 greatest(0,coalesce((c.closed_at at time zone 'Asia/Bangkok')::date,today)-coalesce(m.start_date,(m.created_at at time zone 'Asia/Bangkok')::date)) age_days
 from public.advisory_matters m join public.clients cl on cl.id=m.client_id
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
 when 'overdue' then i.closed_at is null and i.next_due<today
 when 'missing' then i.closed_at is null and i.next_action is null
 when 'closed' then i.closed_at is not null else true end
 ), page as (
 select * from filtered order by case when p_query->>'sort'='due' then next_due end asc nulls last,created_at desc,id
 limit least(50,greatest(1,coalesce((p_query->>'limit')::int,20))) offset greatest(0,coalesce((p_query->>'offset')::int,0))
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'),'total',(select count(*) from filtered),
 'summary',(select jsonb_build_object('open',count(*) filter(where closed_at is null and status not in ('completed','cancelled')),
 'overdue',count(*) filter(where closed_at is null and next_due<today),'waiting',count(*) filter(where closed_at is null and work_state='waiting_client'),
 'closed_week',count(*) filter(where closed_at>=date_trunc('week',current_timestamp at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')) from items),
 'permissions',jsonb_build_object('manage',public.advisory076_allowed('manage'),'task',public.advisory076_allowed('task'),'delete',public.advisory076_allowed('delete'))) into result;
 if p_matter_id is not null then
  if jsonb_array_length(result->'items')<>1 then raise exception 'ADVISORY_MATTER_NOT_FOUND'; end if;
  result:=result||jsonb_build_object(
   'state_history',(select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]') from (select work_state,started_at,ended_at,reason from public.advisory_work_state_events where matter_id=p_matter_id order by started_at desc limit 10) x),
   'team',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('name',coalesce(nullif(p.staff_name,''),p.full_name)) order by t.team_role,p.full_name),'[]') from public.advisory_matter_team t join public.user_profiles p on p.id=t.user_id where t.matter_id=p_matter_id),
   'stages',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('visits',coalesce(v.rows,'[]'),'minutes',tm.minutes,'elapsed_seconds',(select sum(extract(epoch from coalesce(exited_at,current_timestamp)-entered_at)) from public.advisory_stage_visits where stage_id=s.id and kind='visit'),'task_total',(select count(*) from public.advisory_issue_tasks where stage_id=s.id and deleted_at is null),'task_completed',(select count(*) from public.advisory_issue_tasks where stage_id=s.id and deleted_at is null and status='completed'),'unclassified',tm.unclassified) order by s.position),'[]')
    from public.advisory_matter_stages s
    left join lateral(select jsonb_agg(to_jsonb(x) order by recorded_at desc) rows from (select * from public.advisory_stage_visits where stage_id=s.id order by recorded_at desc limit 20) x) v on true
    left join lateral(select sum(minutes) minutes,count(*) filter(where stage_id is null) unclassified from public.advisory_time_logs where advisory_matter_id=p_matter_id and stage_id=s.id and deleted_at is null) tm on true where s.matter_id=p_matter_id),
   'time',(select jsonb_build_object('minutes',coalesce(sum(minutes),0),'core',coalesce(sum(minutes) filter(where billable),0),'support',coalesce(sum(minutes) filter(where not billable),0),'unclassified',count(*) filter(where stage_id is null)) from public.advisory_time_logs where advisory_matter_id=p_matter_id and deleted_at is null),
   'other_matters',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,matter_no,title,status from public.advisory_matters where client_id=(select client_id from public.advisory_matters where id=p_matter_id) and id<>p_matter_id order by created_at desc limit 5) x));
 end if;
 return result;
end; $$;

create function public.advisory_control_section(p_matter_id uuid,p_section text,p_offset integer default 0,p_issue_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare tab text; predicate text; ordering text; rows jsonb; total bigint;
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.advisory_matters where id=p_matter_id) then raise exception 'ADVISORY_MATTER_NOT_FOUND'; end if;
 case p_section
 when 'tasks' then tab:='advisory_issue_tasks'; predicate:='advisory_matter_id=$1 and deleted_at is null and ($3 is null or advisory_issue_id=$3)'; ordering:='case when status in (''completed'',''cancelled'') then 1 else 0 end,due_date nulls last,id';
 when 'deleted_tasks' then tab:='advisory_issue_tasks'; predicate:='advisory_matter_id=$1 and deleted_at is not null and ($3 is null or advisory_issue_id=$3)'; ordering:='deleted_at desc,id';
 when 'activity' then tab:='advisory_matter_activities'; predicate:='matter_id=$1'; ordering:='occurred_at desc,id';
 when 'deliverables' then tab:='advisory_deliverables'; predicate:='matter_id=$1'; ordering:='due_date nulls last,id';
 when 'visits' then tab:='advisory_stage_visits'; predicate:='matter_id=$1'; ordering:='recorded_at desc,id';
 when 'states' then tab:='advisory_work_state_events'; predicate:='matter_id=$1'; ordering:='started_at desc,id';
 else raise exception 'ADVISORY_SECTION_INVALID'; end case;
 execute format('select count(*) from public.%I where %s',tab,predicate) into total using p_matter_id,p_offset,p_issue_id;
 execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from (select * from public.%I where %s order by %s limit 20 offset $2) t',tab,predicate,ordering)
 into rows using p_matter_id,greatest(0,p_offset),p_issue_id;
 return jsonb_build_object('items',rows,'total',total);
end; $$;


-- New relations are private-by-default. Existing table ACL and RLS are untouched.
do $security$ declare n text; f regprocedure; begin
 foreach n in array array['advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests'] loop
  execute format('alter table public.%I owner to postgres',n);
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
  if n<>'advisory_control_requests' then
   execute format('grant select on public.%I to authenticated',n);
   execute format('create policy advisory076_read on public.%I for select to authenticated using (public.advisory076_allowed(''read''))',n);
  end if;
 end loop;
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and (proname like 'advisory076_%' or proname in ('advisory_control_write','advisory_control_read','advisory_control_section')) loop
  execute format('alter function %s owner to postgres',f);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end; $security$;
grant execute on function public.advisory076_allowed(text),public.advisory076_template(text),public.advisory_control_write(uuid,text,jsonb,uuid,bigint),public.advisory_control_read(uuid,jsonb),public.advisory_control_section(uuid,text,integer,uuid) to authenticated;

-- BEGIN GENERATED PRESERVATION POSTLUDE
do $preserved$ declare actual jsonb; before_state jsonb; begin
 WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
 ('clients'), ('user_profiles'), ('case_audit_logs')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
raw(table_name,j) AS MATERIALIZED (
 SELECT 'advisory_matters',to_jsonb(t) FROM public.advisory_matters t UNION ALL
 SELECT 'advisory_issues',to_jsonb(t) FROM public.advisory_issues t UNION ALL
 SELECT 'advisory_issue_tasks',to_jsonb(t)-'assignee_user_id'-'stage_id' FROM public.advisory_issue_tasks t UNION ALL
 SELECT 'advisory_advice_records',to_jsonb(t) FROM public.advisory_advice_records t UNION ALL
 SELECT 'advisory_time_logs',to_jsonb(t)-'stage_id' FROM public.advisory_time_logs t UNION ALL
 SELECT 'advisory_matter_counters',to_jsonb(t) FROM public.advisory_matter_counters t UNION ALL
 SELECT 'clients',to_jsonb(t) FROM public.clients t UNION ALL
 SELECT 'user_profiles',to_jsonb(t) FROM public.user_profiles t UNION ALL
 SELECT 'case_audit_logs',to_jsonb(t) FROM public.case_audit_logs t
 WHERE t.table_name IN ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs')
),
rows AS MATERIALIZED (
 SELECT table_name,j,j->>'id' id,nullif(j->>'deleted_at','') IS NULL live FROM raw
),
fingerprints AS (
 SELECT s.name,count(r.j) row_count,
  encode(sha256(convert_to(coalesce(string_agg(r.j::text,E'\n' ORDER BY r.j::text),''),'UTF8')),'hex') rows_sha256
 FROM scope s LEFT JOIN rows r ON r.table_name=s.name GROUP BY s.name
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
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text,c.conname),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
),
function_roots(oid) AS (
 SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
  ('create_advisory_matter_with_number','can_create_advisory_matter','generate_advisory_matter_no',
   'people_is_assignable','people_is_active_admin','admin074_session_allowed')
 UNION SELECT g.tgfoid FROM pg_trigger g JOIN relations t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'
 UNION SELECT d.refobjid FROM pg_policy p JOIN relations t ON t.oid=p.polrelid
  JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
),
function_edges(parent,child) AS (
 SELECT p.oid,q.oid FROM pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace
 JOIN pg_proc q ON q.prokind='f' JOIN pg_namespace qn ON qn.oid=q.pronamespace
 WHERE p.prokind='f' AND pn.nspname IN ('public','auth') AND qn.nspname IN ('public','auth')
 AND q.proname ~ '^[a-zA-Z_][a-zA-Z_0-9]*$'
 AND p.prosrc ~ ('\m'||q.proname||'\M[[:space:]]*\(')
 UNION SELECT d.objid,d.refobjid FROM pg_depend d
 WHERE d.classid='pg_proc'::regclass AND d.refclassid='pg_proc'::regclass
),
function_walk(oid,path,depth) AS (
 SELECT oid,ARRAY[oid],0 FROM function_roots
 UNION ALL SELECT e.child,w.path||e.child,w.depth+1 FROM function_walk w
 JOIN function_edges e ON e.parent=w.oid WHERE w.depth<8 AND NOT e.child=ANY(w.path)
),
functions AS (
 SELECT p.oid,jsonb_build_object('signature',p.oid::regprocedure::text,'arguments',pg_get_function_arguments(p.oid),
  'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,
  'proconfig',p.proconfig,'acl',p.proacl::text,
  'effective_execute',(SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE'))
   FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))) evidence
 FROM pg_proc p WHERE p.oid IN (SELECT oid FROM function_walk) AND p.prokind='f'
),
finance_relations AS (
 SELECT n.nspname,c.relname,c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='advisory_matter_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND left(c.relname,8)='finance_'
),
finance_refs AS (
 SELECT f.relname,x.evidence::jsonb evidence FROM finance_relations f
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
  'SELECT jsonb_build_object(''count'',count(*),''orphan_matter_refs'',count(*) FILTER (WHERE NOT EXISTS
   (SELECT 1 FROM public.advisory_matters m WHERE m.id::text=t.advisory_matter_id::text)),
   ''rows_sha256'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E''\n'' ORDER BY to_jsonb(t)::text),''''),''UTF8'')),''hex''))::text evidence
   FROM %I.%I t WHERE t.advisory_matter_id IS NOT NULL',f.nspname,f.relname),false,false,'')
  COLUMNS evidence text PATH 'evidence') x
),
normalized_catalog as (select name,evidence || jsonb_build_object(
 'columns',(select jsonb_agg(case when name='advisory_issue_tasks' and x->>'name'='advisory_issue_id' then jsonb_set(x,'{not_null}','true') else x end order by n) from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where not (name='advisory_issue_tasks' and x->>'name' in ('assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id')),
 'constraints',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' not like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' not like '%INDEX advisory076_%'),
 'incoming_foreign_keys',(select coalesce(jsonb_agg(x order by x->>'table',x->>'name'),'[]') from jsonb_array_elements(evidence->'incoming_foreign_keys') x where x->>'table' not in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests') and x->>'name' not like 'advisory076_%')) evidence from catalog)
 SELECT jsonb_build_object('catalog',(select jsonb_object_agg(name,evidence) from normalized_catalog),
 'functions',(select jsonb_agg(evidence order by (evidence->>'signature') COLLATE "C") from functions),
 'rows',(select jsonb_object_agg(name,jsonb_build_object('count',row_count,'sha256',rows_sha256)) from fingerprints),
 'finance',(select coalesce(jsonb_object_agg(relname,evidence),'{}') from finance_refs)) into actual;
 select state into before_state from advisory076_before;
 if actual<>before_state then raise exception 'ADVISORY076_PRESERVATION_FAILED: %', (select string_agg(k,', ') from jsonb_object_keys(actual) k where actual->k is distinct from before_state->k); end if;
end; $preserved$;
-- END GENERATED PRESERVATION POSTLUDE

commit;
