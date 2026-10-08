-- Additive Shared Case Core. No legacy owner matching, task creation or backfill.
CREATE TABLE public.case_work_core (
 case_id bigint PRIMARY KEY REFERENCES public.cases(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 work_state text CHECK(work_state IN ('action_required','waiting_court','waiting_client','waiting_opponent','waiting_external','no_current_action')),
 next_mode text NOT NULL DEFAULT 'none' CHECK(next_mode IN ('none','manual','task')),
 next_task_id uuid REFERENCES public.case_tasks(id),
 next_title text, next_assignee_id uuid REFERENCES public.user_profiles(id), next_due date,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 CHECK ((next_mode='none' AND next_task_id IS NULL AND next_title IS NULL AND next_assignee_id IS NULL AND next_due IS NULL)
 OR (next_mode='task' AND next_task_id IS NOT NULL AND next_title IS NULL AND next_assignee_id IS NULL AND next_due IS NULL)
 OR (next_mode='manual' AND next_task_id IS NULL AND length(btrim(next_title)) BETWEEN 1 AND 500)),
 CHECK(next_due IS NULL OR isfinite(next_due))
);
CREATE TABLE public.case_team_assignments (
 case_id bigint NOT NULL REFERENCES public.case_work_core(case_id),
 person_id uuid NOT NULL REFERENCES public.user_profiles(id),
 team_role text NOT NULL CHECK(team_role IN ('lead','strategy','qc','member','current_actor')),
 PRIMARY KEY(case_id,person_id,team_role)
);
CREATE UNIQUE INDEX case098_single_role ON public.case_team_assignments(case_id,team_role) WHERE team_role<>'member';
ALTER TABLE public.case_work_core ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_team_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_work_core,public.case_team_assignments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_work_core,public.case_team_assignments TO authenticated;
CREATE POLICY case098_read ON public.case_work_core FOR SELECT TO authenticated
 USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case098_read ON public.case_team_assignments FOR SELECT TO authenticated
 USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case098_read(p_case_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE098_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE098_NOT_FOUND'; END IF;
 SELECT jsonb_build_object(
  'core',(SELECT to_jsonb(c) FROM public.case_work_core c WHERE c.case_id=p_case_id),
  'team',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_role,t.person_id),'[]') FROM public.case_team_assignments t WHERE t.case_id=p_case_id),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.staff_name,''),nullif(p.full_name,''),p.id::text),'full_name',p.full_name,
    'eligible',p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE) ORDER BY p.id),'[]') FROM public.user_profiles p
   WHERE (p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE)
    OR p.id IN (SELECT t.person_id FROM public.case_team_assignments t WHERE t.case_id=p_case_id)
    OR p.id IN (SELECT c.next_assignee_id FROM public.case_work_core c WHERE c.case_id=p_case_id)),
  'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'task_type',t.task_type,'task_other',t.task_other,'assignee_name',t.assignee_name,'due_date',t.due_date,'status',t.status,'deleted_at',t.deleted_at) ORDER BY t.created_at,t.id),'[]') FROM public.case_tasks t
   WHERE t.case_id=p_case_id AND ((t.deleted_at IS NULL AND coalesce(t.status,'Pending')<>'Done') OR t.id IN(SELECT c.next_task_id FROM public.case_work_core c WHERE c.case_id=p_case_id)))
 ) INTO result;
 RETURN result;
END $fn$;

