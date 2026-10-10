-- Phase 3B: explicit service facts and human-confirmed suggestions for the 101 pilot only.
-- Installation is DDL only. Existing Case/Party/Deadline/Flow facts are never backfilled.
CREATE TABLE public.case_service_controls (
 party_id uuid PRIMARY KEY REFERENCES public.parties(id), case_id bigint NOT NULL REFERENCES public.cases(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), required boolean NOT NULL DEFAULT true, exemption_reason text,
 lawful_attempt_id uuid, lawful_at timestamptz, lawful_by uuid REFERENCES public.user_profiles(id),
 answer_deadline_id uuid UNIQUE REFERENCES public.case_deadlines(id), default_deadline_id uuid UNIQUE REFERENCES public.case_deadlines(id),
 answer_filed_on date CHECK(isfinite(answer_filed_on)), absent_hearing_id uuid REFERENCES public.case_timeline(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(party_id,case_id), CHECK(required OR (exemption_reason IS NOT NULL AND length(btrim(exemption_reason))>0)),
 CHECK((lawful_attempt_id IS NULL AND lawful_at IS NULL AND lawful_by IS NULL) OR (lawful_attempt_id IS NOT NULL AND lawful_at IS NOT NULL AND lawful_by IS NOT NULL))
);
CREATE TABLE public.case_service_attempts (
 id uuid PRIMARY KEY, party_id uuid NOT NULL, case_id bigint NOT NULL,
 method text NOT NULL CHECK(method IN('normal','posting','electronic','other')), attempted_on date NOT NULL CHECK(isfinite(attempted_on)),
 result text NOT NULL CHECK(result IN('pending','served','failed','void')),
 failure_kind text CHECK(failure_kind IN('investigating','not_found','demolished','other')), failure_reason text, note text, void_reason text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(id,party_id), FOREIGN KEY(party_id,case_id) REFERENCES public.case_service_controls(party_id,case_id),
 CHECK(result<>'failed' OR (failure_kind IS NOT NULL AND failure_reason IS NOT NULL AND length(btrim(failure_reason))>0)),
 CHECK(result<>'void' OR (void_reason IS NOT NULL AND length(btrim(void_reason))>0)), CHECK(length(note)<=10000 AND length(failure_reason)<=10000)
);
ALTER TABLE public.case_service_controls ADD CONSTRAINT case102_lawful_party FOREIGN KEY(lawful_attempt_id,party_id) REFERENCES public.case_service_attempts(id,party_id);
CREATE TABLE public.case_service_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id bigint NOT NULL REFERENCES public.cases(id), party_id uuid REFERENCES public.parties(id),
 action text NOT NULL, actor_id uuid NOT NULL REFERENCES public.user_profiles(id), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 before_data jsonb, after_data jsonb NOT NULL, request_id uuid NOT NULL UNIQUE, request_data jsonb NOT NULL
);
CREATE INDEX case102_case ON public.case_service_controls(case_id);
CREATE INDEX case102_attempts ON public.case_service_attempts(party_id,recorded_at);
CREATE INDEX case102_history ON public.case_service_events(case_id,occurred_at);
CREATE TRIGGER case102_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_service_events FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case102_controls_preserve BEFORE DELETE OR TRUNCATE ON public.case_service_controls FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case102_attempts_preserve BEFORE DELETE OR TRUNCATE ON public.case_service_attempts FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_service_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_service_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_service_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_service_controls,public.case_service_attempts,public.case_service_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_service_controls,public.case_service_attempts,public.case_service_events TO authenticated;
CREATE POLICY case102_read ON public.case_service_controls FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case102_read ON public.case_service_attempts FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case102_read ON public.case_service_events FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case102_read(p_case_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE102_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE102_NOT_FOUND'; END IF;
 RETURN jsonb_build_object(
 'today',(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date,
 'flow',(SELECT to_jsonb(i) FROM public.case_flow_instances i WHERE case_id=p_case_id AND track_key='main' AND template_id='civil_ordinary_plaintiff_v1'),
 'defendants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',CASE WHEN p.entity_type='company' THEN p.company_name ELSE concat_ws(' ',nullif(p.title,''),nullif(p.first_name,''),nullif(p.last_name,'')) END,'order_no',p.order_no,
 'control',to_jsonb(c),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY recorded_at DESC,id),'[]') FROM public.case_service_attempts a WHERE a.party_id=p.id),
 'answer_deadline',(SELECT to_jsonb(d) FROM public.case_deadlines d WHERE id=c.answer_deadline_id),
 'default_deadline',(SELECT to_jsonb(d) FROM public.case_deadlines d WHERE id=c.default_deadline_id),
 'extensions',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY extension_no,created_at),'[]') FROM public.case_deadline_extensions e WHERE deadline_id=c.answer_deadline_id AND deleted_at IS NULL)) ORDER BY p.order_no,p.id),'[]')
 FROM public.parties p LEFT JOIN public.case_service_controls c ON c.party_id=p.id WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL),
 'deadlines',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY order_no,id),'[]') FROM public.case_deadlines d WHERE case_id=p_case_id AND deleted_at IS NULL AND status='Active'),
 'hearings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'event_date',t.event_date,'appointment_type',t.appointment_type,'appointment_other',t.appointment_other) ORDER BY event_date DESC,id),'[]') FROM public.case_timeline t WHERE case_id=p_case_id AND deleted_at IS NULL AND event_type='hearing' AND status IS DISTINCT FROM 'Cancelled'),
 'history',(SELECT coalesce(jsonb_agg((to_jsonb(e)-'request_data'-'request_id')||jsonb_build_object('actor_name',coalesce(nullif(p.staff_name,''),p.full_name)) ORDER BY occurred_at DESC,e.id),'[]') FROM public.case_service_events e JOIN public.user_profiles p ON p.id=e.actor_id WHERE e.case_id=p_case_id));
