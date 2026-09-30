-- Advisory 082: unified overdue READ contract. HUMAN APPLY ONLY.
-- One canonical item source; no business-row writes/backfill; table, column and lifecycle definitions unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.advisory_matters,public.advisory_issues,public.advisory_issue_tasks,public.advisory_advice_records,public.advisory_time_logs,public.advisory_matter_counters,public.advisory_matter_control,public.advisory_matter_team,public.advisory_matter_stages,public.advisory_stage_visits,public.advisory_work_state_events,public.advisory_matter_activities,public.advisory_deliverables,public.advisory_control_requests IN SHARE MODE;
CREATE TEMP TABLE advisory082_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory082_before WITH structure AS (WITH RECURSIVE
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
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
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
DO $baseline$ DECLARE s jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY082_OWNER_REQUIRED'; END IF;
 SELECT state INTO s FROM advisory082_before;
 IF encode(sha256(convert_to((s->'contract')::text,'UTF8')),'hex') IS DISTINCT FROM '0ba73dd77d65a221d9afadf935cab31bf15571bea642f56224ca671a1cdf1366' THEN
  RAISE EXCEPTION 'ADVISORY082_BASELINE_MISMATCH: accepted081'; END IF;
END; $baseline$;
-- BEGIN 082 CONTRACT: two existing read functions + one invoker-only helper.
CREATE OR REPLACE FUNCTION public.advisory_overdue_work(p_matter_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(matter_id uuid, source text, source_id uuid, title text, assignee_user_id uuid, assignee_name text, due_date date, overdue_days integer, is_next_action boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare today date:=(current_timestamp at time zone 'Asia/Bangkok')::date;
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 -- Invoker/RLS remains authoritative. Identity is (source, source_id), never title.
 return query
 with open_matters as materialized (
  select m.id,c.next_task_id,c.next_action,c.next_owner_id,c.next_due
  from public.advisory_matters m left join public.advisory_matter_control c on c.matter_id=m.id
  where (p_matter_id is null or m.id=p_matter_id)
   and m.status not in ('completed','cancelled') and c.closed_at is null
 )
 select m.id,'task'::text,t.id,t.title,t.assignee_user_id,
  coalesce(nullif(p.staff_name,''),p.full_name,t.assignee_name),t.due_date,today-t.due_date,
  coalesce(m.next_task_id=t.id,false)
 from open_matters m join public.advisory_issue_tasks t on t.advisory_matter_id=m.id
 left join public.user_profiles p on p.id=t.assignee_user_id
 where t.deleted_at is null and t.completed_at is null
  and t.status in ('pending','in_progress','waiting') and t.due_date<today
 union all
 select m.id,'next_action'::text,m.id,m.next_action,m.next_owner_id,
  coalesce(nullif(p.staff_name,''),p.full_name),m.next_due,today-m.next_due,true
 from open_matters m left join public.user_profiles p on p.id=m.next_owner_id
 where m.next_task_id is null and nullif(btrim(m.next_action),'') is not null and m.next_due<today;
end; $function$;
REVOKE ALL ON FUNCTION public.advisory_overdue_work(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.advisory_overdue_work(uuid) TO authenticated;
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
end; $function$;
CREATE OR REPLACE FUNCTION public.advisory_control_section(p_matter_id uuid, p_section text, p_offset integer DEFAULT 0, p_issue_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
 if p_section='tasks' then
  -- Enrich the existing bounded Task page from the same canonical source once.
  with overdue as materialized (select * from public.advisory_overdue_work(p_matter_id))
  select coalesce(jsonb_agg(t.value||jsonb_build_object('overdue_days',coalesce(o.overdue_days,0)) order by t.position),'[]'::jsonb)
  into rows from jsonb_array_elements(rows) with ordinality t(value,position)
  left join overdue o on o.source='task' and o.source_id=(t.value->>'id')::uuid;
 end if;
 return jsonb_build_object('items',rows,'total',total);
end; $function$;
-- END 082 CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM advisory082_before;
 WITH structure AS (WITH RECURSIVE
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
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
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
 SELECT s.state||jsonb_build_object('rows',(select * from rows)) AS state FROM structure s(state) INTO a;
 IF a->'rows' IS DISTINCT FROM b->'rows' OR a->'catalog' IS DISTINCT FROM b->'catalog'
  OR encode(sha256(convert_to((a->'contract')::text,'UTF8')),'hex') IS DISTINCT FROM '4cd771d87dbfbed7fba9a1595be88aef791ce4cbc796f7029804d3da88d73f4b'
  OR EXISTS(SELECT 1 FROM jsonb_each(b#>'{contract,functions}') f
    WHERE (a#>ARRAY['contract','functions',f.key])-'definition' IS DISTINCT FROM f.value-'definition')
 THEN RAISE EXCEPTION 'ADVISORY082_PRESERVATION_FAILED'; END IF;
END; $preservation$;
COMMIT;