CREATE FUNCTION public.case098_save(p_case_id bigint,p_version integer,p_section text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.case_work_core; old_facts jsonb; new_facts jsonb; person uuid; entry jsonb; target uuid; actor public.user_profiles;
BEGIN
 IF NOT public.case097_session_ready() OR NOT public.can_view_case_data()
 OR (p_section IN ('team','work') AND NOT public.case097_process_writer())
 OR (p_section='next' AND NOT public.can_write_case_data()) THEN RAISE EXCEPTION 'CASE098_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_section IS NULL OR p_section NOT IN ('team','work','next') OR p_version IS NULL OR p_version<0
 OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE098_NOT_FOUND'; END IF;
 SELECT * INTO c FROM public.case_work_core WHERE case_id=p_case_id;
 IF coalesce(c.version,0)<>p_version THEN RAISE EXCEPTION 'CASE098_STALE'; END IF;
 SELECT jsonb_build_object('core',to_jsonb(c),'team',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY team_role,person_id),'[]') FROM public.case_team_assignments t WHERE case_id=p_case_id)) INTO old_facts;
 IF c.case_id IS NULL THEN
  INSERT INTO public.case_work_core(case_id,updated_by) VALUES(p_case_id,auth.uid()) RETURNING * INTO c;
 END IF;
 IF p_section='team' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k<>'assignments') OR jsonb_typeof(p_data->'assignments') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_data->'assignments')>100 THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'assignments') LOOP
   IF jsonb_typeof(entry)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN('person_id','team_role'))
    OR entry->>'team_role' IS NULL OR entry->>'team_role' NOT IN('lead','strategy','qc','member','current_actor') THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
   person:=(entry->>'person_id')::uuid;
   IF person IS NULL OR (NOT EXISTS(SELECT 1 FROM public.case_team_assignments t WHERE t.case_id=p_case_id AND t.person_id=person AND t.team_role=entry->>'team_role')
    AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=person AND p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE)) THEN RAISE EXCEPTION 'CASE098_PERSON_INELIGIBLE'; END IF;
  END LOOP;
  DELETE FROM public.case_team_assignments WHERE case_id=p_case_id;
  INSERT INTO public.case_team_assignments(case_id,person_id,team_role) SELECT p_case_id,(value->>'person_id')::uuid,value->>'team_role' FROM jsonb_array_elements(p_data->'assignments');
 ELSIF p_section='work' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k<>'work_state') OR NOT(p_data ? 'work_state') THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  UPDATE public.case_work_core SET work_state=p_data->>'work_state' WHERE case_id=p_case_id;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('mode','task_id','title','assignee_id','due'))
   OR p_data->>'mode' IS NULL OR p_data->>'mode' NOT IN('none','manual','task') THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  IF p_data->>'mode'='task' THEN
   target:=(p_data->>'task_id')::uuid;
   -- Lock the existing task for validation, but never edit or copy its business facts.
   PERFORM 1 FROM public.case_tasks WHERE id=target AND case_id=p_case_id AND deleted_at IS NULL AND coalesce(status,'Pending')<>'Done' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASE098_TASK_UNAVAILABLE'; END IF;
  ELSIF p_data->>'mode'='manual' THEN
   person:=nullif(p_data->>'assignee_id','')::uuid;
   IF person IS NOT NULL AND person IS DISTINCT FROM c.next_assignee_id AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=person AND p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE) THEN RAISE EXCEPTION 'CASE098_PERSON_INELIGIBLE'; END IF;
   IF nullif(btrim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  END IF;
  UPDATE public.case_work_core SET next_mode=p_data->>'mode',next_task_id=target,
   next_title=CASE WHEN p_data->>'mode'='manual' THEN btrim(p_data->>'title') END,
   next_assignee_id=person,next_due=CASE WHEN p_data->>'mode'='manual' THEN nullif(p_data->>'due','')::date END WHERE case_id=p_case_id;
 END IF;
 UPDATE public.case_work_core SET version=p_version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE case_id=p_case_id RETURNING * INTO c;
 SELECT jsonb_build_object('core',to_jsonb(c),'team',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY team_role,person_id),'[]') FROM public.case_team_assignments t WHERE case_id=p_case_id)) INTO new_facts;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,'case_work_core',p_case_id::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,new_facts,'case098_'||p_section);
 RETURN public.case098_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR unique_violation OR not_null_violation THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case098_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case098_save(bigint,integer,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case098_read(bigint),public.case098_save(bigint,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case098_read(bigint),public.case098_save(bigint,integer,text,jsonb) TO authenticated;