END $fn$;

CREATE FUNCTION public.case102_save(p_case_id bigint,p_party_id uuid,p_version integer,p_request_id uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.case_service_controls; a public.case_service_attempts; d public.case_deadlines; f public.case_flow_instances; actor public.user_profiles; receipt public.case_service_events;
 old_facts jsonb; new_facts jsonb; deadline_before jsonb; deadline_after jsonb; flow_before jsonb; next_before jsonb; next_after jsonb;
 req jsonb:=jsonb_build_object('case_id',p_case_id,'party_id',p_party_id,'version',p_version,'action',p_action,'data',p_data);
 allowed text[]; why text; due date; event_day date; today date:=(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date; target uuid; person uuid; did uuid; attempts_id uuid; dst text;
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data() AND public.case097_process_writer()) THEN RAISE EXCEPTION 'CASE102_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 IF p_request_id IS NULL OR p_version IS NULL OR p_version<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_action IS NULL THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
 allowed:=CASE p_action
 WHEN 'attempt' THEN ARRAY['attempt_id','method','attempted_on','result','failure_kind','failure_reason','note']
 WHEN 'void' THEN ARRAY['attempt_id','reason']
 WHEN 'lawful' THEN ARRAY['attempt_id','confirmed']
 WHEN 'required' THEN ARRAY['required','reason']
 WHEN 'deadline' THEN ARRAY['kind','due','confirmed','existing_id','reason','expected_due','expected_updated_at']
 WHEN 'answer' THEN ARRAY['date','expected_due','expected_updated_at']
 WHEN 'absence' THEN ARRAY['hearing_id','confirmed']
 WHEN 'next' THEN ARRAY['core_version','next']
 WHEN 'advance' THEN ARRAY['flow_version','confirmed']
 WHEN 'branch' THEN ARRAY['flow_version','confirmed','reason'] END;
 IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
 IF p_action IN('lawful','required','deadline','answer','absence','advance','branch','void') AND actor.role NOT IN('lawyer','partner','admin') THEN RAISE EXCEPTION 'CASE102_LAWYER_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE102_NOT_FOUND'; END IF;
 SELECT * INTO receipt FROM public.case_service_events WHERE request_id=p_request_id;
 IF receipt.id IS NOT NULL THEN
  IF receipt.actor_id<>auth.uid() OR receipt.request_data IS DISTINCT FROM req THEN RAISE EXCEPTION 'CASE102_REQUEST_CONFLICT'; END IF;
  RETURN public.case102_read(p_case_id);
 END IF;
 SELECT * INTO f FROM public.case_flow_instances WHERE case_id=p_case_id AND track_key='main' FOR UPDATE;
 IF f.id IS NULL OR f.template_id<>'civil_ordinary_plaintiff_v1' OR f.lifecycle<>'active' THEN RAISE EXCEPTION 'CASE102_PILOT_REQUIRED'; END IF;
 IF p_action IN('advance','branch') THEN
  IF p_party_id IS NOT NULL OR p_version<>0 OR (p_data->>'flow_version')::integer IS DISTINCT FROM f.version THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
  IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
  -- All currently required live defendants, never inferred from a display name.
  IF NOT EXISTS(SELECT 1 FROM public.parties p LEFT JOIN public.case_service_controls s ON s.party_id=p.id WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL AND coalesce(s.required,true))
   OR EXISTS(SELECT 1 FROM public.parties p LEFT JOIN public.case_service_controls s ON s.party_id=p.id LEFT JOIN public.case_service_attempts x ON x.id=s.lawful_attempt_id
    WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL AND coalesce(s.required,true) AND (s.lawful_attempt_id IS NULL OR x.result IS DISTINCT FROM 'served')) THEN RAISE EXCEPTION 'CASE102_NOT_ALL_LAWFUL'; END IF;
  flow_before:=to_jsonb(f);
  IF p_action='advance' THEN
   IF f.current_stage<>'service' THEN RAISE EXCEPTION 'CASE102_FLOW_STATE'; END IF;
   PERFORM public.case101_save(p_case_id,f.id,f.version,p_request_id,'advance','{"stage":"defence"}'::jsonb);
  ELSE
   why:=nullif(btrim(p_data->>'reason'),'');
   IF why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
   IF f.current_stage NOT IN('service','defence') THEN RAISE EXCEPTION 'CASE102_FLOW_STATE'; END IF;
   -- This conservative case-wide branch requires explicit nonappearance evidence for every required defendant.
   IF EXISTS(SELECT 1 FROM public.parties p JOIN public.case_service_controls s ON s.party_id=p.id LEFT JOIN public.case_timeline h ON h.id=s.absent_hearing_id
    WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL AND s.required AND (s.answer_filed_on IS NOT NULL OR h.id IS NULL OR h.deleted_at IS NOT NULL OR h.status='Cancelled')) THEN RAISE EXCEPTION 'CASE102_BRANCH_EVIDENCE_REQUIRED'; END IF;
   dst:='evidence';
   UPDATE public.case_flow_instances SET current_stage=dst,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=f.id;
   INSERT INTO public.case_flow_transitions(id,instance_id,template_id,sequence_no,event_kind,transition_code,from_stage,to_stage,from_lifecycle,to_lifecycle,reason,actor_id,request_id,request_data)
   VALUES(gen_random_uuid(),f.id,f.template_id,f.version+1,'transition','BRANCH',f.current_stage,dst,'active','active',why,auth.uid(),p_request_id,req);
   INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
   SELECT p_case_id,'case_flow_instances',i.id::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,flow_before,to_jsonb(i),'case102_branch' FROM public.case_flow_instances i WHERE id=f.id;
  END IF;
  SELECT to_jsonb(i) INTO new_facts FROM public.case_flow_instances i WHERE id=f.id;old_facts:=flow_before;
 ELSE
  PERFORM 1 FROM public.parties WHERE id=p_party_id AND case_id=p_case_id AND role='defendant' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE102_PARTY_UNAVAILABLE'; END IF;
  SELECT * INTO c FROM public.case_service_controls WHERE party_id=p_party_id FOR UPDATE;
  IF coalesce(c.version,0)<>p_version THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
  old_facts:=jsonb_build_object('control',to_jsonb(c),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.case_service_attempts x WHERE party_id=p_party_id));
  IF c.party_id IS NULL THEN INSERT INTO public.case_service_controls(party_id,case_id,updated_by) VALUES(p_party_id,p_case_id,auth.uid()) RETURNING * INTO c; END IF;
  why:=nullif(btrim(p_data->>'reason'),'');
  IF p_action='attempt' THEN
   attempts_id:=nullif(p_data->>'attempt_id','')::uuid;
   IF attempts_id IS NOT NULL THEN
    SELECT * INTO a FROM public.case_service_attempts WHERE id=attempts_id AND party_id=p_party_id FOR UPDATE;
    IF a.id IS NULL OR a.result<>'pending' OR c.lawful_attempt_id=a.id THEN RAISE EXCEPTION 'CASE102_ATTEMPT_FINAL'; END IF;
   END IF;
   event_day:=(p_data->>'attempted_on')::date;
   IF event_day IS NULL OR NOT isfinite(event_day) OR event_day>today OR p_data->>'result' IS NULL OR p_data->>'result' NOT IN('pending','served','failed') THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   IF attempts_id IS NULL THEN
    INSERT INTO public.case_service_attempts(id,party_id,case_id,method,attempted_on,result,failure_kind,failure_reason,note,recorded_by,updated_by)
    VALUES(gen_random_uuid(),p_party_id,p_case_id,p_data->>'method',event_day,p_data->>'result',nullif(p_data->>'failure_kind',''),nullif(btrim(p_data->>'failure_reason'),''),nullif(btrim(p_data->>'note'),''),auth.uid(),auth.uid());
   ELSE
    UPDATE public.case_service_attempts SET method=p_data->>'method',attempted_on=event_day,result=p_data->>'result',failure_kind=nullif(p_data->>'failure_kind',''),failure_reason=nullif(btrim(p_data->>'failure_reason'),''),note=nullif(btrim(p_data->>'note'),''),updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=attempts_id;
   END IF;
  ELSIF p_action='lawful' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
   SELECT * INTO a FROM public.case_service_attempts WHERE id=(p_data->>'attempt_id')::uuid AND party_id=p_party_id FOR UPDATE;
   IF a.id IS NULL OR a.result<>'served' OR c.lawful_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'CASE102_ATTEMPT_FINAL'; END IF;
   UPDATE public.case_service_controls SET lawful_attempt_id=a.id,lawful_at=clock_timestamp(),lawful_by=auth.uid() WHERE party_id=p_party_id;
  ELSIF p_action='void' THEN
   IF why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
   SELECT * INTO a FROM public.case_service_attempts WHERE id=(p_data->>'attempt_id')::uuid AND party_id=p_party_id FOR UPDATE;
   IF a.id IS NULL OR a.result='void' THEN RAISE EXCEPTION 'CASE102_ATTEMPT_FINAL'; END IF;
   IF c.lawful_attempt_id=a.id THEN
    IF c.answer_filed_on IS NOT NULL OR EXISTS(SELECT 1 FROM public.case_deadlines WHERE id IN(c.answer_deadline_id,c.default_deadline_id) AND deleted_at IS NULL AND status IS DISTINCT FROM 'Cancelled') THEN RAISE EXCEPTION 'CASE102_DEADLINE_REVIEW_REQUIRED'; END IF;
    UPDATE public.case_service_controls SET lawful_attempt_id=NULL,lawful_at=NULL,lawful_by=NULL,answer_deadline_id=NULL,default_deadline_id=NULL,absent_hearing_id=NULL WHERE party_id=p_party_id;
   END IF;
   UPDATE public.case_service_attempts SET result='void',void_reason=why,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=a.id;
  ELSIF p_action='required' THEN
   IF jsonb_typeof(p_data->'required') IS DISTINCT FROM 'boolean' OR why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
   UPDATE public.case_service_controls SET required=(p_data->>'required')::boolean,exemption_reason=why WHERE party_id=p_party_id;
  ELSIF p_action='deadline' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
   IF p_data->>'kind' IS NULL OR p_data->>'kind' NOT IN('answer','default','court') THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   IF p_data->>'kind' IN('answer','default') AND (c.lawful_attempt_id IS NULL OR c.answer_filed_on IS NOT NULL) THEN RAISE EXCEPTION 'CASE102_LAWFUL_REQUIRED'; END IF;
   IF p_data->>'kind'='answer' AND c.answer_deadline_id IS NOT NULL OR p_data->>'kind'='default' AND c.default_deadline_id IS NOT NULL THEN RAISE EXCEPTION 'CASE102_DEADLINE_LINKED'; END IF;
   IF p_data->>'kind'='default' THEN
    SELECT * INTO d FROM public.case_deadlines WHERE id=c.answer_deadline_id AND case_id=p_case_id AND deleted_at IS NULL AND status='Active' FOR UPDATE;
    IF d.id IS NULL OR d.current_due_date IS NULL OR d.current_due_date>=today THEN RAISE EXCEPTION 'CASE102_NOT_OVERDUE'; END IF;
    IF d.current_due_date IS DISTINCT FROM (p_data->>'expected_due')::date OR d.updated_at IS DISTINCT FROM (p_data->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
   END IF;
   did:=nullif(p_data->>'existing_id','')::uuid;
   IF did IS NOT NULL THEN
    IF p_data->>'kind'<>'answer' THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
    SELECT * INTO d FROM public.case_deadlines WHERE id=did AND case_id=p_case_id AND deadline_type='answer' AND status='Active' AND deleted_at IS NULL FOR UPDATE;
    IF d.id IS NULL THEN RAISE EXCEPTION 'CASE102_DEADLINE_UNAVAILABLE'; END IF;
    IF d.current_due_date IS DISTINCT FROM (p_data->>'expected_due')::date OR d.updated_at IS DISTINCT FROM (p_data->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
   ELSE
    due:=(p_data->>'due')::date;
    IF due IS NULL OR NOT isfinite(due) THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
    IF p_data->>'kind'='court' AND why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
    INSERT INTO public.case_deadlines(case_id,order_no,deadline_type,deadline_other,original_due_date,current_due_date,status,note)
    VALUES(p_case_id,(SELECT coalesce(max(order_no),0)+1 FROM public.case_deadlines WHERE case_id=p_case_id),CASE WHEN p_data->>'kind'='answer' THEN 'answer' ELSE 'other' END,
     CASE WHEN p_data->>'kind'='default' THEN 'คำร้องขาดนัด' WHEN p_data->>'kind'='court' THEN why END,due,due,'Active',why) RETURNING * INTO d;
    did:=d.id;deadline_after:=to_jsonb(d);
   END IF;
   IF p_data->>'kind'='answer' THEN UPDATE public.case_service_controls SET answer_deadline_id=did WHERE party_id=p_party_id;
   ELSIF p_data->>'kind'='default' THEN UPDATE public.case_service_controls SET default_deadline_id=did WHERE party_id=p_party_id; END IF;
  ELSIF p_action='answer' THEN
   event_day:=(p_data->>'date')::date;
   IF event_day IS NULL OR NOT isfinite(event_day) OR event_day>today OR c.answer_filed_on IS NOT NULL THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   IF c.answer_deadline_id IS NOT NULL THEN
    SELECT * INTO d FROM public.case_deadlines WHERE id=c.answer_deadline_id AND case_id=p_case_id AND deleted_at IS NULL AND status='Active' FOR UPDATE;
    IF d.id IS NULL THEN RAISE EXCEPTION 'CASE102_DEADLINE_UNAVAILABLE'; END IF;
    IF d.current_due_date IS DISTINCT FROM (p_data->>'expected_due')::date OR d.updated_at IS DISTINCT FROM (p_data->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
    deadline_before:=to_jsonb(d);
    UPDATE public.case_deadlines SET status='Done',updated_at=clock_timestamp() WHERE id=d.id RETURNING to_jsonb(case_deadlines.*) INTO deadline_after;
   END IF;
   UPDATE public.case_service_controls SET answer_filed_on=event_day WHERE party_id=p_party_id;
  ELSIF p_action='absence' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
   target:=(p_data->>'hearing_id')::uuid;
   PERFORM 1 FROM public.case_timeline WHERE id=target AND case_id=p_case_id AND event_type='hearing' AND deleted_at IS NULL AND status IS DISTINCT FROM 'Cancelled'
    AND CASE WHEN event_date~'^\d{4}-\d{2}-\d{2}$' THEN event_date::date BETWEEN (SELECT attempted_on FROM public.case_service_attempts WHERE id=c.lawful_attempt_id) AND today ELSE false END FOR SHARE;
   IF NOT FOUND OR c.lawful_attempt_id IS NULL THEN RAISE EXCEPTION 'CASE102_BRANCH_EVIDENCE_REQUIRED'; END IF;
   UPDATE public.case_service_controls SET absent_hearing_id=target WHERE party_id=p_party_id;
  ELSIF p_action='next' THEN
   IF jsonb_typeof(p_data->'next') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   person:=nullif(p_data->'next'->>'assignee_id','')::uuid;
   IF person IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=person AND active AND account_type='operational' AND assignable AND NOT must_change_password AND role IN('admin','partner','lawyer','assistant_lawyer','staff')) THEN RAISE EXCEPTION 'CASE102_PERSON_INELIGIBLE'; END IF;
   next_before:=public.case098_read(p_case_id);
   next_after:=public.case098_save(p_case_id,(p_data->>'core_version')::integer,'next',p_data->'next');
  END IF;
  UPDATE public.case_service_controls SET version=p_version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE party_id=p_party_id RETURNING * INTO c;
  new_facts:=jsonb_build_object('control',to_jsonb(c),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.case_service_attempts x WHERE party_id=p_party_id),'deadline',deadline_after,'next',next_after);
 END IF;
 INSERT INTO public.case_service_events(case_id,party_id,action,actor_id,before_data,after_data,request_id,request_data)
 VALUES(p_case_id,p_party_id,p_action,auth.uid(),old_facts||jsonb_build_object('deadline',deadline_before,'next',next_before),new_facts,p_request_id,req);
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,'case_service_controls',coalesce(p_party_id,f.id)::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,new_facts,'case102_'||p_action);
 IF deadline_after IS NOT NULL THEN
  INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
  VALUES(p_case_id,'case_deadlines',deadline_after->>'id',CASE WHEN deadline_before IS NULL THEN 'create' ELSE 'update' END,auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,deadline_before,deadline_after,'case102_'||p_action);
 END IF;
 RETURN public.case102_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case102_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case102_save(bigint,uuid,integer,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case102_read(bigint),public.case102_save(bigint,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case102_read(bigint),public.case102_save(bigint,uuid,integer,uuid,text,jsonb) TO authenticated;
