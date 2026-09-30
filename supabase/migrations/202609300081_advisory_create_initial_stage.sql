-- Advisory 081: atomic first Stage for NEW Matters only. HUMAN APPLY ONLY.
-- Applied 076/077 source bytes remain immutable; no row/backfill DML is executed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.advisory_matters,public.advisory_issues,public.advisory_issue_tasks,public.advisory_advice_records,public.advisory_time_logs,public.advisory_matter_counters,public.advisory_matter_control,public.advisory_matter_team,public.advisory_matter_stages,public.advisory_stage_visits,public.advisory_work_state_events,public.advisory_matter_activities,public.advisory_deliverables,public.advisory_control_requests IN SHARE MODE;
CREATE TEMP TABLE advisory081_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory081_before WITH structure AS (WITH RECURSIVE
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
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section','advisory_workflow_checks')))
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
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY081_OWNER_REQUIRED'; END IF;
 SELECT state INTO s FROM advisory081_before;
 IF encode(sha256(convert_to((s->'contract')::text,'UTF8')),'hex') IS DISTINCT FROM 'f85937506d3fec583f084873c6ef7be13155cd671ad87150401cd7785d20edb8' THEN
  RAISE EXCEPTION 'ADVISORY081_BASELINE_MISMATCH: accepted077'; END IF;
END; $baseline$;
-- BEGIN 081 CONTRACT: identical to accepted 077 except create initialization.
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
 elsif p_action='stage_complete' then
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
  update public.advisory_stage_visits set exited_at=moment,exit_reason='completed' where id=current_visit.id;
  if next_stage.id is not null and next_stage.stage_key<>'close' then
   insert into public.advisory_stage_visits(matter_id,stage_id,kind,entered_at,actor_id) values(m.id,next_stage.id,'visit',moment,actor);
  end if;
  -- 'close' is a terminal plan marker, not a fabricated visit or lifecycle flip.
  event_detail:=jsonb_build_object('completed_stage_id',stage.id,'completed_stage_key',stage.stage_key,
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

 if p_action in ('create','stage','stage_skip') then
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
 if p_action='stage_complete' then result:=result||event_detail; end if;
 insert into public.advisory_control_requests(request_id,actor_id,request_body,response) values(p_request_id,actor,body,result);
 return result;
end; $function$;
-- END 081 CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM advisory081_before;
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
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section','advisory_workflow_checks')))
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
  OR encode(sha256(convert_to((a->'contract')::text,'UTF8')),'hex') IS DISTINCT FROM '0ba73dd77d65a221d9afadf935cab31bf15571bea642f56224ca671a1cdf1366'
  OR (a#>ARRAY['contract','functions','advisory_control_write(uuid,text,jsonb,uuid,bigint)'])-'definition'
   IS DISTINCT FROM (b#>ARRAY['contract','functions','advisory_control_write(uuid,text,jsonb,uuid,bigint)'])-'definition'
 THEN RAISE EXCEPTION 'ADVISORY081_PRESERVATION_FAILED'; END IF;
END; $preservation$;
COMMIT;
